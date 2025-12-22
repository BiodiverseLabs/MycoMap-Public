import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Plus, FlaskConical, RefreshCw, Edit, Database, Upload, FileText, AlertCircle, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useRef } from "react";

interface LabRun {
  id: number;
  name: string;
  status: string;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
}

const RUN_STATUS_OPTIONS = [
  { value: 'tissue_collection', label: 'Tissue Collection In Progress', color: 'bg-purple-100 text-purple-700' },
  { value: 'dna_extraction', label: 'DNA Extraction In Progress', color: 'bg-orange-100 text-orange-700' },
  { value: 'dna_amplification', label: 'DNA Amplification In Progress', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'dna_sequencing_pooled', label: 'DNA Sequencing In Progress (DNA Pooled)', color: 'bg-blue-100 text-blue-700' },
  { value: 'dna_sequencing_library', label: 'DNA Sequencing In Progress (DNA Library Created)', color: 'bg-blue-100 text-blue-700' },
  { value: 'dna_sequencing_raw_data', label: 'DNA Sequencing In Progress (Raw Data Available)', color: 'bg-blue-100 text-blue-700' },
  { value: 'sequence_analysis', label: 'Sequence Analysis In Progress', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'complete', label: 'Complete', color: 'bg-green-100 text-green-700' },
  { value: 'draft', label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  { value: 'completed', label: 'Completed', color: 'bg-green-100 text-green-700' },
];

const getStatusLabel = (value: string) => {
  const option = RUN_STATUS_OPTIONS.find(o => o.value === value);
  return option?.label || value.replace(/_/g, ' ');
};

const getStatusColor = (value: string) => {
  const option = RUN_STATUS_OPTIONS.find(o => o.value === value);
  return option?.color || 'bg-gray-100 text-gray-700';
};

export default function AdminRunsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newRunName, setNewRunName] = useState("");
  const [newRunNotes, setNewRunNotes] = useState("");
  const [plateCount, setPlateCount] = useState(20);
  const [activeTab, setActiveTab] = useState("scratch");
  const [indexFileName, setIndexFileName] = useState("");
  const [indexFileContent, setIndexFileContent] = useState("");
  const [indexRunName, setIndexRunName] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { data: runs, isLoading, refetch } = useQuery<LabRun[]>({
    queryKey: ['/api/admin/runs'],
  });

  const processFile = (file: File) => {
    setIndexFileName(file.name);
    setValidationErrors([]);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setIndexFileContent(content);
      
      if (!indexRunName) {
        const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
        setIndexRunName(baseName);
      }
    };
    reader.readAsText(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const resetIndexForm = () => {
    setIndexFileName("");
    setIndexFileContent("");
    setIndexRunName("");
    setValidationErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

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

  const createFromIndexMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/runs/from-index', { 
        name: indexRunName || `Run ${new Date().toLocaleDateString()}`,
        indexFileContent
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw errorData;
      }
      
      return response.json();
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/runs'] });
      setIsDialogOpen(false);
      resetIndexForm();
      setActiveTab("scratch");
      toast({
        title: "Run Created from Index File",
        description: `${data.run.name} has been created with ${data.plateCount} plates and ${data.sampleCount} samples.`,
      });
      setLocation(`/admin/runs/${data.run.id}`);
    },
    onError: (error: any) => {
      const details = error.details || [];
      const missingIndexes = [...(error.missingFwIndexes || []), ...(error.missingRvIndexes || [])];
      const missingPrimers = [...(error.missingFwPrimers || []), ...(error.missingRvPrimers || [])];
      
      const allErrors = [
        ...details,
        ...(missingIndexes.length > 0 ? [`Missing indexes: ${missingIndexes.join(', ')}`] : []),
        ...(missingPrimers.length > 0 ? [`Missing primers: ${missingPrimers.join(', ')}`] : []),
      ];
      
      if (allErrors.length > 0) {
        setValidationErrors(allErrors);
      } else {
        toast({
          title: "Error",
          description: error.error || "Failed to create run from index file",
          variant: "destructive",
        });
      }
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
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) {
                  setActiveTab("scratch");
                  setNewRunName("");
                  setNewRunNotes("");
                  setPlateCount(20);
                  resetIndexForm();
                }
              }}>
              <DialogTrigger asChild>
                <Button className="bg-[#8CBD45] hover:bg-[#7aa93d]" data-testid="button-new-run">
                  <Plus className="h-4 w-4 mr-2" /> New Run
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create New Lab Run</DialogTitle>
                </DialogHeader>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="scratch" data-testid="tab-from-scratch">From Scratch</TabsTrigger>
                    <TabsTrigger value="index" data-testid="tab-from-index">From Index File</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="scratch" className="space-y-4 py-4">
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
                  </TabsContent>
                  
                  <TabsContent value="index" className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="index-run-name">Run Name</Label>
                      <Input 
                        id="index-run-name"
                        placeholder={`Run ${new Date().toLocaleDateString()}`}
                        value={indexRunName}
                        onChange={(e) => setIndexRunName(e.target.value)}
                        data-testid="input-index-run-name"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Index File (.txt)</Label>
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept=".txt"
                        onChange={handleFileSelect}
                        className="hidden"
                        data-testid="input-index-file"
                      />
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                          isDragOver 
                            ? 'border-[#8CBD45] bg-green-50' 
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {indexFileName ? (
                          <div className="flex items-center justify-center gap-2 text-green-600">
                            <FileText className="h-5 w-5" />
                            <span className="font-medium">{indexFileName}</span>
                          </div>
                        ) : (
                          <div className="text-gray-500">
                            <Upload className="h-8 w-8 mx-auto mb-2" />
                            <p>Click to upload or drag and drop</p>
                            <p className="text-sm">Tab-delimited .txt file</p>
                          </div>
                        )}
                      </div>
                      {indexFileContent && (
                        <p className="text-sm text-gray-500">
                          {indexFileContent.split('\n').length - 1} samples detected
                        </p>
                      )}
                    </div>
                    
                    {validationErrors.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <div className="flex items-start gap-2 text-red-700">
                          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                          <div className="text-sm">
                            <p className="font-medium mb-1">Validation Errors:</p>
                            <ul className="list-disc list-inside space-y-1">
                              {validationErrors.slice(0, 5).map((err, i) => (
                                <li key={i}>{err}</li>
                              ))}
                              {validationErrors.length > 5 && (
                                <li>...and {validationErrors.length - 5} more errors</li>
                              )}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <Button 
                      className="w-full" 
                      onClick={() => createFromIndexMutation.mutate()}
                      disabled={createFromIndexMutation.isPending || !indexFileContent}
                      data-testid="button-create-from-index"
                    >
                      {createFromIndexMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating Run...
                        </>
                      ) : (
                        "Create Run from Index File"
                      )}
                    </Button>
                  </TabsContent>
                </Tabs>
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
                        <Badge className={getStatusColor(run.status)}>
                          {getStatusLabel(run.status)}
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
