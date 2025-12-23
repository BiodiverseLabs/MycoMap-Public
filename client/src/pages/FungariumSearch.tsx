import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { 
  Search, 
  Filter, 
  ExternalLink, 
  Archive, 
  Dna,
  MapPin,
  Calendar,
  User,
  ChevronLeft,
  ChevronRight,
  Send
} from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";
import { format } from "date-fns";

interface Specimen {
  id: number;
  uuid: string;
  displayCode: string;
  scientificName: string | null;
  commonName: string | null;
  locality: string | null;
  collectionDate: string | null;
  collector: string | null;
  currentStatus: string;
  primaryObservationSource: string | null;
  primaryObservationId: string | null;
  voucherNumber: string | null;
}

interface SearchResponse {
  specimens: Specimen[];
  total: number;
  page: number;
  pageSize: number;
}

export default function FungariumSearch() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("accessioned");
  const [page, setPage] = useState(1);
  const [selectedSpecimen, setSelectedSpecimen] = useState<Specimen | null>(null);
  const pageSize = 20;

  const { data, isLoading } = useQuery<SearchResponse>({
    queryKey: ['/api/public/fungarium/specimens', { search: searchTerm, status: statusFilter, page, pageSize }],
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accessioned': return 'bg-[#8CBD45]/10 text-[#8CBD45]';
      case 'archived': return 'bg-slate-100 text-slate-600';
      case 'sequenced': return 'bg-purple-100 text-purple-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getObservationUrl = (source: string | null, id: string | null) => {
    if (!source || !id) return null;
    if (source === 'inat') return `https://www.inaturalist.org/observations/${id}`;
    if (source === 'mo') return `https://mushroomobserver.org/observations/${id}`;
    return null;
  };

  return (
    <PublicLayout>
      <div className="min-h-screen bg-gradient-to-b from-[#8CBD45]/5 to-white">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
              <Link href="/fungarium/about">
                <Button variant="ghost" size="sm" data-testid="button-back">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Fungarium
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-[#A87146]" data-testid="text-page-title">
                  Search Specimens
                </h1>
                <p className="text-slate-600">Browse the MYCO Fungarium collection</p>
              </div>
            </div>

            <Card className="mb-6 border-[#8CBD45]/20">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by scientific name, MYCO #, voucher number, location..."
                      value={searchTerm}
                      onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                      className="pl-10"
                      data-testid="input-search"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-full md:w-48" data-testid="select-status">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Specimens</SelectItem>
                      <SelectItem value="accessioned">Accessioned</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                      <SelectItem value="sequenced">Sequenced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {isLoading ? (
              <Card>
                <CardContent className="p-6">
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="mb-4 border-[#8CBD45]/20">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>MYCO #</TableHead>
                          <TableHead>Scientific Name</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Collector</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data?.specimens && data.specimens.length > 0 ? (
                          data.specimens.map((specimen) => (
                            <TableRow key={specimen.id} className="cursor-pointer hover:bg-[#8CBD45]/5" data-testid={`row-specimen-${specimen.id}`}>
                              <TableCell className="font-mono text-[#8CBD45] font-medium">
                                {specimen.displayCode}
                              </TableCell>
                              <TableCell>
                                <span className="italic">{specimen.scientificName || "—"}</span>
                                {specimen.commonName && (
                                  <span className="block text-sm text-slate-500">{specimen.commonName}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-slate-600">
                                {specimen.locality || "—"}
                              </TableCell>
                              <TableCell className="text-sm text-slate-600">
                                {specimen.collector || "—"}
                              </TableCell>
                              <TableCell>
                                <Badge className={getStatusColor(specimen.currentStatus)}>
                                  {specimen.currentStatus}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => setSelectedSpecimen(specimen)}
                                  data-testid={`button-view-${specimen.id}`}
                                >
                                  View Details
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                              <Archive className="w-12 h-12 mx-auto mb-3 opacity-30" />
                              <p className="font-medium">No specimens found</p>
                              <p className="text-sm">Try adjusting your search or filters</p>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-600">
                      Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, data?.total || 0)} of {data?.total || 0}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        data-testid="button-next-page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <Dialog open={!!selectedSpecimen} onOpenChange={() => setSelectedSpecimen(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Dna className="w-5 h-5 text-[#8CBD45]" />
                Specimen Details
              </DialogTitle>
            </DialogHeader>
            {selectedSpecimen && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-lg text-[#8CBD45] font-bold">{selectedSpecimen.displayCode}</span>
                  <Badge className={getStatusColor(selectedSpecimen.currentStatus)}>{selectedSpecimen.currentStatus}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">Scientific Name</p>
                    <p className="font-medium italic">{selectedSpecimen.scientificName || "Not determined"}</p>
                  </div>
                  {selectedSpecimen.commonName && (
                    <div>
                      <p className="text-slate-500">Common Name</p>
                      <p className="font-medium">{selectedSpecimen.commonName}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-slate-500">Location</p>
                    <p className="font-medium flex items-center gap-1">
                      <MapPin className="w-4 h-4" /> {selectedSpecimen.locality || "Unknown"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Collection Date</p>
                    <p className="font-medium flex items-center gap-1">
                      <Calendar className="w-4 h-4" /> 
                      {selectedSpecimen.collectionDate ? format(new Date(selectedSpecimen.collectionDate), 'MMM d, yyyy') : "Unknown"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Collector</p>
                    <p className="font-medium flex items-center gap-1">
                      <User className="w-4 h-4" /> {selectedSpecimen.collector || "Unknown"}
                    </p>
                  </div>
                  {selectedSpecimen.voucherNumber && (
                    <div>
                      <p className="text-slate-500">Voucher Number</p>
                      <p className="font-mono font-medium">{selectedSpecimen.voucherNumber}</p>
                    </div>
                  )}
                </div>

                {selectedSpecimen.primaryObservationSource && selectedSpecimen.primaryObservationId && (
                  <div className="border-t pt-4">
                    <a
                      href={getObservationUrl(selectedSpecimen.primaryObservationSource, selectedSpecimen.primaryObservationId) || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-[#8CBD45] hover:underline"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View on {selectedSpecimen.primaryObservationSource === 'inat' ? 'iNaturalist' : 'Mushroom Observer'}
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
