import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { PublicLayout } from "@/components/PublicLayout";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Package, Plus, Check, X, AlertCircle, Trash2, ArrowLeft, ArrowRight, Clipboard, CheckCircle2, Loader2 } from "lucide-react";
import type { Shipment, ShipmentBag, ShipmentSpecimen, ShipmentWithBags } from "@shared/schema";

type Step = "questionnaire" | "bags" | "complete";

interface QuestionnaireData {
  isNorthAmerica: boolean | null;
  isMycoMapProject: boolean | null;
  mycoMapProjectName: string;
  hasObservations: boolean | null;
  isCompletelyDried: boolean | null;
  isProperlyPackaged: boolean | null;
  hasSlimeMolds: string;
}

export default function ShipmentPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const { toast } = useToast();

  const routeShipmentId = params.id ? parseInt(params.id) : null;
  const [currentStep, setCurrentStep] = useState<Step>("questionnaire");
  const [currentShipmentId, setCurrentShipmentId] = useState<number | null>(routeShipmentId);
  const [selectedBagId, setSelectedBagId] = useState<number | null>(null);
  const [questionnaire, setQuestionnaire] = useState<QuestionnaireData>({
    isNorthAmerica: null,
    isMycoMapProject: null,
    mycoMapProjectName: "",
    hasObservations: null,
    isCompletelyDried: null,
    isProperlyPackaged: null,
    hasSlimeMolds: "",
  });

  const [newObservationId, setNewObservationId] = useState("");
  const [newObservationPlatform, setNewObservationPlatform] = useState<"iNaturalist" | "Mushroom Observer">("iNaturalist");
  const [isValidating, setIsValidating] = useState(false);
  const [labAddress, setLabAddress] = useState<{ name: string; street: string; city: string; state: string; zip: string } | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [isAddingPastedList, setIsAddingPastedList] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/api/login";
    }
  }, [authLoading, isAuthenticated]);

  const { data: currentShipment, refetch: refetchShipment, isLoading: shipmentLoading } = useQuery<ShipmentWithBags>({
    queryKey: ["shipment-detail", currentShipmentId],
    queryFn: async () => {
      const res = await fetch(`/api/shipments/${currentShipmentId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch shipment");
      return res.json();
    },
    enabled: !!currentShipmentId,
  });

  const isReadOnly = currentShipment?.status === "submitted";

  useEffect(() => {
    if (currentShipment && !initialized) {
      setQuestionnaire({
        isNorthAmerica: currentShipment.isNorthAmerica ?? null,
        isMycoMapProject: currentShipment.isMycoMapProject ?? null,
        mycoMapProjectName: currentShipment.mycoMapProjectName || "",
        hasObservations: currentShipment.hasObservations ?? null,
        isCompletelyDried: currentShipment.isCompletelyDried ?? null,
        isProperlyPackaged: currentShipment.isProperlyPackaged ?? null,
        hasSlimeMolds: currentShipment.hasSlimeMolds || "",
      });
      if (currentShipment.bags && currentShipment.bags.length > 0) {
        setCurrentStep("bags");
        setSelectedBagId(currentShipment.bags[0].id);
      }
      setInitialized(true);
    }
  }, [currentShipment, initialized]);

  const createShipmentMutation = useMutation({
    mutationFn: async (data: Partial<Shipment>) => {
      const res = await apiRequest("POST", "/api/shipments", data);
      return res.json();
    },
    onSuccess: (data) => {
      setCurrentShipmentId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/shipments"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create shipment", variant: "destructive" });
    },
  });

  const updateShipmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Shipment> }) => {
      const res = await apiRequest("PATCH", `/api/shipments/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipment-detail", currentShipmentId] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update shipment", variant: "destructive" });
    },
  });

  const createBagMutation = useMutation({
    mutationFn: async (shipmentId: number) => {
      const res = await apiRequest("POST", `/api/shipments/${shipmentId}/bags`, {});
      return res.json();
    },
    onSuccess: (data) => {
      setSelectedBagId(data.id);
      refetchShipment();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create bag", variant: "destructive" });
    },
  });

  const updateBagMutation = useMutation({
    mutationFn: async ({ bagId, data }: { bagId: number; data: Partial<ShipmentBag> }) => {
      const res = await apiRequest("PATCH", `/api/shipments/bags/${bagId}`, data);
      return res.json();
    },
    onSuccess: () => {
      refetchShipment();
    },
  });

  const deleteBagMutation = useMutation({
    mutationFn: async (bagId: number) => {
      const res = await apiRequest("DELETE", `/api/shipments/bags/${bagId}`);
      return res.json();
    },
    onSuccess: () => {
      setSelectedBagId(null);
      refetchShipment();
    },
  });

  const addSpecimenMutation = useMutation({
    mutationFn: async ({ bagId, data }: { bagId: number; data: { observationId: string; platform: string } }) => {
      const res = await apiRequest("POST", `/api/shipments/bags/${bagId}/specimens`, data);
      return res.json();
    },
    onSuccess: () => {
      setNewObservationId("");
      refetchShipment();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add specimen", variant: "destructive" });
    },
  });

  const deleteSpecimenMutation = useMutation({
    mutationFn: async (specimenId: number) => {
      const res = await apiRequest("DELETE", `/api/shipments/specimens/${specimenId}`);
      return res.json();
    },
    onSuccess: () => {
      refetchShipment();
    },
  });

  const validateSpecimensMutation = useMutation({
    mutationFn: async (bagId: number) => {
      const res = await apiRequest("POST", `/api/shipments/bags/${bagId}/validate`);
      return res.json();
    },
    onSuccess: () => {
      refetchShipment();
      toast({ title: "Success", description: "Specimens validated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Validation failed", variant: "destructive" });
    },
  });

  const overrideSpecimenMutation = useMutation({
    mutationFn: async (specimenId: number) => {
      const res = await apiRequest("POST", `/api/specimens/${specimenId}/override`);
      return res.json();
    },
    onSuccess: () => {
      refetchShipment();
      toast({ title: "Success", description: "Specimen confirmed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to confirm specimen", variant: "destructive" });
    },
  });

  const submitShipmentMutation = useMutation({
    mutationFn: async (shipmentId: number) => {
      const res = await apiRequest("POST", `/api/shipments/${shipmentId}/submit`);
      return res.json();
    },
    onSuccess: (data) => {
      setLabAddress(data.labAddress);
      setCurrentStep("complete");
      queryClient.invalidateQueries({ queryKey: ["/api/shipments"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit shipment", variant: "destructive" });
    },
  });

  const handleContinueFromQuestionnaire = async () => {
    if (!currentShipmentId) {
      const shipment = await createShipmentMutation.mutateAsync(questionnaire as any);
      setCurrentShipmentId(shipment.id);
      await createBagMutation.mutateAsync(shipment.id);
    } else {
      await updateShipmentMutation.mutateAsync({
        id: currentShipmentId,
        data: questionnaire as any,
      });
    }
    setCurrentStep("bags");
  };

  const handleSaveForLater = async () => {
    if (!currentShipmentId) {
      await createShipmentMutation.mutateAsync(questionnaire as any);
    } else {
      await updateShipmentMutation.mutateAsync({
        id: currentShipmentId,
        data: questionnaire as any,
      });
    }
    toast({ title: "Saved", description: "Shipment saved as draft" });
    setLocation("/profile?tab=specimens");
  };

  const handleAddSpecimen = () => {
    if (!selectedBagId || !newObservationId.trim()) return;
    addSpecimenMutation.mutate({
      bagId: selectedBagId,
      data: { observationId: newObservationId.trim(), platform: newObservationPlatform },
    });
  };

  const handleOpenPasteDialog = () => {
    setPastedText("");
    setPasteDialogOpen(true);
  };

  const handleAddPastedObservations = async () => {
    if (!selectedBagId || !pastedText.trim()) return;
    setIsAddingPastedList(true);
    try {
      const lines = pastedText.split(/[\n,]/).map(l => l.trim()).filter(l => l);
      for (const line of lines) {
        await addSpecimenMutation.mutateAsync({
          bagId: selectedBagId,
          data: { observationId: line, platform: newObservationPlatform },
        });
      }
      toast({ title: "Success", description: `Added ${lines.length} observations` });
      setPasteDialogOpen(false);
      setPastedText("");
    } catch (error) {
      toast({ title: "Error", description: "Failed to add observations", variant: "destructive" });
    } finally {
      setIsAddingPastedList(false);
    }
  };

  const pastedLines = pastedText.split(/[\n,]/).map(l => l.trim()).filter(l => l);

  const handleValidate = async () => {
    if (!selectedBagId) return;
    setIsValidating(true);
    try {
      await validateSpecimensMutation.mutateAsync(selectedBagId);
    } finally {
      setIsValidating(false);
    }
  };

  const handleGetAddress = async () => {
    if (!currentShipmentId) return;
    await submitShipmentMutation.mutateAsync(currentShipmentId);
  };

  const selectedBag = currentShipment?.bags?.find(b => b.id === selectedBagId);
  const hasValidatedBag = currentShipment?.bags?.some(b => b.specimens?.some(s => s.isValidated));
  const hasInvalidSpecimens = currentShipment?.bags?.some(b => 
    b.specimens?.some(s => 
      s.isValidated && (s.validationStatus === "invalid" || s.validationStatus === "slime_mold")
    )
  );

  if (authLoading) {
    return (
      <PublicLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-myco-green" />
        </div>
      </PublicLayout>
    );
  }

  if (!user) return null;

  return (
    <PublicLayout>
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" onClick={() => setLocation("/profile?tab=specimens")} data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Profile
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-6 w-6 text-myco-green" />
                {isReadOnly ? `Shipment #${currentShipmentId}` : "Create New Shipment"}
              </CardTitle>
              <CardDescription>
                {isReadOnly 
                  ? "View your submitted shipment details" 
                  : (
                    <>
                      {currentStep === "questionnaire" && "Answer a few questions about your specimens"}
                      {currentStep === "bags" && "Add specimens to your shipment bags"}
                      {currentStep === "complete" && "Shipment submitted successfully"}
                    </>
                  )
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currentStep === "questionnaire" && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label>Are your collections from North America?</Label>
                    <RadioGroup
                      value={questionnaire.isNorthAmerica === null ? "" : questionnaire.isNorthAmerica ? "yes" : "no"}
                      onValueChange={(v) => setQuestionnaire({ ...questionnaire, isNorthAmerica: v === "yes" })}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="na-yes" />
                        <Label htmlFor="na-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="na-no" />
                        <Label htmlFor="na-no">No</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <Label>Are your collections a part of a MycoMap Network Project?</Label>
                    <RadioGroup
                      value={questionnaire.isMycoMapProject === null ? "" : questionnaire.isMycoMapProject ? "yes" : "no"}
                      onValueChange={(v) => setQuestionnaire({ ...questionnaire, isMycoMapProject: v === "yes" })}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="proj-yes" />
                        <Label htmlFor="proj-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="proj-no" />
                        <Label htmlFor="proj-no">No</Label>
                      </div>
                    </RadioGroup>
                    {questionnaire.isMycoMapProject && (
                      <Input
                        placeholder="Project name"
                        value={questionnaire.mycoMapProjectName}
                        onChange={(e) => setQuestionnaire({ ...questionnaire, mycoMapProjectName: e.target.value })}
                        data-testid="input-project-name"
                      />
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <Label>Are your collections all associated with an iNaturalist or Mushroom Observer observation?</Label>
                    <RadioGroup
                      value={questionnaire.hasObservations === null ? "" : questionnaire.hasObservations ? "yes" : "no"}
                      onValueChange={(v) => setQuestionnaire({ ...questionnaire, hasObservations: v === "yes" })}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="obs-yes" />
                        <Label htmlFor="obs-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="obs-no" />
                        <Label htmlFor="obs-no">No</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <Label>Are all your collections completely dried? They should be "cracker dry" with no flex in them.</Label>
                    <RadioGroup
                      value={questionnaire.isCompletelyDried === null ? "" : questionnaire.isCompletelyDried ? "yes" : "no"}
                      onValueChange={(v) => setQuestionnaire({ ...questionnaire, isCompletelyDried: v === "yes" })}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="dry-yes" />
                        <Label htmlFor="dry-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="dry-no" />
                        <Label htmlFor="dry-no">No</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <Label>Are your specimens in snack-size Ziplock bags, with a printed QR code visible through the bag?</Label>
                    <RadioGroup
                      value={questionnaire.isProperlyPackaged === null ? "" : questionnaire.isProperlyPackaged ? "yes" : "no"}
                      onValueChange={(v) => setQuestionnaire({ ...questionnaire, isProperlyPackaged: v === "yes" })}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="pkg-yes" />
                        <Label htmlFor="pkg-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="pkg-no" />
                        <Label htmlFor="pkg-no">No</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <Label>Are you sending any slime molds?</Label>
                    <RadioGroup
                      value={questionnaire.hasSlimeMolds}
                      onValueChange={(v) => setQuestionnaire({ ...questionnaire, hasSlimeMolds: v })}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes_separate" id="slime-yes" />
                        <Label htmlFor="slime-yes">Yes, I am submitting slime molds, and they are packaged separately from the fungi</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="not_applicable" id="slime-no" />
                        <Label htmlFor="slime-no">Not applicable, I am not submitting slime molds</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <Separator />

                  <div className="flex gap-4">
                    <Button variant="outline" onClick={handleSaveForLater} data-testid="button-save-later">
                      Save for Later
                    </Button>
                    {(() => {
                      const isQuestionnaireComplete = 
                        questionnaire.isNorthAmerica !== null &&
                        questionnaire.isMycoMapProject !== null &&
                        (!questionnaire.isMycoMapProject || questionnaire.mycoMapProjectName.trim() !== "") &&
                        questionnaire.hasObservations !== null &&
                        questionnaire.isCompletelyDried !== null &&
                        questionnaire.isProperlyPackaged !== null &&
                        questionnaire.hasSlimeMolds !== "";
                      
                      return (
                        <Button
                          className={isQuestionnaireComplete ? "bg-myco-green hover:bg-myco-green/90" : ""}
                          variant={isQuestionnaireComplete ? "default" : "secondary"}
                          onClick={handleContinueFromQuestionnaire}
                          disabled={!isQuestionnaireComplete || createShipmentMutation.isPending}
                          data-testid="button-continue"
                        >
                          {createShipmentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Continue
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      );
                    })()}
                  </div>
                </div>
              )}

              {currentStep === "bags" && currentShipment && (
                <div className="space-y-6">
                  {isReadOnly && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-blue-600" />
                        <span className="font-medium">This shipment has been submitted</span>
                      </div>
                      <p className="mt-1 text-blue-700">
                        Submitted on {currentShipment.submittedAt ? new Date(currentShipment.submittedAt).toLocaleDateString() : 'N/A'}
                        {currentShipment.trackingNumber && <> • Tracking: <span className="font-mono">{currentShipment.trackingNumber}</span></>}
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 items-center">
                    {currentShipment.bags?.map((bag) => (
                      <Button
                        key={bag.id}
                        variant={selectedBagId === bag.id ? "default" : "outline"}
                        className={selectedBagId === bag.id ? "bg-myco-green hover:bg-myco-green/90" : ""}
                        onClick={() => setSelectedBagId(bag.id)}
                        data-testid={`button-bag-${bag.id}`}
                      >
                        {bag.name}
                        {bag.specimens && bag.specimens.length > 0 && (
                          <Badge variant="secondary" className="ml-2">{bag.specimens.length}</Badge>
                        )}
                      </Button>
                    ))}
                    {!isReadOnly && (
                      <Button
                        variant="outline"
                        onClick={() => createBagMutation.mutate(currentShipmentId!)}
                        disabled={createBagMutation.isPending}
                        data-testid="button-create-bag"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Create New Bag
                      </Button>
                    )}
                  </div>

                  {selectedBag && (
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          {isReadOnly ? (
                            <h3 className="text-lg font-semibold">{selectedBag.name}</h3>
                          ) : (
                            <>
                              <Input
                                value={selectedBag.name}
                                onChange={(e) => updateBagMutation.mutate({ bagId: selectedBag.id, data: { name: e.target.value } })}
                                className="text-lg font-semibold w-48"
                                data-testid="input-bag-name"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => deleteBagMutation.mutate(selectedBag.id)}
                                data-testid="button-delete-bag"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {!isReadOnly && (
                          <div className="flex gap-2">
                            <Select
                              value={newObservationPlatform}
                              onValueChange={(v) => setNewObservationPlatform(v as any)}
                            >
                              <SelectTrigger className="w-48" data-testid="select-platform">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="iNaturalist">iNaturalist</SelectItem>
                                <SelectItem value="Mushroom Observer">Mushroom Observer</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder="Observation ID or URL"
                              value={newObservationId}
                              onChange={(e) => setNewObservationId(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && handleAddSpecimen()}
                              className="flex-1"
                              data-testid="input-observation-id"
                            />
                            <Button onClick={handleAddSpecimen} disabled={addSpecimenMutation.isPending} data-testid="button-add-specimen">
                              <Plus className="h-4 w-4 mr-1" />
                              Add
                            </Button>
                            <Button variant="outline" onClick={handleOpenPasteDialog} data-testid="button-paste-list">
                              <Clipboard className="h-4 w-4 mr-1" />
                              Paste List
                            </Button>
                          </div>
                        )}

                        {selectedBag.specimens && selectedBag.specimens.length > 0 && (
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left">Status</th>
                                  <th className="px-3 py-2 text-left">Platform</th>
                                  <th className="px-3 py-2 text-left">Observation</th>
                                  <th className="px-3 py-2 text-left">Species</th>
                                  <th className="px-3 py-2 text-left">Voucher Number(s)</th>
                                  <th className="px-3 py-2 text-left">Date</th>
                                  <th className="px-3 py-2 text-left">User</th>
                                  {!isReadOnly && <th className="px-3 py-2"></th>}
                                </tr>
                              </thead>
                              <tbody>
                                {selectedBag.specimens.map((specimen) => (
                                  <>
                                    <tr key={specimen.id} className="border-t">
                                      <td className="px-3 py-2">
                                        {isReadOnly ? (
                                          <Badge 
                                            variant="outline" 
                                            className={
                                              specimen.processingStatus === "submitted" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                              specimen.processingStatus === "received" ? "bg-purple-50 text-purple-700 border-purple-200" :
                                              specimen.processingStatus === "processing" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                                              specimen.processingStatus === "sequenced" ? "bg-green-50 text-green-700 border-green-200" :
                                              specimen.processingStatus === "complete" ? "bg-green-100 text-green-800 border-green-300" :
                                              "bg-gray-50 text-gray-600 border-gray-200"
                                            }
                                          >
                                            {specimen.processingStatus === "submitted" ? "Submitted" :
                                             specimen.processingStatus === "received" ? "Received" :
                                             specimen.processingStatus === "processing" ? "Processing" :
                                             specimen.processingStatus === "sequenced" ? "Sequenced" :
                                             specimen.processingStatus === "complete" ? "Complete" :
                                             "Pending"}
                                          </Badge>
                                        ) : !specimen.isValidated ? (
                                          <span className="text-gray-400">-</span>
                                        ) : specimen.validationStatus === "valid" ? (
                                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                                        ) : specimen.validationStatus === "invalid" || specimen.validationStatus === "slime_mold" ? (
                                          <X className="h-5 w-5 text-red-600" />
                                        ) : (
                                          <AlertCircle className="h-5 w-5 text-yellow-600" />
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-xs">{specimen.platform}</td>
                                      <td className="px-3 py-2 font-mono text-xs">
                                        {(() => {
                                          const id = specimen.observationId || '';
                                          const inatMatch = id.match(/inaturalist\.org\/observations\/(\d+)/);
                                          if (inatMatch) return inatMatch[1];
                                          const moMatch = id.match(/mushroomobserver\.org\/(\d+)/);
                                          if (moMatch) return moMatch[1];
                                          return id;
                                        })()}
                                      </td>
                                      <td className="px-3 py-2 italic">{specimen.scientificName || "-"}</td>
                                      <td className="px-3 py-2 text-xs font-mono">{specimen.voucherNumber || "-"}</td>
                                      <td className="px-3 py-2 text-xs">{specimen.observedDate || "-"}</td>
                                      <td className="px-3 py-2 text-xs">{specimen.username || "-"}</td>
                                      {!isReadOnly && (
                                        <td className="px-3 py-2">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-600"
                                            onClick={() => deleteSpecimenMutation.mutate(specimen.id)}
                                            data-testid={`button-delete-specimen-${specimen.id}`}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </td>
                                      )}
                                    </tr>
                                    {!isReadOnly && specimen.isValidated && (specimen.validationStatus === "invalid" || specimen.validationStatus === "slime_mold") && (
                                      <tr key={`${specimen.id}-message`} className="bg-red-50">
                                        <td colSpan={8} className="px-3 py-2">
                                          <div className="flex items-center justify-between">
                                            <span className="text-red-600 text-sm">
                                              {specimen.validationStatus === "slime_mold" 
                                                ? "This observation is a slime mold and should be in its own bag" 
                                                : "This observation is not fungal"}
                                            </span>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                              onClick={() => overrideSpecimenMutation.mutate(specimen.id)}
                                              disabled={overrideSpecimenMutation.isPending}
                                              data-testid={`button-override-${specimen.id}`}
                                            >
                                              This is ok.
                                            </Button>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {!isReadOnly && (
                          <div className="flex gap-4">
                            <Button variant="outline" onClick={handleSaveForLater} data-testid="button-save-later-bags">
                              Save for Later
                            </Button>
                            <Button
                              onClick={handleValidate}
                              disabled={isValidating || !selectedBag.specimens?.length}
                              data-testid="button-validate"
                            >
                              {isValidating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                              Validate Specimens
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  <Separator />

                  <div className="flex gap-4 justify-between">
                    {isReadOnly ? (
                      <Button variant="outline" onClick={() => setLocation("/profile?tab=specimens")} data-testid="button-back-profile">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Profile
                      </Button>
                    ) : (
                      <>
                        <Button variant="outline" onClick={() => setCurrentStep("questionnaire")} data-testid="button-back-questionnaire">
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          Back to Questionnaire
                        </Button>
                        <Button
                          className="bg-myco-green hover:bg-myco-green/90"
                          onClick={handleGetAddress}
                          disabled={!hasValidatedBag || hasInvalidSpecimens || submitShipmentMutation.isPending}
                          data-testid="button-get-address"
                        >
                          {submitShipmentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Get Address for Submission
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {currentStep === "complete" && labAddress && (
                <div className="text-center space-y-6">
                  <CheckCircle2 className="h-16 w-16 text-myco-green mx-auto" />
                  <h3 className="text-xl font-semibold text-myco-brown">Shipment Ready!</h3>
                  <p className="text-gray-600">Please send your specimens to:</p>
                  
                  <Card className="max-w-xs mx-auto">
                    <CardContent className="pt-6 text-left">
                      <p className="font-semibold">{labAddress.name}</p>
                      <p>{labAddress.street}</p>
                      <p>{labAddress.city}, {labAddress.state} {labAddress.zip}</p>
                    </CardContent>
                  </Card>

                  <Button
                    className="bg-myco-green hover:bg-myco-green/90"
                    onClick={() => setLocation("/profile?tab=specimens")}
                    data-testid="button-back-to-profile"
                  >
                    Back to Shipments
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={pasteDialogOpen} onOpenChange={setPasteDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Paste Observation List</DialogTitle>
            <DialogDescription>
              Paste your observation IDs or URLs below, one per line or separated by commas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Paste observation IDs or URLs here..."
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={8}
              className="font-mono text-sm"
              data-testid="textarea-paste-observations"
            />
            {pastedLines.length > 0 && (
              <div className="text-sm text-gray-600">
                <strong>{pastedLines.length}</strong> observation{pastedLines.length !== 1 ? 's' : ''} detected
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasteDialogOpen(false)} data-testid="button-cancel-paste">
              Cancel
            </Button>
            <Button
              onClick={handleAddPastedObservations}
              disabled={pastedLines.length === 0 || isAddingPastedList}
              className="bg-myco-green hover:bg-myco-green/90"
              data-testid="button-add-observations"
            >
              {isAddingPastedList && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add {pastedLines.length} Observation{pastedLines.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
}
