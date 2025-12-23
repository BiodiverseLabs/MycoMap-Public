import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Package, 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Send, 
  Users, 
  RefreshCw,
  Upload,
  MapPin,
  Calendar,
  FileSpreadsheet
} from "lucide-react";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SpecimenRequest {
  id: number;
  observationId: string | null;
  platform: string | null;
  voucherNumbers: string | null;
  runNumber: number | null;
  plateCell: string | null;
  mycoNumber: string | null;
  shipmentDate: string | null;
  recipientId: number | null;
  recipientName: string | null;
  notes: string | null;
  otherNotes: string | null;
  trackingNumber: string | null;
  status: string;
  createdAt: string;
}

interface Recipient {
  id: number;
  name: string;
  institution: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  isActive: boolean;
}

interface Stats {
  total: number;
  shipped: number;
  pending: number;
  uniqueRecipients: number;
}

export default function AdminSpecimenRequestsPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("requests");
  
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [showRecipientDialog, setShowRecipientDialog] = useState(false);
  const [editingRequest, setEditingRequest] = useState<SpecimenRequest | null>(null);
  const [editingRecipient, setEditingRecipient] = useState<Recipient | null>(null);
  
  const [requestForm, setRequestForm] = useState({
    observationId: "",
    voucherNumbers: "",
    runNumber: "",
    plateCell: "",
    mycoNumber: "",
    shipmentDate: "",
    recipientId: "",
    recipientName: "",
    notes: "",
    otherNotes: "",
    trackingNumber: "",
    status: "pending",
  });
  
  const [recipientForm, setRecipientForm] = useState({
    name: "",
    institution: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "USA",
    notes: "",
  });

  const { data: requestsData, isLoading: loadingRequests, refetch: refetchRequests } = useQuery<{ requests: SpecimenRequest[]; total: number }>({
    queryKey: ['/api/admin/specimen-requests', { status: statusFilter }],
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ['/api/admin/specimen-requests/stats'],
  });

  const { data: recipients, refetch: refetchRecipients } = useQuery<Recipient[]>({
    queryKey: ['/api/admin/specimen-recipients'],
  });

  const createRequestMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/admin/specimen-requests', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    }),
    onSuccess: () => {
      toast({ title: "Success", description: "Specimen request created" });
      setShowRequestDialog(false);
      resetRequestForm();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/specimen-requests'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateRequestMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest(`/api/admin/specimen-requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    }),
    onSuccess: () => {
      toast({ title: "Success", description: "Specimen request updated" });
      setShowRequestDialog(false);
      setEditingRequest(null);
      resetRequestForm();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/specimen-requests'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteRequestMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/admin/specimen-requests/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({ title: "Deleted", description: "Specimen request removed" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/specimen-requests'] });
    },
  });

  const createRecipientMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/admin/specimen-recipients', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    }),
    onSuccess: () => {
      toast({ title: "Success", description: "Recipient created" });
      setShowRecipientDialog(false);
      resetRecipientForm();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/specimen-recipients'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateRecipientMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest(`/api/admin/specimen-recipients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    }),
    onSuccess: () => {
      toast({ title: "Success", description: "Recipient updated" });
      setShowRecipientDialog(false);
      setEditingRecipient(null);
      resetRecipientForm();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/specimen-recipients'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetRequestForm = () => {
    setRequestForm({
      observationId: "",
      voucherNumbers: "",
      runNumber: "",
      plateCell: "",
      mycoNumber: "",
      shipmentDate: "",
      recipientId: "",
      recipientName: "",
      notes: "",
      otherNotes: "",
      trackingNumber: "",
      status: "pending",
    });
  };

  const resetRecipientForm = () => {
    setRecipientForm({
      name: "",
      institution: "",
      email: "",
      phone: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
      country: "USA",
      notes: "",
    });
  };

  const openEditRequest = (request: SpecimenRequest) => {
    setEditingRequest(request);
    setRequestForm({
      observationId: request.observationId || "",
      voucherNumbers: request.voucherNumbers || "",
      runNumber: request.runNumber?.toString() || "",
      plateCell: request.plateCell || "",
      mycoNumber: request.mycoNumber || "",
      shipmentDate: request.shipmentDate || "",
      recipientId: request.recipientId?.toString() || "",
      recipientName: request.recipientName || "",
      notes: request.notes || "",
      otherNotes: request.otherNotes || "",
      trackingNumber: request.trackingNumber || "",
      status: request.status || "pending",
    });
    setShowRequestDialog(true);
  };

  const openEditRecipient = (recipient: Recipient) => {
    setEditingRecipient(recipient);
    setRecipientForm({
      name: recipient.name,
      institution: recipient.institution || "",
      email: recipient.email || "",
      phone: recipient.phone || "",
      addressLine1: recipient.addressLine1 || "",
      addressLine2: recipient.addressLine2 || "",
      city: recipient.city || "",
      state: recipient.state || "",
      postalCode: recipient.postalCode || "",
      country: recipient.country || "USA",
      notes: recipient.notes || "",
    });
    setShowRecipientDialog(true);
  };

  const handleSaveRequest = () => {
    const data = {
      ...requestForm,
      runNumber: requestForm.runNumber ? parseInt(requestForm.runNumber) : null,
      recipientId: requestForm.recipientId ? parseInt(requestForm.recipientId) : null,
      shipmentDate: requestForm.shipmentDate || null,
    };

    if (editingRequest) {
      updateRequestMutation.mutate({ id: editingRequest.id, data });
    } else {
      createRequestMutation.mutate(data);
    }
  };

  const handleSaveRecipient = () => {
    if (editingRecipient) {
      updateRecipientMutation.mutate({ id: editingRecipient.id, data: recipientForm });
    } else {
      createRecipientMutation.mutate(recipientForm);
    }
  };

  const filteredRequests = useMemo(() => {
    if (!requestsData?.requests) return [];
    if (!searchTerm.trim()) return requestsData.requests;
    
    const term = searchTerm.toLowerCase();
    return requestsData.requests.filter(r =>
      r.observationId?.toLowerCase().includes(term) ||
      r.voucherNumbers?.toLowerCase().includes(term) ||
      r.mycoNumber?.toLowerCase().includes(term) ||
      r.recipientName?.toLowerCase().includes(term)
    );
  }, [requestsData?.requests, searchTerm]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'shipped': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'delivered': return 'bg-blue-100 text-blue-800';
      case 'returned': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loadingRequests) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800" data-testid="text-page-title">
            Specimen Requests
          </h1>
          <p className="text-slate-600">Track specimen splits and loans sent to researchers</p>
        </div>
        <Button onClick={() => refetchRequests()} variant="outline" data-testid="button-refresh">
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-stat-total">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Requests</p>
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
              </div>
              <Package className="h-8 w-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-shipped">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Shipped</p>
                <p className="text-2xl font-bold text-green-600">{stats?.shipped || 0}</p>
              </div>
              <Send className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-pending">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{stats?.pending || 0}</p>
              </div>
              <Calendar className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-recipients">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Recipients</p>
                <p className="text-2xl font-bold text-blue-600">{stats?.uniqueRecipients || 0}</p>
              </div>
              <Users className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="requests" data-testid="tab-requests">
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Requests
          </TabsTrigger>
          <TabsTrigger value="recipients" data-testid="tab-recipients">
            <Users className="h-4 w-4 mr-2" /> Recipients
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by observation ID, voucher, MYCO #, recipient..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="returned">Returned</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => { resetRequestForm(); setEditingRequest(null); setShowRequestDialog(true); }} data-testid="button-add-request">
              <Plus className="h-4 w-4 mr-2" /> Add Request
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>iNat/MO</TableHead>
                    <TableHead>Voucher #</TableHead>
                    <TableHead>Run</TableHead>
                    <TableHead>Plate+Cell</TableHead>
                    <TableHead>MYCO #</TableHead>
                    <TableHead>Shipment Date</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                        <Package className="h-12 w-12 mx-auto mb-2 opacity-30" />
                        No specimen requests found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRequests.map((request) => (
                      <TableRow key={request.id} data-testid={`row-request-${request.id}`}>
                        <TableCell className="font-mono text-sm">{request.observationId || "—"}</TableCell>
                        <TableCell className="text-sm max-w-[120px] truncate" title={request.voucherNumbers || ""}>
                          {request.voucherNumbers || "—"}
                        </TableCell>
                        <TableCell>{request.runNumber || "—"}</TableCell>
                        <TableCell className="font-mono">{request.plateCell || "—"}</TableCell>
                        <TableCell className="font-mono text-[#8CBD45]">{request.mycoNumber || "—"}</TableCell>
                        <TableCell>
                          {request.shipmentDate ? format(new Date(request.shipmentDate), 'MMM d, yyyy') : "—"}
                        </TableCell>
                        <TableCell>{request.recipientName || "—"}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(request.status)}>{request.status}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate text-sm" title={request.notes || ""}>
                          {request.notes || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => openEditRequest(request)} data-testid={`button-edit-${request.id}`}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-red-500"
                              onClick={() => deleteRequestMutation.mutate(request.id)}
                              data-testid={`button-delete-${request.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recipients" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { resetRecipientForm(); setEditingRecipient(null); setShowRecipientDialog(true); }} data-testid="button-add-recipient">
              <Plus className="h-4 w-4 mr-2" /> Add Recipient
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recipients?.map((recipient) => (
              <Card key={recipient.id} className="hover:shadow-md transition-shadow" data-testid={`card-recipient-${recipient.id}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>{recipient.name}</span>
                    <Button variant="ghost" size="sm" onClick={() => openEditRecipient(recipient)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                  {recipient.institution && (
                    <p className="text-sm text-gray-500">{recipient.institution}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {recipient.email && (
                    <p className="text-gray-600">{recipient.email}</p>
                  )}
                  {recipient.addressLine1 && (
                    <div className="flex items-start gap-2 text-gray-600">
                      <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <p>{recipient.addressLine1}</p>
                        {recipient.addressLine2 && <p>{recipient.addressLine2}</p>}
                        <p>{[recipient.city, recipient.state, recipient.postalCode].filter(Boolean).join(", ")}</p>
                        {recipient.country && recipient.country !== "USA" && <p>{recipient.country}</p>}
                      </div>
                    </div>
                  )}
                  {recipient.notes && (
                    <p className="text-gray-500 italic text-xs">{recipient.notes}</p>
                  )}
                </CardContent>
              </Card>
            ))}
            {(!recipients || recipients.length === 0) && (
              <div className="col-span-full text-center py-12 text-gray-500">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>No recipients added yet</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRequest ? "Edit Specimen Request" : "Add Specimen Request"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>iNat/MO ID</Label>
              <Input
                value={requestForm.observationId}
                onChange={(e) => setRequestForm({ ...requestForm, observationId: e.target.value })}
                placeholder="e.g., 169219203"
                data-testid="input-observation-id"
              />
            </div>
            <div className="space-y-2">
              <Label>Voucher Number(s)</Label>
              <Input
                value={requestForm.voucherNumbers}
                onChange={(e) => setRequestForm({ ...requestForm, voucherNumbers: e.target.value })}
                placeholder="e.g., CM24-10848"
                data-testid="input-voucher"
              />
            </div>
            <div className="space-y-2">
              <Label>Run Number</Label>
              <Input
                type="number"
                value={requestForm.runNumber}
                onChange={(e) => setRequestForm({ ...requestForm, runNumber: e.target.value })}
                placeholder="e.g., 36"
                data-testid="input-run-number"
              />
            </div>
            <div className="space-y-2">
              <Label>Plate + Cell</Label>
              <Input
                value={requestForm.plateCell}
                onChange={(e) => setRequestForm({ ...requestForm, plateCell: e.target.value })}
                placeholder="e.g., 1.57"
                data-testid="input-plate-cell"
              />
            </div>
            <div className="space-y-2">
              <Label>MYCO #</Label>
              <Input
                value={requestForm.mycoNumber}
                onChange={(e) => setRequestForm({ ...requestForm, mycoNumber: e.target.value })}
                placeholder="e.g., MYCO1002103"
                data-testid="input-myco-number"
              />
            </div>
            <div className="space-y-2">
              <Label>Shipment Date</Label>
              <Input
                type="date"
                value={requestForm.shipmentDate}
                onChange={(e) => setRequestForm({ ...requestForm, shipmentDate: e.target.value })}
                data-testid="input-shipment-date"
              />
            </div>
            <div className="space-y-2">
              <Label>Recipient</Label>
              <Select 
                value={requestForm.recipientId} 
                onValueChange={(value) => {
                  const recipient = recipients?.find(r => r.id.toString() === value);
                  setRequestForm({ 
                    ...requestForm, 
                    recipientId: value,
                    recipientName: recipient?.name || requestForm.recipientName
                  });
                }}
              >
                <SelectTrigger data-testid="select-recipient">
                  <SelectValue placeholder="Select recipient" />
                </SelectTrigger>
                <SelectContent>
                  {recipients?.map((r) => (
                    <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Or Enter Name</Label>
              <Input
                value={requestForm.recipientName}
                onChange={(e) => setRequestForm({ ...requestForm, recipientName: e.target.value })}
                placeholder="Recipient name"
                data-testid="input-recipient-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={requestForm.status} onValueChange={(value) => setRequestForm({ ...requestForm, status: value })}>
                <SelectTrigger data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tracking Number</Label>
              <Input
                value={requestForm.trackingNumber}
                onChange={(e) => setRequestForm({ ...requestForm, trackingNumber: e.target.value })}
                placeholder="Shipping tracking #"
                data-testid="input-tracking"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={requestForm.notes}
                onChange={(e) => setRequestForm({ ...requestForm, notes: e.target.value })}
                placeholder="e.g., Half of specimen sent"
                data-testid="input-notes"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Other Notes</Label>
              <Textarea
                value={requestForm.otherNotes}
                onChange={(e) => setRequestForm({ ...requestForm, otherNotes: e.target.value })}
                placeholder="Additional notes"
                data-testid="input-other-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSaveRequest}
              disabled={createRequestMutation.isPending || updateRequestMutation.isPending}
              data-testid="button-save-request"
            >
              {(createRequestMutation.isPending || updateRequestMutation.isPending) ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRecipientDialog} onOpenChange={setShowRecipientDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingRecipient ? "Edit Recipient" : "Add Recipient"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={recipientForm.name}
                  onChange={(e) => setRecipientForm({ ...recipientForm, name: e.target.value })}
                  placeholder="Full name"
                  data-testid="input-recipient-form-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Institution</Label>
                <Input
                  value={recipientForm.institution}
                  onChange={(e) => setRecipientForm({ ...recipientForm, institution: e.target.value })}
                  placeholder="University, museum, etc."
                  data-testid="input-institution"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={recipientForm.email}
                  onChange={(e) => setRecipientForm({ ...recipientForm, email: e.target.value })}
                  placeholder="email@example.com"
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={recipientForm.phone}
                  onChange={(e) => setRecipientForm({ ...recipientForm, phone: e.target.value })}
                  placeholder="Phone number"
                  data-testid="input-phone"
                />
              </div>
            </div>
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Shipping Address</h4>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Address Line 1</Label>
                  <Input
                    value={recipientForm.addressLine1}
                    onChange={(e) => setRecipientForm({ ...recipientForm, addressLine1: e.target.value })}
                    placeholder="Street address"
                    data-testid="input-address1"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Address Line 2</Label>
                  <Input
                    value={recipientForm.addressLine2}
                    onChange={(e) => setRecipientForm({ ...recipientForm, addressLine2: e.target.value })}
                    placeholder="Apt, suite, building, etc."
                    data-testid="input-address2"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      value={recipientForm.city}
                      onChange={(e) => setRecipientForm({ ...recipientForm, city: e.target.value })}
                      placeholder="City"
                      data-testid="input-city"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>State</Label>
                    <Input
                      value={recipientForm.state}
                      onChange={(e) => setRecipientForm({ ...recipientForm, state: e.target.value })}
                      placeholder="State"
                      data-testid="input-state"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Postal Code</Label>
                    <Input
                      value={recipientForm.postalCode}
                      onChange={(e) => setRecipientForm({ ...recipientForm, postalCode: e.target.value })}
                      placeholder="ZIP"
                      data-testid="input-postal"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Input
                    value={recipientForm.country}
                    onChange={(e) => setRecipientForm({ ...recipientForm, country: e.target.value })}
                    placeholder="Country"
                    data-testid="input-country"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={recipientForm.notes}
                onChange={(e) => setRecipientForm({ ...recipientForm, notes: e.target.value })}
                placeholder="Any additional notes about this recipient"
                data-testid="input-recipient-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecipientDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSaveRecipient}
              disabled={!recipientForm.name || createRecipientMutation.isPending || updateRecipientMutation.isPending}
              data-testid="button-save-recipient"
            >
              {(createRecipientMutation.isPending || updateRecipientMutation.isPending) ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
