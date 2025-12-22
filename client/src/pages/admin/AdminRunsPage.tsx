import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Plus, FlaskConical, RefreshCw, Edit, Database, Upload, FileText, AlertCircle, Loader2, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  plateCount?: number;
  validatedPlateCount?: number;
  successRate?: number;
  rerunCount?: number;
}

interface SpecimenSummary {
  inQueue: number;
  inSequencingQueue: number;
  tissueExtracted: number;
  underDataAnalysis: number;
  breakdown: {
    inQueue: { username: string; state: string; count: number }[];
    inSequencingQueue: { username: string; state: string; count: number }[];
    tissueExtracted: { username: string; state: string; count: number }[];
    underDataAnalysis: { username: string; state: string; count: number }[];
  };
}

type SortField = 'name' | 'createdAt';
type SortDirection = 'asc' | 'desc';
type SummaryPanel = 'inQueue' | 'inSequencingQueue' | 'tissueExtracted' | 'underDataAnalysis' | null;

const RUN_STATUS_OPTIONS = [
  { value: 'tissue_collection', label: 'Tissue Collection In Progress', color: 'bg-purple-100 text-purple-700' },
  { value: 'dna_extraction', label: 'DNA Extraction In Progress', color: 'bg-orange-100 text-orange-700' },
  { value: 'dna_amplification', label: 'DNA Amplification In Progress', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'dna_sequencing_pooled', label: 'DNA Sequencing In Progress (DNA Pooled)', color: 'bg-blue-100 text-blue-700' },
  { value: 'dna_sequencing_library', label: 'DNA Sequencing In Progress (DNA Library Created)', color: 'bg-blue-100 text-blue-700' },
  { value: 'dna_sequencing_raw_data', label: 'DNA Sequencing In Progress (Raw Data Available)', color: 'bg-blue-100 text-blue-700' },
  { value: 'sequence_analysis', label: 'Sequence Analysis In Progress', color: 'bg-teal-100 text-teal-700' },
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
  const [allowMissingReverseIndexes, setAllowMissingReverseIndexes] = useState(false);
  const [hasMissingReverseIndexesOnly, setHasMissingReverseIndexesOnly] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedPanel, setSelectedPanel] = useState<SummaryPanel>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { data: summary } = useQuery<SpecimenSummary>({
    queryKey: ['/api/admin/specimen-summary'],
  });
  
  const { data: runs, isLoading, refetch } = useQuery<LabRun[]>({
    queryKey: ['/api/admin/runs', searchQuery, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      const url = params.toString() ? `/api/admin/runs?${params}` : '/api/admin/runs';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch runs');
      return res.json();
    },
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedRuns = runs ? [...runs].sort((a, b) => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    if (sortField === 'name') {
      return a.name.localeCompare(b.name) * direction;
    } else {
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction;
    }
  }) : [];

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
    setAllowMissingReverseIndexes(false);
    setHasMissingReverseIndexesOnly(false);
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
      setValidationErrors([]);
      setHasMissingReverseIndexesOnly(false);
      const response = await apiRequest('POST', '/api/admin/runs/from-index', { 
        name: indexRunName || `Run ${new Date().toLocaleDateString()}`,
        indexFileContent,
        allowMissingReverseIndexes
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
      // Parse error if it's a string (sometimes errors get stringified)
      let parsedError = error;
      if (typeof error === 'string') {
        try {
          parsedError = JSON.parse(error);
        } catch {
          parsedError = { message: error };
        }
      }
      // Handle Error objects with message property containing JSON
      if (error?.message && typeof error.message === 'string') {
        try {
          const match = error.message.match(/\d+:\s*(\{.*\})/);
          if (match) {
            parsedError = JSON.parse(match[1]);
          }
        } catch {
          // Keep original error
        }
      }
      
      const details = parsedError?.details || [];
      const missingFwIndexes = parsedError?.missingFwIndexes || [];
      const missingRvIndexes = parsedError?.missingRvIndexes || [];
      const missingFwPrimers = parsedError?.missingFwPrimers || [];
      const missingRvPrimers = parsedError?.missingRvPrimers || [];
      
      // Check if only reverse indexes are missing (can be overridden)
      const onlyReverseIndexesMissing = missingRvIndexes.length > 0 && 
        missingFwIndexes.length === 0 && 
        missingFwPrimers.length === 0 && 
        missingRvPrimers.length === 0 &&
        details.length === 0;
      
      setHasMissingReverseIndexesOnly(onlyReverseIndexesMissing);
      
      const allErrors: string[] = [];
      
      // Add the general error message FIRST if it exists (e.g., "Failed to parse index file")
      if (parsedError?.error) {
        allErrors.push(parsedError.error);
      }
      
      if (missingFwIndexes.length > 0) {
        allErrors.push(`Missing forward indexes (${missingFwIndexes.length} total): ${missingFwIndexes.slice(0, 10).join(', ')}${missingFwIndexes.length > 10 ? ` (+${missingFwIndexes.length - 10} more)` : ''}`);
      }
      
      if (missingRvIndexes.length > 0) {
        allErrors.push(`Missing reverse indexes (${missingRvIndexes.length} total): ${missingRvIndexes.slice(0, 10).join(', ')}${missingRvIndexes.length > 10 ? ` (+${missingRvIndexes.length - 10} more)` : ''}`);
      }
      
      if (missingFwPrimers.length > 0) {
        allErrors.push(`Missing forward primers: ${missingFwPrimers.join(', ')}`);
      }
      
      if (missingRvPrimers.length > 0) {
        allErrors.push(`Missing reverse primers: ${missingRvPrimers.join(', ')}`);
      }
      
      if (details.length > 0) {
        allErrors.push(...details);
      }
      
      // If still no errors, try to extract from message
      if (allErrors.length === 0 && parsedError?.message) {
        allErrors.push(parsedError.message);
      }
      
      if (allErrors.length > 0) {
        setValidationErrors(allErrors);
      } else {
        toast({
          title: "Error",
          description: "Failed to create run from index file",
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
        <div className="space-y-4">
          <Link href="/dashboard" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Link>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900" data-testid="text-page-title">
                Sequencing Runs
              </h1>
              <p className="text-gray-600">Manage sequencing runs and plates</p>
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
                      <div className={`border rounded-lg p-3 ${hasMissingReverseIndexesOnly ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                        <div className={`flex items-start gap-2 ${hasMissingReverseIndexesOnly ? 'text-amber-700' : 'text-red-700'}`}>
                          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                          <div className="text-sm flex-1">
                            <p className="font-medium mb-1">Validation Errors:</p>
                            <ul className="list-disc list-inside space-y-1">
                              {validationErrors.slice(0, 5).map((err, i) => (
                                <li key={i}>{err}</li>
                              ))}
                              {validationErrors.length > 5 && (
                                <li>...and {validationErrors.length - 5} more errors</li>
                              )}
                            </ul>
                            
                            {hasMissingReverseIndexesOnly && (
                              <div className="mt-3 pt-3 border-t border-amber-200">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={allowMissingReverseIndexes}
                                    onChange={(e) => setAllowMissingReverseIndexes(e.target.checked)}
                                    className="rounded border-amber-400"
                                    data-testid="checkbox-override-missing-indexes"
                                  />
                                  <span className="text-amber-800 font-medium">
                                    Override: Create run without missing reverse indexes
                                  </span>
                                </label>
                                <p className="text-xs text-amber-600 mt-1 ml-6">
                                  Some runs may intentionally have incomplete index sets. Check this to proceed anyway.
                                </p>
                              </div>
                            )}
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
        </div>

        {/* Summary Panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card 
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setSelectedPanel('inQueue')}
            data-testid="panel-specimens-in-queue"
          >
            <CardContent className="p-4">
              <div className="text-sm text-gray-600">Specimens in Queue</div>
              <div className="text-2xl font-bold text-purple-600">{summary?.inQueue ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">Not yet completed</div>
            </CardContent>
          </Card>
          
          <Card 
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setSelectedPanel('inSequencingQueue')}
            data-testid="panel-sequencing-queue"
          >
            <CardContent className="p-4">
              <div className="text-sm text-gray-600">In Sequencing Queue</div>
              <div className="text-2xl font-bold text-blue-600">{summary?.inSequencingQueue ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">Extraction through sequencing</div>
            </CardContent>
          </Card>
          
          <Card 
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setSelectedPanel('tissueExtracted')}
            data-testid="panel-tissue-extracted"
          >
            <CardContent className="p-4">
              <div className="text-sm text-gray-600">Tissue Extracted</div>
              <div className="text-2xl font-bold text-orange-600">{summary?.tissueExtracted ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">DNA extraction complete</div>
            </CardContent>
          </Card>
          
          <Card 
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setSelectedPanel('underDataAnalysis')}
            data-testid="panel-data-analysis"
          >
            <CardContent className="p-4">
              <div className="text-sm text-gray-600">Under Data Analysis</div>
              <div className="text-2xl font-bold text-teal-600">{summary?.underDataAnalysis ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">Sequence analysis in progress</div>
            </CardContent>
          </Card>
        </div>

        {/* Summary Panel Detail Modal */}
        <Dialog open={selectedPanel !== null} onOpenChange={(open) => !open && setSelectedPanel(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {selectedPanel === 'inQueue' && 'Specimens in Queue'}
                {selectedPanel === 'inSequencingQueue' && 'Specimens in Sequencing Queue'}
                {selectedPanel === 'tissueExtracted' && 'Tissue Extracted'}
                {selectedPanel === 'underDataAnalysis' && 'Under Data Analysis'}
              </DialogTitle>
            </DialogHeader>
            <div className="max-h-[400px] overflow-y-auto">
              {selectedPanel && summary?.breakdown[selectedPanel] && summary.breakdown[selectedPanel].length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Specimens</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.breakdown[selectedPanel].map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.username}</TableCell>
                        <TableCell>{item.state}</TableCell>
                        <TableCell className="text-right font-medium">{item.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-gray-500 text-center py-4">No specimens in this category</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Search and Filter Row */}
        <div className="flex gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by run name, iNat number, or lab code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-runs"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[280px]" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {RUN_STATUS_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button 
                      className="flex items-center gap-1 hover:text-gray-900"
                      onClick={() => toggleSort('name')}
                    >
                      Name
                      {sortField === 'name' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                      ) : (
                        <ArrowUpDown className="h-4 w-4 opacity-50" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plates Validated</TableHead>
                  <TableHead>
                    <button 
                      className="flex items-center gap-1 hover:text-gray-900"
                      onClick={() => toggleSort('createdAt')}
                    >
                      Created
                      {sortField === 'createdAt' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                      ) : (
                        <ArrowUpDown className="h-4 w-4 opacity-50" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead># to Rerun</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!sortedRuns || sortedRuns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      <FlaskConical className="h-12 w-12 mx-auto mb-2 opacity-30" />
                      {searchQuery || statusFilter !== 'all' ? 'No runs match your filters.' : 'No lab runs yet. Create your first run to get started.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedRuns.map((run) => (
                    <TableRow key={run.id} data-testid={`row-run-${run.id}`}>
                      <TableCell className="font-medium" data-testid={`text-run-name-${run.id}`}>
                        {run.name}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(run.status)}>
                          {getStatusLabel(run.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {run.plateCount !== undefined ? (
                          <span className={run.validatedPlateCount === run.plateCount ? 'text-green-600 font-medium' : 'text-gray-600'}>
                            {run.validatedPlateCount ?? 0}/{run.plateCount}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {format(new Date(run.createdAt), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        {run.successRate !== undefined ? (
                          <span className={run.successRate >= 90 ? 'text-green-600 font-medium' : run.successRate >= 70 ? 'text-yellow-600' : 'text-red-600'}>
                            {run.successRate.toFixed(1)}%
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {run.rerunCount !== undefined ? (
                          <span className={run.rerunCount === 0 ? 'text-green-600' : 'text-orange-600 font-medium'}>
                            {run.rerunCount}
                          </span>
                        ) : '—'}
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
