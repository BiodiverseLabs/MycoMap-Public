import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, FlaskConical, Grid3X3, Plus, FileText, Download, X, Loader2, Users, MapPin, TestTube, AlertTriangle, CheckCircle, BarChart3, Cpu, HardDrive, ExternalLink, FolderOpen, File, ChevronDown, ChevronUp, Copy, Trash2, ShieldCheck, ClipboardList, Pencil, Check, Upload } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect } from "react";
import { Progress } from "@/components/ui/progress";

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
  specimensNeedingRecords: number;
  topStates: { state: string; count: number }[];
  allStates: { state: string; count: number }[];
  topUsers: { username: string; count: number }[];
  allUsers: { username: string; count: number }[];
  successRate: number | null;
  totalFails: number | null;
  platesWithMissingPrimers?: { plateNumber: number; plateName: string | null; wellsWithData: number; wellsMissingPrimers: number }[];
  sequencingSuccess?: {
    rate: number | null;
    withDnaBarcode: number;
    totalChecked: number;
    totalInat: number;
  };
}

interface MycoMapAnalysis {
  hasResults: boolean;
  uploadedAt?: string;
  successCount?: number;
  failureCount?: number;
  noAnalysisLinkageCount?: number;
  noAnalysisLinkageIds?: string[];
  sequencesToUploadCount?: number;
  sequencesToUploadIds?: string[];
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

interface StatusHistoryEntry {
  status: string;
  timestamp: string;
}

interface LabRun {
  id: number;
  name: string;
  status: string;
  notes: string | null;
  rawDataUrl: string | null;
  statusHistory: StatusHistoryEntry[] | null;
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

const RUN_STATUS_OPTIONS = [
  { value: 'tissue_collection', label: 'Tissue Collection In Progress' },
  { value: 'dna_extraction', label: 'DNA Extraction In Progress' },
  { value: 'dna_amplification', label: 'DNA Amplification In Progress' },
  { value: 'dna_sequencing_pooled', label: 'DNA Sequencing In Progress (DNA Pooled)' },
  { value: 'dna_sequencing_library', label: 'DNA Sequencing In Progress (DNA Library Created)' },
  { value: 'dna_sequencing_raw_data', label: 'DNA Sequencing In Progress (Raw Data Available)' },
  { value: 'sequence_analysis', label: 'Sequence Analysis In Progress' },
  { value: 'complete', label: 'Complete' },
];

const getStatusLabel = (value: string) => {
  const option = RUN_STATUS_OPTIONS.find(o => o.value === value);
  return option?.label || value.replace(/_/g, ' ');
};

const statusColors: Record<string, string> = {
  empty: "bg-gray-100 text-gray-600",
  partial: "bg-yellow-100 text-yellow-700",
  full: "bg-blue-100 text-blue-700",
  validated: "bg-green-100 text-green-700",
};

const STATE_NAMES: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
  'DC': 'District of Columbia', 'PR': 'Puerto Rico', 'VI': 'Virgin Islands', 'GU': 'Guam',
  'AB': 'Alberta', 'BC': 'British Columbia', 'MB': 'Manitoba', 'NB': 'New Brunswick',
  'NL': 'Newfoundland and Labrador', 'NS': 'Nova Scotia', 'NT': 'Northwest Territories',
  'NU': 'Nunavut', 'ON': 'Ontario', 'PE': 'Prince Edward Island', 'QC': 'Quebec', 'SK': 'Saskatchewan', 'YT': 'Yukon',
};

function getStateName(code: string): string {
  const upperCode = code?.toUpperCase()?.trim();
  return STATE_NAMES[upperCode] || code;
}

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
  const [importNotesOpen, setImportNotesOpen] = useState(false);
  const [plateNotes, setPlateNotes] = useState<Record<number, string>>({});
  const [isEditingDriveUrl, setIsEditingDriveUrl] = useState(false);
  const [expandedCodeStages, setExpandedCodeStages] = useState<Record<string, boolean>>({});
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [generateSpecimensOpen, setGenerateSpecimensOpen] = useState(false);
  const [mycoMapUploadOpen, setMycoMapUploadOpen] = useState(false);
  const [mycoMapSuccessFile, setMycoMapSuccessFile] = useState<File | null>(null);
  const [mycoMapFailureFile, setMycoMapFailureFile] = useState<File | null>(null);
  const mycoMapSuccessInputRef = useRef<HTMLInputElement>(null);
  const mycoMapFailureInputRef = useRef<HTMLInputElement>(null);
  const [showSequencesToUpload, setShowSequencesToUpload] = useState(false);
  const [specimenJobId, setSpecimenJobId] = useState<string | null>(null);
  const [specimenProgress, setSpecimenProgress] = useState<{
    status: 'running' | 'completed' | 'error';
    total: number;
    processed: number;
    created: number;
    linked: number;
    progress: number;
    error?: string;
    refreshStatus?: {
      jobId?: string;
      status: 'running' | 'syncing' | 'completed' | 'error';
      total: number;
      processed: number;
      withDnaBarcode: number;
      progress: number;
      successRate: number;
      message?: string;
    };
  } | null>(null);
  
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

  const { data: mycoMapAnalysis, refetch: refetchMycoMapAnalysis } = useQuery<MycoMapAnalysis>({
    queryKey: ['/api/admin/runs', runId, 'mycomap-analysis'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/runs/${runId}/mycomap-analysis`);
      if (!res.ok) throw new Error('Failed to fetch MycoMap analysis');
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
        const errorData = await response.json();
        // Create a more readable error message
        if (errorData.missingPrimers && Array.isArray(errorData.missingPrimers)) {
          const primerList = errorData.missingPrimers.slice(0, 5).join(', ');
          const moreCount = errorData.missingPrimers.length > 5 ? ` and ${errorData.missingPrimers.length - 5} more` : '';
          throw new Error(`Missing primer sequences for: ${primerList}${moreCount}. Go to Primer Management to add sequences.`);
        }
        throw new Error(errorData.message || errorData.error || 'Failed to generate files');
      }
      return response.json();
    },
    onSuccess: async (data: any) => {
      await refetchFiles();
      if (data.wellErrors && data.wellErrors.length > 0) {
        const errorCount = data.wellErrors.length;
        const errorList = data.wellErrors.slice(0, 3).map((e: any) => 
          `Plate ${e.plateNumber} ${e.wellPosition}: ${e.sampleId}`
        ).join(', ');
        const moreText = errorCount > 3 ? ` and ${errorCount - 3} more` : '';
        toast({ 
          title: `Files Generated with ${errorCount} Warning${errorCount > 1 ? 's' : ''}`, 
          description: `Wells missing observation/lab code: ${errorList}${moreText}`,
          variant: "destructive",
          duration: 10000,
        });
      } else {
        toast({ title: "Files Generated", description: "Index and primer files created successfully" });
      }
    },
    onError: (error: Error) => {
      toast({ 
        title: "Cannot Generate Files", 
        description: error.message || "Failed to generate files", 
        variant: "destructive" 
      });
    },
  });

  const generateSpecimensMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/admin/runs/${runId}/generate-specimens`, {});
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate specimen records');
      }
      return response.json();
    },
    onSuccess: async (data: { jobId: string | null; status: string; total?: number; created?: number; linked?: number; message?: string }) => {
      if (data.jobId) {
        // Job started, begin polling
        setSpecimenJobId(data.jobId);
        setSpecimenProgress({ status: 'running', total: data.total || 0, processed: 0, created: 0, linked: 0, progress: 0 });
      } else {
        // Immediate completion (no wells to process)
        queryClient.invalidateQueries({ queryKey: ['/api/admin/runs', runId, 'stats'] });
        setGenerateSpecimensOpen(false);
        toast({ 
          title: "Complete", 
          description: data.message || "No specimen records needed"
        });
      }
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to generate specimen records", 
        variant: "destructive" 
      });
    },
  });

  // Poll for specimen generation progress
  const { data: progressData } = useQuery({
    queryKey: ['/api/admin/runs', runId, 'generate-specimens/status', specimenJobId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/runs/${runId}/generate-specimens/status/${specimenJobId}`);
      if (!res.ok) throw new Error('Failed to fetch progress');
      return res.json();
    },
    enabled: !!specimenJobId,
    refetchInterval: specimenJobId ? 500 : false, // Poll every 500ms while job is running
  });

  // Handle progress data changes in useEffect to avoid render-phase updates
  const progressRef = useRef<typeof progressData>(null);
  const completionToastShown = useRef(false);
  useEffect(() => {
    if (!progressData || !specimenJobId) return;
    if (progressRef.current === progressData) return;
    progressRef.current = progressData;
    
    // Always update the progress state to show current status
    setSpecimenProgress(progressData);
    
    if (progressData.status === 'completed' || progressData.status === 'error') {
      // Check if refresh is still running (handle both 'running' and 'syncing' statuses)
      const refreshStatus = progressData.refreshStatus?.status;
      const refreshStillRunning = refreshStatus === 'running' || refreshStatus === 'syncing';
      
      if (progressData.status === 'completed' && !refreshStillRunning && !completionToastShown.current) {
        // Both specimen generation and refresh are done - show toast only once
        completionToastShown.current = true;
        if (progressData.refreshStatus) {
          toast({ 
            title: "Import Complete", 
            description: `Created ${progressData.created} records. ${progressData.refreshStatus.withDnaBarcode}/${progressData.refreshStatus.total} have DNA barcode (${progressData.refreshStatus.successRate}%)`
          });
        } else {
          toast({ 
            title: "Specimen Records Generated", 
            description: `Created ${progressData.created} new records, linked ${progressData.linked} to existing`
          });
        }
        // Don't auto-close - let user click Done button
        queryClient.invalidateQueries({ queryKey: ['/api/admin/runs', runId, 'stats'] });
      } else if (progressData.status === 'error') {
        toast({ 
          title: "Error", 
          description: progressData.error || "Failed to generate specimen records",
          variant: "destructive"
        });
        setSpecimenJobId(null);
        setSpecimenProgress(null);
        setGenerateSpecimensOpen(false);
      }
      // If refresh is still running, keep polling
    }
  }, [progressData, specimenJobId, toast, runId]);
  
  // Reset completion toast flag when job changes
  useEffect(() => {
    if (!specimenJobId) {
      completionToastShown.current = false;
    }
  }, [specimenJobId]);

  const mycoMapUploadMutation = useMutation({
    mutationFn: async ({ successFile, failureFile }: { successFile: File | null; failureFile: File | null }) => {
      const formData = new FormData();
      formData.append('runId', runId.toString());
      if (successFile) formData.append('successFile', successFile);
      if (failureFile) formData.append('failureFile', failureFile);
      
      const response = await fetch(`/api/admin/runs/${runId}/mycomap-results`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload files');
      }
      return response.json();
    },
    onSuccess: async (data) => {
      await refetchFiles();
      await refetchMycoMapAnalysis();
      setMycoMapUploadOpen(false);
      setMycoMapSuccessFile(null);
      setMycoMapFailureFile(null);
      toast({ 
        title: "MycoMap Results Uploaded", 
        description: `Processed ${data.successCount || 0} success and ${data.failureCount || 0} failure records`
      });
    },
    onError: (error: Error) => {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
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

  const deleteRunMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', `/api/admin/runs/${runId}`, {});
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/runs'] });
      toast({ title: "Run Deleted", description: "The run and all associated data have been deleted" });
      setLocation('/admin/runs');
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete run", variant: "destructive" });
    },
  });

  const validateAllMutation = useMutation({
    mutationFn: async (plateIds: number[]) => {
      const results = [];
      for (const plateId of plateIds) {
        try {
          const response = await apiRequest('POST', `/api/admin/plates/${plateId}/validate`, {});
          if (response.ok) {
            results.push({ plateId, success: true });
          } else {
            results.push({ plateId, success: false });
          }
        } catch {
          results.push({ plateId, success: false });
        }
      }
      return results;
    },
    onSuccess: async (results) => {
      await refetch();
      const successCount = results.filter(r => r.success).length;
      toast({ 
        title: "Validation Complete", 
        description: `Validated ${successCount} of ${results.length} plates` 
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to validate plates", variant: "destructive" });
    },
  });

  const importNotesMutation = useMutation({
    mutationFn: async (notesData: Record<number, string>) => {
      const results = [];
      for (const [plateId, notes] of Object.entries(notesData)) {
        if (notes.trim()) {
          try {
            const response = await apiRequest('PATCH', `/api/admin/plates/${plateId}`, { notes });
            results.push({ plateId: Number(plateId), success: response.ok });
          } catch {
            results.push({ plateId: Number(plateId), success: false });
          }
        }
      }
      return results;
    },
    onSuccess: async (results) => {
      await refetch();
      const successCount = results.filter(r => r.success).length;
      setImportNotesOpen(false);
      setPlateNotes({});
      toast({ 
        title: "Notes Imported", 
        description: `Updated notes for ${successCount} plate${successCount !== 1 ? 's' : ''}` 
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to import notes", variant: "destructive" });
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

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      return apiRequest('PATCH', `/api/admin/runs/${runId}`, { status });
    },
    onSuccess: async () => {
      await refetch();
      toast({ title: "Status Updated", description: "Run status has been updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    },
  });

  const updateTitleMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest('PATCH', `/api/admin/runs/${runId}`, { name });
    },
    onSuccess: async () => {
      await refetch();
      setIsEditingTitle(false);
      toast({ title: "Title Updated", description: "Run title has been updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update title", variant: "destructive" });
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
        {/* Breadcrumb */}
        <Link href="/admin/runs" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700" data-testid="button-back">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Sequencing Runs
        </Link>
        
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="text-2xl font-bold h-10 w-64"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editedTitle.trim()) {
                        updateTitleMutation.mutate(editedTitle.trim());
                      } else if (e.key === 'Escape') {
                        setIsEditingTitle(false);
                      }
                    }}
                    data-testid="input-run-title"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (editedTitle.trim()) {
                        updateTitleMutation.mutate(editedTitle.trim());
                      }
                    }}
                    disabled={updateTitleMutation.isPending || !editedTitle.trim()}
                    data-testid="button-save-title"
                  >
                    {updateTitleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsEditingTitle(false)}
                    data-testid="button-cancel-title"
                  >
                    <X className="h-4 w-4 text-gray-500" />
                  </Button>
                </div>
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-gray-900" data-testid="text-run-title">
                    {run.name}
                  </h1>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditedTitle(run.name);
                      setIsEditingTitle(true);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                    data-testid="button-edit-title"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
            <p className="text-gray-600">
              Created {format(new Date(run.createdAt), 'MMMM d, yyyy')} • {run.plates.length} plates
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select 
              value={run.status} 
              onValueChange={(value) => updateStatusMutation.mutate(value)}
              disabled={updateStatusMutation.isPending}
            >
              <SelectTrigger 
                className="w-auto min-w-[220px] bg-white" 
                data-testid="select-run-status"
              >
                <span className="truncate">{getStatusLabel(run.status)}</span>
              </SelectTrigger>
              <SelectContent>
                {RUN_STATUS_OPTIONS.map(option => (
                  <SelectItem 
                    key={option.value} 
                    value={option.value}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {run.plates.length > 0 && (stats?.specimensNeedingRecords ?? 0) > 0 && (
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
            {run.plates.length > 0 && (stats?.specimensNeedingRecords ?? 0) > 0 && (
              <Button 
                onClick={() => validateAllMutation.mutate(run.plates.map(p => p.id))}
                disabled={validateAllMutation.isPending}
                variant="outline"
                data-testid="button-validate-all"
              >
                {validateAllMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Validating...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 mr-1" /> Validate All
                  </>
                )}
              </Button>
            )}
            {run.plates.length > 0 && (stats?.specimensNeedingRecords ?? 0) === 0 && (
              <Button 
                onClick={() => setMycoMapUploadOpen(true)}
                variant="outline"
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
                data-testid="button-upload-mycomap"
              >
                <Upload className="h-4 w-4 mr-1" /> Upload MycoMap Success
              </Button>
            )}
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
                {(stats?.specimensNeedingRecords ?? 0) > 0 && (
                  <button
                    onClick={() => setGenerateSpecimensOpen(true)}
                    className="text-xs text-amber-600 hover:text-amber-700 hover:underline mt-1 flex items-center gap-1"
                    data-testid="link-specimens-needing-records"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {stats?.specimensNeedingRecords} need records in MYCO
                  </button>
                )}
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
                        <span className="truncate text-gray-700" title={s.state}>{getStateName(s.state)}</span>
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

              {/* Sequencing Success Rate */}
              <div className="bg-gradient-to-br from-green-50 to-white rounded-xl p-4 border border-green-100 hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-600">Sequencing Success</span>
                </div>
                {stats?.sequencingSuccess?.totalChecked !== undefined && stats?.sequencingSuccess?.totalChecked > 0 ? (
                  <>
                    <p className="text-3xl font-bold text-green-600" data-testid="stat-sequencing-success">
                      {stats.sequencingSuccess.totalInat > 0 
                        ? Math.round((stats.sequencingSuccess.withDnaBarcode / stats.sequencingSuccess.totalInat) * 100)
                        : 0}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {stats.sequencingSuccess.withDnaBarcode}/{stats.sequencingSuccess.totalInat} with DNA barcode (iNat field)
                    </p>
                    {stats.sequencingSuccess.totalInat > stats.sequencingSuccess.totalChecked && (
                      <p className="text-xs text-amber-600 mt-0.5">
                        {stats.sequencingSuccess.totalInat - stats.sequencingSuccess.totalChecked} awaiting cache sync
                      </p>
                    )}
                  </>
                ) : stats?.sequencingSuccess?.totalInat === 0 ? (
                  <p className="text-gray-400 text-sm italic">No iNat specimens</p>
                ) : (
                  <p className="text-gray-400 text-sm italic">Run iNat refresh to check</p>
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

            {/* Warning: Plates with Missing Primers */}
            {stats?.platesWithMissingPrimers && stats.platesWithMissingPrimers.length > 0 && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg" data-testid="warning-missing-primers">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-amber-800">
                      {stats.platesWithMissingPrimers.length} plate{stats.platesWithMissingPrimers.length > 1 ? 's' : ''} missing primer assignments
                    </h4>
                    <p className="text-sm text-amber-700 mt-1">
                      The following plates have wells with sample data but no primer pool or forward/reverse primer assigned:
                    </p>
                    <ul className="mt-2 space-y-1">
                      {stats.platesWithMissingPrimers.slice(0, 5).map((p) => (
                        <li key={p.plateNumber} className="text-sm text-amber-700">
                          <span className="font-medium">Plate {p.plateNumber}</span>
                          {p.plateName && <span className="text-amber-600"> ({p.plateName})</span>}
                          <span> - {p.wellsMissingPrimers} of {p.wellsWithData} wells need primers</span>
                        </li>
                      ))}
                      {stats.platesWithMissingPrimers.length > 5 && (
                        <li className="text-sm text-amber-600 italic">
                          ...and {stats.platesWithMissingPrimers.length - 5} more plates
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* MycoMap Sequence Analysis Section */}
        {mycoMapAnalysis?.hasResults && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              MycoMap Sequence Analysis
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Successful Observations */}
              <div className="bg-gradient-to-br from-green-50 to-white rounded-xl p-4 border border-green-100 hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-600">Successful Observations</span>
                </div>
                <p className="text-3xl font-bold text-green-600" data-testid="stat-mycomap-success">
                  {mycoMapAnalysis.successCount || 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">from MycoMap Success CSV</p>
              </div>

              {/* Observation Fails */}
              <div className="bg-gradient-to-br from-red-50 to-white rounded-xl p-4 border border-red-100 hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <X className="h-4 w-4 text-red-500" />
                  </div>
                  <span className="text-sm font-medium text-gray-600">Observation Fails</span>
                </div>
                <p className="text-3xl font-bold text-red-600" data-testid="stat-mycomap-failure">
                  {mycoMapAnalysis.failureCount || 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">from MycoMap Failure CSV</p>
              </div>

              {/* No Analysis Linkage */}
              <div className="bg-gradient-to-br from-amber-50 to-white rounded-xl p-4 border border-amber-100 hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-600">No Analysis Linkage</span>
                </div>
                <p className="text-3xl font-bold text-amber-600" data-testid="stat-mycomap-no-linkage">
                  {mycoMapAnalysis.noAnalysisLinkageCount || 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">in run but not in MycoMap</p>
              </div>

              {/* Sequences to Upload - Clickable */}
              <div 
                className={`bg-gradient-to-br from-blue-50 to-white rounded-xl p-4 border border-blue-100 hover:shadow-md transition-all ${
                  (mycoMapAnalysis.sequencesToUploadCount || 0) > 0 ? 'cursor-pointer hover:border-blue-300' : ''
                }`}
                onClick={() => {
                  if ((mycoMapAnalysis.sequencesToUploadCount || 0) > 0) {
                    setShowSequencesToUpload(true);
                  }
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Upload className="h-4 w-4 text-blue-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-600">Sequences to Upload</span>
                </div>
                <p className="text-3xl font-bold text-blue-600" data-testid="stat-mycomap-to-upload">
                  {mycoMapAnalysis.sequencesToUploadCount || 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {(mycoMapAnalysis.sequencesToUploadCount || 0) > 0 
                    ? 'Click to view observation IDs' 
                    : 'success but no sequence in cache'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Sequences to Upload Dialog */}
        <Dialog open={showSequencesToUpload} onOpenChange={setShowSequencesToUpload}>
          <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-blue-600" />
                Sequences to Upload ({mycoMapAnalysis?.sequencesToUploadCount || 0})
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600 mb-3">
              These observations are in the MycoMap Success CSV but don't have a DNA barcode sequence in our platform's cache.
            </p>
            <div className="flex-1 overflow-y-auto pr-2" style={{ maxHeight: '400px' }}>
              <div className="space-y-2">
                {mycoMapAnalysis?.sequencesToUploadIds?.map((obsId) => (
                  <div key={obsId} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <a 
                      href={`https://www.inaturalist.org/observations/${obsId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {obsId}
                    </a>
                    <ExternalLink className="h-4 w-4 text-gray-400" />
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
                    <span className="font-medium text-gray-700" title={s.state}>{getStateName(s.state)}</span>
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
                const isExpanded = expandedCodeStages[key];
                
                const getDisplayText = (method: BioinformaticsMethod) => {
                  return `${method.name}${method.programName ? ` (${method.programName}${method.programVersion ? ` v${method.programVersion}` : ''})` : ''}`.trim();
                };
                
                const selectedMethod = methods.find(m => m.id === currentSelection?.methodId);
                const selectedDisplayText = selectedMethod ? getDisplayText(selectedMethod) : null;
                
                return (
                  <div key={key} className="border rounded-lg p-3" data-testid={`bio-stage-${key}`}>
                    <div className="flex items-center gap-4">
                      <Label className="w-40 text-sm font-medium text-gray-700 shrink-0">{label}</Label>
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
                          {selectedDisplayText ? (
                            <span className="truncate">{selectedDisplayText}</span>
                          ) : (
                            <SelectValue placeholder="Select a method..." />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          {methods.length === 0 ? (
                            <SelectItem value="none" disabled>No methods available</SelectItem>
                          ) : (
                            methods.map((method) => (
                              <SelectItem key={method.id} value={method.id.toString()}>
                                {getDisplayText(method)}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {currentSelection && (
                        <>
                          <Badge variant="secondary" className="bg-green-100 text-green-700 shrink-0">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Selected
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedCodeStages(prev => ({ ...prev, [key]: !prev[key] }))}
                            className="ml-auto shrink-0"
                            data-testid={`toggle-code-${key}`}
                          >
                            {isExpanded ? (
                              <>Hide Code <ChevronUp className="h-4 w-4 ml-1" /></>
                            ) : (
                              <>Show Code <ChevronDown className="h-4 w-4 ml-1" /></>
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                    {isExpanded && currentSelection?.code && (
                      <div className="mt-3 relative">
                        <div className="absolute top-2 right-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(currentSelection.code || "");
                              toast({ title: "Copied!", description: "Code copied to clipboard" });
                            }}
                            className="h-8 px-2 bg-white/80 hover:bg-white"
                            data-testid={`copy-code-${key}`}
                          >
                            <Copy className="h-4 w-4 mr-1" />
                            Copy
                          </Button>
                        </div>
                        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap">
                          <code>{currentSelection.code}</code>
                        </pre>
                      </div>
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
              Raw, Intermediate, and Final Data Files
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

        {/* Status Change History */}
        {run?.statusHistory && run.statusHistory.length > 0 && (
          <Card className="mt-6">
            <CardHeader className="py-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-[#8CBD45]" />
                Status Change History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(() => {
                  // Filter out entries within 1 minute of each other (keep the later one)
                  const filteredHistory = run.statusHistory.filter((entry, index, arr) => {
                    if (index === arr.length - 1) return true; // Always keep last entry
                    const nextEntry = arr[index + 1];
                    const currentTime = new Date(entry.timestamp).getTime();
                    const nextTime = new Date(nextEntry.timestamp).getTime();
                    return nextTime - currentTime >= 60000; // Keep if more than 1 minute apart
                  });
                  
                  // Reverse to show most recent first
                  return [...filteredHistory].reverse().map((entry, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
                      data-testid={`status-history-${index}`}
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-[#8CBD45]" />
                        <span className="font-medium text-sm">{getStatusLabel(entry.status)}</span>
                      </div>
                      <span className="text-sm text-gray-500">
                        {format(new Date(entry.timestamp), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                  ));
                })()}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Delete Run Section */}
        <div className="flex justify-start gap-4 mt-8 pt-6 border-t border-gray-200">
          <Button 
            variant="ghost" 
            className="flex items-center gap-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            onClick={() => {
              const initialNotes: Record<number, string> = {};
              run?.plates.forEach(plate => {
                initialNotes[plate.id] = '';
              });
              setPlateNotes(initialNotes);
              setImportNotesOpen(true);
            }}
            data-testid="button-import-notes"
          >
            <ClipboardList className="h-4 w-4" />
            Import Notes
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="ghost" 
                className="flex items-center gap-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                data-testid="button-delete-run"
              >
                <Trash2 className="h-4 w-4" />
                Delete Run
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>{run?.name}</strong> and all associated plates, wells, and files. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteRunMutation.mutate()}
                  className="bg-red-600 hover:bg-red-700"
                  disabled={deleteRunMutation.isPending}
                >
                  {deleteRunMutation.isPending ? "Deleting..." : "Yes, Delete Run"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Import Notes Dialog */}
        <Dialog open={importNotesOpen} onOpenChange={setImportNotesOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-[#8CBD45]" />
                Import Notes for Plates
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto pr-2" style={{ maxHeight: '400px' }}>
              <p className="text-sm text-gray-500 mb-4">
                Enter notes for each plate. Pasting into the first field will auto-populate down the list.
              </p>
              <div className="space-y-3">
                {run?.plates
                  .sort((a, b) => a.plateNumber - b.plateNumber)
                  .map((plate, index) => (
                  <div key={plate.id} className="flex items-start gap-3">
                    <Label className="w-20 pt-2 text-sm font-medium text-gray-600 flex-shrink-0">
                      Plate {plate.plateNumber}
                    </Label>
                    <Textarea
                      className="flex-1 min-h-[60px]"
                      placeholder={`Notes for Plate ${plate.plateNumber}...`}
                      value={plateNotes[plate.id] || ''}
                      onChange={(e) => setPlateNotes(prev => ({
                        ...prev,
                        [plate.id]: e.target.value
                      }))}
                      onPaste={(e) => {
                        if (index === 0) {
                          const pastedText = e.clipboardData.getData('text');
                          const lines = pastedText.split('\n').filter(line => line.trim());
                          if (lines.length > 1) {
                            e.preventDefault();
                            const sortedPlates = [...(run?.plates || [])].sort((a, b) => a.plateNumber - b.plateNumber);
                            const newNotes: Record<number, string> = { ...plateNotes };
                            sortedPlates.forEach((p, i) => {
                              if (i < lines.length) {
                                newNotes[p.id] = lines[i].trim();
                              }
                            });
                            setPlateNotes(newNotes);
                          }
                        }
                      }}
                      data-testid={`input-notes-plate-${plate.plateNumber}`}
                    />
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setImportNotesOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => importNotesMutation.mutate(plateNotes)}
                disabled={importNotesMutation.isPending || Object.values(plateNotes).every(v => !v.trim())}
                className="bg-[#8CBD45] hover:bg-[#7AAD35]"
              >
                {importNotesMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Notes'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Generate Specimens Dialog */}
        <Dialog open={generateSpecimensOpen} onOpenChange={(open) => {
          if (!specimenJobId) setGenerateSpecimensOpen(open);
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TestTube className="h-5 w-5 text-[#8CBD45]" />
                Generate Specimen Records
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              {specimenProgress ? (
                <div className="space-y-4">
                  {/* Specimen Generation Progress */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      {specimenProgress.status === 'completed' ? 'Specimens created' : 'Processing specimens...'}
                    </span>
                    <span className="font-medium">{specimenProgress.progress}%</span>
                  </div>
                  <Progress value={specimenProgress.progress} className="h-3" />
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="bg-gray-50 rounded p-2">
                      <p className="text-lg font-bold text-gray-900">{specimenProgress.processed}</p>
                      <p className="text-xs text-gray-500">of {specimenProgress.total}</p>
                    </div>
                    <div className="bg-green-50 rounded p-2">
                      <p className="text-lg font-bold text-green-600">{specimenProgress.created}</p>
                      <p className="text-xs text-gray-500">Created</p>
                    </div>
                    <div className="bg-blue-50 rounded p-2">
                      <p className="text-lg font-bold text-blue-600">{specimenProgress.linked}</p>
                      <p className="text-xs text-gray-500">Linked</p>
                    </div>
                  </div>
                  
                  {/* iNat Refresh Progress */}
                  {specimenProgress.refreshStatus && (
                    <div className="border-t pt-4 mt-4 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 flex items-center gap-2">
                          <Loader2 className={`h-3 w-3 ${specimenProgress.refreshStatus.status === 'running' || specimenProgress.refreshStatus.status === 'syncing' ? 'animate-spin' : ''}`} />
                          {specimenProgress.refreshStatus.status === 'completed' 
                            ? 'iNaturalist data refreshed' 
                            : 'Refreshing from iNaturalist...'}
                        </span>
                        <span className="font-medium">{specimenProgress.refreshStatus.progress}%</span>
                      </div>
                      <Progress value={specimenProgress.refreshStatus.progress} className="h-2" />
                      <div className="grid grid-cols-2 gap-2 text-center text-sm">
                        <div className="bg-blue-50 rounded p-2">
                          <p className="text-lg font-bold text-blue-600">{specimenProgress.refreshStatus.processed}</p>
                          <p className="text-xs text-gray-500">of {specimenProgress.refreshStatus.total} refreshed</p>
                        </div>
                        <div className="bg-green-50 rounded p-2">
                          <p className="text-lg font-bold text-green-600">{specimenProgress.refreshStatus.withDnaBarcode}</p>
                          <p className="text-xs text-gray-500">with DNA barcode</p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Done Button - show when generation is complete AND refresh is not running/syncing */}
                  {specimenProgress.status === 'completed' && 
                   (!specimenProgress.refreshStatus || 
                    (specimenProgress.refreshStatus.status !== 'running' && specimenProgress.refreshStatus.status !== 'syncing')) && (
                    <div className="pt-2">
                      <Button 
                        className="w-full bg-[#8CBD45] hover:bg-[#7AAD35]"
                        onClick={() => {
                          setGenerateSpecimensOpen(false);
                          setSpecimenJobId(null);
                          setSpecimenProgress(null);
                          queryClient.invalidateQueries({ queryKey: ['/api/admin/runs', runId, 'stats'] });
                        }}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Done
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 mb-4">
                    This will create specimen records in MYCO for wells that have observation data (iNaturalist/Mushroom Observer IDs or lab codes) but don't yet have linked specimen records.
                  </p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-800">{stats?.specimensNeedingRecords ?? 0} wells need records</p>
                        <p className="text-amber-700 mt-1">
                          Existing specimens will be linked automatically. New records will only be created when no match is found.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              {!specimenProgress && (
                <>
                  <Button variant="outline" onClick={() => setGenerateSpecimensOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => generateSpecimensMutation.mutate()}
                    disabled={generateSpecimensMutation.isPending}
                    className="bg-[#8CBD45] hover:bg-[#7AAD35]"
                  >
                    {generateSpecimensMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      'Generate Records'
                    )}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MycoMap Results Upload Dialog */}
        <Dialog open={mycoMapUploadOpen} onOpenChange={(open) => {
          setMycoMapUploadOpen(open);
          if (!open) {
            setMycoMapSuccessFile(null);
            setMycoMapFailureFile(null);
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-blue-600" />
                Upload MycoMap Results
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-6">
              <p className="text-sm text-gray-600">
                Upload the success and failure CSV files from MycoMap Analysis to compare against specimens in this run.
              </p>
              
              {/* Success File Upload */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">MycoMap Success</Label>
                <div 
                  className="border-2 border-dashed border-green-300 rounded-lg p-4 text-center cursor-pointer hover:bg-green-50 transition-colors"
                  onClick={() => mycoMapSuccessInputRef.current?.click()}
                >
                  <input
                    ref={mycoMapSuccessInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setMycoMapSuccessFile(file);
                    }}
                    data-testid="input-mycomap-success"
                  />
                  {mycoMapSuccessFile ? (
                    <div className="flex items-center justify-center gap-2 text-green-700">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-medium">{mycoMapSuccessFile.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMycoMapSuccessFile(null);
                          if (mycoMapSuccessInputRef.current) mycoMapSuccessInputRef.current.value = '';
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="text-gray-500">
                      <Upload className="h-8 w-8 mx-auto mb-2 text-green-400" />
                      <p className="text-sm">Click to select success CSV</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Failure File Upload */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">MycoMap Failure</Label>
                <div 
                  className="border-2 border-dashed border-red-300 rounded-lg p-4 text-center cursor-pointer hover:bg-red-50 transition-colors"
                  onClick={() => mycoMapFailureInputRef.current?.click()}
                >
                  <input
                    ref={mycoMapFailureInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setMycoMapFailureFile(file);
                    }}
                    data-testid="input-mycomap-failure"
                  />
                  {mycoMapFailureFile ? (
                    <div className="flex items-center justify-center gap-2 text-red-700">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-medium">{mycoMapFailureFile.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMycoMapFailureFile(null);
                          if (mycoMapFailureInputRef.current) mycoMapFailureInputRef.current.value = '';
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="text-gray-500">
                      <Upload className="h-8 w-8 mx-auto mb-2 text-red-400" />
                      <p className="text-sm">Click to select failure CSV</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMycoMapUploadOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => mycoMapUploadMutation.mutate({ 
                  successFile: mycoMapSuccessFile, 
                  failureFile: mycoMapFailureFile 
                })}
                disabled={mycoMapUploadMutation.isPending || (!mycoMapSuccessFile && !mycoMapFailureFile)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {mycoMapUploadMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  'Upload Files'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
