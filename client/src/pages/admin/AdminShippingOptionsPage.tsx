import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, MapPin, Building2, Mail, Phone, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ShippingDestination } from "@shared/schema";

export default function AdminShippingOptionsPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingDestination, setEditingDestination] = useState<ShippingDestination | null>(null);
  const { toast } = useToast();

  const { data: destinations = [], isLoading } = useQuery<ShippingDestination[]>({
    queryKey: ["/api/shipping/destinations"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<ShippingDestination>) => {
      return apiRequest("POST", "/api/shipping/destinations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shipping/destinations"] });
      setIsAddDialogOpen(false);
      toast({ title: "Destination created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error creating destination", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<ShippingDestination> & { id: number }) => {
      return apiRequest("PATCH", `/api/shipping/destinations/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shipping/destinations"] });
      setEditingDestination(null);
      toast({ title: "Destination updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error updating destination", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/shipping/destinations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shipping/destinations"] });
      toast({ title: "Destination deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error deleting destination", description: error.message, variant: "destructive" });
    },
  });

  const toggleDefaultMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/shipping/destinations/${id}/set-default`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shipping/destinations"] });
      toast({ title: "Default destination updated" });
    },
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-myco-brown" data-testid="text-shipping-options-title">
          Shipping Options
        </h1>
        <p className="text-gray-600">Manage lab locations and shipping destinations for specimen transfers</p>
      </div>

      <Tabs defaultValue="destinations" className="space-y-6">
        <TabsList>
          <TabsTrigger value="destinations" data-testid="tab-destinations">Destinations</TabsTrigger>
        </TabsList>

        <TabsContent value="destinations">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Lab Destinations</CardTitle>
                <CardDescription>Configure lab locations for specimen shipments and transfers</CardDescription>
              </div>
              <Button 
                onClick={() => setIsAddDialogOpen(true)} 
                className="bg-myco-green hover:bg-myco-green/90"
                data-testid="button-add-destination"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Destination
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">Loading destinations...</div>
              ) : destinations.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No destinations configured. Add your first lab location to get started.
                </div>
              ) : (
                <div className="space-y-4">
                  {destinations.map((destination) => (
                    <div 
                      key={destination.id}
                      className="border rounded-lg p-4 hover:border-myco-green/50 transition-colors"
                      data-testid={`destination-card-${destination.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Building2 className="h-5 w-5 text-myco-brown" />
                            <h3 className="font-semibold text-lg">{destination.name}</h3>
                            <Badge variant="outline" className="text-xs">
                              {destination.shortCode}
                            </Badge>
                            {destination.isDefault && (
                              <Badge className="bg-myco-green text-white">Default</Badge>
                            )}
                            {!destination.isActive && (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </div>
                          
                          <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-600">
                            <div className="flex items-start gap-2">
                              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                              <div>
                                {destination.addressLine1 && <div>{destination.addressLine1}</div>}
                                {destination.addressLine2 && <div>{destination.addressLine2}</div>}
                                <div>
                                  {[destination.city, destination.stateProvince, destination.postalCode]
                                    .filter(Boolean)
                                    .join(", ")}
                                </div>
                                {destination.country && <div>{destination.country}</div>}
                              </div>
                            </div>
                            
                            <div className="space-y-1">
                              {destination.contactName && (
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">Contact:</span> {destination.contactName}
                                </div>
                              )}
                              {destination.contactEmail && (
                                <div className="flex items-center gap-2">
                                  <Mail className="h-4 w-4" />
                                  {destination.contactEmail}
                                </div>
                              )}
                              {destination.contactPhone && (
                                <div className="flex items-center gap-2">
                                  <Phone className="h-4 w-4" />
                                  {destination.contactPhone}
                                </div>
                              )}
                            </div>
                          </div>

                          {destination.handlingNotes && (
                            <div className="mt-2 text-sm text-gray-500 italic">
                              Notes: {destination.handlingNotes}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          {!destination.isDefault && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleDefaultMutation.mutate(destination.id)}
                              title="Set as default"
                              data-testid={`button-set-default-${destination.id}`}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingDestination(destination)}
                            data-testid={`button-edit-${destination.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this destination?")) {
                                deleteMutation.mutate(destination.id);
                              }
                            }}
                            data-testid={`button-delete-${destination.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DestinationDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSave={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
        title="Add New Destination"
      />

      <DestinationDialog
        isOpen={!!editingDestination}
        onClose={() => setEditingDestination(null)}
        onSave={(data) => updateMutation.mutate({ id: editingDestination!.id, ...data })}
        isPending={updateMutation.isPending}
        destination={editingDestination}
        title="Edit Destination"
      />
    </div>
  );
}

function DestinationDialog({
  isOpen,
  onClose,
  onSave,
  isPending,
  destination,
  title,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<ShippingDestination>) => void;
  isPending: boolean;
  destination?: ShippingDestination | null;
  title: string;
}) {
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateProvince, setStateProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("USA");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [handlingNotes, setHandlingNotes] = useState("");

  const resetForm = () => {
    if (destination) {
      setName(destination.name || "");
      setShortCode(destination.shortCode || "");
      setAddressLine1(destination.addressLine1 || "");
      setAddressLine2(destination.addressLine2 || "");
      setCity(destination.city || "");
      setStateProvince(destination.stateProvince || "");
      setPostalCode(destination.postalCode || "");
      setCountry(destination.country || "USA");
      setContactName(destination.contactName || "");
      setContactEmail(destination.contactEmail || "");
      setContactPhone(destination.contactPhone || "");
      setIsActive(destination.isActive ?? true);
      setHandlingNotes(destination.handlingNotes || "");
    } else {
      setName("");
      setShortCode("");
      setAddressLine1("");
      setAddressLine2("");
      setCity("");
      setStateProvince("");
      setPostalCode("");
      setCountry("USA");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setIsActive(true);
      setHandlingNotes("");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => { resetForm(); onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onOpenAutoFocus={() => resetForm()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Name *</Label>
              <Input 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mycota Lab - Main"
                data-testid="input-name"
              />
            </div>
            <div>
              <Label>Short Code *</Label>
              <Input 
                value={shortCode}
                onChange={(e) => setShortCode(e.target.value.toUpperCase())}
                placeholder="ML-MAIN"
                data-testid="input-short-code"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Address</h4>
            <div className="space-y-3">
              <div>
                <Label>Address Line 1</Label>
                <Input 
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="123 Lab Street"
                />
              </div>
              <div>
                <Label>Address Line 2</Label>
                <Input 
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  placeholder="Suite 100"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>City</Label>
                  <Input 
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ann Arbor"
                  />
                </div>
                <div>
                  <Label>State/Province</Label>
                  <Input 
                    value={stateProvince}
                    onChange={(e) => setStateProvince(e.target.value)}
                    placeholder="MI"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Postal Code</Label>
                  <Input 
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="48104"
                  />
                </div>
                <div>
                  <Label>Country</Label>
                  <Input 
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="USA"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Contact Information</h4>
            <div className="space-y-3">
              <div>
                <Label>Contact Name</Label>
                <Input 
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Lab Manager Name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <Input 
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="lab@mycota.com"
                    type="email"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input 
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Settings</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch 
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  data-testid="switch-active"
                />
              </div>
              <div>
                <Label>Handling Notes</Label>
                <Textarea 
                  value={handlingNotes}
                  onChange={(e) => setHandlingNotes(e.target.value)}
                  placeholder="Special instructions for specimens..."
                  rows={3}
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={() => {
              onSave({
                name,
                shortCode,
                addressLine1: addressLine1 || null,
                addressLine2: addressLine2 || null,
                city: city || null,
                stateProvince: stateProvince || null,
                postalCode: postalCode || null,
                country: country || null,
                contactName: contactName || null,
                contactEmail: contactEmail || null,
                contactPhone: contactPhone || null,
                isActive,
                handlingNotes: handlingNotes || null,
              });
            }}
            disabled={isPending || !name || !shortCode}
            className="bg-myco-green hover:bg-myco-green/90"
            data-testid="button-save-destination"
          >
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
