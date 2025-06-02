import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Database, AlertCircle, CheckCircle, Clock, ExternalLink } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

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
}

export function ObservationValidation() {
  const [sourceFilter, setSourceFilter] = useState('all');
  const [limit, setLimit] = useState(50);
  const queryClient = useQueryClient();

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
      return apiRequest(`/api/inaturalist/sync/${observationId}`, {
        method: 'POST'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/observations/validation'] });
    }
  });

  const handleSync = async (observationId: string) => {
    try {
      await syncMutation.mutateAsync(observationId);
    } catch (error) {
      console.error('Sync failed:', error);
    }
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

  const getSourceName = (observationId: string) => {
    if (observationId.startsWith('iNaturalist-')) {
      return 'iNaturalist';
    }
    if (observationId.startsWith('MO-')) {
      return 'Mushroom Observer';
    }
    return 'Other';
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
            
            <div className="space-y-3">
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
                            {getSourceName(obs.observationId)}
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
                        
                        {getSourceName(obs.observationId) === 'iNaturalist' && (
                          <Button
                            size="sm"
                            onClick={() => handleSync(obs.observationId)}
                            disabled={syncMutation.isPending}
                            className="flex items-center gap-1"
                          >
                            <RefreshCw className={`w-3 h-3 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                            Sync
                          </Button>
                        )}
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