import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Grid3X3, CheckCircle, AlertCircle, RefreshCw, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useCallback } from "react";

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
  valid: "border-green-500 bg-green-50",
  mismatch: "border-red-500 bg-red-50",
  no_voucher: "border-yellow-500 bg-yellow-50",
  error: "border-red-500 bg-red-50",
};

export default function AdminPlateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const plateId = parseInt(id);
  const { toast } = useToast();
  
  const [wellData, setWellData] = useState<Record<number, Partial<Well>>>({});
  const [selectedWellId, setSelectedWellId] = useState<number | null>(null);
  const [defaultForward, setDefaultForward] = useState("");
  const [defaultReverse, setDefaultReverse] = useState("");
  const [plateNotes, setPlateNotes] = useState("");

  const { data: plate, isLoading, refetch } = useQuery<Plate>({
    queryKey: ['/api/admin/plates', plateId],
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

  const handleWellChange = (wellId: number, field: keyof Well, value: string) => {
    setWellData(prev => ({
      ...prev,
      [wellId]: { ...prev[wellId], [field]: value }
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

  const handleKeyDown = (e: React.KeyboardEvent, wellId: number, currentIndex: number) => {
    if (e.key === 'Tab' || e.key === 'Enter') {
      saveWell(wellId);
      if (e.key === 'Enter') {
        const nextWell = plate?.wells[currentIndex + 1];
        if (nextWell) {
          setSelectedWellId(nextWell.id);
          setTimeout(() => {
            document.getElementById(`well-obs-${nextWell.id}`)?.focus();
          }, 0);
        }
      }
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

  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const cols = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

  const wellsByPosition = Object.fromEntries(
    plate.wells.map(w => [w.wellPosition, w])
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-full mx-auto space-y-4">
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
              <Badge variant="secondary">{plate.orientation}</Badge>
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

        <Card className="overflow-x-auto">
          <CardContent className="p-2">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="w-8 p-1 border bg-gray-100"></th>
                  {cols.map((col) => (
                    <th key={col} className="w-24 p-1 border bg-gray-100 text-center font-semibold">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row}>
                    <td className="p-1 border bg-gray-100 text-center font-semibold">{row}</td>
                    {cols.map((col) => {
                      const pos = `${row}${col}`;
                      const well = wellsByPosition[pos];
                      if (!well) return <td key={pos} className="border bg-gray-50" />;
                      
                      const localData = wellData[well.id] || {};
                      const obsId = localData.observationId ?? well.observationId ?? "";
                      const labCode = localData.labCode ?? well.labCode ?? "";
                      const platform = localData.platform ?? well.platform ?? "";
                      
                      const validationClass = well.validationStatus ? validationColors[well.validationStatus] : "";
                      
                      return (
                        <td 
                          key={pos} 
                          className={`border p-1 ${validationClass}`}
                          title={well.validationMessage || undefined}
                          data-testid={`cell-${pos}`}
                        >
                          <div className="space-y-1">
                            <Select 
                              value={platform || "empty"}
                              onValueChange={(val) => handleWellChange(well.id, 'platform', val === "empty" ? "" : val)}
                            >
                              <SelectTrigger className="h-6 text-xs">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="empty">—</SelectItem>
                                <SelectItem value="iNaturalist">iNat</SelectItem>
                                <SelectItem value="MO">MO</SelectItem>
                                <SelectItem value="MyCoPortal">MCP</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input 
                              id={`well-obs-${well.id}`}
                              className="h-6 text-xs"
                              placeholder="Obs ID"
                              value={obsId}
                              onChange={(e) => handleWellChange(well.id, 'observationId', e.target.value)}
                              onBlur={() => saveWell(well.id)}
                              onKeyDown={(e) => handleKeyDown(e, well.id, plate.wells.findIndex(w => w.id === well.id))}
                              data-testid={`input-obs-${pos}`}
                            />
                            <Input 
                              className="h-6 text-xs"
                              placeholder="Lab Code"
                              value={labCode}
                              onChange={(e) => handleWellChange(well.id, 'labCode', e.target.value)}
                              onBlur={() => saveWell(well.id)}
                              data-testid={`input-code-${pos}`}
                            />
                            {well.isValidated && (
                              <div className="flex items-center gap-1">
                                {well.validationStatus === 'valid' ? (
                                  <CheckCircle className="h-3 w-3 text-green-600" />
                                ) : (
                                  <AlertCircle className="h-3 w-3 text-red-500" />
                                )}
                                {well.voucherNumber && (
                                  <span className="text-xs text-gray-500 truncate">{well.voucherNumber}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-green-500 bg-green-50 rounded" />
                <span>Valid</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-yellow-500 bg-yellow-50 rounded" />
                <span>No Voucher</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-red-500 bg-red-50 rounded" />
                <span>Mismatch/Error</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
