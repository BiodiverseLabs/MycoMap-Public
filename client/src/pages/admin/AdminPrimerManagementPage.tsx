import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Plus, Pencil, Trash2, FlaskConical } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface PrimerItem {
  id?: number;
  label: string;
  sequence?: string;
}

interface PrimerSet {
  id: number;
  title: string;
  orientation: string;
  type: string;
  poolSize?: number | null;
  items?: PrimerItem[];
  createdAt: string;
}

export default function AdminPrimerManagementPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<PrimerSet | null>(null);
  const [title, setTitle] = useState("");
  const [orientation, setOrientation] = useState("Forward");
  const [type, setType] = useState("Single");
  const [poolSize, setPoolSize] = useState(2);
  const [singleLabel, setSingleLabel] = useState("");
  const [singleSequence, setSingleSequence] = useState("");
  const [poolItems, setPoolItems] = useState<PrimerItem[]>([]);

  const { data: primerSets, isLoading } = useQuery<PrimerSet[]>({
    queryKey: ['/api/admin/primer-sets'],
    queryFn: async () => {
      const res = await fetch('/api/admin/primer-sets');
      if (!res.ok) throw new Error('Failed to fetch primer sets');
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; orientation: string; type: string; poolSize?: number; items: PrimerItem[] }) => {
      return apiRequest('POST', '/api/admin/primer-sets', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/primer-sets'] });
      closeDialog();
      toast({ title: "Created", description: "Primer set created successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create primer set", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest('PATCH', `/api/admin/primer-sets/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/primer-sets'] });
      closeDialog();
      toast({ title: "Updated", description: "Primer set updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update primer set", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/primer-sets/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/primer-sets'] });
      toast({ title: "Deleted", description: "Primer set deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete primer set", variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingSet(null);
    setTitle("");
    setOrientation("Forward");
    setType("Single");
    setPoolSize(2);
    setSingleLabel("");
    setSingleSequence("");
    setPoolItems([]);
  };

  const openAddDialog = () => {
    closeDialog();
    setDialogOpen(true);
  };

  const openEditDialog = async (primerSet: PrimerSet) => {
    const res = await fetch(`/api/admin/primer-sets/${primerSet.id}`);
    if (res.ok) {
      const fullSet = await res.json();
      setEditingSet(fullSet);
      setTitle(fullSet.title);
      setOrientation(fullSet.orientation);
      setType(fullSet.type);
      
      if (fullSet.type === "Single" && fullSet.items?.length > 0) {
        setSingleLabel(fullSet.items[0].label);
        setSingleSequence(fullSet.items[0].sequence || "");
      } else if (fullSet.type === "Pool" && fullSet.items) {
        setPoolSize(fullSet.poolSize || fullSet.items.length);
        setPoolItems(fullSet.items.map((item: PrimerItem) => ({
          label: item.label,
          sequence: item.sequence || "",
        })));
      }
      setDialogOpen(true);
    }
  };

  const handlePoolSizeChange = (newSize: number) => {
    setPoolSize(newSize);
    const currentItems = [...poolItems];
    while (currentItems.length < newSize) {
      currentItems.push({ label: `Primer ${currentItems.length + 1}`, sequence: "" });
    }
    while (currentItems.length > newSize) {
      currentItems.pop();
    }
    setPoolItems(currentItems);
  };

  const updatePoolItem = (index: number, field: 'label' | 'sequence', value: string) => {
    const newItems = [...poolItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setPoolItems(newItems);
  };

  const handleSave = () => {
    const items: PrimerItem[] = [];
    
    if (type === "Single") {
      if (singleLabel.trim()) {
        items.push({ label: singleLabel.trim(), sequence: singleSequence.trim() || undefined });
      }
    } else {
      poolItems.forEach(item => {
        if (item.label.trim()) {
          items.push({ label: item.label.trim(), sequence: item.sequence?.trim() || undefined });
        }
      });
    }

    const data = { 
      title, 
      orientation, 
      type, 
      poolSize: type === "Pool" ? poolSize : undefined,
      items 
    };
    
    if (editingSet) {
      updateMutation.mutate({ id: editingSet.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/runs">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ChevronLeft className="h-4 w-4 mr-1" /> Lab Runs
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900" data-testid="text-page-title">
                Primer Management
              </h1>
              <p className="text-gray-600">Manage primers and primer pools for sequencing</p>
            </div>
          </div>
          <Button onClick={openAddDialog} data-testid="button-add-primer-set">
            <Plus className="h-4 w-4 mr-1" /> New Primer Set
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="h-5 w-5" /> Primer Sets
            </CardTitle>
          </CardHeader>
          <CardContent>
            {primerSets && primerSets.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Orientation</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Pool Size</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {primerSets.map((primerSet) => (
                    <TableRow key={primerSet.id} data-testid={`row-primer-set-${primerSet.id}`}>
                      <TableCell className="font-medium">{primerSet.title}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{primerSet.orientation}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{primerSet.type}</Badge>
                      </TableCell>
                      <TableCell>
                        {primerSet.type === "Pool" ? primerSet.poolSize : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => openEditDialog(primerSet)}
                            data-testid={`button-edit-${primerSet.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                              if (confirm('Delete this primer set?')) {
                                deleteMutation.mutate(primerSet.id);
                              }
                            }}
                            data-testid={`button-delete-${primerSet.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <FlaskConical className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No primer sets defined yet</p>
                <p className="text-sm">Click "New Primer Set" to create one</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingSet ? "Edit Primer Set" : "New Primer Set"}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., ITS1F"
                    data-testid="input-title"
                  />
                </div>
                <div>
                  <Label htmlFor="orientation">Orientation</Label>
                  <Select value={orientation} onValueChange={setOrientation}>
                    <SelectTrigger data-testid="select-orientation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Forward">Forward</SelectItem>
                      <SelectItem value="Reverse">Reverse</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="type">Type</Label>
                  <Select value={type} onValueChange={(val) => {
                    setType(val);
                    if (val === "Pool" && poolItems.length === 0) {
                      handlePoolSizeChange(2);
                    }
                  }}>
                    <SelectTrigger data-testid="select-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Single">Single Primer</SelectItem>
                      <SelectItem value="Pool">Primer Pool</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {type === "Single" && (
                <div className="space-y-4 border rounded-lg p-4">
                  <h3 className="font-medium">Primer Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="singleLabel">Primer Name</Label>
                      <Input
                        id="singleLabel"
                        value={singleLabel}
                        onChange={(e) => setSingleLabel(e.target.value)}
                        placeholder="e.g., ITS1F"
                        data-testid="input-single-label"
                      />
                    </div>
                    <div>
                      <Label htmlFor="singleSequence">Sequence (optional)</Label>
                      <Input
                        id="singleSequence"
                        value={singleSequence}
                        onChange={(e) => setSingleSequence(e.target.value)}
                        placeholder="e.g., CTTGGTCATTTAGAGGAAGTAA"
                        data-testid="input-single-sequence"
                      />
                    </div>
                  </div>
                </div>
              )}

              {type === "Pool" && (
                <div className="space-y-4 border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Primer Pool Details</h3>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="poolSize" className="text-sm">Number of Primers:</Label>
                      <Input
                        id="poolSize"
                        type="number"
                        min={2}
                        max={20}
                        value={poolSize}
                        onChange={(e) => handlePoolSizeChange(parseInt(e.target.value) || 2)}
                        className="w-20"
                        data-testid="input-pool-size"
                      />
                    </div>
                  </div>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {poolItems.map((item, index) => (
                      <div key={index} className="grid grid-cols-2 gap-2">
                        <Input
                          value={item.label}
                          onChange={(e) => updatePoolItem(index, 'label', e.target.value)}
                          placeholder={`Primer ${index + 1} name`}
                          data-testid={`input-pool-label-${index}`}
                        />
                        <Input
                          value={item.sequence || ""}
                          onChange={(e) => updatePoolItem(index, 'sequence', e.target.value)}
                          placeholder="Sequence (optional)"
                          data-testid={`input-pool-sequence-${index}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeDialog} data-testid="button-cancel">
                Cancel
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={!title.trim() || (type === "Single" && !singleLabel.trim())}
                data-testid="button-save"
              >
                {editingSet ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
