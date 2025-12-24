import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";

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
    notes: string | null;
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

export default function AdminSpecimensPage() {
  const [location] = useLocation();
  const urlParams = new URLSearchParams(location.split("?")[1] || "");
  const initialStatus = urlParams.get("status") || "";
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [selectedSpecimen, setSelectedSpecimen] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const limit = 50;

  // Build URL with query parameters
  const buildSpecimensUrl = () => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("search", searchTerm);
    if (statusFilter) params.set("status", statusFilter);
    params.set("limit", limit.toString());
    params.set("offset", (page * limit).toString());
    return `/api/admin/specimens?${params.toString()}`;
  };

  const { data, isLoading } = useQuery<SpecimensResponse>({
    queryKey: ["/api/admin/specimens", searchTerm, statusFilter, page],
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
    received: { label: "Received", icon: Package, variant: "secondary" },
    processing: { label: "Processing", icon: FlaskConical, variant: "outline" },
    sequenced: { label: "Sequenced", icon: Dna, variant: "default" },
    pending_accession: { label: "Pending Accession", icon: Package, variant: "outline" },
    accessioned: { label: "Accessioned", icon: CheckCircle2, variant: "default" },
    archived: { label: "Archived", icon: Archive, variant: "secondary" },
    retired: { label: "Retired", icon: AlertCircle, variant: "destructive" },
    lost: { label: "Lost", icon: AlertCircle, variant: "destructive" },
  };

  const platformUrls: Record<string, (id: string) => string> = {
    inat: (id) => `https://www.inaturalist.org/observations/${id}`,
    mo: (id) => `https://mushroomobserver.org/observations/${id}`,
    mycoportal: (id) => `https://mycoportal.org/portal/collections/individual/index.php?occid=${id}`,
  };

  const { toast } = useToast();

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
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Specimens</h1>
          <p className="text-slate-600 mt-1">
            Browse and manage fungarium specimens
          </p>
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
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                    <SelectTrigger className="w-40" data-testid="select-status">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="received">Received</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="sequenced">Sequenced</SelectItem>
                      <SelectItem value="accessioned">Accessioned</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
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
                      <TableHead>MYCO #</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Observation #</TableHead>
                      <TableHead>Scientific Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Collection Date</TableHead>
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
                    {specimenDetail.genus && <Badge variant="outline">{specimenDetail.genus}</Badge>}
                    {specimenDetail.observationData?.qualityGrade && (
                      <Badge variant={specimenDetail.observationData.qualityGrade === 'research' ? 'default' : 'secondary'}>
                        {specimenDetail.observationData.qualityGrade}
                      </Badge>
                    )}
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
                      return hasValidCollectorsName 
                        ? collectorsName 
                        : (specimenDetail.collectorName || specimenDetail.observationData?.observerName || "-");
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
                      ? format(new Date(specimenDetail.collectionDate), "MMM d, yyyy")
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

              {/* iNaturalist Observation Fields */}
              {specimenDetail.observationData && (
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
                    {specimenDetail.events.map((event) => (
                      <div key={event.id} className="flex items-start gap-3 p-2 bg-slate-50 rounded text-sm">
                        <div className="text-slate-400 text-xs whitespace-nowrap">
                          {format(new Date(event.performedAt), "MMM d, HH:mm")}
                        </div>
                        <div className="flex-1">
                          <span className="font-medium capitalize">{event.eventType.replace(/_/g, " ")}</span>
                          {event.newValue && (
                            <span className="text-slate-600"> → {event.newValue}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
