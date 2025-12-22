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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Grid3X3, CheckCircle, AlertCircle, RefreshCw, Save, Settings } from "lucide-react";
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
  forwardPrimer: string | null;
  reversePrimer: string | null;
  isValidated: boolean;
  validationStatus: string | null;
  validationMessage: string | null;
  voucherNumber: string | null;
  username: string | null;
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

const validationColors: Record<string, string> = {
  valid: "bg-green-50",
  mismatch: "bg-red-50",
  no_voucher: "bg-yellow-50",
  error: "bg-red-50",
  missing_platform: "bg-orange-50",
  no_observation: "bg-purple-50",
  multiple_inat: "bg-red-100",
  not_fungal: "bg-red-200",
};

export default function AdminPlateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const plateId = parseInt(id);
  const { toast } = useToast();
  
  const [wellData, setWellData] = useState<Record<number, Partial<Well>>>({});
  const [defaultForward, setDefaultForward] = useState("");
  const [defaultReverse, setDefaultReverse] = useState("");
  const [plateNotes, setPlateNotes] = useState("");
  const [forwardIndexSetId, setForwardIndexSetId] = useState<number | null>(null);
  const [reverseIndexSetId, setReverseIndexSetId] = useState<number | null>(null);
  const [editPlateOpen, setEditPlateOpen] = useState(false);
  const [editSampleCount, setEditSampleCount] = useState(96);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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

  const updateWellMutation = useMutation({
    mutationFn: async ({ wellId, data }: { wellId: number; data: any }) => {
      return apiRequest('PATCH', `/api/admin/wells/${wellId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plates', plateId] });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (data: { forwardPrimer?: string; reversePrimer?: string }) => {
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
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{plate.status}</Badge>
                {plate.wells.filter(w => w.observationId || w.labCode).length > 0 && (
                  <span className="text-sm text-gray-600">
                    {plate.wells.filter(w => w.observationId || w.labCode).length} samples
                  </span>
                )}
              </div>
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
        </div>

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
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="default-fwd">Forward Primer</Label>
              <Input 
                id="default-fwd" 
                value={defaultForward}
                onChange={(e) => setDefaultForward(e.target.value)}
                placeholder="e.g., ITS1F"
                data-testid="input-default-forward"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="default-rev">Reverse Primer</Label>
              <Input 
                id="default-rev" 
                value={defaultReverse}
                onChange={(e) => setDefaultReverse(e.target.value)}
                placeholder="e.g., ITS4"
                data-testid="input-default-reverse"
              />
            </div>
            <Button 
              onClick={() => bulkUpdateMutation.mutate({ forwardPrimer: defaultForward, reversePrimer: defaultReverse })}
              disabled={bulkUpdateMutation.isPending}
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
                    <TableHead className="w-[100px]">Fwd Primer</TableHead>
                    <TableHead className="w-[100px]">Rev Primer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedWells.map((well, index) => {
                    const localData = wellData[well.id] || {};
                    const obsId = localData.observationId ?? well.observationId ?? "";
                    const labCode = localData.labCode ?? well.labCode ?? "";
                    const platform = localData.platform ?? well.platform ?? "";
                    const validationClass = well.validationStatus ? validationColors[well.validationStatus] : "";
                    
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
                          <Input 
                            ref={el => inputRefs.current[`${well.id}-labCode`] = el}
                            className="h-8"
                            placeholder="Enter lab code"
                            value={labCode}
                            onChange={(e) => handleWellChange(well.id, 'labCode', e.target.value)}
                            onBlur={() => saveWell(well.id)}
                            onKeyDown={(e) => handleKeyDown(e, well.id, index, 'labCode')}
                            onPaste={(e) => handlePaste(e, well.id, index, 'labCode')}
                            data-testid={`input-labcode-${well.wellPosition}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Select 
                            value={platform || "empty"}
                            onValueChange={(val) => {
                              handleWellChange(well.id, 'platform', val === "empty" ? "" : val);
                              setTimeout(() => saveWell(well.id), 0);
                            }}
                          >
                            <SelectTrigger 
                              className={`h-8 ${!platform && well.isValidated ? 'border-red-500 border-2' : ''}`} 
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
                        </TableCell>
                        <TableCell>
                          {well.isValidated && (
                            <div className="flex items-center gap-1" title={well.validationMessage || undefined}>
                              {well.validationStatus === 'valid' ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
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
                          {well.forwardPrimer || '—'}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {well.reversePrimer || '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
