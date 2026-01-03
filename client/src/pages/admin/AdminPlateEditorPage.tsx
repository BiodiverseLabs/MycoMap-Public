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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Grid3X3, CheckCircle, AlertCircle, RefreshCw, Save, Settings, Clock, XCircle, ExternalLink, Download, Search, Trash2, ChevronDown } from "lucide-react";
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
  plateNumber: number;
  name: string | null;
  notes: string | null;
  runId: number;
  runName?: string;
  orientation: string;
  status: string;
  defaultForwardPrimer: string | null;
  defaultReversePrimer: string | null;
  forwardIndexSetId: number | null;
  reverseIndexSetId: number | null;
  wells: Well[];
}

interface IndexSet {
  id: number;
  title: string;
  orientation: string;
  type: string;
}

interface PrimerSet {
  id: number;
  title: string;
  orientation: string;
  type: string;
}

interface PrimerPool {
  id: number;
  name: string;
  forwardPrimerSetId: number;
  reversePrimerSetId: number;
  isActive?: boolean;
  forwardPrimerSet?: PrimerSet;
  reversePrimerSet?: PrimerSet;
}

interface PendingPlate {
  id: number;
  name: string | null;
  notes: string | null;
  sampleCount: number;
  status: string;
  wells: Well[];
  createdAt: string;
}

const validationColors: Record<string, string> = {
  valid: "bg-green-50",
  mismatch: "bg-red-50",
  no_voucher: "bg-yellow-50",
  error: "bg-red-50",
  missing_platform: "bg-orange-50",
  no_observation: "bg-purple-50",
  multiple_inat: "bg-red-100",
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

export default function AdminPlateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const plateId = parseInt(id);
  const { toast } = useToast();
  
  const [wellData, setWellData] = useState<Record<number, Partial<Well>>>({});
  const [defaultPrimerPool, setDefaultPrimerPool] = useState("");
  const [defaultForward, setDefaultForward] = useState("");
  const [defaultReverse, setDefaultReverse] = useState("");
  const [plateNotes, setPlateNotes] = useState("");
  const [forwardIndexSetId, setForwardIndexSetId] = useState<number | null>(null);
  const [reverseIndexSetId, setReverseIndexSetId] = useState<number | null>(null);
  const [editPlateOpen, setEditPlateOpen] = useState(false);
  const [editSampleCount, setEditSampleCount] = useState(96);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importSearch, setImportSearch] = useState("");
  const [selectedPendingPlate, setSelectedPendingPlate] = useState<PendingPlate | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [fillDownMode, setFillDownMode] = useState<{ active: boolean; sourceIndex: number; sourceValue: string } | null>(null);
  const [fillDownDialogOpen, setFillDownDialogOpen] = useState(false);
  const [fillDownTarget, setFillDownTarget] = useState("");

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
    queryKey: ['/api/admin/plates', plateId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/plates/${plateId}`);
      if (!res.ok) throw new Error('Failed to fetch plate');
      return res.json();
    },
  });

  const { data: indexSets } = useQuery<IndexSet[]>({
    queryKey: ['/api/admin/index-sets'],
    queryFn: async () => {
      const res = await fetch('/api/admin/index-sets');
      if (!res.ok) throw new Error('Failed to fetch index sets');
      return res.json();
    },
  });

  const { data: primerPools } = useQuery<PrimerPool[]>({
    queryKey: ['/api/admin/primer-pools'],
    queryFn: async () => {
      const res = await fetch('/api/admin/primer-pools');
      if (!res.ok) throw new Error('Failed to fetch primer pools');
      return res.json();
    },
  });

  // Filter to only active primer pools
  const activePrimerPools = primerPools?.filter(p => p.isActive !== false) || [];

  const handlePrimerPoolSelect = (poolId: string) => {
    const pool = primerPools?.find(p => p.id.toString() === poolId);
    if (pool) {
      setDefaultPrimerPool(pool.name);
      setDefaultForward(pool.forwardPrimerSet?.title || "");
      setDefaultReverse(pool.reversePrimerSet?.title || "");
    }
  };

  useEffect(() => {
    if (plate) {
      setDefaultForward(plate.defaultForwardPrimer || "");
      setDefaultReverse(plate.defaultReversePrimer || "");
      setPlateNotes(plate.notes || "");
      setForwardIndexSetId(plate.forwardIndexSetId);
      setReverseIndexSetId(plate.reverseIndexSetId);
      setEditSampleCount(plate.wells.length || 96);
    }
  }, [plate]);

  const pendingRefetchRef = useRef<NodeJS.Timeout | null>(null);
  
  const updateWellMutation = useMutation({
    mutationFn: async ({ wellId, data }: { wellId: number; data: any }) => {
      return apiRequest('PATCH', `/api/admin/wells/${wellId}`, data);
    },
    onSuccess: () => {
      // Debounce the refetch to avoid cascading updates
      // Only refetch after 1 second of no new mutations
      if (pendingRefetchRef.current) {
        clearTimeout(pendingRefetchRef.current);
      }
      pendingRefetchRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/plates', plateId] });
        pendingRefetchRef.current = null;
      }, 1000);
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (data: { primerPool?: string; forwardPrimer?: string; reversePrimer?: string }) => {
      return apiRequest('POST', `/api/admin/plates/${plateId}/bulk-update`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plates', plateId] });
      toast({ title: "Updated", description: "Applied primers to all wells" });
    },
  });

  const saveNotesMutation = useMutation({
    mutationFn: async (notes: string) => {
      return apiRequest('PATCH', `/api/admin/plates/${plateId}`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plates', plateId] });
      toast({ title: "Saved", description: "Plate notes saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save notes", variant: "destructive" });
    },
  });

  const saveIndexSetsMutation = useMutation({
    mutationFn: async (data: { forwardIndexSetId: number | null; reverseIndexSetId: number | null }) => {
      return apiRequest('PATCH', `/api/admin/plates/${plateId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plates', plateId] });
      toast({ title: "Saved", description: "Index sets saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save index sets", variant: "destructive" });
    },
  });

  // Fetch pending plates for import
  const { data: pendingPlates } = useQuery<PendingPlate[]>({
    queryKey: ['/api/admin/pending-plates'],
    queryFn: async () => {
      const res = await fetch('/api/admin/pending-plates');
      if (!res.ok) throw new Error('Failed to fetch pending plates');
      return res.json();
    },
    enabled: importDialogOpen,
  });

  // Filter pending plates by search term
  const filteredPendingPlates = pendingPlates?.filter(p => {
    if (!importSearch) return true;
    const searchLower = importSearch.toLowerCase();
    return (p.name?.toLowerCase().includes(searchLower)) ||
           (p.notes?.toLowerCase().includes(searchLower)) ||
           p.id.toString().includes(searchLower);
  }) || [];

  const importPendingPlateMutation = useMutation({
    mutationFn: async (pendingPlateId: number) => {
      return apiRequest('POST', `/api/admin/plates/${plateId}/import-pending`, { pendingPlateId });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plates', plateId] });
      setImportDialogOpen(false);
      setSelectedPendingPlate(null);
      setImportSearch("");
      toast({ title: "Imported", description: "Pending plate data imported successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to import pending plate", variant: "destructive" });
    },
  });

  const updateSampleCountMutation = useMutation({
    mutationFn: async (sampleCount: number) => {
      return apiRequest('PATCH', `/api/admin/plates/${plateId}/sample-count`, { sampleCount });
    },
    onSuccess: async () => {
      await refetch();
      setEditPlateOpen(false);
      toast({ title: "Updated", description: "Sample count updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update sample count", variant: "destructive" });
    },
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/admin/plates/${plateId}/validate`, {});
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plates', plateId] });
      toast({ 
        title: "Validation Complete", 
        description: `Checked ${data.results.length} wells against iNaturalist` 
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Validation failed", variant: "destructive" });
    },
  });

  const clearDataMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/admin/plates/${plateId}/clear-data`, {});
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plates', plateId] });
      setWellData({});
      toast({ title: "Cleared", description: "All well data has been cleared" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to clear data", variant: "destructive" });
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
    return value;
  };

  const detectPlatform = (obsId: string, currentPlatform: string | null): string | null => {
    if (!obsId) return currentPlatform;
    const digits = obsId.replace(/\D/g, '');
    if (digits.length === 6) return 'MO';
    if (digits.length >= 8 && digits.length <= 9) return 'iNaturalist';
    return currentPlatform;
  };

  const handleWellChange = (wellId: number, field: keyof Well, value: string) => {
    let processedValue = value;
    let additionalUpdates: Partial<Well> = {};
    
    if (field === 'observationId') {
      processedValue = parseObservationId(value);
      const currentPlatform = wellData[wellId]?.platform ?? plate?.wells.find(w => w.id === wellId)?.platform ?? null;
      const detectedPlatform = detectPlatform(processedValue, currentPlatform);
      if (detectedPlatform && detectedPlatform !== currentPlatform) {
        additionalUpdates.platform = detectedPlatform;
      }
    }
    
    setWellData(prev => ({
      ...prev,
      [wellId]: { ...prev[wellId], [field]: processedValue, ...additionalUpdates }
    }));
  };

  const saveWell = useCallback((wellId: number) => {
    const data = wellData[wellId];
    if (data && Object.keys(data).length > 0) {
      updateWellMutation.mutate({ wellId, data });
      setWellData(prev => {
        const { [wellId]: _, ...rest } = prev;
        return rest;
      });
    }
  }, [wellData, updateWellMutation]);

  const handleKeyDown = (e: React.KeyboardEvent, wellId: number, currentIndex: number, field: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveWell(wellId);
      const nextWell = plate?.wells[currentIndex + 1];
      if (nextWell) {
        const nextRef = inputRefs.current[`${nextWell.id}-${field}`];
        if (nextRef) {
          nextRef.focus();
        }
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent, wellId: number, currentIndex: number, field: keyof Well) => {
    const pastedText = e.clipboardData.getData('text');
    const lines = pastedText.split(/[\r\n]+/).map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length > 1) {
      e.preventDefault();
      const sortedWells = plate ? [...plate.wells].sort((a, b) => a.sortOrder - b.sortOrder) : [];
      
      const updates: Record<number, Partial<Well>> = {};
      lines.forEach((line, i) => {
        const targetWell = sortedWells[currentIndex + i];
        if (targetWell) {
          let processedValue = line;
          let additionalUpdates: Partial<Well> = {};
          if (field === 'observationId') {
            processedValue = parseObservationId(line);
            const currentPlatform = wellData[targetWell.id]?.platform ?? targetWell.platform ?? null;
            const detectedPlatform = detectPlatform(processedValue, currentPlatform);
            if (detectedPlatform && detectedPlatform !== currentPlatform) {
              additionalUpdates.platform = detectedPlatform;
            }
          }
          updates[targetWell.id] = { ...wellData[targetWell.id], [field]: processedValue, ...additionalUpdates };
        }
      });
      
      setWellData(prev => ({ ...prev, ...updates }));
      
      Object.entries(updates).forEach(([id, data]) => {
        updateWellMutation.mutate({ wellId: parseInt(id), data });
      });
      
      toast({
        title: "Pasted",
        description: `Applied ${Math.min(lines.length, sortedWells.length - currentIndex)} values to rows`,
      });
    }
  };

  // Check if fill-down would overwrite existing data
  const checkFillDownOverwrite = useCallback((startIndex: number, endIndex: number): string[] => {
    if (!plate) return [];
    const sortedWells = [...plate.wells].sort((a, b) => a.sortOrder - b.sortOrder);
    const conflicts: string[] = [];
    
    for (let i = startIndex + 1; i <= endIndex; i++) {
      const well = sortedWells[i];
      const localLabCode = wellData[well.id]?.labCode;
      const actualLabCode = localLabCode ?? well?.labCode;
      if (actualLabCode) {
        conflicts.push(`Row ${i + 1} (${well.wellPosition}): ${actualLabCode}`);
      }
    }
    return conflicts;
  }, [plate, wellData]);

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
        
        // Update local state
        setWellData(prev => ({
          ...prev,
          [well.id]: { ...prev[well.id], labCode: newLabCode }
        }));
        
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
            <Link href="/admin/runs">
              <Button>Back to Runs</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sortedWells = [...plate.wells].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Link href={`/admin/runs/${plate.runId}`}>
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ChevronLeft className="h-4 w-4 mr-1" /> Back to Run
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900" data-testid="text-plate-title">
                {plate.runName || `Run ${plate.runId}`} - Plate {plate.plateNumber}
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
              variant="outline"
              onClick={() => setImportDialogOpen(true)}
              data-testid="button-import-pending"
            >
              <Download className="h-4 w-4 mr-1" /> Import from Pending
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
          </div>

          <Dialog open={editPlateOpen} onOpenChange={setEditPlateOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Plate Settings</DialogTitle>
              </DialogHeader>
              <div className="py-4 space-y-4">
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
                  onClick={() => updateSampleCountMutation.mutate(editSampleCount)}
                  disabled={updateSampleCountMutation.isPending}
                  data-testid="button-confirm-edit-plate"
                >
                  {updateSampleCountMutation.isPending ? "Updating..." : "Update Plate"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Import from Pending Plates Dialog */}
          <Dialog open={importDialogOpen} onOpenChange={(open) => {
            setImportDialogOpen(open);
            if (!open) {
              setSelectedPendingPlate(null);
              setImportSearch("");
            }
          }}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Import from Pending Plates</DialogTitle>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search pending plates by name or ID..."
                    value={importSearch}
                    onChange={(e) => setImportSearch(e.target.value)}
                    className="pl-10"
                    data-testid="input-import-search"
                  />
                </div>
                
                <div className="max-h-[300px] overflow-auto border rounded-md">
                  {filteredPendingPlates.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      {pendingPlates?.length === 0 ? "No pending plates available" : "No matching plates found"}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Samples</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPendingPlates.map((pendingPlate) => {
                          const filledWells = pendingPlate.wells.filter(w => w.observationId || w.labCode).length;
                          const isSelected = selectedPendingPlate?.id === pendingPlate.id;
                          return (
                            <TableRow 
                              key={pendingPlate.id}
                              className={`cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                              onClick={() => setSelectedPendingPlate(pendingPlate)}
                              data-testid={`row-pending-plate-${pendingPlate.id}`}
                            >
                              <TableCell className="font-medium">
                                {pendingPlate.name || `Plate ${pendingPlate.id}`}
                              </TableCell>
                              <TableCell>
                                {filledWells} / {pendingPlate.wells.length}
                              </TableCell>
                              <TableCell className="text-sm text-gray-500">
                                {pendingPlate.createdAt ? new Date(pendingPlate.createdAt).toLocaleDateString() : '—'}
                              </TableCell>
                              <TableCell>
                                {isSelected && (
                                  <Badge className="bg-blue-500">Selected</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>

                {selectedPendingPlate && (() => {
                  const pendingFilledPositions = new Set(
                    selectedPendingPlate.wells
                      .filter(w => w.observationId || w.labCode)
                      .map(w => w.wellPosition)
                  );
                  const currentFilledWells = plate?.wells.filter(w => 
                    (w.observationId || w.labCode) && pendingFilledPositions.has(w.wellPosition)
                  ) || [];
                  const willOverwrite = currentFilledWells.length;

                  return (
                    <div className="space-y-3">
                      <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
                        <p className="text-sm">
                          <strong>Selected:</strong> {selectedPendingPlate.name || `Plate ${selectedPendingPlate.id}`}
                        </p>
                        <p className="text-sm text-gray-600">
                          This will import {pendingFilledPositions.size} samples into the current plate.
                        </p>
                      </div>
                      {willOverwrite > 0 && (
                        <div className="p-3 bg-amber-50 rounded-md border border-amber-300">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-amber-800">
                                Warning: {willOverwrite} well{willOverwrite > 1 ? 's' : ''} will be overwritten
                              </p>
                              <p className="text-sm text-amber-700 mt-1">
                                The following positions already have data: {currentFilledWells.slice(0, 10).map(w => w.wellPosition).join(', ')}
                                {currentFilledWells.length > 10 ? `, and ${currentFilledWells.length - 10} more` : ''}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => selectedPendingPlate && importPendingPlateMutation.mutate(selectedPendingPlate.id)}
                  disabled={!selectedPendingPlate || importPendingPlateMutation.isPending}
                  className="bg-[#8CBD45] hover:bg-[#7aab3d]"
                  data-testid="button-confirm-import"
                >
                  {importPendingPlateMutation.isPending ? "Importing..." : "Import Data"}
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
                  <Label htmlFor="fill-target-seq">Enter the final lab code in the series:</Label>
                  <Input
                    id="fill-target-seq"
                    placeholder={fillDownMode ? incrementLabCode(parseLabCode(fillDownMode.sourceValue)!, 5) : ""}
                    value={fillDownTarget}
                    onChange={(e) => setFillDownTarget(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && fillDownTarget) {
                        handleFillDownByCode();
                      }
                    }}
                    data-testid="input-fill-target-seq"
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
              <DialogFooter className="flex gap-2">
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
                  data-testid="button-select-row-seq"
                >
                  Select Row
                </Button>
                <Button 
                  onClick={handleFillDownByCode}
                  disabled={!fillDownTarget}
                  data-testid="button-confirm-fill-seq"
                >
                  Fill Down
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Validation Summary */}
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
                  // Cleared = was validated but now has no status (manually cleared)
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

        <Card className={(!forwardIndexSetId || !reverseIndexSetId) ? "border-red-300 bg-red-50" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              Index Sets
              {(!forwardIndexSetId || !reverseIndexSetId) && (
                <Badge variant="destructive" className="text-xs">Required for Validation</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4 flex-wrap items-end">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="forward-index-set">Forward Index Set</Label>
              <Select 
                value={forwardIndexSetId?.toString() || ""} 
                onValueChange={(val) => setForwardIndexSetId(val ? parseInt(val) : null)}
              >
                <SelectTrigger data-testid="select-forward-index-set">
                  <SelectValue placeholder="Select forward index set..." />
                </SelectTrigger>
                <SelectContent>
                  {indexSets?.filter(s => s.orientation === "Forward").map(set => (
                    <SelectItem key={set.id} value={set.id.toString()}>
                      {set.title} ({set.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="reverse-index-set">Reverse Index Set</Label>
              <Select 
                value={reverseIndexSetId?.toString() || ""} 
                onValueChange={(val) => setReverseIndexSetId(val ? parseInt(val) : null)}
              >
                <SelectTrigger data-testid="select-reverse-index-set">
                  <SelectValue placeholder="Select reverse index set..." />
                </SelectTrigger>
                <SelectContent>
                  {indexSets?.filter(s => s.orientation === "Reverse").map(set => (
                    <SelectItem key={set.id} value={set.id.toString()}>
                      {set.title} ({set.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={() => saveIndexSetsMutation.mutate({ forwardIndexSetId, reverseIndexSetId })}
              disabled={saveIndexSetsMutation.isPending}
              data-testid="button-save-index-sets"
            >
              <Save className="h-4 w-4 mr-1" /> {saveIndexSetsMutation.isPending ? "Saving..." : "Save Index Sets"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Default Primers</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4 flex-wrap items-end">
            <div className="flex-1 min-w-[180px]">
              <Label htmlFor="default-pool">Primer Pool</Label>
              <Select 
                value={activePrimerPools.find(p => p.name === defaultPrimerPool)?.id.toString() || ""}
                onValueChange={handlePrimerPoolSelect}
              >
                <SelectTrigger data-testid="select-default-primer-pool">
                  <SelectValue placeholder="Select primer pool..." />
                </SelectTrigger>
                <SelectContent>
                  {activePrimerPools.map((pool) => (
                    <SelectItem key={pool.id} value={pool.id.toString()}>
                      {pool.name} ({pool.forwardPrimerSet?.title} / {pool.reversePrimerSet?.title})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[150px]">
              <Label htmlFor="default-fwd">Forward Primer</Label>
              <Input 
                id="default-fwd" 
                value={defaultForward}
                onChange={(e) => setDefaultForward(e.target.value)}
                placeholder="e.g., ITS1F"
                className="bg-gray-50"
                readOnly
                data-testid="input-default-forward"
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <Label htmlFor="default-rev">Reverse Primer</Label>
              <Input 
                id="default-rev" 
                value={defaultReverse}
                onChange={(e) => setDefaultReverse(e.target.value)}
                placeholder="e.g., ITS4"
                className="bg-gray-50"
                readOnly
                data-testid="input-default-reverse"
              />
            </div>
            <Button 
              onClick={() => bulkUpdateMutation.mutate({ primerPool: defaultPrimerPool, forwardPrimer: defaultForward, reversePrimer: defaultReverse })}
              disabled={bulkUpdateMutation.isPending || !defaultPrimerPool}
              data-testid="button-apply-primers"
            >
              <Save className="h-4 w-4 mr-1" /> Apply to All
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
                    <TableHead className="w-[100px]">Primer Pool</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedWells.map((well, index) => {
                    const localData = wellData[well.id] || {};
                    const obsId = localData.observationId ?? well.observationId ?? "";
                    const labCode = localData.labCode ?? well.labCode ?? "";
                    const platform = localData.platform ?? well.platform ?? "";
                    // Use local validation status if available (null means cleared), otherwise use server status
                    const isValidated = localData.isValidated !== undefined ? localData.isValidated : well.isValidated;
                    const validationStatus = localData.validationStatus !== undefined ? localData.validationStatus : well.validationStatus;
                    const validationClass = validationStatus ? validationColors[validationStatus] : "";
                    
                    return (
                      <TableRow 
                        key={well.id} 
                        className={validationClass}
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
                              ref={el => inputRefs.current[`${well.id}-labCode`] = el}
                              className="h-8 flex-1"
                              placeholder="Enter lab code"
                              value={labCode}
                              onChange={(e) => handleWellChange(well.id, 'labCode', e.target.value)}
                              onBlur={() => saveWell(well.id)}
                              onKeyDown={(e) => handleKeyDown(e, well.id, index, 'labCode')}
                              onPaste={(e) => handlePaste(e, well.id, index, 'labCode')}
                              data-testid={`input-labcode-${well.wellPosition}`}
                            />
                            {labCode && parseLabCode(labCode) && !fillDownMode && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 flex-shrink-0 text-gray-400 hover:text-blue-600"
                                onClick={() => {
                                  setFillDownMode({ active: true, sourceIndex: index, sourceValue: labCode });
                                  setFillDownTarget(labCode);
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
                            value={platform || "empty"}
                            onValueChange={(val) => {
                              const newPlatform = val === "empty" ? "" : val;
                              handleWellChange(well.id, 'platform', newPlatform);
                              // Clear validation status when platform changes since it needs re-validation
                              setWellData(prev => ({
                                ...prev,
                                [well.id]: { 
                                  ...prev[well.id], 
                                  platform: newPlatform,
                                  validationStatus: null,
                                  isValidated: false
                                }
                              }));
                              setTimeout(() => {
                                updateWellMutation.mutate({ 
                                  wellId: well.id, 
                                  data: { 
                                    platform: newPlatform, 
                                    validationStatus: null, 
                                    validationMessage: null,
                                    isValidated: false 
                                  } 
                                });
                              }, 0);
                            }}
                          >
                            <SelectTrigger 
                              className={`h-8 ${!platform && isValidated ? 'border-red-500 border-2' : ''}`} 
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
                              ref={el => inputRefs.current[`${well.id}-observationId`] = el}
                              className="h-8"
                              placeholder="Enter obs ID"
                              value={obsId}
                              onChange={(e) => handleWellChange(well.id, 'observationId', e.target.value)}
                              onBlur={() => saveWell(well.id)}
                              onKeyDown={(e) => handleKeyDown(e, well.id, index, 'observationId')}
                              onPaste={(e) => handlePaste(e, well.id, index, 'observationId')}
                              data-testid={`input-obs-${well.wellPosition}`}
                            />
                            {obsId && platform && getObservationUrl(platform, obsId) && (
                              <a
                                href={getObservationUrl(platform, obsId)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-400 hover:text-blue-600 flex-shrink-0"
                                title={`View on ${platform}`}
                                data-testid={`link-obs-${well.wellPosition}`}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {isValidated && validationStatus && (
                            <div className="flex items-center gap-1" title={well.validationMessage || undefined}>
                              {validationStatus === 'valid' || validationStatus === 'no_voucher' ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : validationStatus === 'pending' ? (
                                <Clock className="h-4 w-4 text-blue-500" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-red-500" />
                              )}
                              <span className="text-xs capitalize">
                                {validationStatus?.replace('_', ' ')}
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
                        <TableCell className="text-sm text-gray-600">
                          {well.primerPool || '—'}
                        </TableCell>
                        <TableCell>
                          {validationStatus && !['valid', 'no_voucher'].includes(validationStatus) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => {
                                setWellData(prev => ({
                                  ...prev,
                                  [well.id]: { 
                                    ...prev[well.id], 
                                    validationStatus: null,
                                    validationMessage: null,
                                    isValidated: false
                                  }
                                }));
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
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            
            {/* Clear Data Button */}
            <div className="mt-6 pt-4 border-t flex justify-end">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-500 hover:text-red-600 hover:bg-red-50"
                    data-testid="button-clear-all-data"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear All Data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all plate data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove all observation IDs, lab codes, primer assignments, and validation data from every well on this plate. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => clearDataMutation.mutate()}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {clearDataMutation.isPending ? "Clearing..." : "Yes, clear all data"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
