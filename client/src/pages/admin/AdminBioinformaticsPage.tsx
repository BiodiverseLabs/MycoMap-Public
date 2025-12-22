import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ChevronLeft, Plus, Pencil, Trash2, Code, Terminal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface LabRun {
  id: number;
  name: string;
  status: string;
  createdAt: string;
}

interface BioStep {
  id: number;
  runId: number;
  stage: string;
  name: string;
  code: string;
  notes?: string | null;
  sequence?: number | null;
  createdAt: string;
  updatedAt: string;
}

interface BioStepsResponse {
  steps: BioStep[];
  grouped: Record<string, BioStep[]>;
}

const STAGES = [
  { value: 'basecalling', label: 'Basecalling' },
  { value: 'qc_filtering', label: 'QC Filtering' },
  { value: 'qc_reports', label: 'QC Reports' },
  { value: 'demultiplexing', label: 'Demultiplexing' },
  { value: 'consensus_building', label: 'Consensus Building' },
];

export default function AdminBioinformaticsPage() {
  const { toast } = useToast();
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<BioStep | null>(null);
  const [stage, setStage] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState("");

  const { data: runs, isLoading: runsLoading } = useQuery<LabRun[]>({
    queryKey: ['/api/admin/runs'],
    queryFn: async () => {
      const res = await fetch('/api/admin/runs');
      if (!res.ok) throw new Error('Failed to fetch runs');
      return res.json();
    },
  });

  const { data: bioData, isLoading: bioLoading } = useQuery<BioStepsResponse>({
    queryKey: ['/api/admin/runs', selectedRunId, 'bioinformatics'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/runs/${selectedRunId}/bioinformatics`);
      if (!res.ok) throw new Error('Failed to fetch bioinformatics steps');
      return res.json();
    },
    enabled: !!selectedRunId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { stage: string; name: string; code: string; notes?: string }) => {
      return apiRequest('POST', `/api/admin/runs/${selectedRunId}/bioinformatics`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/runs', selectedRunId, 'bioinformatics'] });
      closeDialog();
      toast({ title: "Created", description: "Bioinformatics component added successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create component", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest('PATCH', `/api/admin/bioinformatics/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/runs', selectedRunId, 'bioinformatics'] });
      closeDialog();
      toast({ title: "Updated", description: "Component updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update component", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/bioinformatics/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/runs', selectedRunId, 'bioinformatics'] });
      toast({ title: "Deleted", description: "Component removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete component", variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingStep(null);
    setStage("");
    setName("");
    setCode("");
    setNotes("");
  };

  const openAddDialog = (stageValue: string) => {
    setEditingStep(null);
    setStage(stageValue);
    setName("");
    setCode("");
    setNotes("");
    setDialogOpen(true);
  };

  const openEditDialog = (step: BioStep) => {
    setEditingStep(step);
    setStage(step.stage);
    setName(step.name);
    setCode(step.code);
    setNotes(step.notes || "");
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!name.trim() || !code.trim()) {
      toast({ title: "Error", description: "Name and code are required", variant: "destructive" });
      return;
    }

    if (editingStep) {
      updateMutation.mutate({ id: editingStep.id, data: { name, code, notes } });
    } else {
      createMutation.mutate({ stage, name, code, notes });
    }
  };

  const getStageLabel = (stageValue: string) => {
    return STAGES.find(s => s.value === stageValue)?.label || stageValue;
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <Link href="/admin/runs">
          <Button variant="ghost" size="sm" className="mb-2" data-testid="button-back-runs">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Lab Runs
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-[#8CBD45] flex items-center gap-3">
          <Terminal className="h-8 w-8" />
          Bioinformatics Management
        </h1>
        <p className="text-gray-600 mt-1">Track and manage bioinformatics code for your lab runs</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Select Lab Run</CardTitle>
        </CardHeader>
        <CardContent>
          {runsLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={selectedRunId} onValueChange={setSelectedRunId}>
              <SelectTrigger className="w-full" data-testid="select-run">
                <SelectValue placeholder="Select a lab run..." />
              </SelectTrigger>
              <SelectContent>
                {runs?.map((run) => (
                  <SelectItem key={run.id} value={run.id.toString()}>
                    {run.name} ({run.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedRunId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5 text-[#A87146]" />
              Pipeline Stages
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bioLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : (
              <Accordion type="multiple" defaultValue={STAGES.map(s => s.value)} className="w-full">
                {STAGES.map((stageInfo) => {
                  const steps = bioData?.grouped?.[stageInfo.value] || [];
                  return (
                    <AccordionItem key={stageInfo.value} value={stageInfo.value} className="border rounded-lg mb-2 px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center justify-between w-full pr-4">
                          <span className="font-semibold text-[#A87146]">{stageInfo.label}</span>
                          <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                            {steps.length} component{steps.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 pb-3">
                          {steps.length === 0 ? (
                            <p className="text-gray-500 text-sm italic">No components added yet</p>
                          ) : (
                            steps.map((step) => (
                              <div
                                key={step.id}
                                className="border rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <h4 className="font-medium text-gray-800">{step.name}</h4>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openEditDialog(step)}
                                      data-testid={`button-edit-step-${step.id}`}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => deleteMutation.mutate(step.id)}
                                      className="text-red-500 hover:text-red-700"
                                      data-testid={`button-delete-step-${step.id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                                <pre className="bg-gray-900 text-green-400 p-3 rounded text-sm overflow-x-auto font-mono">
                                  {step.code}
                                </pre>
                                {step.notes && (
                                  <p className="text-sm text-gray-600 mt-2 italic">{step.notes}</p>
                                )}
                              </div>
                            ))
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAddDialog(stageInfo.value)}
                            className="w-full border-dashed"
                            data-testid={`button-add-${stageInfo.value}`}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add {stageInfo.label} Component
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingStep ? 'Edit Component' : `Add ${getStageLabel(stage)} Component`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., MinKNOW Basecalling"
                data-testid="input-name"
              />
            </div>
            <div>
              <Label htmlFor="code">Code / Command</Label>
              <Textarea
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter the command or code snippet..."
                className="font-mono min-h-[150px]"
                data-testid="input-code"
              />
            </div>
            <div>
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes or documentation..."
                className="min-h-[80px]"
                data-testid="input-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-[#8CBD45] hover:bg-[#7aab3a]"
              data-testid="button-save"
            >
              {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
