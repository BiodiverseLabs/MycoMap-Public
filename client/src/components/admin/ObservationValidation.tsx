import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Database, AlertCircle, CheckCircle, Clock, ExternalLink, ChevronDown, ChevronUp, XCircle, Check, X, Play, Square, Search } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

interface ValidationObservation {
  id: number;
  observationId: string;
  scientificName: string;
  commonName: string | null;
  observer: string | null;
  collector: string | null;
  observedOn: string | null;
  state: string | null;
  source: string;
  inatSyncStatus: 'pending' | 'success' | 'error';
  inatLastSynced: string | null;
  inatSyncError: string | null;
  hasInatData: boolean;
  dnaBarcode?: string | null;
  provisionalSpeciesName?: string | null;
  mycoMapBlastResults?: string | null;
  traceFiles?: string | null;
  // BLAST file tracking
  blastFilesDownloaded?: boolean;
  ncbiBlastFile?: string | null;
  localBlastFile?: string | null;
  // Trace file tracking
  traceFilesDownloaded?: boolean;
  fastqFile?: string | null;
  mycoMapTraceUrl?: string | null;
  // iNaturalist comparison data
  inatObserver?: string | null;
  inatObservedOn?: string | null;
  inatState?: string | null;
  inatScientificName?: string | null;
  inatGenbankAccession?: string | null;
  // MycoMap data fields
  genbankAccession?: string | null;
  // iNaturalist API file tracking
  inatApiSaved?: boolean;
  inatApiFile?: string | null;
  inatApiSaveDate?: string | null;
  // Mushroom Observer data
  hasMoData?: boolean;
  moId?: string | null;
  moSyncStatus?: 'pending' | 'success' | 'error' | null;
  moLastSynced?: string | null;
  moSyncError?: string | null;
}

interface SyncProgress {
  isRunning: boolean;
  total: number;
  processed: number;
  successful: number;
  failed: number;
  errors: Array<{observationId: string, error: string}>;
  startTime: string | null;
  endTime: string | null;
}

export function ObservationValidation() {
  const [sourceFilter, setSourceFilter] = useState('all');
  const [syncFilter, setSyncFilter] = useState('all');
  const [validationFilter, setValidationFilter] = useState('all');
  const [limit, setLimit] = useState(50);
  const [expandedComparisons, setExpandedComparisons] = useState<Set<number>>(new Set());
  const [showProgress, setShowProgress] = useState(false);
  const [syncingObservations, setSyncingObservations] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Helper function to compare data fields
  const compareFields = (mycoMapValue: string | null | undefined, inatValue: string | null | undefined, isScientificName = false, provisionalName?: string | null | undefined) => {
    // For scientific name comparison, use provisional name if available, otherwise use primary iNat name
    if (isScientificName) {
      const targetName = provisionalName || inatValue;
      return (mycoMapValue || '').toLowerCase().trim() === (targetName || '').toLowerCase().trim();
    }
    
    // For date fields, normalize both dates to comparable format
    if (mycoMapValue && inatValue) {
      // Check if these look like dates (contain numbers and slashes or dashes)
      const datePattern = /\d+[\/\-]\d+[\/\-]\d+/;
      if (datePattern.test(mycoMapValue) && datePattern.test(inatValue)) {
        try {
          // Normalize date strings to avoid parsing issues with different formats
          const normalizeDate = (dateStr: string) => {
            // Handle ISO timestamp format: "2024-10-16T00:00:00.000Z" -> extract date part
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)) {
              return dateStr.split('T')[0]; // Extract just the date part
            }
            
            // First, extract just the date part if there's a timestamp
            let dateOnly = dateStr.split(' ')[0]; // Remove time portion
            
            // Handle iNaturalist format: "2024/10/16" -> normalize to "2024-10-16"
            if (dateOnly.match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)) {
              const parts = dateOnly.split('/');
              const year = parts[0];
              const month = parts[1].padStart(2, '0');
              const day = parts[2].padStart(2, '0');
              return `${year}-${month}-${day}`;
            }
            
            // Handle US format: "10/16/2024" -> normalize to "2024-10-16"
            if (dateOnly.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
              const parts = dateOnly.split('/');
              const month = parts[0].padStart(2, '0');
              const day = parts[1].padStart(2, '0');
              const year = parts[2];
              return `${year}-${month}-${day}`;
            }
            
            // Handle ISO format: "2024-10-16" (already normalized)
            if (dateOnly.match(/^\d{4}-\d{2}-\d{2}$/)) {
              return dateOnly;
            }
            
            return dateOnly;
          };
          
          const normalizedMycoMap = normalizeDate(mycoMapValue);
          const normalizedInat = normalizeDate(inatValue);
          

          
          return normalizedMycoMap === normalizedInat;
        } catch (e) {
          // If date parsing fails, fall back to string comparison
        }
      }
    }
    
    // For other fields, do direct comparison
    const mycoMap = (mycoMapValue || '').toLowerCase().trim();
    const inat = (inatValue || '').toLowerCase().trim();
    return mycoMap === inat && mycoMap !== '';
  };

  // Helper function to render comparison icon (consistent with DNA field icons)
  const renderComparisonIcon = (isMatch: boolean) => {
    return isMatch ? 
      <CheckCircle className="w-4 h-4 text-green-600" /> : 
      <XCircle className="w-4 h-4 text-red-600" />;
  };

  // Comprehensive validation function that checks all comparison fields
  const getOverallValidationStatus = (obs: ValidationObservation) => {
    const validationChecks = [
      // Core data comparisons - only check if iNaturalist data exists
      obs.hasInatData ? compareFields(obs.scientificName, obs.provisionalSpeciesName || obs.inatScientificName, true, obs.provisionalSpeciesName) : true,
      obs.hasInatData ? compareFields(obs.collector, obs.inatObserver) : true,
      obs.hasInatData ? compareFields(obs.observedOn, obs.inatObservedOn) : true,
      obs.hasInatData ? compareFields(obs.state, obs.inatState) : true,
      
      // Data completeness checks
      obs.hasInatData, // Has iNaturalist data synced
      
      // DNA/BLAST data checks - must be present and downloaded if MycoMap URL exists
      obs.mycoMapBlastResults && obs.mycoMapBlastResults.includes('mycomap.com') ? 
        (obs.blastFilesDownloaded && (obs.ncbiBlastFile || obs.localBlastFile)) : true,
      
      // Trace file checks - must be present and downloaded 
      obs.traceFiles && obs.traceFiles.includes('mycomap.com') ? 
        (obs.traceFilesDownloaded && obs.fastqFile) : false,
      
      // iNaturalist API Export check - must have file saved if observation has iNat data
      obs.hasInatData ? (obs.inatApiSaved && obs.inatApiFile) : true,
    ];

    // Count failed validations
    const failedChecks = validationChecks.filter(check => check === false).length;
    
    // If any checks fail, show red X
    if (failedChecks > 0) {
      return <XCircle className="w-4 h-4 text-red-600" />;
    }
    
    // If all checks pass, show green checkmark
    return <CheckCircle className="w-4 h-4 text-green-600" />;
  };

  // Helper function to determine if observation is synced
  const isObservationSynced = (obs: ValidationObservation) => {
    return obs.inatSyncStatus === 'success';
  };

  // Helper function to determine if observation is fully validated
  // This should match exactly what getOverallValidationStatus returns
  const isObservationFullyValidated = (obs: ValidationObservation) => {
    // Non-iNaturalist observations are considered validated
    if (obs.source?.toLowerCase() !== 'inaturalist') {
      return true;
    }

    // For iNaturalist observations, check all validation criteria
    // (This matches the logic in getOverallValidationStatus)
    
    // Check if has iNaturalist data
    if (!obs.hasInatData) return false;
    
    // Check if has API Export file
    if (!obs.inatApiSaved) return false;
    
    // Check if has BLAST files when BLAST URL exists
    if (obs.mycoMapBlastResults && !obs.blastFilesDownloaded) return false;
    
    // Check if has trace files when trace URL exists
    if (obs.traceFiles && !obs.traceFilesDownloaded) return false;
    
    // If all checks pass, it's fully validated (shows green checkmark)
    return true;
  };

  // Filter observations based on current filters
  const getFilteredObservations = (rawObservations: ValidationObservation[]) => {
    return rawObservations.filter(obs => {
      // Source filter
      if (sourceFilter === 'inaturalist' && obs.source?.toLowerCase() !== 'inaturalist') return false;
      if (sourceFilter === 'mo' && obs.source?.toLowerCase() !== 'mushroom observer') return false;
      
      // Sync filter
      if (syncFilter === 'synced' && !isObservationSynced(obs)) return false;
      if (syncFilter === 'not_synced' && isObservationSynced(obs)) return false;
      
      // Validation filter
      if (validationFilter === 'fully_validated' && !isObservationFullyValidated(obs)) return false;
      if (validationFilter === 'needs_data' && isObservationFullyValidated(obs)) return false;
      
      return true;
    });
  };

  // Fetch validation data with all filters including search
  const { data: observations = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/observations/validation', sourceFilter, syncFilter, validationFilter, limit, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sourceFilter !== 'all') {
        params.append('source', sourceFilter);
      }
      if (syncFilter !== 'all') {
        params.append('syncStatus', syncFilter);
      }
      if (validationFilter !== 'all') {
        params.append('validationStatus', validationFilter);
      }
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      params.append('limit', limit.toString());
      
      const response = await fetch(`/api/observations/validation?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch validation data');
      return response.json();
    }
  });

  // Fetch sync progress
  const { data: syncProgress, refetch: refetchProgress } = useQuery<SyncProgress>({
    queryKey: ['/api/inaturalist/sync-progress'],
    queryFn: async () => {
      const response = await fetch('/api/inaturalist/sync-progress');
      if (!response.ok) throw new Error('Failed to fetch sync progress');
      return response.json();
    },
    refetchInterval: showProgress ? 2000 : false, // Poll every 2 seconds when progress is shown
    enabled: showProgress
  });

  // Start bulk sync mutation
  const bulkSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/inaturalist/sync-bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          limit: limit,
          source: sourceFilter
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start bulk sync');
      }
      return data;
    },
    onSuccess: (data) => {
      setShowProgress(true);
      toast({
        title: "Bulk Sync Started",
        description: data.message,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to Start Sync",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Reset sync progress mutation
  const resetProgressMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/inaturalist/sync-reset', {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to reset progress');
      return response.json();
    },
    onSuccess: () => {
      setShowProgress(false);
      refetchProgress();
      toast({
        title: "Progress Reset",
        description: "Sync progress has been reset",
      });
    }
  });

  // Sync individual observation mutation
  const syncMutation = useMutation({
    mutationFn: async (observationId: string) => {
      console.log(`[Frontend] Starting sync for observation: ${observationId}`);
      
      // Add to syncing set
      setSyncingObservations(prev => new Set(prev).add(observationId));
      
      // Find the observation to determine its source
      const observation = observations?.find((obs: ValidationObservation) => obs.observationId === observationId);
      if (!observation) {
        throw new Error('Observation not found');
      }
      
      // Route to the correct sync endpoint based on source
      let syncEndpoint;
      if (observation.source?.toLowerCase() === 'mo observations') {
        syncEndpoint = `/api/mushroom-observer/sync/${observationId}`;
      } else if (observation.source?.toLowerCase() === 'inaturalist') {
        syncEndpoint = `/api/inaturalist/sync/${observationId}`;
      } else {
        throw new Error('Only iNaturalist and Mushroom Observer observations can be synced');
      }
      
      const response = await fetch(syncEndpoint, {
        method: 'POST'
      });
      
      const responseData = await response.json();
      console.log(`[Frontend] Sync response for ${observationId}:`, responseData);
      
      if (!response.ok) {
        const errorMsg = responseData?.error || `HTTP ${response.status}`;
        throw new Error(errorMsg);
      }
      
      return responseData;
    },
    onSuccess: (data, observationId) => {
      console.log(`[Frontend] Sync successful for ${observationId}:`, data);
      const source = data?.source || 'external source';
      const sourceName = source.toLowerCase() === 'mo' ? 'Mushroom Observer' : 
                        source.toLowerCase() === 'inaturalist' ? 'iNaturalist' : source;
      toast({
        title: "Success",
        description: `Observation ${observationId} synced with ${sourceName} successfully!`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/observations/validation'] });
      // Remove from syncing set
      setSyncingObservations(prev => {
        const newSet = new Set(prev);
        newSet.delete(observationId);
        return newSet;
      });
    },
    onError: (error, observationId) => {
      console.error(`[Frontend] Sync failed for ${observationId}:`, error);
      toast({
        title: "Sync Failed", 
        description: `Failed to sync observation ${observationId}: ${error.message}`,
        variant: "destructive",
      });
      // Remove from syncing set
      setSyncingObservations(prev => {
        const newSet = new Set(prev);
        newSet.delete(observationId);
        return newSet;
      });
    }
  });

  // BLAST file download mutation
  const downloadBlastMutation = useMutation({
    mutationFn: async ({ observationId, blastUrl }: { observationId: string, blastUrl: string }) => {
      const response = await fetch(`/api/observations/${observationId}/download-blast`, {
        method: 'POST',
        body: JSON.stringify({ blastUrl }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to download BLAST files');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "BLAST Files Downloaded",
        description: "NCBI and Local XML files have been downloaded successfully",
      });
      // Add a small delay to ensure database transaction is committed
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/observations/validation'] });
        queryClient.refetchQueries({ queryKey: ['/api/observations/validation'] });
      }, 500);
    },
    onError: (error: any) => {
      toast({
        title: "Download Failed",
        description: error.message || "Failed to download BLAST files",
        variant: "destructive"
      });
    }
  });

  // Trace file download mutation
  const downloadTraceMutation = useMutation({
    mutationFn: async ({ observationId, traceUrl }: { observationId: string, traceUrl: string }) => {
      const response = await fetch(`/api/observations/${observationId}/download-trace`, {
        method: 'POST',
        body: JSON.stringify({ traceUrl }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to download trace files');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Trace Files Downloaded",
        description: "FASTQ file has been downloaded successfully",
      });
      // Add a small delay to ensure database transaction is committed
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/observations/validation'] });
        queryClient.refetchQueries({ queryKey: ['/api/observations/validation'] });
      }, 500);
    },
    onError: (error: any) => {
      toast({
        title: "Download Failed",
        description: error.message || "Failed to download trace files",
        variant: "destructive"
      });
    }
  });

  const handleSync = async (observationId: string) => {
    await syncMutation.mutateAsync(observationId);
  };

  const handleBlastDownload = async (observationId: string, blastUrl: string) => {
    await downloadBlastMutation.mutateAsync({ observationId, blastUrl });
  };

  const handleTraceDownload = async (observationId: string, traceUrl: string) => {
    await downloadTraceMutation.mutateAsync({ observationId, traceUrl });
  };

  const getSyncStatusIcon = (status: string, hasData: boolean) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'pending':
        return hasData ? <Clock className="w-4 h-4 text-yellow-600" /> : <Database className="w-4 h-4 text-gray-400" />;
      default:
        return <Database className="w-4 h-4 text-gray-400" />;
    }
  };

  const getSyncStatusBadge = (status: string | null | undefined, hasData: boolean | undefined) => {
    if (status === 'success') {
      return <Badge variant="default" className="bg-green-100 text-green-800">Synced</Badge>;
    }
    if (status === 'error') {
      return <Badge variant="destructive">Error</Badge>;
    }
    if (hasData) {
      return <Badge variant="secondary">Cached</Badge>;
    }
    return <Badge variant="outline">Pending</Badge>;
  };

  const getSourceName = (source: string | null) => {
    if (source?.toLowerCase() === 'inaturalist') return 'iNaturalist';
    if (source?.toLowerCase() === 'mo') return 'Mushroom Observer';
    return source || 'Other';
  };

  const getInatId = (observationId: string, source: string) => {
    // For iNaturalist observations, the observationId is the iNaturalist ID
    if (source?.toLowerCase() === 'inaturalist') {
      return observationId;
    }
    return null;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    
    // Handle ISO date strings that end with Z (UTC) - extract date part only
    if (dateString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)) {
      const datePart = dateString.split('T')[0];
      const [year, month, day] = datePart.split('-');
      return `${month}/${day}/${year}`;
    }
    
    // Handle date-only strings to avoid timezone conversion issues
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateString.split('-');
      return `${month}/${day}/${year}`;
    }
    
    return new Date(dateString).toLocaleDateString();
  };

  const toggleComparison = (obsId: number) => {
    const newExpanded = new Set(expandedComparisons);
    if (newExpanded.has(obsId)) {
      newExpanded.delete(obsId);
    } else {
      newExpanded.add(obsId);
    }
    setExpandedComparisons(newExpanded);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          Observation Validation
        </CardTitle>
        <p className="text-sm text-slate-600">
          Validate and sync observation data with external sources like iNaturalist and Mushroom Observer
        </p>
      </CardHeader>
      <CardContent>
        {/* Sync Controls */}
        <div className="flex gap-4 mb-6 p-4 bg-slate-50 rounded-lg">
          <Button
            onClick={() => bulkSyncMutation.mutate()}
            disabled={bulkSyncMutation.isPending || syncProgress?.isRunning}
            variant="default"
            className="flex items-center gap-2"
          >
            {bulkSyncMutation.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : syncProgress?.isRunning ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {syncProgress?.isRunning ? 'Sync Running...' : `Sync This Page (${limit} records)`}
          </Button>
          
          <Button
            onClick={() => {
              refetch();
              refetchProgress();
            }}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Page
          </Button>
          
          {/* Search by ID */}
          <div className="flex items-center gap-2 ml-auto">
            <Search className="w-4 h-4 text-slate-500" />
            <input
              placeholder="Search by iNat/MO/MP ID..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="w-64 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {(showProgress || syncProgress?.isRunning) && (
            <Button
              onClick={() => resetProgressMutation.mutate()}
              disabled={resetProgressMutation.isPending}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Square className="w-4 h-4" />
              Reset Progress
            </Button>
          )}
        </div>

        {/* Sync Progress Display */}
        {(showProgress || syncProgress?.isRunning) && syncProgress && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200 max-h-96 overflow-y-auto">
            <h3 className="text-lg font-semibold text-blue-900 mb-3 sticky top-0 bg-blue-50 pb-2">Sync Progress</h3>
            
            <div className="space-y-4">
              {/* Progress Bar */}
              <div>
                <div className="flex justify-between text-sm text-blue-700 mb-2">
                  <span>Progress: {syncProgress.processed} / {syncProgress.total}</span>
                  <span>{syncProgress.total > 0 ? Math.round((syncProgress.processed / syncProgress.total) * 100) : 0}%</span>
                </div>
                <Progress 
                  value={syncProgress.total > 0 ? (syncProgress.processed / syncProgress.total) * 100 : 0} 
                  className="w-full h-3"
                />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="bg-green-100 p-3 rounded text-center">
                  <div className="text-2xl font-bold text-green-800">{syncProgress.successful}</div>
                  <div className="text-green-600">Successful</div>
                </div>
                <div className="bg-red-100 p-3 rounded text-center">
                  <div className="text-2xl font-bold text-red-800">{syncProgress.failed}</div>
                  <div className="text-red-600">Failed</div>
                </div>
                <div className="bg-blue-100 p-3 rounded text-center">
                  <div className="text-2xl font-bold text-blue-800">
                    {syncProgress.total - syncProgress.processed}
                  </div>
                  <div className="text-blue-600">Remaining</div>
                </div>
              </div>

              {/* Status */}
              <div className="text-sm text-blue-700">
                <strong>Status:</strong> {syncProgress.isRunning ? 'Running...' : 'Completed'}
                {syncProgress.startTime && (
                  <span className="ml-4">
                    <strong>Started:</strong> {new Date(syncProgress.startTime).toLocaleString()}
                  </span>
                )}
                {syncProgress.endTime && (
                  <span className="ml-4">
                    <strong>Ended:</strong> {new Date(syncProgress.endTime).toLocaleString()}
                  </span>
                )}
              </div>

              {/* Errors */}
              {syncProgress.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <h4 className="font-semibold text-red-800 mb-2">
                    Failed Observations ({syncProgress.errors.length})
                  </h4>
                  <div className="max-h-24 overflow-y-auto space-y-1">
                    {syncProgress.errors.map((error, index) => (
                      <div key={index} className="text-sm text-red-700">
                        <strong>{error.observationId}:</strong> {error.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Source Database
            </label>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="inaturalist">iNaturalist Only</SelectItem>
                <SelectItem value="mo">Mushroom Observer Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Sync Status
            </label>
            <Select value={syncFilter} onValueChange={setSyncFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="synced">Synced</SelectItem>
                <SelectItem value="not_synced">Not Synced</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Validation Status
            </label>
            <Select value={validationFilter} onValueChange={setValidationFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Validation</SelectItem>
                <SelectItem value="fully_validated">Fully Validated</SelectItem>
                <SelectItem value="needs_data">Needs Data</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Records to Show
            </label>
            <Select value={limit.toString()} onValueChange={(value) => setLimit(parseInt(value))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 records</SelectItem>
                <SelectItem value="50">50 records</SelectItem>
                <SelectItem value="100">100 records</SelectItem>
                <SelectItem value="200">200 records</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button 
              onClick={() => refetch()} 
              variant="outline" 
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="text-center py-8 text-slate-500">Loading validation data...</div>
        ) : observations.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            No observations found matching your filters
          </div>
        ) : (
          <div className="space-y-4">
            {/* Filter Results Summary */}
            <div className="p-3 bg-slate-50 rounded-lg border">
              <div className="text-sm text-slate-600">
                Showing <strong>{observations.length}</strong> observations
                {(syncFilter !== 'all' || validationFilter !== 'all') && (
                  <span className="ml-2 text-slate-500">
                    (filtered by {syncFilter !== 'all' ? `sync: ${syncFilter.replace('_', ' ')}` : ''} 
                    {syncFilter !== 'all' && validationFilter !== 'all' ? ', ' : ''}
                    {validationFilter !== 'all' ? `validation: ${validationFilter.replace('_', ' ')}` : ''})
                  </span>
                )}
              </div>
            </div>
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {observations.map((obs: ValidationObservation) => {
                const inatId = getInatId(obs.observationId, obs.source);
                
                return (
                  <div key={obs.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            {getOverallValidationStatus(obs)}
                            <span className="font-medium text-slate-900 italic">
                              {obs.scientificName}
                            </span>
                          </div>
                          {getSyncStatusBadge(obs.inatSyncStatus, obs.hasInatData)}
                          {obs.source === 'MO Observations' && getSyncStatusBadge(obs.moSyncStatus, obs.hasMoData)}
                          <Badge variant="outline" className="text-xs">
                            {getSourceName(obs.source)}
                          </Badge>
                          {inatId && (
                            <a
                              href={`https://www.inaturalist.org/observations/${inatId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-green-600 hover:text-green-700 text-xs font-medium"
                            >
                              <ExternalLink className="w-3 h-3" />
                              iNat #{inatId}
                            </a>
                          )}
                          {obs.moId && (
                            <a
                              href={`https://mushroomobserver.org/observations/${obs.moId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-orange-600 hover:text-orange-700 text-xs font-medium"
                            >
                              <ExternalLink className="w-3 h-3" />
                              MO #{obs.moId}
                            </a>
                          )}
                        </div>
                        
                        {obs.commonName && (
                          <div className="text-sm text-slate-600">
                            {obs.commonName}
                          </div>
                        )}
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-slate-500">
                          <div>
                            <span className="font-medium">Observer:</span><br />
                            {obs.observer || 'Unknown'}
                          </div>
                          <div>
                            <span className="font-medium">Date:</span><br />
                            {formatDate(obs.observedOn)}
                          </div>
                          <div>
                            <span className="font-medium">Location:</span><br />
                            {obs.state || 'Unknown'}
                          </div>
                          <div>
                            <span className="font-medium">Last Synced:</span><br />
                            {obs.source === 'iNaturalist' ? 
                              (obs.inatLastSynced ? formatDate(obs.inatLastSynced) : 'Never') :
                              (obs.moLastSynced ? formatDate(obs.moLastSynced) : 'Never')
                            }
                          </div>
                        </div>
                        
                        {obs.inatSyncError && (
                          <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                            <span className="font-medium">Sync Error:</span> {obs.inatSyncError}
                          </div>
                        )}



                        {/* Data Comparison Dropdown */}
                        <Collapsible 
                          open={expandedComparisons.has(obs.id)} 
                          onOpenChange={() => toggleComparison(obs.id)}
                          className="mt-3"
                        >
                          <CollapsibleTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="w-full justify-between"
                            >
                              <span>Compare MycoMap vs {getSourceName(obs.source)} Data</span>
                              {expandedComparisons.has(obs.id) ? 
                                <ChevronUp className="h-4 w-4" /> : 
                                <ChevronDown className="h-4 w-4" />
                              }
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-2 mt-2">
                            <div className="p-3 bg-gray-50 rounded-lg border">
                              <h4 className="text-sm font-medium text-gray-900 mb-2">Data Comparison</h4>
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <h5 className="font-medium text-blue-800 mb-1">MycoMap Data</h5>
                                  <div className="space-y-1">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">Scientific Name:</span>
                                        {renderComparisonIcon(compareFields(obs.scientificName, obs.provisionalSpeciesName || obs.inatScientificName, true, obs.provisionalSpeciesName))}
                                      </div>
                                      <span className="text-gray-700">{obs.scientificName}</span>
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">Collector:</span>
                                        {renderComparisonIcon(compareFields(obs.collector, obs.inatObserver))}
                                      </div>
                                      <span className="text-gray-700">{obs.collector || 'N/A'}</span>
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">Date:</span>
                                        {renderComparisonIcon(compareFields(obs.observedOn, obs.inatObservedOn))}
                                      </div>
                                      <span className="text-gray-700">{formatDate(obs.observedOn)}</span>
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">State:</span>
                                        {renderComparisonIcon(compareFields(obs.state, obs.inatState))}
                                      </div>
                                      <span className="text-gray-700">{obs.state || 'N/A'}</span>
                                    </div>
                                    <div>
                                      <span className="font-medium">GenBank Accession:</span><br />
                                      <span className="text-gray-700 font-mono">{obs.genbankAccession || 'N/A'}</span>
                                    </div>
                                    
                                    {/* iNaturalist API Export Section */}
                                    <div className="mt-3 pt-3 border-t border-gray-200">
                                      <h6 className="text-xs font-medium text-purple-700 mb-2">{getSourceName(obs.source)} API Export</h6>
                                      <div className="flex items-center gap-2 text-xs">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">{getSourceName(obs.source)} API Export:</span>
                                          {obs.inatApiSaved && obs.inatApiFile ? (
                                            <CheckCircle className="w-4 h-4 text-green-600" />
                                          ) : (
                                            <XCircle className="w-4 h-4 text-red-600" />
                                          )}
                                        </div>
                                        {obs.inatApiSaved && obs.inatApiFile ? (
                                          <a
                                            href={`/api/download/inat-api/${obs.inatApiFile}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:text-blue-800 underline"
                                          >
                                            {obs.inatApiSaveDate ? new Date(obs.inatApiSaveDate).toLocaleDateString() : 'Download'}
                                          </a>
                                        ) : (
                                          <span className="text-gray-500">No API file saved</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <h5 className="font-medium text-green-800 mb-1">{getSourceName(obs.source)} Data</h5>
                                  <div className="space-y-1">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">Scientific Name:</span>
                                        {renderComparisonIcon(compareFields(obs.scientificName, obs.provisionalSpeciesName || obs.inatScientificName, true, obs.provisionalSpeciesName))}
                                      </div>
                                      <span className="text-gray-700">
                                        {obs.inatScientificName || 'N/A'}
                                        {obs.provisionalSpeciesName ? ` (${obs.provisionalSpeciesName})` : ''}
                                      </span>
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">Observer:</span>
                                        {renderComparisonIcon(compareFields(obs.collector, obs.inatObserver))}
                                      </div>
                                      <span className="text-gray-700">{obs.inatObserver || 'N/A'}</span>
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">Date:</span>
                                        {renderComparisonIcon(compareFields(obs.observedOn, obs.inatObservedOn))}
                                      </div>
                                      <span className="text-gray-700">{formatDate(obs.inatObservedOn || null)}</span>
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">State:</span>
                                        {renderComparisonIcon(compareFields(obs.state, obs.inatState))}
                                      </div>
                                      <span className="text-gray-700">{obs.inatState || 'N/A'}</span>
                                    </div>
                                  </div>
                                  
                                  {/* iNaturalist Observation Fields */}
                                  <div className="mt-3 pt-3 border-t border-gray-200">
                                    <h6 className="text-xs font-medium text-green-700 mb-2">iNat Observation Fields</h6>
                                    <div className="space-y-1 text-xs">
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">DNA Barcode ITS:</span>
                                          {obs.dnaBarcode && <CheckCircle className="w-4 h-4 text-green-600" />}
                                        </div>
                                        <span className="text-gray-700 font-mono">
                                          {obs.dnaBarcode || 'N/A'}
                                        </span>
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">GenBank Accession #:</span>
                                          {obs.inatGenbankAccession && <CheckCircle className="w-4 h-4 text-green-600" />}
                                        </div>
                                        <span className="text-gray-700 font-mono">
                                          {obs.inatGenbankAccession || 'N/A'}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="font-medium">Provisional Species Name:</span><br />
                                        <span className="text-gray-700">{obs.provisionalSpeciesName || 'N/A'}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">MycoMap BLAST Results:</span>
                                        {obs.mycoMapBlastResults && obs.mycoMapBlastResults.includes('mycomap.com') ? (
                                          <>
                                            {obs.blastFilesDownloaded && obs.ncbiBlastFile && obs.localBlastFile ? (
                                              <CheckCircle className="w-4 h-4 text-green-600" />
                                            ) : (
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleBlastDownload(obs.observationId, obs.mycoMapBlastResults!)}
                                                disabled={downloadBlastMutation.isPending}
                                              >
                                                {downloadBlastMutation.isPending ? (
                                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                                ) : (
                                                  'Download Files'
                                                )}
                                              </Button>
                                            )}
                                            <a
                                              href={obs.mycoMapBlastResults}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:text-blue-800"
                                            >
                                              <ExternalLink className="w-4 h-4" />
                                            </a>
                                            {obs.blastFilesDownloaded && (obs.ncbiBlastFile || obs.localBlastFile) && (
                                              <div className="flex items-center gap-1 text-sm">
                                                <span>-</span>
                                                {obs.ncbiBlastFile && (
                                                  <a
                                                    href={`/api/blast-files/${obs.ncbiBlastFile}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:text-blue-800 underline"
                                                  >
                                                    NCBI
                                                  </a>
                                                )}
                                                {obs.ncbiBlastFile && obs.localBlastFile && <span>-</span>}
                                                {obs.localBlastFile && (
                                                  <a
                                                    href={`/api/blast-files/${obs.localBlastFile}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:text-blue-800 underline"
                                                  >
                                                    Local
                                                  </a>
                                                )}
                                              </div>
                                            )}
                                          </>
                                        ) : (
                                          <XCircle className="w-4 h-4 text-red-600" />
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">Trace Files (Raw DNA Data):</span>
                                        {obs.traceFiles && obs.traceFiles.includes('mycomap.com') ? (
                                          <>
                                            {obs.traceFilesDownloaded && obs.fastqFile ? (
                                              <CheckCircle className="w-4 h-4 text-green-600" />
                                            ) : (
                                              <>
                                                <XCircle className="w-4 h-4 text-red-600" />
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  onClick={() => handleTraceDownload(obs.observationId, obs.traceFiles!)}
                                                  disabled={downloadTraceMutation.isPending}
                                                  className="ml-2"
                                                >
                                                  {downloadTraceMutation.isPending ? (
                                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                                  ) : (
                                                    'Download FASTQ'
                                                  )}
                                                </Button>
                                              </>
                                            )}
                                            <a
                                              href={obs.traceFiles}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:text-blue-800"
                                            >
                                              <ExternalLink className="w-4 h-4" />
                                            </a>
                                            {obs.traceFilesDownloaded && obs.fastqFile && (
                                              <div className="flex items-center gap-1 text-sm">
                                                <span>-</span>
                                                <a
                                                  href={`/api/trace-files/${obs.fastqFile}`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="text-blue-600 hover:text-blue-800 underline"
                                                >
                                                  FASTQ
                                                </a>
                                              </div>
                                            )}
                                          </>
                                        ) : (
                                          <XCircle className="w-4 h-4 text-red-600" />
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                      
                      <div className="flex items-center gap-2 ml-4">
                        {inatId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(`https://www.inaturalist.org/observations/${inatId}`, '_blank')}
                            className="flex items-center gap-1 text-xs"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View on iNat
                          </Button>
                        )}
                        
                        <Button
                          size="sm"
                          onClick={() => {
                            console.log('Refresh clicked for:', obs.observationId, 'Source:', getSourceName(obs.source));
                            handleSync(obs.observationId);
                          }}
                          disabled={syncingObservations.has(obs.observationId) || (obs.source?.toLowerCase() !== 'inaturalist' && obs.source?.toLowerCase() !== 'mo observations')}
                          className={`flex items-center gap-1 ${
                            (obs.source?.toLowerCase() === 'inaturalist' || obs.source?.toLowerCase() === 'mo observations')
                              ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                          title={
                            obs.source?.toLowerCase() === 'inaturalist' ? 'Refresh data from iNaturalist' :
                            obs.source?.toLowerCase() === 'mo observations' ? 'Refresh data from Mushroom Observer' :
                            'Only iNaturalist and Mushroom Observer observations can be refreshed'
                          }
                        >
                          <RefreshCw className={`w-3 h-3 ${syncingObservations.has(obs.observationId) ? 'animate-spin' : ''}`} />
                          Refresh
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}