import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Plus, FlaskConical, RefreshCw, Edit, Database, Terminal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

interface LabRun {
  id: number;
  name: string;
  status: string;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
};

export default function AdminRunsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newRunName, setNewRunName] = useState("");
  const [newRunNotes, setNewRunNotes] = useState("");
  const [plateCount, setPlateCount] = useState(20);
  
  const { data: runs, isLoading, refetch } = useQuery<LabRun[]>({
    queryKey: ['/api/admin/runs'],
  });

  const createRunMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/runs', { 
        name: newRunName || `Run ${new Date().toLocaleDateString()}`,
        notes: newRunNotes || null,
        plateCount: plateCount
      });
    },
    onSuccess: async (response) => {
      const run = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/runs'] });
      setIsDialogOpen(false);
      setNewRunName("");
      setNewRunNotes("");
      setPlateCount(20);
      toast({
        title: "Run Created",
        description: `${run.name} has been created with ${plateCount} plates.`,
      });
      setLocation(`/admin/runs/${run.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create run",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" data-testid="button-back-dashboard">
                <ChevronLeft className="h-4 w-4 mr-1" /> Dashboard
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900" data-testid="text-page-title">
                Lab Runs
              </h1>
              <p className="text-gray-600">Manage sequencing runs and plates</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => refetch()} variant="outline" data-testid="button-refresh">
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
            <Link href="/admin/primer-management">
              <Button variant="outline" data-testid="button-primer-management">
                <FlaskConical className="h-4 w-4 mr-2" /> Primer Management
              </Button>
            </Link>
            <Link href="/admin/index-management">
              <Button variant="outline" data-testid="button-index-management">
                <Database className="h-4 w-4 mr-2" /> Index Management
              </Button>
            </Link>
            <Link href="/admin/bioinformatics">
              <Button variant="outline" data-testid="button-bioinformatics-management">
                <Terminal className="h-4 w-4 mr-2" /> Bioinformatics
              </Button>
            </Link>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#8CBD45] hover:bg-[#7aa93d]" data-testid="button-new-run">
                  <Plus className="h-4 w-4 mr-2" /> New Run
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Lab Run</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="run-name">Run Name</Label>
                    <Input 
                      id="run-name"
                      placeholder={`Run ${new Date().toLocaleDateString()}`}
                      value={newRunName}
                      onChange={(e) => setNewRunName(e.target.value)}
                      data-testid="input-run-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="run-notes">Notes (optional)</Label>
                    <Textarea 
                      id="run-notes"
                      placeholder="Any notes about this run..."
                      value={newRunNotes}
                      onChange={(e) => setNewRunNotes(e.target.value)}
                      data-testid="input-run-notes"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plate-count">Number of Plates</Label>
                    <Input 
                      id="plate-count"
                      type="number"
                      min={1}
                      max={100}
                      value={plateCount}
                      onChange={(e) => setPlateCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                      data-testid="input-plate-count"
                    />
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={() => createRunMutation.mutate()}
                    disabled={createRunMutation.isPending}
                    data-testid="button-create-run"
                  >
                    {createRunMutation.isPending ? "Creating..." : `Create Run (${plateCount} Plates)`}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!runs || runs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      <FlaskConical className="h-12 w-12 mx-auto mb-2 opacity-30" />
                      No lab runs yet. Create your first run to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  runs.map((run) => (
                    <TableRow key={run.id} data-testid={`row-run-${run.id}`}>
                      <TableCell className="font-mono">#{run.id}</TableCell>
                      <TableCell className="font-medium" data-testid={`text-run-name-${run.id}`}>
                        {run.name}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[run.status] || statusColors.draft}>
                          {run.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 max-w-[200px] truncate">
                        {run.notes || '—'}
                      </TableCell>
                      <TableCell>
                        {format(new Date(run.createdAt), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        {run.completedAt ? format(new Date(run.completedAt), 'MMM d, yyyy') : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/admin/runs/${run.id}`}>
                          <Button variant="outline" size="sm" data-testid={`button-edit-${run.id}`}>
                            <Edit className="h-4 w-4 mr-1" /> Edit
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
