import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
  ExternalLink
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
  scientificName: string | null;
  genus: string | null;
  family: string | null;
  currentStatus: string;
  herbariumAccessionNumber: string | null;
  storageLocation: string | null;
  createdAt: string;
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

  const { data, isLoading } = useQuery<SpecimensResponse>({
    queryKey: ["/api/admin/specimens", { search: searchTerm, status: statusFilter, limit, offset: page * limit }],
  });

  const { data: specimenDetail, isLoading: detailLoading } = useQuery<SpecimenDetail>({
    queryKey: ["/api/admin/specimens", selectedSpecimen],
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
                      <TableHead>Platform</TableHead>
                      <TableHead>Observation #</TableHead>
                      <TableHead>Voucher Number</TableHead>
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
                        <TableCell className="font-mono text-sm">
                          <div>
                            {specimen.voucherNumber || specimen.labCode || <span className="text-slate-400">-</span>}
                          </div>
                          {specimen.voucherNumber && specimen.labCode && (
                            <div className="text-xs text-slate-500">{specimen.labCode}</div>
                          )}
                        </TableCell>
                        <TableCell className="italic">
                          {specimen.scientificName || <span className="text-slate-400">Unknown</span>}
                        </TableCell>
                        <TableCell>{getStatusBadge(specimen.currentStatus)}</TableCell>
                        <TableCell className="text-sm text-slate-600 max-w-[200px] truncate">
                          {specimen.locality || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {specimen.collectionDate ? format(new Date(specimen.collectionDate), "MMM d, yyyy") : "-"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedSpecimen(specimen.id)}
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Scientific Name</p>
                  <p className="font-medium italic">{specimenDetail.scientificName || "Unknown"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Family</p>
                  <p className="font-medium">{specimenDetail.family || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Collector</p>
                  <p className="font-medium">{specimenDetail.collectorName || "-"}</p>
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
                </div>
                {specimenDetail.herbariumAccessionNumber && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">MYCO Accession #</p>
                    <p className="font-mono font-bold text-[#8CBD45]">{specimenDetail.herbariumAccessionNumber}</p>
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

              {specimenDetail.sources && specimenDetail.sources.length > 0 && (
                <div>
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
                <div>
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
