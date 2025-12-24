import { db, pool } from "./db";
import { specimens, labRuns } from "@shared/schema";
import { eq, inArray, and, isNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import XLSX from "xlsx";

interface SpecimenRow {
  "MYCO Number": number;
  "iNat Number"?: string | number;
  "Lab Code"?: string;
  "Run"?: string;
  "Plate"?: number;
  "Position"?: number;
  "Well Position"?: string;
}

interface ImportStats {
  totalRows: number;
  specimensCreated: number;
  specimensSkipped: number;
  labRunsCreated: number;
  duplicatesFound: number;
  errors: string[];
}

export async function importSpecimensFromExcel(filePath: string): Promise<ImportStats> {
  const stats: ImportStats = {
    totalRows: 0,
    specimensCreated: 0,
    specimensSkipped: 0,
    labRunsCreated: 0,
    duplicatesFound: 0,
    errors: [],
  };

  console.log(`[Import] Reading Excel file: ${filePath}`);
  
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data: SpecimenRow[] = XLSX.utils.sheet_to_json(sheet);
  
  stats.totalRows = data.length;
  console.log(`[Import] Found ${stats.totalRows} rows to process`);

  const runNameToId: Map<string, number> = new Map();
  const existingRuns = await db.select({ id: labRuns.id, name: labRuns.name }).from(labRuns);
  for (const run of existingRuns) {
    if (run.name) {
      runNameToId.set(run.name, run.id);
    }
  }
  console.log(`[Import] Found ${existingRuns.length} existing lab runs`);

  const runNamesSet = new Set<string>();
  for (const row of data) {
    if (row["Run"]) runNamesSet.add(row["Run"]);
  }
  const uniqueRunNames = Array.from(runNamesSet);
  
  for (const runName of uniqueRunNames) {
    if (!runNameToId.has(runName)) {
      try {
        const [newRun] = await db.insert(labRuns).values({
          name: runName,
          status: "completed",
        }).returning();
        runNameToId.set(runName, newRun.id);
        stats.labRunsCreated++;
      } catch (error: any) {
        const existingRun = existingRuns.find(r => r.name === runName);
        if (existingRun) {
          runNameToId.set(runName, existingRun.id);
        }
      }
    }
  }
  console.log(`[Import] Lab runs ready: ${runNameToId.size}`);

  console.log(`[Import] Getting existing MYCO numbers...`);
  const existingMycoNumbers = new Set<number>();
  const existingSpecimens = await db.select({ mycoNumber: specimens.mycoNumber }).from(specimens);
  for (const s of existingSpecimens) {
    if (s.mycoNumber) existingMycoNumbers.add(s.mycoNumber);
  }
  console.log(`[Import] Found ${existingMycoNumbers.size} existing specimens`);

  const toInsert: SpecimenRow[] = [];
  for (const row of data) {
    const mycoNumber = row["MYCO Number"];
    if (!mycoNumber) continue;
    if (existingMycoNumbers.has(mycoNumber)) {
      stats.specimensSkipped++;
      continue;
    }
    toInsert.push(row);
  }
  console.log(`[Import] Specimens to insert: ${toInsert.length}, skipping: ${stats.specimensSkipped}`);

  const BATCH_SIZE = 100;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(toInsert.length / BATCH_SIZE);
    
    if (batchNum % 10 === 0 || batchNum === 1) {
      console.log(`[Import] Processing batch ${batchNum}/${totalBatches}`);
    }

    const values = batch.map(row => {
      const mycoNumber = row["MYCO Number"];
      const inatNumber = row["iNat Number"]?.toString() || null;
      const labCode = row["Lab Code"] || null;
      const runName = row["Run"];
      const plateNumber = row["Plate"] || null;
      const wellPosition = row["Well Position"] || null;
      const labRunId = runName ? runNameToId.get(runName) || null : null;

      return {
        uuid: randomUUID(),
        mycoNumber,
        displayCode: `MYCO-${mycoNumber}`,
        intakeSourceType: "legacy_import" as const,
        primaryObservationSource: inatNumber ? ("inat" as const) : undefined,
        primaryObservationId: inatNumber,
        labCode,
        labRunId,
        plateNumber,
        wellPosition,
        currentStatus: labCode ? ("sequenced" as const) : ("received" as const),
      };
    });

    try {
      await db.insert(specimens).values(values);
      stats.specimensCreated += values.length;
    } catch (error: any) {
      for (const v of values) {
        try {
          await db.insert(specimens).values(v);
          stats.specimensCreated++;
        } catch (e: any) {
          stats.errors.push(`MYCO ${v.mycoNumber}: ${e.message}`);
        }
      }
    }
  }

  console.log(`[Import] Complete!`);
  console.log(`[Import] Created: ${stats.specimensCreated}, Skipped: ${stats.specimensSkipped}`);
  console.log(`[Import] Lab runs created: ${stats.labRunsCreated}`);
  console.log(`[Import] Errors: ${stats.errors.length}`);
  
  if (stats.errors.length > 0) {
    console.log(`[Import] First 10 errors:`, stats.errors.slice(0, 10));
  }

  // Flag duplicate iNat observations (where multiple MYCO specimens share same observation ID)
  console.log(`[Import] Checking for duplicate iNat observations...`);
  const duplicateObsResult = await db.execute(sql`
    WITH duplicate_obs AS (
      SELECT primary_observation_id
      FROM specimens
      WHERE primary_observation_id IS NOT NULL
        AND display_code LIKE 'MYCO-%'
      GROUP BY primary_observation_id
      HAVING COUNT(*) > 1
    )
    UPDATE specimens
    SET inat_field_conflict = 'duplicate_inat'
    WHERE primary_observation_id IN (SELECT primary_observation_id FROM duplicate_obs)
      AND display_code LIKE 'MYCO-%'
      AND (inat_field_conflict IS NULL OR inat_field_conflict = '')
    RETURNING id
  `);
  stats.duplicatesFound = Array.isArray(duplicateObsResult) ? duplicateObsResult.length : 0;
  console.log(`[Import] Flagged ${stats.duplicatesFound} specimens as duplicates`);

  return stats;
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  const filePath = process.argv[2] || "attached_assets/Index_Large_Prelim_Lookup_1766468860881.xlsx";
  importSpecimensFromExcel(filePath)
    .then((stats) => {
      console.log("Import completed:", stats);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Import failed:", err);
      process.exit(1);
    });
}
