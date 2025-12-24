import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { 
  Search, 
  Filter,
  Package,
  Dna,
  CheckCircle2,
  Eye,
  AlertCircle,
  ExternalLink,
  MapPin,
  Calendar,
  User,
  Send,
  X,
  ChevronLeft
} from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";
import { format } from "date-fns";

interface Specimen {
  id: number;
  uuid: string;
  displayCode: string;
  scientificName: string | null;
  locality: string | null;
  state: string | null;
  country: string | null;
  collectionDate: string | null;
  collectorName: string | null;
  observerUsername: string | null;
  currentStatus: string;
  primaryObservationSource: string | null;
  primaryObservationId: string | null;
  voucherNumber: string | null;
  inatFieldConflict: string | null;
}

const getDisplayCollector = (specimen: Specimen): string => {
  if (specimen.collectorName && specimen.collectorName.toLowerCase() !== 'none') {
    return specimen.collectorName;
  }
  if (specimen.observerUsername) {
    return `@${specimen.observerUsername}`;
  }
  return "Unknown";
};

interface SpecimensResponse {
  specimens: Specimen[];
  total: number;
  limit: number;
  offset: number;
}

export default function FungariumSearch() {
  const [location] = useLocation();
  const urlParams = new URLSearchParams(location.split("?")[1] || "");
  const initialStatus = urlParams.get("status") || "";
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [validationFlagFilters, setValidationFlagFilters] = useState<string[]>([]);
  const [selectedSpecimen, setSelectedSpecimen] = useState<Specimen | null>(null);
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hasSequence, setHasSequence] = useState(false);
  const limit = 50;
  
  const flagOptions = [
    { value: "check_specimen", label: "Check Specimen", displayLabel: "Check Specimen" },
    { value: "metadata", label: "Missing Metadata", displayLabel: "Missing Metadata" },
    { value: "push_incomplete", label: "Push Incomplete", displayLabel: "Push Incomplete" },
    { value: "herbarium_catalog_conflict", label: "Catalog Conflict", displayLabel: "Conflict" },
    { value: "herbarium_name_conflict", label: "Name Conflict", displayLabel: "Conflict" },
    { value: "both_conflict", label: "Both Conflict", displayLabel: "Conflict" },
  ];
  
  const filterFlagOptions = [
    { value: "has_flag", label: "Has Any Flag" },
    { value: "no_flag", label: "No Flag" },
    { value: "check_specimen", label: "Check Specimen" },
    { value: "metadata", label: "Missing Metadata" },
    { value: "push_incomplete", label: "Push Incomplete" },
    { value: "unexpected_catalog", label: "Unexpected Catalog" },
    { value: "duplicate_inat", label: "Duplicate iNat" },
    { value: "herbarium_catalog_conflict", label: "Catalog Conflict" },
    { value: "herbarium_name_conflict", label: "Name Conflict" },
    { value: "both_conflict", label: "Both Conflict" },
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

  const buildSpecimensUrl = () => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("search", searchTerm);
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    if (validationFlagFilters.length > 0) params.set("validationFlags", validationFlagFilters.join(","));
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (hasSequence) params.set("hasSequence", "true");
    params.set("limit", limit.toString());
    params.set("offset", (page * limit).toString());
    return `/api/public/fungarium/specimens?${params.toString()}`;
  };

  const { data, isLoading } = useQuery<SpecimensResponse>({
    queryKey: ["/api/public/fungarium/specimens", searchTerm, statusFilter, validationFlagFilters.join(","), page, dateFrom, dateTo, hasSequence],
    queryFn: async () => {
      const res = await fetch(buildSpecimensUrl());
      if (!res.ok) throw new Error("Failed to fetch specimens");
      return res.json();
    },
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

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] || { label: status, icon: Package, variant: "secondary" as const };
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <PublicLayout>
      <div className="min-h-screen bg-gradient-to-b from-[#8CBD45]/5 to-white">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <Link href="/fungarium/about">
                <Button variant="ghost" size="sm" className="mb-2 -ml-2" data-testid="button-back">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Fungarium
                </Button>
              </Link>
              <h1 className="text-3xl font-bold text-[#A87146]" data-testid="text-page-title">
                Search Specimens
              </h1>
              <p className="text-slate-600">Browse the MYCO Fungarium collection</p>
            </div>

            <Card className="mb-6 border-[#8CBD45]/20">
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row gap-4">
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

            <Card className="border-[#8CBD45]/20">
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
                  <div className="p-6 space-y-3">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : data?.specimens?.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    <p>No specimens found matching your criteria</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>MYCO #</TableHead>
                        <TableHead>Platform</TableHead>
                        <TableHead>Observation #</TableHead>
                        <TableHead>Scientific Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Collection Date</TableHead>
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
                            {specimen.scientificName || <span className="text-slate-400">Unknown</span>}
                          </TableCell>
                          <TableCell>{getStatusBadge(specimen.currentStatus)}</TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {specimen.state || specimen.country 
                              ? [specimen.state, specimen.country].filter(Boolean).join(", ")
                              : "-"}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {specimen.collectionDate ? format(new Date(specimen.collectionDate), "MMM d, yyyy") : "-"}
                          </TableCell>
                          <TableCell>
                            {specimen.inatFieldConflict ? (
                              <Badge variant="destructive" className="text-xs" data-testid={`badge-conflict-${specimen.id}`}>
                                {getFlagDisplayLabel(specimen.inatFieldConflict)}
                              </Badge>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedSpecimen(specimen)}
                              data-testid={`button-view-${specimen.id}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={!!selectedSpecimen} onOpenChange={() => setSelectedSpecimen(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono">{selectedSpecimen?.displayCode}</span>
                {selectedSpecimen && getStatusBadge(selectedSpecimen.currentStatus)}
              </DialogTitle>
            </DialogHeader>
            
            {selectedSpecimen && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Scientific Name</p>
                    <p className="font-medium italic">{selectedSpecimen.scientificName || "Not determined"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Platform</p>
                    <p className="font-medium">
                      {selectedSpecimen.primaryObservationSource === 'inat' ? 'iNaturalist' : 
                       selectedSpecimen.primaryObservationSource === 'mo' ? 'Mushroom Observer' : 
                       selectedSpecimen.primaryObservationSource === 'mycoportal' ? 'MyCoPortal' : 
                       selectedSpecimen.primaryObservationSource || '-'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Location</p>
                    <p className="font-medium flex items-center gap-1">
                      <MapPin className="w-4 h-4" /> 
                      {selectedSpecimen.locality || "Unknown location"}
                    </p>
                    {(selectedSpecimen.state || selectedSpecimen.country) && (
                      <p className="text-sm text-slate-500">
                        {[selectedSpecimen.state, selectedSpecimen.country].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Collection Date</p>
                    <p className="font-medium flex items-center gap-1">
                      <Calendar className="w-4 h-4" /> 
                      {selectedSpecimen.collectionDate ? format(new Date(selectedSpecimen.collectionDate), 'MMM d, yyyy') : "Unknown"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Collector</p>
                    <p className="font-medium flex items-center gap-1">
                      <User className="w-4 h-4" /> {getDisplayCollector(selectedSpecimen)}
                    </p>
                  </div>
                  {selectedSpecimen.voucherNumber && (
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Voucher Number</p>
                      <p className="font-mono font-medium">{selectedSpecimen.voucherNumber}</p>
                    </div>
                  )}
                </div>

                {selectedSpecimen.inatFieldConflict && (
                  <div className="border-t pt-4">
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Validation Status</p>
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {getFlagDisplayLabel(selectedSpecimen.inatFieldConflict)}
                    </Badge>
                  </div>
                )}

                {selectedSpecimen.primaryObservationSource && selectedSpecimen.primaryObservationId && (
                  <div className="border-t pt-4">
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">External Reference</p>
                    <a
                      href={platformUrls[selectedSpecimen.primaryObservationSource]?.(selectedSpecimen.primaryObservationId) || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View on {selectedSpecimen.primaryObservationSource === 'inat' ? 'iNaturalist' : 
                               selectedSpecimen.primaryObservationSource === 'mo' ? 'Mushroom Observer' : 
                               selectedSpecimen.primaryObservationSource === 'mycoportal' ? 'MyCoPortal' : 
                               selectedSpecimen.primaryObservationSource}
                    </a>
                  </div>
                )}

                <div className="flex gap-2 pt-4 border-t">
                  <Link href={`/fungarium/request?specimen=${selectedSpecimen.displayCode}`} className="flex-1">
                    <Button className="w-full bg-[#8CBD45] hover:bg-[#7aaa3d]" data-testid="button-request-specimen">
                      <Send className="w-4 h-4 mr-2" /> Request This Specimen
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PublicLayout>
  );
}
