import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Grid3X3, CheckCircle, AlertCircle, RefreshCw, Save } from "lucide-react";
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
}

interface Plate {
  id: number;
  plateNumber: number;
  name: string | null;
  notes: string | null;
  runId: number;
  orientation: string;
  status: string;
  defaultForwardPrimer: string | null;
  defaultReversePrimer: string | null;
  wells: Well[];
}

const validationColors: Record<string, string> = {
  valid: "bg-green-50",
  mismatch: "bg-red-50",
  no_voucher: "bg-yellow-50",
  error: "bg-red-50",
};

export default function AdminPlateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const plateId = parseInt(id);
  const { toast } = useToast();
  
  const [wellData, setWellData] = useState<Record<number, Partial<Well>>>({});
  const [defaultForward, setDefaultForward] = useState("");
  const [defaultReverse, setDefaultReverse] = useState("");
  const [plateNotes, setPlateNotes] = useState("");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: plate, isLoading, refetch } = useQuery<Plate>({
    queryKey: ['/api/admin/plates', plateId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/plates/${plateId}`);
      if (!res.ok) throw new Error('Failed to fetch plate');
      return res.json();
    },
  });

  useEffect(() => {
    if (plate) {
      setDefaultForward(plate.defaultForwardPrimer || "");
      setDefaultReverse(plate.defaultReversePrimer || "");
      setPlateNotes(plate.notes || "");
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

  const handleWellChange = (wellId: number, field: keyof Well, value: string) => {
    let processedValue = value;
    if (field === 'observationId') {
      processedValue = parseObservationId(value);
    }
    setWellData(prev => ({
      ...prev,
      [wellId]: { ...prev[wellId], [field]: processedValue }
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
          if (field === 'observationId') {
            processedValue = parseObservationId(line);
          }
          updates[targetWell.id] = { ...wellData[targetWell.id], [field]: processedValue };
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
                Plate {plate.plateNumber} - {plate.name || 'Untitled'}
              </h1>
              <Badge variant="secondary">{plate.status}</Badge>
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
              onClick={() => validateMutation.mutate()}
              disabled={validateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-validate"
            >
              <CheckCircle className="h-4 w-4 mr-1" /> 
              {validateMutation.isPending ? "Validating..." : "Validate Plate"}
            </Button>
          </div>
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
                    <TableHead className="w-[80px]">Well Position</TableHead>
                    <TableHead className="w-[180px]">Lab Code</TableHead>
                    <TableHead className="w-[120px]">Platform</TableHead>
                    <TableHead className="w-[150px]">Observation Number</TableHead>
                    <TableHead className="w-[100px]">Validation</TableHead>
                    <TableHead>Voucher #</TableHead>
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
                            <SelectTrigger className="h-8" data-testid={`select-platform-${well.wellPosition}`}>
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
                          {well.voucherNumber || '—'}
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
