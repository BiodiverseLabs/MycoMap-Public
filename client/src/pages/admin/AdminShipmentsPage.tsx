import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, ChevronLeft, RefreshCw, Eye, User, MapPin, Search, Plus, Truck, Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";

interface ShippingDestination {
  id: number;
  name: string;
  shortCode: string;
  city: string | null;
  stateProvince: string | null;
  isActive: boolean;
}

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

interface PendingPlate {
  id: number;
  name: string;
  status: string;
  createdAt: string;
  wells: any[];
}

export default function AdminShipmentsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [selectedPlates, setSelectedPlates] = useState<number[]>([]);
  const [sourceLabId, setSourceLabId] = useState<string>("");
  const [destinationLabId, setDestinationLabId] = useState<string>("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [createSpecimens, setCreateSpecimens] = useState(true);
  
  const { data: shipments, isLoading, refetch } = useQuery<PendingShipment[]>({
    queryKey: ['/api/admin/shipments/pending'],
  });

  const { data: pendingPlates } = useQuery<PendingPlate[]>({
    queryKey: ['/api/admin/pending-plates'],
    enabled: showTransferDialog,
  });

  const { data: destinations } = useQuery<ShippingDestination[]>({
    queryKey: ['/api/shipping/destinations'],
  });

  const activeDestinations = useMemo(() => 
    destinations?.filter(d => d.isActive) || [], 
    [destinations]
  );

  const labTransferMutation = useMutation({
    mutationFn: async (data: { plateIds: number[]; sourceLab: string; destinationLab: string; trackingNumber: string; createSpecimens: boolean }) => {
      return apiRequest('/api/admin/shipments/lab-transfer', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Lab Transfer Created",
        description: data.message || "Shipment created successfully",
      });
      setShowTransferDialog(false);
      setSelectedPlates([]);
      setTrackingNumber("");
      queryClient.invalidateQueries({ queryKey: ['/api/admin/shipments/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pending-plates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/specimens'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create lab transfer",
        variant: "destructive",
      });
    },
  });

  const handleCreateTransfer = () => {
    if (selectedPlates.length === 0) {
      toast({
        title: "No Plates Selected",
        description: "Please select at least one plate to transfer",
        variant: "destructive",
      });
      return;
    }
    if (!sourceLabId || !destinationLabId) {
      toast({
        title: "Missing Lab Selection",
        description: "Please select both source and destination labs",
        variant: "destructive",
      });
      return;
    }
    const sourceDest = activeDestinations.find(d => d.id.toString() === sourceLabId);
    const destDest = activeDestinations.find(d => d.id.toString() === destinationLabId);
    
    labTransferMutation.mutate({
      plateIds: selectedPlates,
      sourceLab: sourceDest?.name || "Unknown",
      destinationLab: destDest?.name || "Unknown",
      trackingNumber,
      createSpecimens,
    });
  };

  const togglePlateSelection = (plateId: number) => {
    setSelectedPlates(prev => 
      prev.includes(plateId) 
        ? prev.filter(id => id !== plateId)
        : [...prev, plateId]
    );
  };

  const selectAllPlates = () => {
    if (pendingPlates) {
      setSelectedPlates(pendingPlates.map(p => p.id));
    }
  };

  const deselectAllPlates = () => {
    setSelectedPlates([]);
  };

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
          <div className="flex gap-2">
            <Button onClick={() => setShowTransferDialog(true)} data-testid="button-create-transfer">
              <Truck className="h-4 w-4 mr-2" /> Create Lab Transfer
            </Button>
            <Button onClick={() => refetch()} variant="outline" data-testid="button-refresh">
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
          </div>
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

      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" /> Create Lab Transfer
            </DialogTitle>
            <DialogDescription>
              Create a shipment record for transferring pending plates between labs
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sourceLab">Source Lab</Label>
                <Select value={sourceLabId} onValueChange={setSourceLabId}>
                  <SelectTrigger data-testid="select-source-lab">
                    <SelectValue placeholder="Select source lab" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeDestinations.map((dest) => (
                      <SelectItem key={dest.id} value={dest.id.toString()}>
                        {dest.name} {dest.city && dest.stateProvince ? `(${dest.city}, ${dest.stateProvince})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="destinationLab">Destination Lab</Label>
                <Select value={destinationLabId} onValueChange={setDestinationLabId}>
                  <SelectTrigger data-testid="select-destination-lab">
                    <SelectValue placeholder="Select destination lab" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeDestinations.map((dest) => (
                      <SelectItem key={dest.id} value={dest.id.toString()}>
                        {dest.name} {dest.city && dest.stateProvince ? `(${dest.city}, ${dest.stateProvince})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="trackingNumber">Tracking Number (optional)</Label>
              <Input
                id="trackingNumber"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Enter shipping tracking number"
                data-testid="input-tracking-number"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="createSpecimens"
                checked={createSpecimens}
                onCheckedChange={(checked) => setCreateSpecimens(checked as boolean)}
                data-testid="checkbox-create-specimens"
              />
              <Label htmlFor="createSpecimens" className="text-sm font-normal">
                Create specimen records from plate wells (recommended)
              </Label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Select Plates to Transfer</Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAllPlates} data-testid="button-select-all">
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAllPlates} data-testid="button-deselect-all">
                    Clear
                  </Button>
                </div>
              </div>
              
              <div className="border rounded-lg max-h-60 overflow-auto">
                {pendingPlates && pendingPlates.length > 0 ? (
                  <div className="divide-y">
                    {pendingPlates.map((plate) => (
                      <div
                        key={plate.id}
                        className={`p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 ${
                          selectedPlates.includes(plate.id) ? 'bg-green-50' : ''
                        }`}
                        onClick={() => togglePlateSelection(plate.id)}
                        data-testid={`plate-item-${plate.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedPlates.includes(plate.id)}
                            onCheckedChange={() => togglePlateSelection(plate.id)}
                          />
                          <div>
                            <div className="font-medium">{plate.name}</div>
                            <div className="text-sm text-gray-500">
                              {plate.wells?.length || 0} wells
                            </div>
                          </div>
                        </div>
                        <Badge variant="outline">{plate.status}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No pending plates available</p>
                  </div>
                )}
              </div>
              
              {selectedPlates.length > 0 && (
                <p className="text-sm text-green-600">
                  {selectedPlates.length} plate(s) selected
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateTransfer}
              disabled={selectedPlates.length === 0 || !sourceLabId || !destinationLabId || labTransferMutation.isPending}
              data-testid="button-confirm-transfer"
            >
              {labTransferMutation.isPending ? "Creating..." : `Create Transfer (${selectedPlates.length} plates)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
