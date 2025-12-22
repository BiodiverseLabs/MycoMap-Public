import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, Pencil, Trash2, Code, Terminal, FileCode, Cpu, Filter, BarChart3, Layers, Combine } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface BioMethod {
  id: number;
  stage: string;
  name: string;
  code: string;
  description?: string | null;
  notes?: string | null;
  sortOrder?: number | null;
  createdAt: string;
  updatedAt: string;
}

interface BioMethodsResponse {
  methods: BioMethod[];
  grouped: Record<string, BioMethod[]>;
}

const STAGES = [
  { value: 'basecalling', label: 'Basecalling', icon: Cpu, description: 'Convert raw signal data to nucleotide sequences' },
  { value: 'qc_filtering', label: 'QC Filtering', icon: Filter, description: 'Filter reads based on quality metrics' },
  { value: 'qc_reports', label: 'QC Reports', icon: BarChart3, description: 'Generate quality control reports and visualizations' },
  { value: 'demultiplexing', label: 'Demultiplexing', icon: Layers, description: 'Separate pooled samples by barcode/index' },
  { value: 'consensus_building', label: 'Consensus Building', icon: Combine, description: 'Build consensus sequences from aligned reads' },
];

export default function AdminBioinformaticsPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<BioMethod | null>(null);
  const [stage, setStage] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  const { data: bioData, isLoading } = useQuery<BioMethodsResponse>({
    queryKey: ['/api/admin/bioinformatics/methods'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { stage: string; name: string; code: string; description?: string; notes?: string }) => {
      return apiRequest('POST', '/api/admin/bioinformatics/methods', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bioinformatics/methods'] });
      closeDialog();
      toast({ title: "Created", description: "Method added successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create method", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest('PATCH', `/api/admin/bioinformatics/methods/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bioinformatics/methods'] });
      closeDialog();
      toast({ title: "Updated", description: "Method updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update method", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/bioinformatics/methods/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bioinformatics/methods'] });
      toast({ title: "Deleted", description: "Method removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete method", variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingMethod(null);
    setStage("");
    setName("");
    setCode("");
    setDescription("");
    setNotes("");
  };

  const openAddDialog = (stageValue: string) => {
    setEditingMethod(null);
    setStage(stageValue);
    setName("");
    setCode("");
    setDescription("");
    setNotes("");
    setDialogOpen(true);
  };

  const openEditDialog = (method: BioMethod) => {
    setEditingMethod(method);
    setStage(method.stage);
    setName(method.name);
    setCode(method.code);
    setDescription(method.description || "");
    setNotes(method.notes || "");
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!name.trim() || !code.trim()) {
      toast({ title: "Error", description: "Name and code are required", variant: "destructive" });
      return;
    }

    if (editingMethod) {
      updateMutation.mutate({ id: editingMethod.id, data: { name, code, description, notes } });
    } else {
      createMutation.mutate({ stage, name, code, description, notes });
    }
  };

  const getStageLabel = (stageValue: string) => {
    return STAGES.find(s => s.value === stageValue)?.label || stageValue;
  };

  const getStageIcon = (stageValue: string) => {
    const stage = STAGES.find(s => s.value === stageValue);
    return stage?.icon || Code;
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[#8CBD45] flex items-center gap-3" data-testid="text-page-title">
          <Terminal className="h-8 w-8" />
          Bioinformatics Management
        </h1>
        <p className="text-gray-600 mt-1">
          Define and manage bioinformatics pipeline methods for DNA barcoding workflows
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {STAGES.map((stageInfo) => {
            const methods = bioData?.grouped?.[stageInfo.value] || [];
            const StageIcon = stageInfo.icon;
            
            return (
              <Card key={stageInfo.value} className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-slate-50 to-white border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-[#8CBD45]/10">
                        <StageIcon className="h-5 w-5 text-[#8CBD45]" />
                      </div>
                      <div>
                        <CardTitle className="text-lg text-[#A87146]">{stageInfo.label}</CardTitle>
                        <p className="text-sm text-gray-500">{stageInfo.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                        {methods.length} method{methods.length !== 1 ? 's' : ''}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAddDialog(stageInfo.value)}
                        className="gap-1"
                        data-testid={`button-add-${stageInfo.value}`}
                      >
                        <Plus className="h-4 w-4" />
                        Add Method
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  {methods.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <FileCode className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No methods defined for this stage</p>
                      <Button
                        variant="link"
                        onClick={() => openAddDialog(stageInfo.value)}
                        className="text-[#8CBD45]"
                      >
                        Add your first method
                      </Button>
                    </div>
                  ) : (
                    <Accordion type="multiple" defaultValue={methods.map(m => m.id.toString())} className="space-y-2">
                      {methods.map((method) => (
                        <AccordionItem 
                          key={method.id} 
                          value={method.id.toString()}
                          className="border rounded-lg px-4 bg-gray-50"
                        >
                          <AccordionTrigger className="hover:no-underline py-3">
                            <div className="flex items-center justify-between w-full pr-4">
                              <div className="flex items-center gap-2">
                                <Code className="h-4 w-4 text-[#A87146]" />
                                <span className="font-medium text-gray-800">{method.name}</span>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pb-4">
                            {method.description && (
                              <p className="text-sm text-gray-600 mb-3">{method.description}</p>
                            )}
                            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto font-mono mb-3">
                              {method.code}
                            </pre>
                            {method.notes && (
                              <p className="text-sm text-gray-500 italic mb-3 bg-amber-50 p-2 rounded border-l-2 border-amber-300">
                                {method.notes}
                              </p>
                            )}
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditDialog(method)}
                                data-testid={`button-edit-method-${method.id}`}
                              >
                                <Pencil className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteMutation.mutate(method.id)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                data-testid={`button-delete-method-${method.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingMethod ? 'Edit Method' : `Add ${getStageLabel(stage)} Method`}
            </DialogTitle>
            <DialogDescription>
              Define a bioinformatics method with code/commands for this pipeline stage
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Method Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., MinKNOW High Accuracy Basecalling"
                data-testid="input-name"
              />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this method"
                data-testid="input-description"
              />
            </div>
            <div>
              <Label htmlFor="code">Code / Command</Label>
              <Textarea
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter the command or code snippet..."
                className="font-mono min-h-[150px] bg-gray-50"
                data-testid="input-code"
              />
            </div>
            <div>
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes, parameters, or documentation..."
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
              {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Method'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
