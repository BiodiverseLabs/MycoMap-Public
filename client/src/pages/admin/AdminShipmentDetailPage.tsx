import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Package, CheckCircle, Truck, MapPin, User, Mail } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

interface Specimen {
  id: number;
  observationId: string;
  platform: string;
  scientificName: string | null;
  location: string | null;
  processingStatus: string;
  isSlimeMold: boolean;
  voucherNumber: string | null;
}

interface Bag {
  id: number;
  bagLabel: string;
  specimens: Specimen[];
}

interface ShipmentDetail {
  id: number;
  userId: string;
  status: string;
  trackingNumber: string | null;
  submittedAt: string | null;
  createdAt: string;
  user: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  bags: Bag[];
}

const statusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  received: "bg-purple-100 text-purple-700",
  processing: "bg-yellow-100 text-yellow-700",
  sequenced: "bg-green-100 text-green-700",
  complete: "bg-emerald-600 text-white",
};

export default function AdminShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const shipmentId = parseInt(id);
  const { toast } = useToast();
  
  const { data: shipment, isLoading, refetch } = useQuery<ShipmentDetail>({
    queryKey: ['/api/admin/shipments', shipmentId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/shipments/${shipmentId}`);
      if (!res.ok) throw new Error('Failed to fetch shipment');
      return res.json();
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ action, newStatus }: { action: string; newStatus: string }) => {
      return apiRequest('PATCH', `/api/admin/shipments/${shipmentId}/status`, { action, newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/shipments', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/shipments/pending'] });
      toast({
        title: "Status Updated",
        description: "Shipment status has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  const handleMarkReceived = () => {
    updateStatusMutation.mutate({ action: "mark_received", newStatus: "received" });
  };

  const handleSentToIndiana = () => {
    updateStatusMutation.mutate({ action: "sent_to_indiana", newStatus: "processing" });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h2 className="text-xl font-semibold mb-2">Shipment Not Found</h2>
            <Link href="/admin/shipments">
              <Button>Back to Shipments</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalSpecimens = shipment.bags.reduce((sum, bag) => sum + bag.specimens.length, 0);
  const userName = shipment.user ? 
    `${shipment.user.firstName || ''} ${shipment.user.lastName || ''}`.trim() || shipment.user.email : 
    'Unknown';

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/shipments">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ChevronLeft className="h-4 w-4 mr-1" /> Pending Shipments
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900" data-testid="text-shipment-title">
                Shipment #{shipment.id}
              </h1>
              <Badge className={statusColors[shipment.status] || statusColors.pending}>
                {shipment.status.toUpperCase()}
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" /> Submitter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium" data-testid="text-user-name">{userName}</p>
              {shipment.user?.email && (
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                  <Mail className="h-4 w-4" /> {shipment.user.email}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5" /> Contents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold" data-testid="text-specimen-count">{totalSpecimens}</p>
              <p className="text-sm text-gray-500">specimens in {shipment.bags.length} bags</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Truck className="h-5 w-5" /> Tracking
              </CardTitle>
            </CardHeader>
            <CardContent>
              {shipment.trackingNumber ? (
                <p className="font-mono" data-testid="text-tracking">{shipment.trackingNumber}</p>
              ) : (
                <p className="text-gray-400">No tracking number</p>
              )}
              {shipment.submittedAt && (
                <p className="text-sm text-gray-500 mt-1">
                  Submitted: {format(new Date(shipment.submittedAt), 'MMM d, yyyy')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4">
            <Button 
              onClick={handleMarkReceived} 
              disabled={shipment.status !== 'submitted' || updateStatusMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="button-mark-received"
            >
              <CheckCircle className="h-4 w-4 mr-2" /> Shipment Received
            </Button>
            <Button 
              onClick={handleSentToIndiana} 
              disabled={shipment.status !== 'received' || updateStatusMutation.isPending}
              className="bg-yellow-600 hover:bg-yellow-700"
              data-testid="button-sent-indiana"
            >
              <Truck className="h-4 w-4 mr-2" /> Sent to Indiana
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Specimens by Bag</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {shipment.bags.map((bag, index) => (
              <div key={bag.id} className="border-b last:border-0">
                <div className="px-6 py-3 bg-gray-50 font-medium flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  {bag.bagLabel || `Bag ${index + 1}`}
                  <Badge variant="secondary" className="ml-auto">{bag.specimens.length} specimens</Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Platform</TableHead>
                      <TableHead>Observation ID</TableHead>
                      <TableHead>Scientific Name</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Voucher #</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bag.specimens.map((specimen) => (
                      <TableRow key={specimen.id} data-testid={`row-specimen-${specimen.id}`}>
                        <TableCell>
                          <Badge variant="outline">{specimen.platform}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {specimen.platform === 'iNaturalist' ? (
                            <a 
                              href={`https://www.inaturalist.org/observations/${specimen.observationId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {specimen.observationId}
                            </a>
                          ) : (
                            specimen.observationId
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="italic">{specimen.scientificName || '—'}</span>
                          {specimen.isSlimeMold && (
                            <Badge className="ml-2 bg-orange-100 text-orange-700">Slime Mold</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600 max-w-[200px] truncate">
                          {specimen.location || '—'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {specimen.voucherNumber || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[specimen.processingStatus] || statusColors.pending}>
                            {specimen.processingStatus}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
