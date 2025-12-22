import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ChevronLeft, FlaskConical, Grid3X3, Plus, FileText, Download, X, Loader2, Users, MapPin, TestTube, AlertTriangle, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface RunFile {
  id: number;
  fileType: string;
  filename: string;
  mimeType: string;
  createdAt: string;
  size: number;
}

interface RunStats {
  totalSpecimens: number;
  topStates: { state: string; count: number }[];
  allStates: { state: string; count: number }[];
  topUsers: { username: string; count: number }[];
  allUsers: { username: string; count: number }[];
  successRate: number | null;
  totalFails: number | null;
}

interface Plate {
  id: number;
  plateNumber: number;
  name: string | null;
  status: string;
  orientation: string;
  defaultForwardPrimer: string | null;
  defaultReversePrimer: string | null;
  sampleCount?: number;
  validatedCount?: number;
  errorCount?: number;
  clearedCount?: number;
  isFullyValidated?: boolean;
}

interface LabRun {
  id: number;
  name: string;
  status: string;
  notes: string | null;
  createdAt: string;
  plates: Plate[];
}

const statusColors: Record<string, string> = {
  empty: "bg-gray-100 text-gray-600",
  partial: "bg-yellow-100 text-yellow-700",
  full: "bg-blue-100 text-blue-700",
  validated: "bg-green-100 text-green-700",
};

export default function AdminRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const runId = parseInt(id);
  const { toast } = useToast();
  const [addPlateOpen, setAddPlateOpen] = useState(false);
  const [newPlateName, setNewPlateName] = useState("");
  const [newPlateSampleCount, setNewPlateSampleCount] = useState(96);
  const [showAllStates, setShowAllStates] = useState(false);
  const [showAllUsers, setShowAllUsers] = useState(false);
  
  const { data: run, isLoading, refetch } = useQuery<LabRun>({
    queryKey: ['/api/admin/runs', runId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/runs/${runId}`);
      if (!res.ok) throw new Error('Failed to fetch run');
      return res.json();
    },
  });

  const { data: stats } = useQuery<RunStats>({
    queryKey: ['/api/admin/runs', runId, 'stats'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/runs/${runId}/stats`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    enabled: !!runId,
  });

  const addPlateMutation = useMutation({
    mutationFn: async (data: { name: string; sampleCount: number }) => {
      return apiRequest('POST', `/api/admin/runs/${runId}/plates`, { 
        name: data.name || undefined,
        sampleCount: data.sampleCount
      });
    },
    onSuccess: async () => {
      await refetch();
      setAddPlateOpen(false);
      setNewPlateName("");
      setNewPlateSampleCount(96);
      toast({ title: "Plate Added", description: "New plate created successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add plate", variant: "destructive" });
    },
  });

  const { data: files = [], refetch: refetchFiles } = useQuery<RunFile[]>({
    queryKey: ['/api/admin/runs', runId, 'files'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/runs/${runId}/files`);
      if (!res.ok) throw new Error('Failed to fetch files');
      return res.json();
    },
    enabled: !!runId,
  });

  const generateFilesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/admin/runs/${runId}/generate-files`, {});
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Failed to generate files');
      }
      return response.json();
    },
    onSuccess: async () => {
      await refetchFiles();
      toast({ title: "Files Generated", description: "Index and primer files created successfully" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to generate files", 
        variant: "destructive" 
      });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: number) => {
      return apiRequest('DELETE', `/api/admin/runs/${runId}/files/${fileId}`, {});
    },
    onSuccess: async () => {
      await refetchFiles();
      toast({ title: "File Deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete file", variant: "destructive" });
    },
  });

  const nextPlateNumber = run ? run.plates.length + 1 : 1;
  
  const allPlatesValidated = run?.plates && run.plates.length > 0 && 
    run.plates.every(p => p.isFullyValidated);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <FlaskConical className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h2 className="text-xl font-semibold mb-2">Run Not Found</h2>
            <Link href="/admin/runs">
              <Button>Back to Runs</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/runs">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ChevronLeft className="h-4 w-4 mr-1" /> Lab Runs
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900" data-testid="text-run-title">
                {run.name}
              </h1>
              <p className="text-gray-600">
                Created {format(new Date(run.createdAt), 'MMMM d, yyyy')} • {run.plates.length} plates
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {run.plates.length > 0 && (
              <Button 
                onClick={() => generateFilesMutation.mutate()}
                disabled={generateFilesMutation.isPending}
                className={allPlatesValidated ? "bg-green-600 hover:bg-green-700" : "bg-yellow-600 hover:bg-yellow-700"}
                data-testid="button-generate-files"
                title={allPlatesValidated ? "Generate files for this run" : "Warning: Not all plates are validated"}
              >
                {generateFilesMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-1" /> Generate Files
                  </>
                )}
              </Button>
            )}
            <Badge className={statusColors[run.status] || "bg-gray-100"}>
              {run.status.replace('_', ' ')}
            </Badge>
            <Dialog open={addPlateOpen} onOpenChange={setAddPlateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-plate">
                  <Plus className="h-4 w-4 mr-1" /> Add Plate
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Plate</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <div>
                    <Label htmlFor="plate-name">Plate Name</Label>
                    <Input
                      id="plate-name"
                      placeholder={`Plate ${nextPlateNumber}`}
                      value={newPlateName}
                      onChange={(e) => setNewPlateName(e.target.value)}
                      data-testid="input-plate-name"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Leave blank to use default: Plate {nextPlateNumber}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="sample-count">Number of Samples</Label>
                    <Input
                      id="sample-count"
                      type="number"
                      min={1}
                      max={96}
                      value={newPlateSampleCount}
                      onChange={(e) => setNewPlateSampleCount(Math.max(1, Math.min(96, parseInt(e.target.value) || 96)))}
                      data-testid="input-sample-count"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      1-96 wells (default: 96)
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddPlateOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => addPlateMutation.mutate({ name: newPlateName, sampleCount: newPlateSampleCount })}
                    disabled={addPlateMutation.isPending}
                    data-testid="button-confirm-add-plate"
                  >
                    {addPlateMutation.isPending ? "Adding..." : "Add Plate"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {run.notes && (
          <Card>
            <CardContent className="py-4">
              <p className="text-gray-600">{run.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Run Summary Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Total Specimens */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <TestTube className="h-5 w-5 text-[#8CBD45]" />
                <span className="text-sm text-gray-500">Total Specimens</span>
              </div>
              <p className="text-2xl font-bold" data-testid="stat-total-specimens">
                {stats?.totalSpecimens ?? 0}
              </p>
            </CardContent>
          </Card>

          {/* Top States */}
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => stats?.allStates?.length && setShowAllStates(true)}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-5 w-5 text-[#A87146]" />
                <span className="text-sm text-gray-500">Top States</span>
              </div>
              {stats?.topStates?.length ? (
                <div className="space-y-1">
                  {stats.topStates.slice(0, 3).map((s, i) => (
                    <div key={s.state} className="flex justify-between text-sm">
                      <span className="truncate">{s.state}</span>
                      <span className="text-gray-500">{s.count}</span>
                    </div>
                  ))}
                  {stats.allStates.length > 3 && (
                    <p className="text-xs text-blue-600 mt-1">+ {stats.allStates.length - 3} more</p>
                  )}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">No data</p>
              )}
            </CardContent>
          </Card>

          {/* Top Users */}
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => stats?.allUsers?.length && setShowAllUsers(true)}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-5 w-5 text-[#8CBD45]" />
                <span className="text-sm text-gray-500">Top Users</span>
              </div>
              {stats?.topUsers?.length ? (
                <div className="space-y-1">
                  {stats.topUsers.slice(0, 3).map((u, i) => (
                    <div key={u.username} className="flex justify-between text-sm">
                      <span className="truncate">{u.username}</span>
                      <span className="text-gray-500">{u.count}</span>
                    </div>
                  ))}
                  {stats.allUsers.length > 3 && (
                    <p className="text-xs text-blue-600 mt-1">+ {stats.allUsers.length - 3} more</p>
                  )}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">No data</p>
              )}
            </CardContent>
          </Card>

          {/* Success Rate */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-sm text-gray-500">Success %</span>
              </div>
              {stats?.successRate !== null ? (
                <p className="text-2xl font-bold text-green-600">{stats.successRate}%</p>
              ) : (
                <p className="text-gray-400 text-sm">Pending results</p>
              )}
            </CardContent>
          </Card>

          {/* Total Fails */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <span className="text-sm text-gray-500">Total Fails</span>
              </div>
              {stats?.totalFails !== null ? (
                <p className="text-2xl font-bold text-red-600">{stats.totalFails}</p>
              ) : (
                <p className="text-gray-400 text-sm">Pending results</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* All States Dialog */}
        <Dialog open={showAllStates} onOpenChange={setShowAllStates}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>All States ({stats?.allStates?.length || 0})</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {stats?.allStates?.map((s, i) => (
                  <div key={s.state} className="flex justify-between p-2 bg-gray-50 rounded">
                    <span>{s.state}</span>
                    <Badge variant="secondary">{s.count}</Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* All Users Dialog */}
        <Dialog open={showAllUsers} onOpenChange={setShowAllUsers}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>All Users ({stats?.allUsers?.length || 0})</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {stats?.allUsers?.map((u, i) => (
                  <div key={u.username} className="flex justify-between p-2 bg-gray-50 rounded">
                    <span>{u.username}</span>
                    <Badge variant="secondary">{u.count}</Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {run.plates.map((plate) => (
            <Link key={plate.id} href={`/admin/plates/${plate.id}`}>
              <Card 
                className={`cursor-pointer hover:shadow-md transition-shadow ${
                  plate.isFullyValidated && plate.sampleCount === 96 
                    ? 'bg-green-50 border-green-200' 
                    : plate.isFullyValidated 
                      ? 'bg-green-50/50 border-green-100'
                      : ''
                }`}
                data-testid={`card-plate-${plate.plateNumber}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Grid3X3 className="h-5 w-5 text-gray-500" />
                      <span className="font-semibold">Plate {plate.plateNumber}</span>
                    </div>
                    <Badge 
                      className={
                        plate.sampleCount && plate.sampleCount > 0
                          ? plate.isFullyValidated 
                            ? "bg-green-100 text-green-700"
                            : plate.errorCount && plate.errorCount > 0
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700"
                          : statusColors.empty
                      } 
                      variant="secondary"
                    >
                      {plate.sampleCount && plate.sampleCount > 0 
                        ? `${plate.sampleCount} samples`
                        : 'empty'}
                    </Badge>
                  </div>
                  {plate.name && plate.name !== `Plate ${plate.plateNumber}` && (
                    <p className="text-sm text-gray-500 truncate">{plate.name}</p>
                  )}
                  {plate.defaultForwardPrimer && (
                    <p className="text-xs text-gray-400 mt-1 truncate">
                      F: {plate.defaultForwardPrimer}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Files Section */}
        {files.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Generated Files
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {files.map((file) => (
                  <div 
                    key={file.id} 
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    data-testid={`file-${file.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="font-medium text-sm">{file.filename}</p>
                        <p className="text-xs text-gray-500">
                          {format(new Date(file.createdAt), 'MMM d, yyyy h:mm a')} • {Math.round(file.size / 1024)}KB
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a 
                        href={`/api/admin/runs/${runId}/files/${file.id}/download`}
                        download
                        className="text-blue-600 hover:text-blue-800"
                        data-testid={`download-file-${file.id}`}
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      <button
                        onClick={() => deleteFileMutation.mutate(file.id)}
                        className="text-red-500 hover:text-red-700"
                        disabled={deleteFileMutation.isPending}
                        data-testid={`delete-file-${file.id}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
