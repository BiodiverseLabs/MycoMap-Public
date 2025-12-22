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
import { ChevronLeft, Plus, Pencil, Trash2, Database } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef } from "react";

interface IndexEntry {
  id?: number;
  wellPosition: string;
  indexSequence: string;
}

interface IndexSet {
  id: number;
  title: string;
  orientation: string;
  type: string;
  entries?: IndexEntry[];
  createdAt: string;
}

const WELL_POSITIONS_96 = [
  'A01', 'B01', 'C01', 'D01', 'E01', 'F01', 'G01', 'H01',
  'A02', 'B02', 'C02', 'D02', 'E02', 'F02', 'G02', 'H02',
  'A03', 'B03', 'C03', 'D03', 'E03', 'F03', 'G03', 'H03',
  'A04', 'B04', 'C04', 'D04', 'E04', 'F04', 'G04', 'H04',
  'A05', 'B05', 'C05', 'D05', 'E05', 'F05', 'G05', 'H05',
  'A06', 'B06', 'C06', 'D06', 'E06', 'F06', 'G06', 'H06',
  'A07', 'B07', 'C07', 'D07', 'E07', 'F07', 'G07', 'H07',
  'A08', 'B08', 'C08', 'D08', 'E08', 'F08', 'G08', 'H08',
  'A09', 'B09', 'C09', 'D09', 'E09', 'F09', 'G09', 'H09',
  'A10', 'B10', 'C10', 'D10', 'E10', 'F10', 'G10', 'H10',
  'A11', 'B11', 'C11', 'D11', 'E11', 'F11', 'G11', 'H11',
  'A12', 'B12', 'C12', 'D12', 'E12', 'F12', 'G12', 'H12',
];

export default function AdminIndexManagementPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<IndexSet | null>(null);
  const [title, setTitle] = useState("");
  const [orientation, setOrientation] = useState("Reverse");
  const [type, setType] = useState("96");
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [singleEntry, setSingleEntry] = useState("");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: indexSets, isLoading } = useQuery<IndexSet[]>({
    queryKey: ['/api/admin/index-sets'],
    queryFn: async () => {
      const res = await fetch('/api/admin/index-sets');
      if (!res.ok) throw new Error('Failed to fetch index sets');
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; orientation: string; type: string; entries: IndexEntry[] }) => {
      return apiRequest('POST', '/api/admin/index-sets', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/index-sets'] });
      closeDialog();
      toast({ title: "Created", description: "Index set created successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create index set", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest('PATCH', `/api/admin/index-sets/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/index-sets'] });
      closeDialog();
      toast({ title: "Updated", description: "Index set updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update index set", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/index-sets/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/index-sets'] });
      toast({ title: "Deleted", description: "Index set deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete index set", variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingSet(null);
    setTitle("");
    setOrientation("Reverse");
    setType("96");
    setEntries({});
    setSingleEntry("");
  };

  const openAddDialog = () => {
    closeDialog();
    setDialogOpen(true);
  };

  const openEditDialog = async (indexSet: IndexSet) => {
    const res = await fetch(`/api/admin/index-sets/${indexSet.id}`);
    if (res.ok) {
      const fullSet = await res.json();
      setEditingSet(fullSet);
      setTitle(fullSet.title);
      setOrientation(fullSet.orientation);
      setType(fullSet.type);
      
      if (fullSet.type === "Single" && fullSet.entries?.length > 0) {
        setSingleEntry(fullSet.entries[0].indexSequence);
      } else if (fullSet.entries) {
        const entryMap: Record<string, string> = {};
        fullSet.entries.forEach((e: IndexEntry) => {
          entryMap[e.wellPosition] = e.indexSequence;
        });
        setEntries(entryMap);
      }
      setDialogOpen(true);
    }
  };

  const handleSave = () => {
    const entryList: IndexEntry[] = [];
    
    if (type === "Single") {
      if (singleEntry.trim()) {
        entryList.push({ wellPosition: "single", indexSequence: singleEntry.trim() });
      }
    } else {
      WELL_POSITIONS_96.forEach(pos => {
        if (entries[pos]?.trim()) {
          entryList.push({ wellPosition: pos, indexSequence: entries[pos].trim() });
        }
      });
    }

    const data = { title, orientation, type, entries: entryList };
    
    if (editingSet) {
      updateMutation.mutate({ id: editingSet.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handlePaste = (e: React.ClipboardEvent, startPosition: string) => {
    const pasteData = e.clipboardData.getData('text');
    const lines = pasteData.split('\n').filter(line => line.trim());
    
    if (lines.length > 1) {
      e.preventDefault();
      const startIndex = WELL_POSITIONS_96.indexOf(startPosition);
      if (startIndex === -1) return;
      
      const newEntries = { ...entries };
      lines.forEach((line, i) => {
        const targetIndex = startIndex + i;
        if (targetIndex < WELL_POSITIONS_96.length) {
          const parts = line.split('\t');
          const sequence = parts.length > 1 ? parts[1].trim() : parts[0].trim();
          newEntries[WELL_POSITIONS_96[targetIndex]] = sequence;
        }
      });
      setEntries(newEntries);
      
      toast({
        title: "Pasted",
        description: `Applied ${Math.min(lines.length, WELL_POSITIONS_96.length - startIndex)} index sequences`,
      });
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
                Index Management
              </h1>
              <p className="text-gray-600">Manage index sequences for 96-well plates</p>
            </div>
          </div>
          <Button onClick={openAddDialog} data-testid="button-add-index-set">
            <Plus className="h-4 w-4 mr-1" /> New Index Set
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-5 w-5" /> Index Sets
            </CardTitle>
          </CardHeader>
          <CardContent>
            {indexSets && indexSets.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Orientation</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {indexSets.map((indexSet) => (
                    <TableRow key={indexSet.id} data-testid={`row-index-set-${indexSet.id}`}>
                      <TableCell className="font-medium">{indexSet.title}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{indexSet.orientation}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{indexSet.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => openEditDialog(indexSet)}
                            data-testid={`button-edit-${indexSet.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                              if (confirm('Delete this index set?')) {
                                deleteMutation.mutate(indexSet.id);
                              }
                            }}
                            data-testid={`button-delete-${indexSet.id}`}
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
                <Database className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No index sets defined yet</p>
                <p className="text-sm">Click "New Index Set" to create one</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingSet ? "Edit Index Set" : "New Index Set"}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., General"
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
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger data-testid="select-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="96">96</SelectItem>
                      <SelectItem value="Single">Single</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {type === "Single" ? (
                <div>
                  <Label htmlFor="single-index">Index Sequence</Label>
                  <Input
                    id="single-index"
                    value={singleEntry}
                    onChange={(e) => setSingleEntry(e.target.value)}
                    placeholder="Enter index sequence"
                    className="font-mono"
                    data-testid="input-single-index"
                  />
                </div>
              ) : (
                <div>
                  <Label>Index Sequences (96 wells)</Label>
                  <p className="text-sm text-gray-500 mb-2">
                    Paste tab-separated data (Position + Sequence) into the first cell to auto-populate
                  </p>
                  <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[80px] sticky top-0 bg-white">Position</TableHead>
                          <TableHead className="sticky top-0 bg-white">Index Sequence</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {WELL_POSITIONS_96.map((pos, idx) => (
                          <TableRow key={pos}>
                            <TableCell className="font-mono font-medium">{pos}</TableCell>
                            <TableCell>
                              <Input
                                ref={el => inputRefs.current[pos] = el}
                                value={entries[pos] || ""}
                                onChange={(e) => setEntries({ ...entries, [pos]: e.target.value })}
                                onPaste={(e) => handlePaste(e, pos)}
                                className="font-mono h-8"
                                placeholder="Enter sequence"
                                data-testid={`input-index-${pos}`}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button 
                onClick={handleSave}
                disabled={!title.trim() || createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-index-set"
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Index Set"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
