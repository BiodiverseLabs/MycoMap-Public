import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  Search, 
  Filter,
  Package,
  FlaskConical,
  Dna,
  CheckCircle2,
  Archive,
  Eye,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Database,
  Square,
  Loader2,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { format, parseISO } from "date-fns";

interface Specimen {
  id: number;
  uuid: string;
  displayCode: string;
  intakeDate: string;
  primaryObservationSource: string | null;
  primaryObservationId: string | null;
  voucherNumber: string | null;
  labCode: string | null;
  collectorName: string | null;
  collectionDate: string | null;
  locality: string | null;
  state: string | null;
  country: string | null;
  scientificName: string | null;
  genus: string | null;
  family: string | null;
  currentStatus: string;
  herbariumAccessionNumber: string | null;
  storageLocation: string | null;
  inatFieldConflict: string | null;
  validationFlags?: string[];
  createdAt: string;
}

interface ObservationData {
  sourceUuid: string | null;
  commonName: string | null;
  observerName: string | null;
  observerUsername: string | null;
  qualityGrade: string | null;
  voucherNumber: string | null;
  voucherNumberMultiple: string | null;
  provisionalSpeciesName: string | null;
  speciesNameOverride: string | null;
  collectorsName: string | null;
  herbariumName: string | null;
  herbariumCatalogNumber: string | null;
  genbankAccession: string | null;
  genbankNumberUrl: string | null;
  mycomapBlastResults: string | null;
  traceFiles: string | null;
  dnaBarcodIts: string | null;
  readsInConsensus: string | null;
  coordinatesObscured: boolean;
  lastSyncedAt: string | null;
}

interface Photo {
  id: number;
  thumbnailUrl: string | null;
  mediumUrl: string | null;
  largeUrl: string | null;
  originalUrl: string | null;
  attribution: string | null;
}

interface SpecimenDetail extends Specimen {
  sources: Array<{
    id: number;
    platform: string;
    externalId: string;
    isPrimary: boolean;
    url: string | null;
  }>;
  events: Array<{
    id: number;
    eventType: string;
    previousValue: string | null;
    newValue: string | null;
    notes: string | null; // JSON with runId, runName, wellId, plateId, etc.
    performedAt: string;
    performedByName: string | null;
  }>;
  observationData: ObservationData | null;
  photos: Photo[];
}

interface SpecimensResponse {
  specimens: Specimen[];
  total: number;
  limit: number;
  offset: number;
}

interface RefreshStatus {
  syncStatus: 'idle' | 'syncing' | 'completed' | 'error' | 'rate_limited' | 'cancelled';
  syncProgress: number;
  totalSpecimens: number;
  processedCount: number;
  successCount: number;
  errorCount: number;
  syncMessage: string | null;
  lastRefreshAt: string | null;
}

export default function AdminSpecimensPage() {
  const [location] = useLocation();
  const urlParams = new URLSearchParams(location.split("?")[1] || "");
  const initialStatus = urlParams.get("status") || "";
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [validationFlagFilters, setValidationFlagFilters] = useState<string[]>([]);
  const [selectedSpecimen, setSelectedSpecimen] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hasSequence, setHasSequence] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState("");
  const [pushToInat, setPushToInat] = useState(false); // Default to pull-only
  const [ignoreRefreshDate, setIgnoreRefreshDate] = useState(false); // Include all filtered specimens
  const [sortField, setSortField] = useState("displayCode");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const limit = 50;
  const { toast } = useToast();
  
  const flagOptions = [
    { value: "check_specimen", label: "Check Specimen", displayLabel: "Check Specimen" },
    { value: "metadata", label: "Missing Metadata", displayLabel: "Missing Metadata" },
    { value: "push_incomplete", label: "Push Incomplete", displayLabel: "Push Incomplete" },
    { value: "curator_only", label: "Curator Only", displayLabel: "Curator Only" },
    { value: "duplicate_inat", label: "Duplicate iNat", displayLabel: "Duplicate" },
    { value: "herbarium_catalog_conflict", label: "Catalog Conflict", displayLabel: "Conflict" },
  ];
  
  const filterFlagOptions = [
    { value: "has_flag", label: "Has Any Flag" },
    { value: "no_flag", label: "No Flag" },
    { value: "check_specimen", label: "Check Specimen" },
    { value: "metadata", label: "Missing Metadata" },
    { value: "push_incomplete", label: "Push Incomplete" },
    { value: "curator_only", label: "Curator Only" },
    { value: "duplicate_inat", label: "Duplicate iNat" },
    { value: "herbarium_catalog_conflict", label: "Catalog Conflict" },
  ];
  
  const toggleFlagFilter = (value: string) => {
    setValidationFlagFilters(prev => {
      if (prev.includes(value)) {
        return prev.filter(f => f !== value);
      }
      return [...prev, value];
    });
    setPage(0);
  };
  
  const clearAllFlagFilters = () => {
    setValidationFlagFilters([]);
    setPage(0);
  };
  
  const getFlagDisplayLabel = (flagValue: string) => {
    const option = flagOptions.find(f => f.value === flagValue);
    return option?.displayLabel || flagValue;
  };

  // Build URL with query parameters
  const buildSpecimensUrl = () => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("search", searchTerm);
    if (statusFilter) params.set("status", statusFilter);
    if (validationFlagFilters.length > 0) params.set("validationFlags", validationFlagFilters.join(","));
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (hasSequence) params.set("hasSequence", "true");
    params.set("sortField", sortField);
    params.set("sortOrder", sortOrder);
    params.set("limit", limit.toString());
    params.set("offset", (page * limit).toString());
    return `/api/admin/specimens?${params.toString()}`;
  };
  
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
    setPage(0);
  };
  
  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/50" />;
    }
    return sortOrder === "asc" 
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  const { data, isLoading } = useQuery<SpecimensResponse>({
    queryKey: ["/api/admin/specimens", searchTerm, statusFilter, validationFlagFilters.join(","), page, dateFrom, dateTo, hasSequence, sortField, sortOrder],
    queryFn: async () => {
      const res = await fetch(buildSpecimensUrl(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch specimens");
      return res.json();
    },
  });

  const { data: specimenDetail, isLoading: detailLoading } = useQuery<SpecimenDetail>({
    queryKey: ["/api/admin/specimens", selectedSpecimen],
    queryFn: async () => {
      const res = await fetch(`/api/admin/specimens/${selectedSpecimen}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch specimen details");
      return res.json();
    },
    enabled: !!selectedSpecimen,
  });

  const statusConfig: Record<string, { label: string; icon: any; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    unaccessioned: { label: "Unaccessioned", icon: Package, variant: "secondary" },
    accessioned: { label: "Accessioned", icon: CheckCircle2, variant: "outline" },
    sequenced: { label: "Sequenced", icon: Dna, variant: "default" },
  };

  const platformUrls: Record<string, (id: string) => string> = {
    inat: (id) => `https://www.inaturalist.org/observations/${id}`,
    mo: (id) => `https://mushroomobserver.org/observations/${id}`,
    mycoportal: (id) => `https://mycoportal.org/portal/collections/individual/index.php?occid=${id}`,
  };

  // Check bulk refresh status on mount
  useEffect(() => {
    checkRefreshStatus();
  }, []);

  // Poll for status when syncing
  useEffect(() => {
    if (isPolling && refreshStatus?.syncStatus === 'syncing') {
      const interval = setInterval(() => {
        checkRefreshStatus();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [isPolling, refreshStatus?.syncStatus]);

  const checkRefreshStatus = async () => {
    try {
      const res = await fetch('/api/admin/specimens/refresh/status', { credentials: 'include' });
      if (res.ok) {
        const status = await res.json();
        setRefreshStatus(status);
        
        if (status.syncStatus === 'syncing') {
          setIsPolling(true);
        } else if (status.syncStatus !== 'idle' && isPolling) {
          setIsPolling(false);
          // Refresh list after sync completes
          if (status.syncStatus === 'completed') {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/specimens"] });
            toast({ title: "Refresh Complete", description: status.syncMessage || `Refreshed ${status.successCount} specimens` });
          } else if (status.syncStatus === 'rate_limited') {
            toast({ title: "Rate Limited", description: status.syncMessage || "Wait 2 min and resume", variant: "destructive" });
          } else if (status.syncStatus === 'error') {
            toast({ title: "Error", description: status.syncMessage || "Refresh failed", variant: "destructive" });
          } else if (status.syncStatus === 'cancelled') {
            toast({ title: "Cancelled", description: status.syncMessage || "Refresh cancelled" });
          }
        }
      }
    } catch (err) {
      console.error('Error checking refresh status:', err);
    }
  };

  const startBulkRefresh = async () => {
    try {
      // Pass current filter state to refresh only matching specimens
      const filterPayload = {
        search: searchTerm,
        status: statusFilter,
        validationFlags: validationFlagFilters.join(","),
        dateFrom,
        dateTo,
        hasSequence,
        pushEnabled: pushToInat,
        ignoreRefreshDate, // Refresh all filtered specimens regardless of last refresh
      };
      
      const res = await fetch('/api/admin/specimens/refresh/start', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filterPayload),
      });
      const data = await res.json();
      
      if (data.status === 'started' || data.status === 'already_syncing') {
        setIsPolling(true);
        toast({ title: "Refresh Started", description: data.message });
        checkRefreshStatus();
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to start refresh", variant: "destructive" });
    }
  };

  const cancelBulkRefresh = async () => {
    try {
      const res = await fetch('/api/admin/specimens/refresh/cancel', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      toast({ title: "Cancelled", description: data.message });
      setIsPolling(false);
      checkRefreshStatus();
    } catch (err) {
      toast({ title: "Error", description: "Failed to cancel refresh", variant: "destructive" });
    }
  };

  const refreshMutation = useMutation({
    mutationFn: async (specimenId: number) => {
      const res = await apiRequest("POST", `/api/admin/specimens/${specimenId}/refresh`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Refreshed", description: "Specimen data updated from observation" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specimens"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateFlagMutation = useMutation({
    mutationFn: async ({ specimenId, flag }: { specimenId: number; flag: string | null }) => {
      const res = await apiRequest("PATCH", `/api/admin/specimens/${specimenId}/flag`, { flag });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Flag Updated", description: "Validation flag has been updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specimens"] });
      setSelectedFlag("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleRefreshSpecimen = (specimenId: number) => {
    refreshMutation.mutate(specimenId);
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] || { label: status, variant: "secondary" };
    const Icon = config.icon || Package;
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Specimens</h1>
            <p className="text-slate-600 mt-1">
              Browse and manage fungarium specimens
            </p>
          </div>
          
          {/* Bulk Refresh Panel */}
          <div className="flex flex-col items-end gap-2">
            {refreshStatus?.syncStatus === 'syncing' ? (
              <div className="flex items-center gap-2 bg-white rounded-lg shadow p-3 min-w-64">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">Refreshing...</span>
                    <span className="text-sm text-slate-500">{refreshStatus.syncProgress}%</span>
                  </div>
                  <Progress value={refreshStatus.syncProgress} className="h-2" />
                  <p className="text-xs text-slate-500 mt-1">
                    {refreshStatus.processedCount}/{refreshStatus.totalSpecimens} specimens
                  </p>
                </div>
                <Button 
                  size="sm" 
                  variant="destructive" 
                  onClick={cancelBulkRefresh}
                  data-testid="button-cancel-refresh"
                >
                  <Square className="w-4 h-4" />
                </Button>
              </div>
            ) : refreshStatus?.syncStatus === 'rate_limited' ? (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="text-amber-600">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800">Rate Limited</p>
                  <p className="text-xs text-amber-600">{refreshStatus.processedCount}/{refreshStatus.totalSpecimens} done</p>
                </div>
                <Button 
                  size="sm" 
                  onClick={startBulkRefresh}
                  className="bg-amber-600 hover:bg-amber-700"
                  data-testid="button-resume-refresh"
                >
                  Resume
                </Button>
              </div>
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="gap-2"
                    data-testid="button-bulk-refresh-menu"
                  >
                    <Database className="w-4 h-4" />
                    Refresh Observations
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="end">
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm">Refresh Options</h4>
                    
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="ignore-refresh-date"
                        checked={ignoreRefreshDate}
                        onCheckedChange={(checked) => setIgnoreRefreshDate(checked === true)}
                        data-testid="checkbox-ignore-refresh-date"
                      />
                      <div className="grid gap-1">
                        <Label htmlFor="ignore-refresh-date" className="text-sm font-medium cursor-pointer">
                          Ignore Previous Refresh Date
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Refresh all filtered specimens, not just stale ones
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="push-to-inat"
                        checked={pushToInat}
                        onCheckedChange={(checked) => setPushToInat(checked === true)}
                        data-testid="checkbox-push-to-inat"
                      />
                      <div className="grid gap-1">
                        <Label htmlFor="push-to-inat" className="text-sm font-medium cursor-pointer">
                          Push MYCO Numbers to iNat
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Only pushes specimens with valid MYCO numbers
                        </p>
                      </div>
                    </div>
                    
                    <Button 
                      onClick={startBulkRefresh} 
                      className="w-full gap-2"
                      data-testid="button-start-refresh"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Start Refresh
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            
            {refreshStatus?.lastRefreshAt && refreshStatus.syncStatus !== 'syncing' && (
              <p className="text-xs text-slate-500">
                Last refresh: {format(new Date(refreshStatus.lastRefreshAt), "MMM d, yyyy h:mm a")}
              </p>
            )}
          </div>
        </div>

          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    placeholder="Search by code, name, collector, location..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(0);
                    }}
                    className="pl-10 pr-10"
                    data-testid="input-search"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => { setSearchTerm(""); setPage(0); }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      data-testid="button-clear-search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                    <SelectTrigger className="w-40" data-testid="select-status">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="unaccessioned">Unaccessioned</SelectItem>
                      <SelectItem value="accessioned">Accessioned</SelectItem>
                      <SelectItem value="sequenced">Sequenced</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-52 justify-start" data-testid="button-validation-flags">
                        <AlertCircle className="w-4 h-4 mr-2" />
                        {validationFlagFilters.length === 0 ? (
                          <span className="text-muted-foreground">Validation Flags</span>
                        ) : (
                          <span>{validationFlagFilters.length} flag{validationFlagFilters.length > 1 ? 's' : ''} selected</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="start">
                      <div className="flex flex-col gap-1">
                        {validationFlagFilters.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="justify-start text-muted-foreground"
                            onClick={clearAllFlagFilters}
                            data-testid="button-clear-all-flags"
                          >
                            <X className="w-3 h-3 mr-2" />
                            Clear all
                          </Button>
                        )}
                        {filterFlagOptions.map((option) => (
                          <label
                            key={option.value}
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer"
                            data-testid={`checkbox-flag-${option.value}`}
                          >
                            <Checkbox
                              checked={validationFlagFilters.includes(option.value)}
                              onCheckedChange={() => toggleFlagFilter(option.value)}
                            />
                            <span className="text-sm">{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                      className="w-36"
                      placeholder="From"
                      data-testid="input-date-from"
                    />
                    <span className="text-slate-400">to</span>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                      className="w-36"
                      placeholder="To"
                      data-testid="input-date-to"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-white">
                    <Checkbox
                      id="hasSequence"
                      checked={hasSequence}
                      onCheckedChange={(checked) => { setHasSequence(checked === true); setPage(0); }}
                      data-testid="checkbox-has-sequence"
                    />
                    <Label htmlFor="hasSequence" className="text-sm cursor-pointer">Has Sequence</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {data?.total?.toLocaleString() || 0} Specimens
                </CardTitle>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <span>Page {page + 1} of {Math.ceil((data?.total || 0) / limit) || 1}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    data-testid="button-prev-page"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={(page + 1) * limit >= (data?.total || 0)}
                    data-testid="button-next-page"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-slate-500">Loading specimens...</div>
              ) : data?.specimens?.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                  <p>No specimens found matching your criteria</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("displayCode")}
                        data-testid="sort-displayCode"
                      >
                        <div className="flex items-center">
                          MYCO #
                          <SortIcon field="displayCode" />
                        </div>
                      </TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("primaryObservationId")}
                        data-testid="sort-observationId"
                      >
                        <div className="flex items-center">
                          Observation #
                          <SortIcon field="primaryObservationId" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("scientificName")}
                        data-testid="sort-scientificName"
                      >
                        <div className="flex items-center">
                          Scientific Name
                          <SortIcon field="scientificName" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("currentStatus")}
                        data-testid="sort-status"
                      >
                        <div className="flex items-center">
                          Status
                          <SortIcon field="currentStatus" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("locality")}
                        data-testid="sort-locality"
                      >
                        <div className="flex items-center">
                          Location
                          <SortIcon field="locality" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("collectionDate")}
                        data-testid="sort-collectionDate"
                      >
                        <div className="flex items-center">
                          Collection Date
                          <SortIcon field="collectionDate" />
                        </div>
                      </TableHead>
                      <TableHead>Validation</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.specimens?.map((specimen) => (
                      <TableRow key={specimen.id} data-testid={`row-specimen-${specimen.id}`}>
                        <TableCell className="font-mono text-sm font-medium">
                          {specimen.displayCode?.startsWith('MYCO-') ? (
                            <span className="text-[#8CBD45]">{specimen.displayCode}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {specimen.primaryObservationSource ? (
                            <Badge variant="outline" className="text-xs">
                              {specimen.primaryObservationSource === 'inat' ? 'iNat' : 
                               specimen.primaryObservationSource === 'mo' ? 'MO' : 
                               specimen.primaryObservationSource === 'mycoportal' ? 'MP' : 
                               specimen.primaryObservationSource.toUpperCase()}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {specimen.primaryObservationId ? (
                            <div className="flex items-center gap-1">
                              <span>{specimen.primaryObservationId}</span>
                              <a 
                                href={platformUrls[specimen.primaryObservationSource || '']?.(specimen.primaryObservationId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="italic">
                          {specimen.scientificName === 'Removed' ? (
                            <span className="text-red-600 italic">Removed</span>
                          ) : specimen.scientificName || <span className="text-slate-400">Unknown</span>}
                        </TableCell>
                        <TableCell>{getStatusBadge(specimen.currentStatus)}</TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {specimen.locality === 'Removed' ? (
                            <span className="text-red-600 italic">Removed</span>
                          ) : specimen.locality === 'Private' ? (
                            <span className="text-amber-600 italic">Private</span>
                          ) : specimen.state || specimen.country ? (
                            [specimen.state, specimen.country].filter(Boolean).join(", ")
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {specimen.locality === 'Removed' ? (
                            <span className="text-red-600 italic">Removed</span>
                          ) : specimen.collectionDate ? format(parseISO(specimen.collectionDate), "MMM d, yyyy") : "-"}
                        </TableCell>
                        <TableCell>
                          {specimen.validationFlags && specimen.validationFlags.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {specimen.validationFlags.map((flag, idx) => (
                                <Badge 
                                  key={idx} 
                                  variant="destructive" 
                                  className="text-xs" 
                                  data-testid={`badge-conflict-${specimen.id}-${idx}`}
                                >
                                  {getFlagDisplayLabel(flag)}
                                </Badge>
                              ))}
                            </div>
                          ) : specimen.inatFieldConflict ? (
                            <Badge variant="destructive" className="text-xs" data-testid={`badge-conflict-${specimen.id}`}>
                              {getFlagDisplayLabel(specimen.inatFieldConflict)}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedSpecimen(specimen.id)}
                              data-testid={`button-view-${specimen.id}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {specimen.primaryObservationId && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-full"
                                onClick={() => handleRefreshSpecimen(specimen.id)}
                                data-testid={`button-refresh-${specimen.id}`}
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
      </div>

      <Dialog open={!!selectedSpecimen} onOpenChange={() => setSelectedSpecimen(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="font-mono">{specimenDetail?.displayCode}</span>
              {specimenDetail && getStatusBadge(specimenDetail.currentStatus)}
            </DialogTitle>
          </DialogHeader>
          
          {detailLoading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : specimenDetail ? (
            <div className="space-y-6">
              {/* Photo and basic info header */}
              <div className="flex gap-4">
                {specimenDetail.photos && specimenDetail.photos.length > 0 ? (
                  <div className="shrink-0">
                    <img
                      src={specimenDetail.photos[0].mediumUrl || specimenDetail.photos[0].thumbnailUrl || ''}
                      alt={specimenDetail.scientificName || 'Specimen photo'}
                      className="w-32 h-32 object-cover rounded-lg border"
                      data-testid="img-specimen-photo"
                    />
                  </div>
                ) : (
                  <div className="w-32 h-32 bg-slate-100 rounded-lg border flex items-center justify-center text-slate-400 shrink-0">
                    <span className="text-xs text-center">No photo</span>
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <div>
                    <p className="font-medium italic text-lg">{specimenDetail.scientificName || "Unknown"}</p>
                    {specimenDetail.observationData?.commonName && (
                      <p className="text-slate-600">{specimenDetail.observationData.commonName}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {specimenDetail.family && <Badge variant="outline">{specimenDetail.family}</Badge>}
                  </div>
                </div>
              </div>

              {/* Collection metadata */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Collector</p>
                  <p className="font-medium">
                    {(() => {
                      const collectorsName = specimenDetail.observationData?.collectorsName;
                      const hasValidCollectorsName = collectorsName && collectorsName.toLowerCase() !== 'none';
                      const collectorName = specimenDetail.collectorName;
                      const hasValidCollectorName = collectorName && collectorName.toLowerCase() !== 'none';
                      const observerName = specimenDetail.observationData?.observerName;
                      const observerUsername = specimenDetail.observationData?.observerUsername;
                      if (hasValidCollectorsName) return collectorsName;
                      if (hasValidCollectorName) return collectorName;
                      if (observerName) return observerName;
                      if (observerUsername) return `@${observerUsername}`;
                      return "-";
                    })()}
                  </p>
                  {specimenDetail.observationData?.observerUsername && (
                    <p className="text-xs text-slate-500">@{specimenDetail.observationData.observerUsername}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Collection Date</p>
                  <p className="font-medium">
                    {specimenDetail.collectionDate 
                      ? format(parseISO(specimenDetail.collectionDate), "MMM d, yyyy")
                      : "-"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Locality</p>
                  <p className="font-medium">{specimenDetail.locality || "-"}</p>
                  {specimenDetail.state || specimenDetail.country ? (
                    <p className="text-sm text-slate-500">{[specimenDetail.state, specimenDetail.country].filter(Boolean).join(", ")}</p>
                  ) : null}
                </div>
              </div>

              {/* Herbarium & Lab info */}
              <div className="grid grid-cols-2 gap-4">
                {specimenDetail.herbariumAccessionNumber && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">MYCO Accession #</p>
                    <p className="font-mono font-bold text-[#8CBD45]">{specimenDetail.herbariumAccessionNumber}</p>
                  </div>
                )}
                {specimenDetail.labCode && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Lab Code</p>
                    <p className="font-mono">{specimenDetail.labCode}</p>
                  </div>
                )}
                {specimenDetail.voucherNumber && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Voucher Number</p>
                    <p className="font-mono">{specimenDetail.voucherNumber}</p>
                  </div>
                )}
                {specimenDetail.storageLocation && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Storage Location</p>
                    <p className="font-medium">{specimenDetail.storageLocation}</p>
                  </div>
                )}
                {specimenDetail.intakeDate && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Intake Date</p>
                    <p className="font-medium">{format(new Date(specimenDetail.intakeDate), "MMM d, yyyy")}</p>
                  </div>
                )}
              </div>

              {/* iNaturalist Observation Fields - only show for iNat specimens */}
              {specimenDetail.observationData && specimenDetail.primaryObservationSource === 'inat' && (
                <div className="border-t pt-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">iNaturalist Observation Fields</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {specimenDetail.observationData.provisionalSpeciesName && (
                      <div>
                        <p className="text-xs text-slate-400">Provisional Species Name</p>
                        <p className="font-medium italic">{specimenDetail.observationData.provisionalSpeciesName}</p>
                      </div>
                    )}
                    {specimenDetail.observationData.speciesNameOverride && (
                      <div>
                        <p className="text-xs text-slate-400">Species Name Override</p>
                        <p className="font-medium italic">{specimenDetail.observationData.speciesNameOverride}</p>
                      </div>
                    )}
                    {specimenDetail.observationData.herbariumName && (
                      <div>
                        <p className="text-xs text-slate-400">Herbarium Name</p>
                        <p className="font-medium">{specimenDetail.observationData.herbariumName}</p>
                      </div>
                    )}
                    {specimenDetail.observationData.herbariumCatalogNumber && (
                      <div>
                        <p className="text-xs text-slate-400">Herbarium Catalog #</p>
                        <p className="font-mono">{specimenDetail.observationData.herbariumCatalogNumber}</p>
                      </div>
                    )}
                    {specimenDetail.observationData.dnaBarcodIts && (
                      <div className="col-span-2">
                        <p className="text-xs text-slate-400">DNA Barcode ITS</p>
                        <p className="font-mono text-xs break-all bg-slate-50 p-1 rounded">{specimenDetail.observationData.dnaBarcodIts}</p>
                      </div>
                    )}
                    {specimenDetail.observationData.genbankAccession && (
                      <div>
                        <p className="text-xs text-slate-400">GenBank Accession</p>
                        <p className="font-mono">{specimenDetail.observationData.genbankAccession}</p>
                      </div>
                    )}
                    {specimenDetail.observationData.mycomapBlastResults && (
                      <div className="col-span-2">
                        <p className="text-xs text-slate-400">MycoMap BLAST Results</p>
                        <a href={specimenDetail.observationData.mycomapBlastResults} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                          View BLAST Results
                        </a>
                      </div>
                    )}
                    {specimenDetail.observationData.traceFiles && (
                      <div className="col-span-2">
                        <p className="text-xs text-slate-400">Trace Files</p>
                        <a href={specimenDetail.observationData.traceFiles} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                          View Trace Files
                        </a>
                      </div>
                    )}
                    {specimenDetail.observationData.readsInConsensus && (
                      <div>
                        <p className="text-xs text-slate-400">Reads in Consensus</p>
                        <p className="font-mono">{specimenDetail.observationData.readsInConsensus}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* MO Sequence Data - only show for MO specimens with sequence data */}
              {specimenDetail.observationData && specimenDetail.primaryObservationSource === 'mo' && 
               (specimenDetail.observationData.dnaBarcodIts || specimenDetail.observationData.mycomapBlastResults) && (
                <div className="border-t pt-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Sequence Data</p>
                  <div className="grid grid-cols-1 gap-3 text-sm">
                    {specimenDetail.observationData.dnaBarcodIts && (
                      <div>
                        <p className="text-xs text-slate-400">DNA Barcode ITS ({specimenDetail.observationData.dnaBarcodIts.length} bp)</p>
                        <p className="font-mono text-xs break-all bg-slate-50 p-1 rounded max-h-20 overflow-y-auto">{specimenDetail.observationData.dnaBarcodIts}</p>
                      </div>
                    )}
                    {specimenDetail.observationData.mycomapBlastResults && (
                      <div>
                        <p className="text-xs text-slate-400">MycoMap BLAST Results</p>
                        <a href={specimenDetail.observationData.mycomapBlastResults} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                          View BLAST Results
                        </a>
                      </div>
                    )}
                    {specimenDetail.observationData.genbankAccession && (
                      <div>
                        <p className="text-xs text-slate-400">GenBank Accession</p>
                        <p className="font-mono">{specimenDetail.observationData.genbankAccession}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {specimenDetail.sources && specimenDetail.sources.length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">External References</p>
                  <div className="space-y-2">
                    {specimenDetail.sources.map((source) => (
                      <div key={source.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded">
                        <Badge variant={source.isPrimary ? "default" : "outline"} className="text-xs">
                          {source.platform.toUpperCase()}
                        </Badge>
                        <span className="font-mono text-sm">{source.externalId}</span>
                        {platformUrls[source.platform] && (
                          <a
                            href={platformUrls[source.platform](source.externalId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        {source.isPrimary && (
                          <Badge variant="secondary" className="text-xs">Primary</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {specimenDetail.events && specimenDetail.events.length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Event History</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {specimenDetail.events.map((event) => {
                      // Parse notes for run link info
                      let runInfo: { runId?: number; runName?: string; positionNumber?: number } | null = null;
                      if (event.notes) {
                        try {
                          runInfo = JSON.parse(event.notes);
                        } catch {}
                      }
                      
                      return (
                        <div key={event.id} className="flex items-start gap-3 p-2 bg-slate-50 rounded text-sm">
                          <div className="text-slate-400 text-xs whitespace-nowrap">
                            {format(new Date(event.performedAt), "MMM d, HH:mm")}
                          </div>
                          <div className="flex-1">
                            <span className="font-medium capitalize">{event.eventType.replace(/_/g, " ")}</span>
                            {runInfo?.runId ? (
                              <span className="text-slate-600">
                                {" → Created from "}
                                <a 
                                  href={`/admin/lims/runs/${runInfo.runId}`}
                                  className="text-blue-600 hover:underline"
                                >
                                  {runInfo.runName || `Run${String(runInfo.runId).padStart(3, '0')}`}
                                </a>
                                {runInfo.positionNumber && ` (Position ${runInfo.positionNumber})`}
                              </span>
                            ) : event.newValue ? (
                              <span className="text-slate-600"> → {event.newValue}</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Validation Flag Section */}
              <div className="border-t pt-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Validation Flags</p>
                {specimenDetail.validationFlags && specimenDetail.validationFlags.length > 0 ? (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {specimenDetail.validationFlags.map((flag, idx) => (
                      <Badge key={idx} variant="destructive" className="gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {getFlagDisplayLabel(flag)}
                      </Badge>
                    ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => updateFlagMutation.mutate({ specimenId: specimenDetail.id, flag: null })}
                      disabled={updateFlagMutation.isPending}
                      data-testid="button-clear-flag"
                    >
                      Clear All
                    </Button>
                  </div>
                ) : specimenDetail.inatFieldConflict ? (
                  <div className="mb-3 flex items-center gap-2">
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {getFlagDisplayLabel(specimenDetail.inatFieldConflict)}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => updateFlagMutation.mutate({ specimenId: specimenDetail.id, flag: null })}
                      disabled={updateFlagMutation.isPending}
                      data-testid="button-clear-flag"
                    >
                      Clear Flag
                    </Button>
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <Select value={selectedFlag} onValueChange={setSelectedFlag}>
                    <SelectTrigger className="w-48" data-testid="select-add-flag">
                      <SelectValue placeholder="Select Flag..." />
                    </SelectTrigger>
                    <SelectContent>
                      {flagOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (selectedFlag) {
                        updateFlagMutation.mutate({ specimenId: specimenDetail.id, flag: selectedFlag });
                      }
                    }}
                    disabled={!selectedFlag || updateFlagMutation.isPending}
                    data-testid="button-add-flag"
                  >
                    {updateFlagMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Flag"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
