import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Grid3X3, CheckCircle, AlertCircle, RefreshCw, Save, Settings, Clock, XCircle, ExternalLink, ChevronDown, ArrowRightCircle, Trash2, MoreHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useCallback, useRef } from "react";

interface Well {
  id: number;
  wellPosition: string;
  sortOrder: number;
  platform: string | null;
  observationId: string | null;
  labCode: string | null;
  primerPool: string | null;
  forwardPrimer: string | null;
  reversePrimer: string | null;
  isValidated: boolean;
  validationStatus: string | null;
  validationMessage: string | null;
  voucherNumber: string | null;
  username: string | null;
  state: string | null;
  country: string | null;
}

interface Plate {
  id: number;
  plateNumber: number | null;
  name: string | null;
  notes: string | null;
  runId: number | null;
  runName?: string;
  orientation: string;
  status: string;
  isActive: boolean | null;
  sampleCount: number;
  defaultForwardPrimer: string | null;
  defaultReversePrimer: string | null;
  forwardIndexSetId: number | null;
  reverseIndexSetId: number | null;
  wells: Well[];
}

interface LabRun {
  id: number;
  name: string;
  status: string;
}

interface PlateAvailability {
  plateNumber: number;
  exists: boolean;
  hasData: boolean;
  available: boolean;
}

const validationColors: Record<string, string> = {
  valid: "bg-green-50",
  mismatch: "bg-red-50",
  no_voucher: "bg-yellow-50",
  error: "bg-red-50",
  missing_platform: "bg-orange-50",
  no_observation: "bg-purple-50",
  multiple_inat: "bg-red-100",
  multiple_matches: "bg-red-100",
  not_fungal: "bg-red-200",
  pending: "bg-blue-50",
};

function getObservationUrl(platform: string | null, observationId: string | null): string | null {
  if (!observationId || !platform) return null;
  const cleanId = observationId.replace(/\D/g, '');
  if (!cleanId) return null;
  
  switch (platform) {
    case 'iNaturalist':
      return `https://www.inaturalist.org/observations/${cleanId}`;
    case 'MO':
      return `https://mushroomobserver.org/observations/${cleanId}`;
    case 'MyCoPortal':
      return `https://mycoportal.org/portal/collections/individual/index.php?occid=${cleanId}`;
    default:
      return null;
  }
}

export default function AdminPendingPlateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const plateId = parseInt(id);
  const { toast } = useToast();
  
  const [plateNotes, setPlateNotes] = useState("");
  const [editPlateOpen, setEditPlateOpen] = useState(false);
  const [editSampleCount, setEditSampleCount] = useState(96);
  const [editPlateName, setEditPlateName] = useState("");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [fillDownMode, setFillDownMode] = useState<{ active: boolean; sourceIndex: number; sourceValue: string } | null>(null);
  const [fillDownDialogOpen, setFillDownDialogOpen] = useState(false);
  const [fillDownTarget, setFillDownTarget] = useState("");
  
  // Assign to run state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [selectedPlateNumber, setSelectedPlateNumber] = useState<string>("");

  // Helper to parse lab code into prefix and number parts
  const parseLabCode = (labCode: string): { prefix: string; number: number; digitLength: number } | null => {
    const match = labCode.match(/^(.+?)(\d+)$/);
    if (!match) return null;
    return {
      prefix: match[1],
      number: parseInt(match[2], 10),
      digitLength: match[2].length,
    };
  };

  // Generate incremented lab code
  const incrementLabCode = (parsed: { prefix: string; number: number; digitLength: number }, offset: number): string => {
    const newNumber = parsed.number + offset;
    return `${parsed.prefix}${String(newNumber).padStart(parsed.digitLength, '0')}`;
  };

  const { data: plate, isLoading, refetch } = useQuery<Plate>({
    queryKey: ['/api/admin/pending-plates', plateId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/pending-plates/${plateId}`);
      if (!res.ok) throw new Error('Failed to fetch plate');
      return res.json();
    },
  });

  useEffect(() => {
    if (plate) {
      setPlateNotes(plate.notes || "");
      setEditSampleCount(plate.wells.length || 96);
      setEditPlateName(plate.name || "");
    }
  }, [plate]);

  const pendingRefetchRef = useRef<NodeJS.Timeout | null>(null);
  
  const updateWellMutation = useMutation({
    mutationFn: async ({ wellId, data }: { wellId: number; data: any }) => {
      return apiRequest('PATCH', `/api/admin/wells/${wellId}`, data);
    },
    onSuccess: () => {
      if (pendingRefetchRef.current) {
        clearTimeout(pendingRefetchRef.current);
      }
      pendingRefetchRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/pending-plates', plateId] });
        pendingRefetchRef.current = null;
      }, 1000);
    },
  });

  const saveNotesMutation = useMutation({
    mutationFn: async (notes: string) => {
      return apiRequest('PATCH', `/api/admin/pending-plates/${plateId}`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pending-plates', plateId] });
      toast({ title: "Saved", description: "Plate notes saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save notes", variant: "destructive" });
    },
  });

  const updatePlateSettingsMutation = useMutation({
    mutationFn: async (data: { name?: string; sampleCount?: number }) => {
      if (data.sampleCount !== undefined) {
        return apiRequest('PATCH', `/api/admin/pending-plates/${plateId}/sample-count`, { sampleCount: data.sampleCount, name: data.name });
      }
      return apiRequest('PATCH', `/api/admin/pending-plates/${plateId}`, { name: data.name });
    },
    onSuccess: async () => {
      await refetch();
      setEditPlateOpen(false);
      toast({ title: "Updated", description: "Plate settings updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update plate settings", variant: "destructive" });
    },
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/admin/pending-plates/${plateId}/validate`, {});
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pending-plates', plateId] });
      toast({ 
        title: "Validation Complete", 
        description: `Checked ${data.results.length} wells against iNaturalist` 
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Validation failed", variant: "destructive" });
    },
  });

  const [validatingWellId, setValidatingWellId] = useState<number | null>(null);
  
  const validateSingleWellMutation = useMutation({
    mutationFn: async (wellId: number) => {
      setValidatingWellId(wellId);
      return apiRequest('POST', `/api/admin/wells/${wellId}/validate`, {});
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pending-plates', plateId] });
      const status = data.result?.status || 'unknown';
      toast({ 
        title: "Well Validated", 
        description: status === 'valid' ? 'Observation verified' : data.result?.message || 'Check complete'
      });
      setValidatingWellId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Well validation failed", variant: "destructive" });
      setValidatingWellId(null);
    },
  });

  // Queries for assign to run
  const { data: runs } = useQuery<LabRun[]>({
    queryKey: ['/api/admin/runs'],
    enabled: assignDialogOpen,
  });

  const { data: availablePlates } = useQuery<{ plates: PlateAvailability[] }>({
    queryKey: ['/api/admin/runs', selectedRunId, 'available-plates'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/runs/${selectedRunId}/available-plates`);
      if (!res.ok) throw new Error('Failed to fetch available plates');
      return res.json();
    },
    enabled: !!selectedRunId && assignDialogOpen,
  });

  const transferMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/admin/pending-plates/${plateId}/transfer`, {
        runId: parseInt(selectedRunId),
        plateNumber: parseInt(selectedPlateNumber),
      });
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pending-plates'] });
      setAssignDialogOpen(false);
      toast({ 
        title: "Success", 
        description: data.message || "Plate assigned to run" 
      });
      refetch();
    },
    onError: async (error: any) => {
      let message = "Failed to assign plate";
      try {
        const data = await error.json?.();
        if (data?.error) message = data.error;
      } catch {}
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const parseObservationId = (value: string): string => {
    if (!value) return value;
    const inatMatch = value.match(/inaturalist\.org\/observations\/(\d+)/);
    if (inatMatch) return inatMatch[1];
    const moMatch = value.match(/mushroomobserver\.org\/(\d+)/);
    if (moMatch) return moMatch[1];
    const numericMatch = value.match(/\/(\d+)\/?$/);
    if (numericMatch) return numericMatch[1];
    // Strip all non-numeric characters from the input
    return value.replace(/\D/g, '');
  };

  const hasInvalidDigitCount = (obsId: string | null): boolean => {
    if (!obsId) return false;
    const digits = obsId.replace(/\D/g, '');
    return digits.length >= 10;
  };

  const detectPlatform = (obsId: string, currentPlatform: string | null): string | null => {
    if (!obsId) return currentPlatform;
    const digits = obsId.replace(/\D/g, '');
    if (digits.length === 6) return 'MO';
    if (digits.length >= 8 && digits.length <= 9) return 'iNaturalist';
    return currentPlatform;
  };

  const saveWellFromRefs = useCallback((wellId: number, field: 'labCode' | 'observationId') => {
    const inputRef = inputRefs.current[`${wellId}-${field}`];
    if (!inputRef) return;
    
    const value = inputRef.value;
    const well = plate?.wells.find(w => w.id === wellId);
    const originalValue = well ? (field === 'labCode' ? well.labCode : well.observationId) : null;
    
    if (value === (originalValue || '')) return;
    
    let processedValue = value;
    let data: Record<string, any> = {};
    
    if (field === 'observationId') {
      processedValue = parseObservationId(value);
      inputRef.value = processedValue;
      const currentPlatform = well?.platform ?? null;
      const detectedPlatform = detectPlatform(processedValue, currentPlatform);
      if (detectedPlatform && detectedPlatform !== currentPlatform) {
        data.platform = detectedPlatform;
      }
      data.observationId = processedValue;
    } else {
      data.labCode = processedValue;
    }
    
    if (Object.keys(data).length > 0) {
      updateWellMutation.mutate({ wellId, data });
    }
  }, [plate, updateWellMutation, parseObservationId, detectPlatform]);

  const handleKeyDown = (e: React.KeyboardEvent, wellId: number, currentIndex: number, field: 'labCode' | 'observationId') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveWellFromRefs(wellId, field);
      const sortedWells = plate ? [...plate.wells].sort((a, b) => a.sortOrder - b.sortOrder) : [];
      const nextWell = sortedWells[currentIndex + 1];
      if (nextWell) {
        const nextRef = inputRefs.current[`${nextWell.id}-${field}`];
        if (nextRef) {
          setTimeout(() => nextRef.focus(), 10);
        }
      }
    }
  };

  // Check if fill-down would overwrite existing data
  const checkFillDownOverwrite = useCallback((startIndex: number, endIndex: number): string[] => {
    if (!plate) return [];
    const sortedWells = [...plate.wells].sort((a, b) => a.sortOrder - b.sortOrder);
    const conflicts: string[] = [];
    
    for (let i = startIndex + 1; i <= endIndex; i++) {
      const well = sortedWells[i];
      if (well?.labCode) {
        conflicts.push(`Row ${i + 1} (${well.wellPosition}): ${well.labCode}`);
      }
    }
    return conflicts;
  }, [plate]);

  // Handle fill-down action
  const handleFillDown = useCallback((targetIndex: number) => {
    if (!fillDownMode || !plate) return;
    
    const sortedWells = [...plate.wells].sort((a, b) => a.sortOrder - b.sortOrder);
    const parsed = parseLabCode(fillDownMode.sourceValue);
    if (!parsed) {
      toast({ title: "Error", description: "Cannot parse lab code for fill-down", variant: "destructive" });
      setFillDownMode(null);
      setFillDownDialogOpen(false);
      return;
    }

    const startIndex = fillDownMode.sourceIndex;
    const endIndex = targetIndex;
    
    if (endIndex <= startIndex) {
      toast({ title: "Error", description: "Target must be below the source row", variant: "destructive" });
      return;
    }

    // Check for conflicts
    const conflicts = checkFillDownOverwrite(startIndex, endIndex);
    if (conflicts.length > 0) {
      toast({ 
        title: "Cannot Fill Down", 
        description: `Would overwrite ${conflicts.length} existing lab code(s). Clear them first.`,
        variant: "destructive"
      });
      return;
    }

    let updateCount = 0;
    for (let i = startIndex + 1; i <= endIndex; i++) {
      const well = sortedWells[i];
      if (well) {
        const offset = i - startIndex;
        const newLabCode = incrementLabCode(parsed, offset);
        
        // Update input ref value
        const inputRef = inputRefs.current[`${well.id}-labCode`];
        if (inputRef) {
          inputRef.value = newLabCode;
        }
        
        // Save to server
        updateWellMutation.mutate({ wellId: well.id, data: { labCode: newLabCode } });
        updateCount++;
      }
    }

    toast({ 
      title: "Fill Down Complete", 
      description: `Filled ${updateCount} rows with incremented lab codes` 
    });
    setFillDownMode(null);
    setFillDownDialogOpen(false);
    setFillDownTarget("");
  }, [fillDownMode, plate, toast, updateWellMutation, checkFillDownOverwrite]);

  // Handle fill-down by entering target lab code
  const handleFillDownByCode = useCallback(() => {
    if (!fillDownMode || !plate || !fillDownTarget) return;
    
    const sortedWells = [...plate.wells].sort((a, b) => a.sortOrder - b.sortOrder);
    const sourceParsed = parseLabCode(fillDownMode.sourceValue);
    const targetParsed = parseLabCode(fillDownTarget);
    
    if (!sourceParsed || !targetParsed) {
      toast({ title: "Error", description: "Cannot parse lab code format", variant: "destructive" });
      return;
    }

    if (sourceParsed.prefix !== targetParsed.prefix) {
      toast({ title: "Error", description: "Lab code prefix must match", variant: "destructive" });
      return;
    }

    if (targetParsed.number <= sourceParsed.number) {
      toast({ title: "Error", description: "Target number must be greater than source", variant: "destructive" });
      return;
    }

    const rowsToFill = targetParsed.number - sourceParsed.number;
    const targetIndex = fillDownMode.sourceIndex + rowsToFill;
    const maxRowsAvailable = sortedWells.length - 1 - fillDownMode.sourceIndex;
    const maxLabCode = incrementLabCode(sourceParsed, maxRowsAvailable);

    if (targetIndex >= sortedWells.length) {
      toast({ 
        title: "Exceeds Plate Capacity", 
        description: `Cannot fill past row ${sortedWells.length}. Maximum final lab code: ${maxLabCode}`, 
        variant: "destructive" 
      });
      return;
    }

    handleFillDown(targetIndex);
  }, [fillDownMode, plate, fillDownTarget, handleFillDown, toast]);

  // Clear row - clears from current well to end of the physical plate row (groups of 8)
  const handleClearRow = useCallback(async () => {
    if (!fillDownMode || !plate) return;
    
    const sortedWells = [...plate.wells].sort((a, b) => a.sortOrder - b.sortOrder);
    const startIndex = fillDownMode.sourceIndex;
    
    // Calculate end of current row (groups of 8)
    const rowEnd = Math.ceil((startIndex + 1) / 8) * 8 - 1;
    const endIndex = Math.min(rowEnd, sortedWells.length - 1);
    
    const wellsToClear = sortedWells.slice(startIndex, endIndex + 1);
    
    for (const well of wellsToClear) {
      await updateWellMutation.mutateAsync({
        wellId: well.id,
        data: { labCode: null, observationId: null, validationStatus: null, validationMessage: null, isValidated: false }
      });
      
      // Clear the input refs too
      const labCodeRef = inputRefs.current[`${well.id}-labCode`];
      const obsIdRef = inputRefs.current[`${well.id}-observationId`];
      if (labCodeRef) labCodeRef.value = '';
      if (obsIdRef) obsIdRef.value = '';
    }
    
    toast({
      title: "Row Cleared",
      description: `Cleared ${wellsToClear.length} wells from ${sortedWells[startIndex].wellPosition} to ${sortedWells[endIndex].wellPosition}`
    });
    
    setFillDownDialogOpen(false);
    setFillDownMode(null);
    setFillDownTarget("");
    refetch();
  }, [fillDownMode, plate, updateWellMutation, toast, refetch]);

  // Clear plate - clears from current well to end of the plate
  const handleClearPlate = useCallback(async () => {
    if (!fillDownMode || !plate) return;
    
    const sortedWells = [...plate.wells].sort((a, b) => a.sortOrder - b.sortOrder);
    const startIndex = fillDownMode.sourceIndex;
    
    const wellsToClear = sortedWells.slice(startIndex);
    
    for (const well of wellsToClear) {
      await updateWellMutation.mutateAsync({
        wellId: well.id,
        data: { labCode: null, observationId: null, validationStatus: null, validationMessage: null, isValidated: false }
      });
      
      // Clear the input refs too
      const labCodeRef = inputRefs.current[`${well.id}-labCode`];
      const obsIdRef = inputRefs.current[`${well.id}-observationId`];
      if (labCodeRef) labCodeRef.value = '';
      if (obsIdRef) obsIdRef.value = '';
    }
    
    toast({
      title: "Plate Cleared",
      description: `Cleared ${wellsToClear.length} wells from ${sortedWells[startIndex].wellPosition} to end of plate`
    });
    
    setFillDownDialogOpen(false);
    setFillDownMode(null);
    setFillDownTarget("");
    refetch();
  }, [fillDownMode, plate, updateWellMutation, toast, refetch]);

  const handlePaste = (e: React.ClipboardEvent, wellId: number, currentIndex: number, field: 'labCode' | 'observationId') => {
    const pastedText = e.clipboardData.getData('text');
    const lines = pastedText.split(/[\r\n]+/).map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length > 1) {
      e.preventDefault();
      const sortedWells = plate ? [...plate.wells].sort((a, b) => a.sortOrder - b.sortOrder) : [];
      
      let updatedCount = 0;
      lines.forEach((line, i) => {
        const targetWell = sortedWells[currentIndex + i];
        if (targetWell) {
          let processedValue = line;
          let data: Record<string, any> = {};
          
          if (field === 'observationId') {
            processedValue = parseObservationId(line);
            const currentPlatform = targetWell.platform ?? null;
            const detectedPlatform = detectPlatform(processedValue, currentPlatform);
            if (detectedPlatform && detectedPlatform !== currentPlatform) {
              data.platform = detectedPlatform;
            }
            data.observationId = processedValue;
          } else {
            data.labCode = processedValue;
          }
          
          const inputRef = inputRefs.current[`${targetWell.id}-${field}`];
          if (inputRef) {
            inputRef.value = processedValue;
          }
          
          updateWellMutation.mutate({ wellId: targetWell.id, data });
          updatedCount++;
        }
      });
      
      toast({
        title: "Pasted",
        description: `Applied ${updatedCount} values to rows`,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-full mx-auto space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[800px] w-full" />
        </div>
      </div>
    );
  }

  if (!plate) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <Grid3X3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h2 className="text-xl font-semibold mb-2">Plate Not Found</h2>
            <Link href="/admin/pending-plates">
              <Button>Back to Pending Plates</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sortedWells = [...plate.wells].sort((a, b) => a.sortOrder - b.sortOrder);
  const isAssigned = plate.isActive === false && plate.runId !== null;
  
  // Calculate if plate is fully validated for assignment
  const targetWellCount = plate.sampleCount || 96;
  const filledWells = plate.wells.filter(w => w.observationId || w.labCode).length;
  const validatedWells = plate.wells.filter(w => w.isValidated && ['valid', 'no_voucher', 'no_observation'].includes(w.validationStatus || '')).length;
  const errorWells = plate.wells.filter(w => w.validationStatus && !['valid', 'no_voucher', 'no_observation'].includes(w.validationStatus)).length;
  const isFullyValidated = filledWells === targetWellCount && validatedWells === targetWellCount && errorWells === 0;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Banner for assigned plates */}
        {isAssigned && (
          <div className="bg-blue-100 border border-blue-300 text-blue-800 px-4 py-3 rounded-lg flex items-center gap-3">
            <CheckCircle className="h-5 w-5" />
            <div>
              <span className="font-semibold">Assigned to Run:</span>{' '}
              <Link href={`/admin/runs/${plate.runId}`}>
                <span className="text-blue-600 hover:underline cursor-pointer">
                  {plate.runName || `Run ${plate.runId}`} Plate {plate.plateNumber}
                </span>
              </Link>
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/pending-plates">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ChevronLeft className="h-4 w-4 mr-1" /> Back to Pending Plates
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900" data-testid="text-plate-title">
                {plate.name || `Pending Plate ${plate.id}`}
              </h1>
              {plate.wells.filter(w => w.observationId || w.labCode).length > 0 && (
                <span className="text-sm text-gray-600">
                  {plate.wells.filter(w => w.observationId || w.labCode).length} samples
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button 
              variant="outline" 
              onClick={() => refetch()}
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Button 
              variant="outline"
              onClick={() => setEditPlateOpen(true)}
              data-testid="button-edit-plate"
            >
              <Settings className="h-4 w-4 mr-1" /> Edit Plate
            </Button>
            <Button 
              onClick={() => validateMutation.mutate()}
              disabled={validateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-validate"
            >
              <CheckCircle className="h-4 w-4 mr-1" /> 
              {validateMutation.isPending ? "Validating..." : "Validate Plate"}
            </Button>
            {isFullyValidated && !isAssigned && (
              <Button
                onClick={() => {
                  setSelectedRunId("");
                  setSelectedPlateNumber("");
                  setAssignDialogOpen(true);
                }}
                className="bg-green-600 hover:bg-green-700"
                data-testid="button-assign"
              >
                <ArrowRightCircle className="h-4 w-4 mr-1" /> Assign to Run
              </Button>
            )}
          </div>

          <Dialog open={editPlateOpen} onOpenChange={setEditPlateOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Plate Settings</DialogTitle>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div>
                  <Label htmlFor="edit-plate-name">Plate Name</Label>
                  <Input
                    id="edit-plate-name"
                    value={editPlateName}
                    onChange={(e) => setEditPlateName(e.target.value)}
                    placeholder="e.g., Missouri Batch 1"
                    data-testid="input-edit-plate-name"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-sample-count">Number of Samples</Label>
                  <Input
                    id="edit-sample-count"
                    type="number"
                    min={1}
                    max={96}
                    value={editSampleCount}
                    onChange={(e) => setEditSampleCount(Math.max(1, Math.min(96, parseInt(e.target.value) || 1)))}
                    data-testid="input-edit-sample-count"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Current: {plate?.wells.length || 0} wells. Reducing will remove excess wells.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditPlateOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => updatePlateSettingsMutation.mutate({ name: editPlateName, sampleCount: editSampleCount })}
                  disabled={updatePlateSettingsMutation.isPending}
                  data-testid="button-confirm-edit-plate"
                >
                  {updatePlateSettingsMutation.isPending ? "Updating..." : "Update Plate"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Fill Down Dialog */}
          <Dialog open={fillDownDialogOpen} onOpenChange={(open) => {
            setFillDownDialogOpen(open);
            if (!open) {
              setFillDownMode(null);
              setFillDownTarget("");
            }
          }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Fill Down Lab Codes</DialogTitle>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="bg-slate-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-600">Starting from:</p>
                  <p className="font-mono font-bold text-lg">{fillDownMode?.sourceValue}</p>
                  <p className="text-xs text-gray-500">Row {(fillDownMode?.sourceIndex ?? 0) + 1}</p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="fill-target">Enter the final lab code in the series:</Label>
                  <Input
                    id="fill-target"
                    placeholder={fillDownMode ? incrementLabCode(parseLabCode(fillDownMode.sourceValue)!, 5) : ""}
                    value={fillDownTarget}
                    onChange={(e) => setFillDownTarget(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && fillDownTarget) {
                        handleFillDownByCode();
                      }
                    }}
                    data-testid="input-fill-target"
                  />
                  <p className="text-xs text-gray-500">
                    Or click "Select Row" below, then click a row in the table
                  </p>
                </div>

                {fillDownTarget && parseLabCode(fillDownTarget) && fillDownMode && (() => {
                  const sourceParsed = parseLabCode(fillDownMode.sourceValue);
                  const targetParsed = parseLabCode(fillDownTarget);
                  if (sourceParsed && targetParsed && sourceParsed.prefix === targetParsed.prefix && targetParsed.number > sourceParsed.number) {
                    const rowCount = targetParsed.number - sourceParsed.number;
                    return (
                      <div className="bg-blue-50 p-2 rounded text-sm text-blue-700">
                        This will fill {rowCount} row{rowCount > 1 ? 's' : ''} with codes {incrementLabCode(sourceParsed, 1)} through {fillDownTarget}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
              <DialogFooter className="flex gap-2 justify-between">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-gray-500" data-testid="button-clear-options">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Clear...
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem 
                      onClick={handleClearRow}
                      disabled={updateWellMutation.isPending}
                      className="text-red-600"
                      data-testid="button-clear-row"
                    >
                      Clear Row (to end of column)
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={handleClearPlate}
                      disabled={updateWellMutation.isPending}
                      className="text-red-600"
                      data-testid="button-clear-plate"
                    >
                      Clear Plate (all remaining)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => {
                    setFillDownDialogOpen(false);
                    setFillDownMode(null);
                    setFillDownTarget("");
                  }}>
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFillDownDialogOpen(false);
                      toast({ 
                        title: "Select Target Row", 
                        description: "Click a 'Fill to here' button on any row below to complete the fill" 
                      });
                    }}
                    data-testid="button-select-row"
                  >
                    Select Row
                  </Button>
                  <Button 
                    onClick={handleFillDownByCode}
                    disabled={!fillDownTarget}
                    data-testid="button-confirm-fill"
                  >
                    Fill Down
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {plate?.wells.some(w => w.isValidated || w.validationStatus) && (
          <Card className="bg-slate-50">
            <CardContent className="py-4">
              <div className="flex items-center gap-6">
                <span className="font-medium text-gray-700">Validation Summary:</span>
                {(() => {
                  const validCount = plate.wells.filter(w => 
                    w.validationStatus === 'valid' || w.validationStatus === 'no_voucher'
                  ).length;
                  const errorCount = plate.wells.filter(w => 
                    w.validationStatus && !['valid', 'no_voucher'].includes(w.validationStatus)
                  ).length;
                  const clearedCount = plate.wells.filter(w => 
                    w.isValidated === false && !w.validationStatus && w.observationId
                  ).length;
                  
                  return (
                    <>
                      <div className="flex items-center gap-1">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-green-700 font-medium">{validCount} Valid</span>
                      </div>
                      {errorCount > 0 && (
                        <div className="flex items-center gap-1">
                          <AlertCircle className="h-4 w-4 text-red-500" />
                          <span className="text-red-600 font-medium">{errorCount} Errors</span>
                        </div>
                      )}
                      {errorCount === 0 && (
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="text-green-700 font-medium">0 Errors</span>
                        </div>
                      )}
                      {clearedCount > 0 && (
                        <div className="flex items-center gap-1">
                          <XCircle className="h-4 w-4 text-gray-500" />
                          <span className="text-gray-600">{clearedCount} Cleared</span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Plate Notes</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4 items-end">
            <div className="flex-1">
              <Textarea 
                id="plate-notes" 
                value={plateNotes}
                onChange={(e) => setPlateNotes(e.target.value)}
                placeholder="Add notes about this plate..."
                className="min-h-[80px]"
                data-testid="input-plate-notes"
              />
            </div>
            <Button 
              onClick={() => saveNotesMutation.mutate(plateNotes)}
              disabled={saveNotesMutation.isPending}
              data-testid="button-save-notes"
            >
              <Save className="h-4 w-4 mr-1" /> {saveNotesMutation.isPending ? "Saving..." : "Save Notes"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Well Data</CardTitle>
              <div className="flex gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-green-50 border border-green-300 rounded" />
                  <span>Valid</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-yellow-50 border border-yellow-300 rounded" />
                  <span>No Voucher</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-red-50 border border-red-300 rounded" />
                  <span>Mismatch</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10">
                  <TableRow>
                    <TableHead className="w-[60px]">Well Number</TableHead>
                    <TableHead className="w-[80px]">Well Position</TableHead>
                    <TableHead className="w-[180px]">Lab Code</TableHead>
                    <TableHead className="w-[120px]">Platform</TableHead>
                    <TableHead className="w-[150px]">Observation Number</TableHead>
                    <TableHead className="w-[100px]">Validation</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead className="w-[100px]">State</TableHead>
                    <TableHead className="w-[100px]">Country</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedWells.map((well, index) => {
                    const validationClass = well.validationStatus ? validationColors[well.validationStatus] : "";
                    
                    return (
                      <TableRow 
                        key={well.id} 
                        className={`${validationClass} ${(index + 1) % 8 === 0 ? 'border-b-2 border-b-gray-800' : ''}`}
                        data-testid={`row-well-${well.wellPosition}`}
                      >
                        <TableCell className="font-mono text-center text-gray-500">
                          {String(index + 1).padStart(2, '0')}
                        </TableCell>
                        <TableCell className="font-mono font-medium">
                          {well.wellPosition}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Input 
                              key={`labCode-${well.id}-${well.labCode || ''}-${well.updatedAt}`}
                              ref={el => inputRefs.current[`${well.id}-labCode`] = el}
                              className="h-8 flex-1"
                              placeholder="Enter lab code"
                              defaultValue={well.labCode || ""}
                              onBlur={() => saveWellFromRefs(well.id, 'labCode')}
                              onKeyDown={(e) => handleKeyDown(e, well.id, index, 'labCode')}
                              onPaste={(e) => handlePaste(e, well.id, index, 'labCode')}
                              data-testid={`input-labcode-${well.wellPosition}`}
                            />
                            {well.labCode && parseLabCode(well.labCode) && !fillDownMode && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 flex-shrink-0 text-gray-400 hover:text-blue-600"
                                onClick={() => {
                                  setFillDownMode({ active: true, sourceIndex: index, sourceValue: well.labCode! });
                                  setFillDownTarget(well.labCode!);
                                  setFillDownDialogOpen(true);
                                }}
                                title="Fill down from this row"
                                data-testid={`button-filldown-${well.wellPosition}`}
                              >
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            )}
                            {fillDownMode && !fillDownDialogOpen && fillDownMode.sourceIndex < index && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-xs bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                                onClick={() => handleFillDown(index)}
                                data-testid={`button-fillto-${well.wellPosition}`}
                              >
                                Fill to here
                              </Button>
                            )}
                            {fillDownMode && !fillDownDialogOpen && fillDownMode.sourceIndex === index && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 flex-shrink-0 bg-blue-100 text-blue-700"
                                onClick={() => setFillDownMode(null)}
                                title="Cancel fill-down"
                                data-testid={`button-cancel-filldown-${well.wellPosition}`}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select 
                            value={well.platform || "empty"}
                            onValueChange={(val) => {
                              const newPlatform = val === "empty" ? "" : val;
                              updateWellMutation.mutate({ 
                                wellId: well.id, 
                                data: { 
                                  platform: newPlatform, 
                                  validationStatus: null, 
                                  validationMessage: null,
                                  isValidated: false 
                                } 
                              });
                            }}
                          >
                            <SelectTrigger 
                              className={`h-8 ${!well.platform && well.isValidated ? 'border-red-500 border-2' : ''}`} 
                              data-testid={`select-platform-${well.wellPosition}`}
                            >
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="empty">—</SelectItem>
                              <SelectItem value="iNaturalist">iNat</SelectItem>
                              <SelectItem value="MO">MO</SelectItem>
                              <SelectItem value="MyCoPortal">MyCoPortal</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Input 
                              key={`obsId-${well.id}-${well.observationId || ''}-${well.updatedAt}`}
                              ref={el => inputRefs.current[`${well.id}-observationId`] = el}
                              className={`h-8 ${hasInvalidDigitCount(well.observationId) ? 'border-red-500 border-2 bg-red-50' : ''}`}
                              placeholder="Enter obs ID"
                              defaultValue={well.observationId || ""}
                              onBlur={() => saveWellFromRefs(well.id, 'observationId')}
                              onKeyDown={(e) => handleKeyDown(e, well.id, index, 'observationId')}
                              onPaste={(e) => handlePaste(e, well.id, index, 'observationId')}
                              data-testid={`input-obs-${well.wellPosition}`}
                              title={hasInvalidDigitCount(well.observationId) ? 'Observation ID has too many digits (10+)' : undefined}
                            />
                            {well.observationId && well.platform && getObservationUrl(well.platform, well.observationId) && (
                              <a
                                href={getObservationUrl(well.platform, well.observationId)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-400 hover:text-blue-600 flex-shrink-0"
                                title={`View on ${well.platform}`}
                                data-testid={`link-obs-${well.wellPosition}`}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {well.isValidated && well.validationStatus && (
                            <div className="flex items-center gap-1" title={well.validationMessage || undefined}>
                              {well.validationStatus === 'valid' || well.validationStatus === 'no_voucher' ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : well.validationStatus === 'pending' ? (
                                <Clock className="h-4 w-4 text-blue-500" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-red-500" />
                              )}
                              <span className="text-xs capitalize">
                                {well.validationStatus?.replace('_', ' ')}
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {well.username || '—'}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {well.state || '—'}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {well.country || '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {/* Refresh button - validate single well */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                              onClick={() => validateSingleWellMutation.mutate(well.id)}
                              disabled={validatingWellId === well.id || (!well.labCode && !well.observationId)}
                              title="Re-validate this row"
                              data-testid={`button-refresh-${well.wellPosition}`}
                            >
                              <RefreshCw className={`h-4 w-4 ${validatingWellId === well.id ? 'animate-spin' : ''}`} />
                            </Button>
                            {/* Clear error button */}
                            {well.validationStatus && !['valid', 'no_voucher'].includes(well.validationStatus) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  updateWellMutation.mutate({ 
                                    wellId: well.id, 
                                    data: { 
                                      validationStatus: null, 
                                      validationMessage: null,
                                      isValidated: false 
                                    } 
                                  });
                                  toast({ title: "Cleared", description: "Validation error cleared" });
                                }}
                                title="Clear error"
                                data-testid={`button-clear-error-${well.wellPosition}`}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Assign to Run Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign to Sequencing Run</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div>
                <Label htmlFor="select-run">Select Run</Label>
                <Select value={selectedRunId} onValueChange={(v) => { setSelectedRunId(v); setSelectedPlateNumber(""); }}>
                  <SelectTrigger data-testid="select-run">
                    <SelectValue placeholder="Choose a run..." />
                  </SelectTrigger>
                  <SelectContent>
                    {runs?.filter(r => r.status !== 'completed').map(run => (
                      <SelectItem key={run.id} value={String(run.id)}>{run.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedRunId && (
                <div>
                  <Label htmlFor="select-plate">Select Plate Position</Label>
                  <Select value={selectedPlateNumber} onValueChange={setSelectedPlateNumber}>
                    <SelectTrigger data-testid="select-plate-number">
                      <SelectValue placeholder="Choose a plate position..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePlates?.plates?.filter(p => p.available).map(p => (
                        <SelectItem key={p.plateNumber} value={String(p.plateNumber)}>
                          Plate {p.plateNumber} {p.exists ? '(empty)' : '(new)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => transferMutation.mutate()}
                disabled={!selectedRunId || !selectedPlateNumber || transferMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
                data-testid="button-confirm-assign"
              >
                {transferMutation.isPending ? "Assigning..." : "Assign Plate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
