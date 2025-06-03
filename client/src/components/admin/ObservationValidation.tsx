import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Database, AlertCircle, CheckCircle, Clock, ExternalLink, ChevronDown, ChevronUp, XCircle, Check, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
}

export function ObservationValidation() {
  const [sourceFilter, setSourceFilter] = useState('all');
  const [limit, setLimit] = useState(50);
  const [expandedComparisons, setExpandedComparisons] = useState<Set<number>>(new Set());
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
          // Normalize date strings to avoid parsing issues with 2-digit years
          const normalizeDate = (dateStr: string) => {
            // First, extract just the date part if there's a timestamp
            let dateOnly = dateStr.split(' ')[0]; // Remove time portion
            
            // Handle formats like "4/18/2025", "04/18/25", "2025-04-18", etc.
            const parts = dateOnly.split(/[\/\-]/);
            if (parts.length === 3) {
              // Check if it's ISO format (YYYY-MM-DD) vs US format (MM/DD/YYYY)
              if (dateOnly.includes('-') && parts[0].length === 4) {
                // ISO format: YYYY-MM-DD (already normalized)
                return dateOnly;
              } else {
                // US format: MM/DD/YYYY or M/D/YYYY
                let year = parseInt(parts[2]);
                let month = parseInt(parts[0]);
                let day = parseInt(parts[1]);
                
                // Handle 2-digit years (assume 20xx if < 50, 19xx if >= 50)
                if (year < 100) {
                  year += year < 50 ? 2000 : 1900;
                }
                
                return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
              }
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
      
      // Trace file checks - must be present and downloaded if trace URL exists
      obs.traceFiles && obs.traceFiles.includes('mycomap.com') ? 
        (obs.traceFilesDownloaded && obs.fastqFile) : true,
      
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

  // Fetch validation data
  const { data: observations = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/observations/validation', sourceFilter, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sourceFilter !== 'all') {
        params.append('source', sourceFilter);
      }
      params.append('limit', limit.toString());
      
      const response = await fetch(`/api/observations/validation?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch validation data');
      return response.json();
    }
  });

  // Sync individual observation mutation
  const syncMutation = useMutation({
    mutationFn: async (observationId: string) => {
      console.log(`[Frontend] Starting sync for observation: ${observationId}`);
      const response = await fetch(`/api/inaturalist/sync/${observationId}`, {
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
      toast({
        title: "Success",
        description: `Observation ${observationId} synced with iNaturalist successfully!`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/observations/validation'] });
    },
    onError: (error, observationId) => {
      console.error(`[Frontend] Sync failed for ${observationId}:`, error);
      toast({
        title: "Sync Failed", 
        description: `Failed to sync observation ${observationId}: ${error.message}`,
        variant: "destructive",
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

  const getSyncStatusBadge = (status: string, hasData: boolean) => {
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
    // Handle date-only strings to avoid timezone conversion issues
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateString.split('-');
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).toLocaleDateString();
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
          Validate and sync observation data with external sources like iNaturalist
        </p>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
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
          
          <div className="flex-1">
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
            <div className="text-sm text-slate-600 mb-4">
              Showing {observations.length} observation{observations.length !== 1 ? 's' : ''}
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
                            {obs.inatLastSynced ? formatDate(obs.inatLastSynced) : 'Never'}
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
                              <span>Compare MycoMap vs iNaturalist Data</span>
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
                                      <h6 className="text-xs font-medium text-purple-700 mb-2">iNat API Export</h6>
                                      <div className="flex items-center gap-2 text-xs">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">iNat API Export:</span>
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
                                            Link {obs.inatApiSaveDate ? new Date(obs.inatApiSaveDate).toLocaleDateString() : ''}
                                          </a>
                                        ) : (
                                          <span className="text-gray-500">No API file saved</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <h5 className="font-medium text-green-800 mb-1">iNaturalist Data</h5>
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
                                          {obs.dnaBarcode ? 
                                            `${obs.dnaBarcode.substring(0, 10)}${obs.dnaBarcode.length > 10 ? '...' : ''}` 
                                            : 'N/A'
                                          }
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
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleTraceDownload(obs.observationId, obs.traceFiles!)}
                                                disabled={downloadTraceMutation.isPending}
                                              >
                                                {downloadTraceMutation.isPending ? (
                                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                                ) : (
                                                  'Download FASTQ'
                                                )}
                                              </Button>
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
                          disabled={syncMutation.isPending || obs.source?.toLowerCase() !== 'inaturalist'}
                          className={`flex items-center gap-1 ${
                            obs.source?.toLowerCase() === 'inaturalist' 
                              ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                          title={obs.source?.toLowerCase() !== 'inaturalist' ? 'Only iNaturalist observations can be refreshed' : 'Refresh data from iNaturalist'}
                        >
                          <RefreshCw className={`w-3 h-3 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
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