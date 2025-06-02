import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Database, AlertCircle, CheckCircle, Clock, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ValidationObservation {
  id: number;
  observationId: string;
  scientificName: string;
  commonName: string | null;
  observer: string | null;
  observedOn: string | null;
  state: string | null;
  source: string;
  inatSyncStatus: 'pending' | 'success' | 'error';
  inatLastSynced: string | null;
  inatSyncError: string | null;
  hasInatData: boolean;
  substrateField?: string | null;
  hostSpeciesField?: string | null;
  ecologyNotesField?: string | null;
  abundanceField?: string | null;
  // iNaturalist comparison data
  inatObserver?: string | null;
  inatObservedOn?: string | null;
  inatState?: string | null;
  inatScientificName?: string | null;
}

export function ObservationValidation() {
  const [sourceFilter, setSourceFilter] = useState('all');
  const [limit, setLimit] = useState(50);
  const [expandedComparisons, setExpandedComparisons] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();
  const { toast } = useToast();

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

  const handleSync = async (observationId: string) => {
    await syncMutation.mutateAsync(observationId);
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

  const getInatId = (observationId: string) => {
    if (observationId.startsWith('iNaturalist-')) {
      return observationId.replace('iNaturalist-', '');
    }
    return null;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
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
                const inatId = getInatId(obs.observationId);
                
                return (
                  <div key={obs.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            {getSyncStatusIcon(obs.inatSyncStatus, obs.hasInatData)}
                            <span className="font-medium text-slate-900 italic">
                              {obs.scientificName}
                            </span>
                          </div>
                          {getSyncStatusBadge(obs.inatSyncStatus, obs.hasInatData)}
                          <Badge variant="outline" className="text-xs">
                            {getSourceName(obs.source)}
                          </Badge>
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

                        {/* Display observation field data if available */}
                        {(obs.substrateField || obs.hostSpeciesField || obs.ecologyNotesField || obs.abundanceField) && (
                          <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <h4 className="text-sm font-medium text-blue-900 mb-2">iNaturalist Observation Fields</h4>
                            <div className="space-y-1 text-sm">
                              {obs.substrateField && (
                                <div>
                                  <span className="font-medium text-blue-800">Substrate:</span> 
                                  <span className="ml-2 text-blue-700">{obs.substrateField}</span>
                                </div>
                              )}
                              {obs.hostSpeciesField && (
                                <div>
                                  <span className="font-medium text-blue-800">Host Species:</span> 
                                  <span className="ml-2 text-blue-700">{obs.hostSpeciesField}</span>
                                </div>
                              )}
                              {obs.ecologyNotesField && (
                                <div>
                                  <span className="font-medium text-blue-800">Ecology/Notes:</span> 
                                  <span className="ml-2 text-blue-700">{obs.ecologyNotesField}</span>
                                </div>
                              )}
                              {obs.abundanceField && (
                                <div>
                                  <span className="font-medium text-blue-800">Abundance:</span> 
                                  <span className="ml-2 text-blue-700">{obs.abundanceField}</span>
                                </div>
                              )}
                            </div>
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
                                      <span className="font-medium">Scientific Name:</span><br />
                                      <span className="text-gray-700">{obs.scientificName}</span>
                                    </div>
                                    <div>
                                      <span className="font-medium">Observer:</span><br />
                                      <span className="text-gray-700">{obs.observer || 'N/A'}</span>
                                    </div>
                                    <div>
                                      <span className="font-medium">Date:</span><br />
                                      <span className="text-gray-700">{formatDate(obs.observedOn)}</span>
                                    </div>
                                    <div>
                                      <span className="font-medium">State:</span><br />
                                      <span className="text-gray-700">{obs.state || 'N/A'}</span>
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <h5 className="font-medium text-green-800 mb-1">iNaturalist Data</h5>
                                  <div className="space-y-1">
                                    <div>
                                      <span className="font-medium">Scientific Name:</span><br />
                                      <span className="text-gray-700">{obs.inatScientificName || 'N/A'}</span>
                                    </div>
                                    <div>
                                      <span className="font-medium">Observer:</span><br />
                                      <span className="text-gray-700">{obs.inatObserver || 'N/A'}</span>
                                    </div>
                                    <div>
                                      <span className="font-medium">Date:</span><br />
                                      <span className="text-gray-700">{formatDate(obs.inatObservedOn || null)}</span>
                                    </div>
                                    <div>
                                      <span className="font-medium">State:</span><br />
                                      <span className="text-gray-700">{obs.inatState || 'N/A'}</span>
                                    </div>
                                  </div>
                                  
                                  {/* iNaturalist Observation Fields */}
                                  <div className="mt-3 pt-3 border-t border-gray-200">
                                    <h6 className="text-xs font-medium text-green-700 mb-2">Observation Fields</h6>
                                    <div className="space-y-1 text-xs">
                                      <div>
                                        <span className="font-medium">DNA Barcode ITS:</span><br />
                                        <span className="text-gray-700 font-mono">
                                          {obs.substrateField ? 
                                            `${obs.substrateField.substring(0, 10)}${obs.substrateField.length > 10 ? '...' : ''}` 
                                            : 'N/A'
                                          }
                                        </span>
                                      </div>
                                      <div>
                                        <span className="font-medium">Provisional Species Name:</span><br />
                                        <span className="text-gray-700">{obs.hostSpeciesField || 'N/A'}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">MycoMap BLAST Results:</span>
                                        {obs.ecologyNotesField && obs.ecologyNotesField.includes('mycomap.com') ? 
                                          <CheckCircle className="w-4 h-4 text-green-600" /> : 
                                          <XCircle className="w-4 h-4 text-red-600" />
                                        }
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">Trace Files (Raw DNA Data):</span>
                                        {obs.abundanceField && obs.abundanceField.includes('mycomap.com') ? 
                                          <CheckCircle className="w-4 h-4 text-green-600" /> : 
                                          <XCircle className="w-4 h-4 text-red-600" />
                                        }
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