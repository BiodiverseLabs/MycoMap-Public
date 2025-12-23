import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Grid3X3, Plus, CheckCircle, AlertCircle, Trash2, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface Well {
  id: number;
  wellPosition: string;
  isValidated: boolean;
  validationStatus: string | null;
  observationId: string | null;
  labCode: string | null;
}

interface PendingPlate {
  id: number;
  name: string | null;
  notes: string | null;
  sampleCount: number;
  status: string;
  isActive: boolean | null;
  wells: Well[];
  createdBy: string | null;
  createdAt: string;
}

export default function AdminPendingPlatesPage() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newPlateName, setNewPlateName] = useState("");
  const [newSampleCount, setNewSampleCount] = useState(96);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const { data: plates, isLoading } = useQuery<PendingPlate[]>({
    queryKey: ['/api/admin/pending-plates', showInactive, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (showInactive) params.append('showInactive', 'true');
      if (searchTerm) params.append('search', searchTerm);
      const res = await fetch(`/api/admin/pending-plates?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch pending plates');
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; sampleCount: number }) => {
      return apiRequest('POST', '/api/admin/pending-plates', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pending-plates', showInactive, searchTerm] });
      setCreateDialogOpen(false);
      setNewPlateName("");
      setNewSampleCount(96);
      toast({ title: "Created", description: "New pending plate created" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create plate", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (plateId: number) => {
      return apiRequest('DELETE', `/api/admin/pending-plates/${plateId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pending-plates', showInactive, searchTerm] });
      setDeleteConfirmId(null);
      toast({ title: "Deleted", description: "Plate deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete plate", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  const getPlateStats = (plate: PendingPlate) => {
    const filledWells = plate.wells.filter(w => w.observationId || w.labCode).length;
    const validatedWells = plate.wells.filter(w => w.isValidated && (w.validationStatus === 'valid' || w.validationStatus === 'no_voucher')).length;
    const errorWells = plate.wells.filter(w => w.validationStatus && !['valid', 'no_voucher'].includes(w.validationStatus)).length;
    return { filledWells, validatedWells, errorWells };
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-pending-plates-title">
              Pending Plates
            </h1>
            <p className="text-gray-600">Manage plates before assigning to lab runs</p>
          </div>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="bg-[#8CBD45] hover:bg-[#7aab3d]"
            data-testid="button-create-plate"
          >
            <Plus className="h-4 w-4 mr-2" /> New Plate
          </Button>
        </div>

        {/* Search and filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search plates by name, notes, or creator..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-plates"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="showInactive"
              checked={showInactive}
              onCheckedChange={(checked) => setShowInactive(checked === true)}
              data-testid="checkbox-show-inactive"
            />
            <Label htmlFor="showInactive" className="text-sm text-gray-600 cursor-pointer">
              Show Inactive
            </Label>
          </div>
        </div>

        {plates && plates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Grid3X3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h2 className="text-xl font-semibold mb-2">No Pending Plates</h2>
              <p className="text-gray-600 mb-4">Create a new plate to start entering well data</p>
              <Button
                onClick={() => setCreateDialogOpen(true)}
                className="bg-[#8CBD45] hover:bg-[#7aab3d]"
              >
                <Plus className="h-4 w-4 mr-2" /> Create First Plate
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>All Pending Plates</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Samples</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Validation</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plates?.map((plate) => {
                    const stats = getPlateStats(plate);
                    const isInactive = plate.isActive === false;
                    return (
                      <TableRow key={plate.id} data-testid={`row-plate-${plate.id}`} className={isInactive ? 'opacity-60' : ''}>
                        <TableCell className="font-mono">{plate.id}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Link href={`/admin/pending-plates/${plate.id}`}>
                              <span className="text-blue-600 hover:underline cursor-pointer font-medium">
                                {plate.name || `Plate ${plate.id}`}
                              </span>
                            </Link>
                            {isInactive && (
                              <Badge variant="outline" className="text-xs text-gray-500">Imported</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {stats.filledWells}/{plate.sampleCount}
                        </TableCell>
                        <TableCell>
                          <Badge variant={plate.status === 'complete' ? 'default' : plate.status === 'partial' ? 'secondary' : 'outline'}>
                            {plate.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {stats.validatedWells > 0 && (
                              <div className="flex items-center gap-1 text-green-600">
                                <CheckCircle className="h-4 w-4" />
                                <span className="text-xs">{stats.validatedWells}</span>
                              </div>
                            )}
                            {stats.errorWells > 0 && (
                              <div className="flex items-center gap-1 text-red-600">
                                <AlertCircle className="h-4 w-4" />
                                <span className="text-xs">{stats.errorWells}</span>
                              </div>
                            )}
                            {stats.validatedWells === 0 && stats.errorWells === 0 && (
                              <span className="text-gray-400 text-xs">Not validated</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {plate.createdBy || '—'}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {plate.createdAt ? new Date(plate.createdAt).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Link href={`/admin/pending-plates/${plate.id}`}>
                              <Button variant="outline" size="sm">
                                Edit
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteConfirmId(plate.id)}
                              data-testid={`button-delete-plate-${plate.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Pending Plate</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div>
                <Label htmlFor="plate-name">Plate Name (optional)</Label>
                <Input
                  id="plate-name"
                  value={newPlateName}
                  onChange={(e) => setNewPlateName(e.target.value)}
                  placeholder="e.g., Missouri Batch 1"
                  data-testid="input-new-plate-name"
                />
              </div>
              <div>
                <Label htmlFor="sample-count">Number of Samples</Label>
                <Input
                  id="sample-count"
                  type="number"
                  min={1}
                  max={96}
                  value={newSampleCount}
                  onChange={(e) => setNewSampleCount(Math.max(1, Math.min(96, parseInt(e.target.value) || 1)))}
                  data-testid="input-new-sample-count"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Maximum 96 wells per plate
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate({ name: newPlateName, sampleCount: newSampleCount })}
                disabled={createMutation.isPending}
                className="bg-[#8CBD45] hover:bg-[#7aab3d]"
                data-testid="button-confirm-create-plate"
              >
                {createMutation.isPending ? "Creating..." : "Create Plate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Plate</DialogTitle>
            </DialogHeader>
            <p className="py-4">Are you sure you want to delete this plate? This action cannot be undone.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete-plate"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
