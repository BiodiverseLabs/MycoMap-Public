import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, FlaskConical, Grid3X3, Plus, FileText, Download, X, Loader2, Users, MapPin, TestTube, AlertTriangle, CheckCircle, BarChart3, Cpu, HardDrive, ExternalLink, FolderOpen, File } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
  rawDataUrl: string | null;
  createdAt: string;
  plates: Plate[];
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

interface DriveFilesResponse {
  files: DriveFile[];
  error: string | null;
  folderId?: string;
  folderUrl?: string;
}

interface BioinformaticsMethod {
  id: number;
  stage: string;
  name: string;
  programName: string | null;
  programVersion: string | null;
  code: string;
  isActive: boolean;
}

interface MethodSelection {
  id: number;
  runId: number;
  stage: string;
  methodId: number;
  methodName: string | null;
  programName: string | null;
  programVersion: string | null;
  code: string | null;
}

const BIOINFORMATICS_STAGES = [
  { key: 'basecalling', label: 'Basecalling' },
  { key: 'qc_filtering', label: 'QC Filtering' },
  { key: 'qc_reports', label: 'QC Reports' },
  { key: 'demultiplexing', label: 'Demultiplexing' },
  { key: 'consensus_building', label: 'Consensus Building' },
];

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
  const [rawDataUrlInput, setRawDataUrlInput] = useState("");
  const [isEditingDriveUrl, setIsEditingDriveUrl] = useState(false);
  
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

  const { data: bioMethods = [] } = useQuery<BioinformaticsMethod[]>({
    queryKey: ['/api/admin/bioinformatics/methods'],
    queryFn: async () => {
      const res = await fetch('/api/admin/bioinformatics/methods');
      if (!res.ok) throw new Error('Failed to fetch methods');
      const data = await res.json();
      return data.methods || [];
    },
  });

  const { data: methodSelections, refetch: refetchMethodSelections } = useQuery<{ selections: MethodSelection[]; byStage: Record<string, MethodSelection> }>({
    queryKey: ['/api/admin/runs', runId, 'method-selections'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/runs/${runId}/method-selections`);
      if (!res.ok) throw new Error('Failed to fetch method selections');
      return res.json();
    },
    enabled: !!runId,
  });

  const setMethodSelectionMutation = useMutation({
    mutationFn: async ({ stage, methodId }: { stage: string; methodId: number }) => {
      return apiRequest('POST', `/api/admin/runs/${runId}/method-selections`, { stage, methodId });
    },
    onSuccess: async () => {
      await refetchMethodSelections();
      toast({ title: "Method Selected", description: "Bioinformatics method assigned to this run" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to set method", variant: "destructive" });
    },
  });

  const { data: driveFilesData, refetch: refetchDriveFiles, isLoading: isDriveFilesLoading } = useQuery<DriveFilesResponse>({
    queryKey: ['/api/admin/runs', runId, 'drive-files'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/runs/${runId}/drive-files`);
      if (!res.ok) throw new Error('Failed to fetch drive files');
      return res.json();
    },
    enabled: !!runId && !!run?.rawDataUrl,
  });

  const updateRawDataUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      return apiRequest('PATCH', `/api/admin/runs/${runId}`, { rawDataUrl: url || null });
    },
    onSuccess: async () => {
      await refetch();
      await refetchDriveFiles();
      setIsEditingDriveUrl(false);
      toast({ title: "Saved", description: "Google Drive folder URL updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update URL", variant: "destructive" });
    },
  });

  const getMethodsForStage = (stage: string) => {
    return bioMethods.filter(m => m.stage === stage && m.isActive);
  };

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
          <Card className="border-l-4 border-l-[#A87146]">
            <CardContent className="py-4">
              <p className="text-gray-600">{run.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Run Summary Statistics Section */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-[#8CBD45]/10 to-[#A87146]/10 px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#8CBD45]" />
              <h2 className="text-lg font-semibold text-gray-800">Run Summary</h2>
            </div>
            <p className="text-sm text-gray-500 mt-1">Overview of specimens and contributors in this run</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* Total Specimens */}
              <div className="bg-gradient-to-br from-[#8CBD45]/5 to-white rounded-xl p-4 border border-[#8CBD45]/20 hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-[#8CBD45]/20 rounded-lg">
                    <TestTube className="h-4 w-4 text-[#8CBD45]" />
                  </div>
                  <span className="text-sm font-medium text-gray-600">Total Specimens</span>
                </div>
                <p className="text-3xl font-bold text-gray-900" data-testid="stat-total-specimens">
                  {stats?.totalSpecimens ?? 0}
                </p>
              </div>

              {/* Top States */}
              <div 
                className="bg-gradient-to-br from-[#A87146]/5 to-white rounded-xl p-4 border border-[#A87146]/20 hover:shadow-md transition-all cursor-pointer" 
                onClick={() => stats?.allStates?.length && setShowAllStates(true)}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-[#A87146]/20 rounded-lg">
                    <MapPin className="h-4 w-4 text-[#A87146]" />
                  </div>
                  <span className="text-sm font-medium text-gray-600">Top States</span>
                </div>
                {stats?.topStates?.length ? (
                  <div className="space-y-1.5">
                    {stats.topStates.slice(0, 3).map((s) => (
                      <div key={s.state} className="flex justify-between text-sm">
                        <span className="truncate text-gray-700">{s.state}</span>
                        <span className="font-medium text-[#A87146]">{s.count}</span>
                      </div>
                    ))}
                    {stats.allStates.length > 3 && (
                      <p className="text-xs text-[#8CBD45] font-medium mt-2">Click to see all {stats.allStates.length}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">No data</p>
                )}
              </div>

              {/* Top Users */}
              <div 
                className="bg-gradient-to-br from-[#8CBD45]/5 to-white rounded-xl p-4 border border-[#8CBD45]/20 hover:shadow-md transition-all cursor-pointer" 
                onClick={() => stats?.allUsers?.length && setShowAllUsers(true)}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-[#8CBD45]/20 rounded-lg">
                    <Users className="h-4 w-4 text-[#8CBD45]" />
                  </div>
                  <span className="text-sm font-medium text-gray-600">Top Users</span>
                </div>
                {stats?.topUsers?.length ? (
                  <div className="space-y-1.5">
                    {stats.topUsers.slice(0, 3).map((u) => (
                      <div key={u.username} className="flex justify-between text-sm">
                        <span className="truncate text-gray-700">{u.username}</span>
                        <span className="font-medium text-[#8CBD45]">{u.count}</span>
                      </div>
                    ))}
                    {stats.allUsers.length > 3 && (
                      <p className="text-xs text-[#8CBD45] font-medium mt-2">Click to see all {stats.allUsers.length}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">No data</p>
                )}
              </div>

              {/* Success Rate */}
              <div className="bg-gradient-to-br from-green-50 to-white rounded-xl p-4 border border-green-100 hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-600">Success %</span>
                </div>
                {stats?.successRate !== null && stats?.successRate !== undefined ? (
                  <p className="text-3xl font-bold text-green-600">{stats.successRate}%</p>
                ) : (
                  <p className="text-gray-400 text-sm italic">Pending results</p>
                )}
              </div>

              {/* Total Fails */}
              <div className="bg-gradient-to-br from-red-50 to-white rounded-xl p-4 border border-red-100 hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  </div>
                  <span className="text-sm font-medium text-gray-600">Total Fails</span>
                </div>
                {stats?.totalFails !== null && stats?.totalFails !== undefined ? (
                  <p className="text-3xl font-bold text-red-600">{stats.totalFails}</p>
                ) : (
                  <p className="text-gray-400 text-sm italic">Pending results</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* All States Dialog */}
        <Dialog open={showAllStates} onOpenChange={setShowAllStates}>
          <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-[#A87146]" />
                All States ({stats?.allStates?.length || 0})
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto pr-2" style={{ maxHeight: '400px' }}>
              <div className="space-y-2">
                {stats?.allStates?.map((s) => (
                  <div key={s.state} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <span className="font-medium text-gray-700">{s.state}</span>
                    <span className="bg-[#A87146] text-white text-sm px-2 py-1 rounded-full font-medium">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* All Users Dialog */}
        <Dialog open={showAllUsers} onOpenChange={setShowAllUsers}>
          <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#8CBD45]" />
                All Contributors ({stats?.allUsers?.length || 0})
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto pr-2" style={{ maxHeight: '400px' }}>
              <div className="space-y-2">
                {stats?.allUsers?.map((u) => (
                  <div key={u.username} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <span className="font-medium text-gray-700">{u.username}</span>
                    <span className="bg-[#8CBD45] text-white text-sm px-2 py-1 rounded-full font-medium">{u.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Plates Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#A87146]/30 to-transparent"></div>
            <div className="flex items-center gap-2 px-4">
              <Grid3X3 className="h-5 w-5 text-[#A87146]" />
              <h2 className="text-lg font-semibold text-gray-700">Plates ({run.plates.length})</h2>
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#A87146]/30 to-transparent"></div>
          </div>

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

        {/* Bioinformatics Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              Bioinformatics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {BIOINFORMATICS_STAGES.map(({ key, label }) => {
                const methods = getMethodsForStage(key);
                const currentSelection = methodSelections?.byStage[key];
                
                return (
                  <div key={key} className="flex items-center gap-4" data-testid={`bio-stage-${key}`}>
                    <Label className="w-40 text-sm font-medium text-gray-700">{label}</Label>
                    <Select
                      value={currentSelection?.methodId?.toString() || ""}
                      onValueChange={(value) => {
                        if (value) {
                          setMethodSelectionMutation.mutate({ stage: key, methodId: parseInt(value) });
                        }
                      }}
                      disabled={setMethodSelectionMutation.isPending}
                    >
                      <SelectTrigger className="w-[300px]" data-testid={`select-${key}`}>
                        <SelectValue placeholder="Select a method..." />
                      </SelectTrigger>
                      <SelectContent>
                        {methods.length === 0 ? (
                          <SelectItem value="none" disabled>No methods available</SelectItem>
                        ) : (
                          methods.map((method) => (
                            <SelectItem key={method.id} value={method.id.toString()}>
                              {method.name}
                              {method.programName && ` (${method.programName}${method.programVersion ? ` v${method.programVersion}` : ''})`}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {currentSelection && (
                      <Badge variant="secondary" className="bg-green-100 text-green-700">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Selected
                      </Badge>
                    )}
                  </div>
                );
              })}
              {bioMethods.length === 0 && (
                <p className="text-sm text-gray-500">
                  No bioinformatics methods configured yet. Add methods in the{' '}
                  <Link href="/admin/bioinformatics" className="text-blue-600 hover:underline">
                    Bioinformatics page
                  </Link>.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Raw Data Files Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Raw Data Files
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Google Drive URL Input */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Google Drive Folder URL</Label>
                {isEditingDriveUrl || !run.rawDataUrl ? (
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="https://drive.google.com/drive/folders/..."
                      value={rawDataUrlInput || run.rawDataUrl || ""}
                      onChange={(e) => setRawDataUrlInput(e.target.value)}
                      className="flex-1"
                      data-testid="input-raw-data-url"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        updateRawDataUrlMutation.mutate(rawDataUrlInput);
                      }}
                      disabled={updateRawDataUrlMutation.isPending}
                      data-testid="btn-save-drive-url"
                    >
                      {updateRawDataUrlMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                    {run.rawDataUrl && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setIsEditingDriveUrl(false);
                          setRawDataUrlInput("");
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <a
                      href={run.rawDataUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1 text-sm"
                      data-testid="link-drive-folder"
                    >
                      <FolderOpen className="h-4 w-4" />
                      Open Google Drive Folder
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRawDataUrlInput(run.rawDataUrl || "");
                        setIsEditingDriveUrl(true);
                      }}
                      data-testid="btn-edit-drive-url"
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => updateRawDataUrlMutation.mutate("")}
                      disabled={updateRawDataUrlMutation.isPending}
                      data-testid="btn-remove-drive-url"
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>

              {/* File List (when API key is configured) */}
              {run.rawDataUrl && (
                <div className="mt-4">
                  {isDriveFilesLoading ? (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Loading files...</span>
                    </div>
                  ) : driveFilesData?.error ? (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-800">
                        {driveFilesData.error === "Google Drive API key not configured" ? (
                          <>
                            <strong>Note:</strong> To display file contents here, add a{" "}
                            <code className="bg-yellow-100 px-1 rounded">GOOGLE_DRIVE_API_KEY</code> secret.
                            For now, click the link above to view files in Google Drive.
                          </>
                        ) : (
                          driveFilesData.error
                        )}
                      </p>
                    </div>
                  ) : driveFilesData?.files && driveFilesData.files.length > 0 ? (
                    <div className="border rounded-lg divide-y">
                      {driveFilesData.files.map((file) => (
                        <a
                          key={file.id}
                          href={file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors"
                          data-testid={`drive-file-${file.id}`}
                        >
                          {file.mimeType?.includes('folder') ? (
                            <FolderOpen className="h-5 w-5 text-yellow-500" />
                          ) : (
                            <File className="h-5 w-5 text-gray-500" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{file.name}</p>
                            <p className="text-xs text-gray-500">
                              {file.mimeType?.split('/').pop() || 'file'}
                              {file.size && ` • ${(parseInt(file.size) / 1024).toFixed(1)} KB`}
                              {file.modifiedTime && ` • ${format(new Date(file.modifiedTime), 'MMM d, yyyy')}`}
                            </p>
                          </div>
                          <ExternalLink className="h-4 w-4 text-gray-400" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No files found in folder.</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
