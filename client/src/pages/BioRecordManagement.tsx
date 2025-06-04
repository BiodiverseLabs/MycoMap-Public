import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Database, AlertCircle, CheckCircle, Clock, ExternalLink, ChevronDown, ChevronUp, XCircle, Check, X, Play, Square, Search, Edit, Archive, Star } from "lucide-react";
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
  moScientificName?: string | null;
  moObserver?: string | null;
  moObservedOn?: string | null;
  moState?: string | null;
  moDnaBarcode?: string | null;
  moSequenceNotes?: string | null;
  moApiSaved?: boolean;
  moApiFile?: string | null;
  moApiSaveDate?: string | null;
  // MyCoPortal data
  hasMycoportalData?: boolean;
  mycoportalCatalogNumber?: string | null;
  mycoportalSyncStatus?: 'pending' | 'success' | 'error' | null;
  mycoportalLastSynced?: string | null;
  mycoportalSyncError?: string | null;
  mycoportalScientificName?: string | null;
  mycoportalRecordedBy?: string | null;
  mycoportalEventDate?: string | null;
  mycoportalState?: string | null;
  mycoportalApiSaved?: boolean;
  mycoportalApiFile?: string | null;
  mycoportalApiSaveDate?: string | null;
}

export default function BioRecordManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [syncFilter, setSyncFilter] = useState<'all' | 'pending' | 'success' | 'error' | 'not_synced'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'iNaturalist' | 'Mushroom Observer' | 'MyCoPortal'>('all');
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [bulkSyncing, setBulkSyncing] = useState(false);

  // Query for validation observations - filter for fully validated records
  const { data: observations, isLoading, refetch } = useQuery<ValidationObservation[]>({
    queryKey: ["/api/observations/validation", syncFilter, sourceFilter, "fully_validated"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (syncFilter !== 'all') {
        params.append('syncFilter', syncFilter);
      }
      if (sourceFilter !== 'all') {
        params.append('sourceFilter', sourceFilter);
      }
      // Filter for fully validated records only
      params.append('fullyValidated', 'true');
      
      const url = `/api/observations/validation?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
      return response.json();
    },
    staleTime: 30000, // 30 seconds
  });

  const getValidationStatus = (obs: ValidationObservation) => {
    const isSpeciesLevel = obs.scientificName && obs.scientificName.trim().split(' ').length >= 2;
    const hasInatSync = obs.inatSyncStatus === 'success';
    const hasInatApi = obs.inatApiSaved === true;
    const hasBlastFiles = !obs.mycoMapBlastResults || obs.blastFilesDownloaded === true;
    
    if (isSpeciesLevel && hasInatSync && hasInatApi && hasBlastFiles) {
      return { status: 'validated', label: 'Fully Validated', color: 'bg-green-100 text-green-800' };
    } else if (!isSpeciesLevel) {
      return { status: 'genus-only', label: 'Genus Only', color: 'bg-red-100 text-red-800' };
    } else {
      return { status: 'incomplete', label: 'Incomplete', color: 'bg-yellow-100 text-yellow-800' };
    }
  };

  const toggleRowExpansion = (id: number) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const filteredObservations = observations?.filter(obs => {
    if (sourceFilter !== 'all' && obs.source !== sourceFilter) return false;
    
    if (syncFilter === 'not_synced') {
      return obs.inatSyncStatus !== 'success' || 
             obs.moSyncStatus !== 'success' || 
             obs.mycoportalSyncStatus !== 'success';
    }
    
    if (syncFilter !== 'all') {
      return obs.inatSyncStatus === syncFilter ||
             obs.moSyncStatus === syncFilter ||
             obs.mycoportalSyncStatus === syncFilter;
    }
    
    return true;
  }) || [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">
            <Database className="w-8 h-8 text-blue-600" />
            BioRecord Management
          </h1>
          <p className="text-slate-600">
            Curate and manage fully validated biological records with comprehensive data synchronization
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Records</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredObservations.length}</div>
              <p className="text-xs text-muted-foreground">Fully validated biorecords</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Species Coverage</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Set(filteredObservations.map(obs => obs.scientificName)).size}
              </div>
              <p className="text-xs text-muted-foreground">Unique species represented</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Complete Validation</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {filteredObservations.filter(obs => getValidationStatus(obs).status === 'validated').length}
              </div>
              <p className="text-xs text-muted-foreground">Ready for publication</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Data Sources</CardTitle>
              <Archive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Set(filteredObservations.map(obs => obs.source)).size}
              </div>
              <p className="text-xs text-muted-foreground">Integrated platforms</p>
            </CardContent>
          </Card>
        </div>

        {/* Controls */}
        <div className="mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Filter & Management Controls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Sync Status</label>
                  <Select value={syncFilter} onValueChange={(value: any) => setSyncFilter(value)}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="success">Synced</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="not_synced">Not Synced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Data Source</label>
                  <Select value={sourceFilter} onValueChange={(value: any) => setSourceFilter(value)}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      <SelectItem value="iNaturalist">iNaturalist</SelectItem>
                      <SelectItem value="Mushroom Observer">Mushroom Observer</SelectItem>
                      <SelectItem value="MyCoPortal">MyCoPortal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end gap-2">
                  <Button 
                    onClick={() => refetch()} 
                    variant="outline"
                    disabled={isLoading}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Observations Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>BioRecord Collection ({filteredObservations.length} records)</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline">
                  <Edit className="w-4 h-4 mr-2" />
                  Bulk Edit
                </Button>
                <Button size="sm" variant="outline">
                  <Archive className="w-4 h-4 mr-2" />
                  Export Records
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                Loading biorecords...
              </div>
            ) : filteredObservations.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No fully validated biorecords found matching current filters
              </div>
            ) : (
              <div className="space-y-2">
                {filteredObservations.map((obs) => {
                  const isExpanded = expandedRows.has(obs.id);
                  const validationStatus = getValidationStatus(obs);
                  
                  return (
                    <Collapsible key={obs.id} open={isExpanded} onOpenChange={() => toggleRowExpansion(obs.id)}>
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 cursor-pointer">
                          <div className="flex items-center space-x-4 flex-1">
                            <div className="flex-1">
                              <h3 className="font-medium text-slate-900 italic">{obs.scientificName}</h3>
                              {obs.commonName && (
                                <p className="text-sm text-slate-600">{obs.commonName}</p>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  {obs.observationId}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {obs.source}
                                </Badge>
                                <Badge className={`text-xs ${validationStatus.color}`}>
                                  {validationStatus.label}
                                </Badge>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-slate-600">{obs.state}</p>
                              <p className="text-xs text-slate-500">{obs.observedOn}</p>
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent>
                        <div className="px-4 pb-4 border-l-2 border-slate-200 ml-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                            {/* Basic Information */}
                            <div>
                              <h4 className="font-medium text-slate-900 mb-2">Record Details</h4>
                              <div className="space-y-2 text-sm">
                                <div><span className="font-medium">Observer:</span> {obs.observer || 'Unknown'}</div>
                                <div><span className="font-medium">Collector:</span> {obs.collector || 'Unknown'}</div>
                                <div><span className="font-medium">Location:</span> {obs.state || 'Unknown'}</div>
                                <div><span className="font-medium">Date:</span> {obs.observedOn || 'Unknown'}</div>
                                {obs.genbankAccession && (
                                  <div><span className="font-medium">GenBank:</span> {obs.genbankAccession}</div>
                                )}
                              </div>
                            </div>

                            {/* Data Synchronization Status */}
                            <div>
                              <h4 className="font-medium text-slate-900 mb-2">Sync Status</h4>
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant={obs.hasInatData && obs.inatSyncStatus === 'success' ? 'default' : 'destructive'} className="text-xs">
                                    iNaturalist
                                  </Badge>
                                  {obs.inatSyncStatus === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  <Badge variant={obs.hasMoData && obs.moSyncStatus === 'success' ? 'default' : 'secondary'} className="text-xs">
                                    Mushroom Observer
                                  </Badge>
                                  {obs.moSyncStatus === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> : 
                                   obs.hasMoData ? <Clock className="w-4 h-4 text-yellow-600" /> : <XCircle className="w-4 h-4 text-gray-400" />}
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  <Badge variant={obs.hasMycoportalData && obs.mycoportalSyncStatus === 'success' ? 'default' : 'secondary'} className="text-xs">
                                    MyCoPortal
                                  </Badge>
                                  {obs.mycoportalSyncStatus === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> : 
                                   obs.hasMycoportalData ? <Clock className="w-4 h-4 text-yellow-600" /> : <XCircle className="w-4 h-4 text-gray-400" />}
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div>
                              <h4 className="font-medium text-slate-900 mb-2">Management Actions</h4>
                              <div className="space-y-2">
                                <Button size="sm" variant="outline" className="w-full">
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit Record
                                </Button>
                                <Button size="sm" variant="outline" className="w-full">
                                  <Star className="w-4 h-4 mr-2" />
                                  Mark Featured
                                </Button>
                                <Button size="sm" variant="outline" className="w-full">
                                  <Archive className="w-4 h-4 mr-2" />
                                  Archive Record
                                </Button>
                                {obs.mycoMapBlastResults && (
                                  <Button size="sm" variant="outline" className="w-full" asChild>
                                    <a href={obs.mycoMapBlastResults} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="w-4 h-4 mr-2" />
                                      View BLAST Results
                                    </a>
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}