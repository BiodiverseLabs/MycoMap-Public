export interface ParsedSample {
  sampleId: string;
  plateNumber: number;
  position: number;
  wellPosition: string;
  labCode: string;
  platform: 'iNat' | 'MO' | 'MyCoPortal' | 'unknown';
  observationId: string;
  primerPool: string;
  fwIndex: string;
  fwPrimer: string;
  rvIndex: string;
  rvPrimer: string;
}

export interface ParsedPlate {
  plateNumber: number;
  orientation: 'right-left' | 'left-right';
  samples: ParsedSample[];
}

export interface ParseResult {
  success: boolean;
  plates: ParsedPlate[];
  errors: string[];
  uniqueFwIndexes: Set<string>;
  uniqueRvIndexes: Set<string>;
  uniqueFwPrimers: Set<string>;
  uniqueRvPrimers: Set<string>;
}

export function parseIndexFile(content: string): ParseResult {
  const lines = content.trim().split('\n');
  const errors: string[] = [];
  const samples: ParsedSample[] = [];
  
  const uniqueFwIndexes = new Set<string>();
  const uniqueRvIndexes = new Set<string>();
  const uniqueFwPrimers = new Set<string>();
  const uniqueRvPrimers = new Set<string>();
  
  if (lines.length < 2) {
    return {
      success: false,
      plates: [],
      errors: ['File must have at least a header row and one data row'],
      uniqueFwIndexes,
      uniqueRvIndexes,
      uniqueFwPrimers,
      uniqueRvPrimers,
    };
  }
  
  const headerLine = lines[0].trim();
  const expectedHeaders = ['SampleID', 'PrimerPool', 'FwIndex', 'FwPrimer', 'RvIndex', 'RvPrimer'];
  const headers = headerLine.split('\t');
  
  if (headers.length !== 6) {
    errors.push(`Invalid header format. Expected 6 tab-separated columns, got ${headers.length}`);
  }
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split('\t');
    if (parts.length !== 6) {
      errors.push(`Line ${i + 1}: Expected 6 columns, got ${parts.length}`);
      continue;
    }
    
    const [sampleId, primerPool, fwIndex, fwPrimer, rvIndex, rvPrimer] = parts;
    
    const parsed = parseSampleId(sampleId, i + 1);
    if (!parsed.success) {
      errors.push(parsed.error!);
      continue;
    }
    
    uniqueFwIndexes.add(fwIndex);
    uniqueRvIndexes.add(rvIndex);
    uniqueFwPrimers.add(fwPrimer);
    uniqueRvPrimers.add(rvPrimer);
    
    samples.push({
      sampleId,
      plateNumber: parsed.plateNumber!,
      position: parsed.position!,
      wellPosition: parsed.wellPosition!,
      labCode: parsed.labCode!,
      platform: parsed.platform!,
      observationId: parsed.observationId!,
      primerPool,
      fwIndex,
      fwPrimer,
      rvIndex,
      rvPrimer,
    });
  }
  
  const plateMap = new Map<number, ParsedSample[]>();
  for (const sample of samples) {
    if (!plateMap.has(sample.plateNumber)) {
      plateMap.set(sample.plateNumber, []);
    }
    plateMap.get(sample.plateNumber)!.push(sample);
  }
  
  const plates: ParsedPlate[] = [];
  const plateEntries = Array.from(plateMap.entries());
  for (const [plateNumber, plateSamples] of plateEntries) {
    const orientation = determineOrientation(plateSamples);
    plates.push({
      plateNumber,
      orientation,
      samples: plateSamples.sort((a: ParsedSample, b: ParsedSample) => a.position - b.position),
    });
  }
  
  plates.sort((a: ParsedPlate, b: ParsedPlate) => a.plateNumber - b.plateNumber);
  
  return {
    success: errors.length === 0,
    plates,
    errors,
    uniqueFwIndexes,
    uniqueRvIndexes,
    uniqueFwPrimers,
    uniqueRvPrimers,
  };
}

interface SampleIdParseResult {
  success: boolean;
  error?: string;
  plateNumber?: number;
  position?: number;
  wellPosition?: string;
  labCode?: string;
  platform?: 'iNat' | 'MO' | 'MyCoPortal' | 'unknown';
  observationId?: string;
}

function parseSampleId(sampleId: string, lineNumber: number): SampleIdParseResult {
  const parts = sampleId.split('-');
  if (parts.length < 2) {
    return {
      success: false,
      error: `Line ${lineNumber}: SampleID "${sampleId}" has invalid format. Expected at least 2 parts separated by hyphens.`,
    };
  }
  
  const platePositionPart = parts[0];
  const plateMatch = platePositionPart.match(/^ONT(\d+)\.(\d+)$/);
  if (!plateMatch) {
    return {
      success: false,
      error: `Line ${lineNumber}: Could not parse plate/position from "${platePositionPart}". Expected format like "ONT01.01"`,
    };
  }
  
  const plateNumber = parseInt(plateMatch[1], 10);
  const position = parseInt(plateMatch[2], 10);
  
  const wellPosition = parts[1];
  if (!/^[A-H](0[1-9]|1[0-2])$/.test(wellPosition)) {
    return {
      success: false,
      error: `Line ${lineNumber}: Invalid well position "${wellPosition}". Expected format like "A01" to "H12"`,
    };
  }
  
  // Remaining parts could be: labCode parts and/or platform+observationId
  // Format variations:
  // ONT01.01-A01 (just plate/position/well)
  // ONT01.01-A01-iNat123456 (no lab code, has platform)
  // ONT01.01-A01-RS-754 (lab code only)
  // ONT01.01-A01-RS-754-iNat123456 (both lab code and platform)
  
  let labCode = '';
  let platform: 'iNat' | 'MO' | 'MyCoPortal' | 'unknown' = 'unknown';
  let observationId = '';
  
  if (parts.length > 2) {
    // Find where platform identifier starts (if present)
    let platformIndex = -1;
    for (let i = 2; i < parts.length; i++) {
      if (parts[i].startsWith('iNat') || parts[i].startsWith('MO') || parts[i].startsWith('MyCoPortal')) {
        platformIndex = i;
        break;
      }
    }
    
    if (platformIndex === -1) {
      // No platform found, everything after well position is lab code
      labCode = parts.slice(2).join('-');
    } else if (platformIndex === 2) {
      // Platform is right after well, no lab code
      const platformPart = parts.slice(2).join('-');
      if (platformPart.startsWith('iNat')) {
        platform = 'iNat';
        observationId = platformPart.substring(4);
      } else if (platformPart.startsWith('MyCoPortal')) {
        platform = 'MyCoPortal';
        observationId = platformPart.substring(10);
      } else if (platformPart.startsWith('MO')) {
        platform = 'MO';
        observationId = platformPart.substring(2);
      }
    } else {
      // Lab code is before platform
      labCode = parts.slice(2, platformIndex).join('-');
      const platformPart = parts.slice(platformIndex).join('-');
      if (platformPart.startsWith('iNat')) {
        platform = 'iNat';
        observationId = platformPart.substring(4);
      } else if (platformPart.startsWith('MyCoPortal')) {
        platform = 'MyCoPortal';
        observationId = platformPart.substring(10);
      } else if (platformPart.startsWith('MO')) {
        platform = 'MO';
        observationId = platformPart.substring(2);
      }
    }
  }
  
  return {
    success: true,
    plateNumber,
    position,
    wellPosition,
    labCode,
    platform,
    observationId,
  };
}

function determineOrientation(samples: ParsedSample[]): 'right-left' | 'left-right' {
  if (samples.length < 2) {
    return 'right-left';
  }
  
  const sorted = [...samples].sort((a, b) => a.position - b.position);
  
  const first = sorted[0];
  const second = sorted.length > 1 ? sorted[1] : null;
  
  if (!second) return 'right-left';
  
  const firstRow = first.wellPosition.charAt(0);
  const secondRow = second.wellPosition.charAt(0);
  const firstCol = parseInt(first.wellPosition.substring(1), 10);
  const secondCol = parseInt(second.wellPosition.substring(1), 10);
  
  if (firstRow === secondRow) {
    return firstCol < secondCol ? 'left-right' : 'right-left';
  } else {
    if (firstCol === 1) {
      return 'right-left';
    } else if (firstCol === 12) {
      return 'left-right';
    }
  }
  
  return 'right-left';
}

export function getWellFromPosition(position: number, orientation: 'right-left' | 'left-right'): string {
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const zeroIndex = position - 1;
  
  if (orientation === 'right-left') {
    const col = Math.floor(zeroIndex / 8) + 1;
    const row = zeroIndex % 8;
    return `${rows[row]}${col.toString().padStart(2, '0')}`;
  } else {
    const row = Math.floor(zeroIndex / 12);
    const col = (zeroIndex % 12) + 1;
    return `${rows[row]}${col.toString().padStart(2, '0')}`;
  }
}
