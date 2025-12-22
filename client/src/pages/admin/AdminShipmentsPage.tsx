import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, ChevronLeft, RefreshCw, Eye, User, MapPin, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";

interface PendingShipment {
  id: number;
  userId: string;
  status: string;
  trackingNumber: string | null;
  submittedAt: string | null;
  createdAt: string;
  userName: string;
  state: string;
  specimenCount: number;
}

export default function AdminShipmentsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  
  const { data: shipments, isLoading, refetch } = useQuery<PendingShipment[]>({
    queryKey: ['/api/admin/shipments/pending'],
  });

  const filteredShipments = useMemo(() => {
    if (!shipments) return [];
    if (!searchTerm.trim()) return shipments;
    
    const term = searchTerm.toLowerCase();
    return shipments.filter((shipment) => 
      shipment.userName.toLowerCase().includes(term) ||
      shipment.userId.toLowerCase().includes(term) ||
      shipment.state.toLowerCase().includes(term) ||
      shipment.trackingNumber?.toLowerCase().includes(term) ||
      String(shipment.id).includes(term)
    );
  }, [shipments, searchTerm]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" data-testid="button-back-dashboard">
                <ChevronLeft className="h-4 w-4 mr-1" /> Dashboard
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900" data-testid="text-page-title">
                Pending Shipments
              </h1>
              <p className="text-gray-600">Shipments waiting to be processed</p>
            </div>
          </div>
          <Button onClick={() => refetch()} variant="outline" data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name, email, state..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-center">Specimens</TableHead>
                  <TableHead>Tracking #</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredShipments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      <Package className="h-12 w-12 mx-auto mb-2 opacity-30" />
                      {searchTerm ? "No shipments match your search" : "No pending shipments"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredShipments.map((shipment) => (
                    <TableRow key={shipment.id} data-testid={`row-shipment-${shipment.id}`}>
                      <TableCell className="font-mono">#{shipment.id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-400" />
                          <span data-testid={`text-user-${shipment.id}`}>{shipment.userName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-gray-400" />
                          <span data-testid={`text-state-${shipment.id}`}>{shipment.state}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" data-testid={`badge-count-${shipment.id}`}>
                          {shipment.specimenCount}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {shipment.trackingNumber ? (
                          <span className="font-mono text-sm">{shipment.trackingNumber}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {shipment.submittedAt ? format(new Date(shipment.submittedAt), 'MMM d, yyyy') : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/admin/shipments/${shipment.id}`}>
                          <Button variant="outline" size="sm" data-testid={`button-view-${shipment.id}`}>
                            <Eye className="h-4 w-4 mr-1" /> View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
