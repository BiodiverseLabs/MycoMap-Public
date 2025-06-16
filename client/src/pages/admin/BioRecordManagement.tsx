import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Search, Archive, History, CheckCircle, Clock, AlertCircle, Coins, ExternalLink, Download, Image as ImageIcon, Palette } from "lucide-react";
import { format } from "date-fns";

interface Biorecord {
  id: number;
  observationId: string;
  scientificName: string;
  commonName?: string;
  observer?: string;
  collector?: string;
  state?: string;
  validatedAt: string;
  validatedBy?: string;
  validationVersion: string;
  originalObservationId?: number;
  // External platform data
  inatScientificName?: string;
  inatObserver?: string;
  moScientificName?: string;
  moObserver?: string;
  mycoportalScientificName?: string;
  mycoportalRecordedBy?: string;
  // NFT minting data
  nftMinted?: boolean;
  nftTokenId?: string;
  nftContractAddress?: string;
  nftBlockchainNetwork?: string;
  nftMetadataUri?: string;
  nftImageUri?: string;
  nftMintedAt?: string;
  nftMintedBy?: string;
}

interface ValidationObservation {
  id: number;
  observationId: string;
  scientificName: string;
  commonName?: string;
  observer?: string;
  state?: string;
  hasInatData: boolean;
  hasMoData: boolean;
  hasMycoportalData: boolean;
  inatSyncStatus?: string;
  moSyncStatus?: string;
  mycoportalSyncStatus?: string;
  blastFilesDownloaded: boolean;
  traceFilesDownloaded: boolean;
  inatApiSaved: boolean;
}

export default function BioRecordManagement() {
  const [selectedObservationId, setSelectedObservationId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch biorecords
  const { data: biorecords = [], isLoading: biorecordsLoading } = useQuery({
    queryKey: ["/api/biorecords"],
    queryFn: async () => {
      const response = await fetch("/api/biorecords?limit=100");
      if (!response.ok) throw new Error("Failed to fetch biorecords");
      return response.json();
    }
  });

  // Fetch validated observations (potential candidates for biorecord creation)
  const { data: validatedObservations = [], isLoading: validationLoading } = useQuery({
    queryKey: ["/api/observations/validation"],
    queryFn: async () => {
      const response = await fetch("/api/observations/validation?limit=100&fullyValidated=true");
      if (!response.ok) throw new Error("Failed to fetch validated observations");
      return response.json();
    }
  });

  // Create biorecord mutation
  const createBiorecordMutation = useMutation({
    mutationFn: async (observationId: string) => {
      const response = await fetch(`/api/biorecords/create/${observationId}`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create biorecord");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Biorecord Created",
        description: `Historical snapshot created for observation ${data.biorecord.observationId}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/biorecords"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Batch create biorecords mutation
  const batchCreateMutation = useMutation({
    mutationFn: async (observationIds: string[]) => {
      const response = await fetch("/api/biorecords/batch-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observationIds }),
      });
      if (!response.ok) throw new Error("Failed to create batch biorecords");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Batch Creation Complete",
        description: `${data.message}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/biorecords"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // NFT minting mutations
  const mintNftMutation = useMutation({
    mutationFn: async (biorecordId: number) => {
      const response = await fetch(`/api/biorecords/${biorecordId}/mock-mint`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to mint NFT");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "NFT Minted Successfully",
        description: `Token ${data.nftData.tokenId} created on ${data.nftData.blockchainNetwork}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/biorecords"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Minting Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Get biorecord history for an observation
  const { data: biorecordHistory = [] } = useQuery({
    queryKey: ["/api/biorecords", selectedObservationId, "history"],
    queryFn: async () => {
      if (!selectedObservationId) return [];
      const response = await fetch(`/api/biorecords/${selectedObservationId}/history`);
      if (!response.ok) throw new Error("Failed to fetch biorecord history");
      return response.json();
    },
    enabled: !!selectedObservationId,
  });

  const filteredBiorecords = biorecords.filter((record: Biorecord) =>
    record.scientificName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.observationId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (record.observer && record.observer.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (record.state && record.state.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredValidatedObservations = validatedObservations.filter((obs: ValidationObservation) =>
    obs.scientificName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    obs.observationId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (obs.observer && obs.observer.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleCreateBiorecord = (observationId: string) => {
    createBiorecordMutation.mutate(observationId);
  };

  const handleBatchCreate = () => {
    const observationIds = filteredValidatedObservations.map((obs: ValidationObservation) => obs.observationId);
    if (observationIds.length === 0) {
      toast({
        title: "No Records",
        description: "No validated observations available for biorecord creation",
        variant: "destructive",
      });
      return;
    }
    batchCreateMutation.mutate(observationIds);
  };

  const getValidationStatusBadge = (observation: ValidationObservation) => {
    const hasSpeciesLevel = observation.scientificName && observation.scientificName.split(' ').length >= 2;
    const hasRequiredFiles = observation.blastFilesDownloaded && observation.traceFilesDownloaded && observation.inatApiSaved;
    const hasSync = observation.inatSyncStatus === 'success' || observation.moSyncStatus === 'success' || observation.mycoportalSyncStatus === 'success';
    
    if (hasSpeciesLevel && hasRequiredFiles && hasSync) {
      return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Fully Validated</Badge>;
    }
    return <Badge variant="secondary"><AlertCircle className="w-3 h-3 mr-1" />Incomplete</Badge>;
  };

// BioRecord Image Generator Component
function BioRecordImageGenerator() {
  const [observationId, setObservationId] = useState("");
  const [platform, setPlatform] = useState<"inat" | "mo" | "mycoportal">("inat");
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRefs = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];
  const { toast } = useToast();

  // Fetch observation data from selected platform
  const fetchObservationData = async (id: string, platformType: string) => {
    try {
      setIsGenerating(true);
      
      let apiUrl = "";
      switch (platformType) {
        case "inat":
          apiUrl = `https://api.inaturalist.org/v1/observations/${id}`;
          break;
        case "mo":
          apiUrl = `/api/mo-lookup/${id}`;
          break;
        case "mycoportal":
          apiUrl = `/api/mycoportal-lookup/${id}`;
          break;
      }

      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error(`Failed to fetch ${platformType} data`);
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching observation data:", error);
      toast({
        title: "Error",
        description: `Failed to fetch observation data from ${platform}`,
        variant: "destructive",
      });
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  // Generate playing card designs
  const generatePlayingCards = async () => {
    if (!observationId.trim()) {
      toast({
        title: "Error",
        description: "Please enter an observation ID",
        variant: "destructive",
      });
      return;
    }

    const observationData = await fetchObservationData(observationId, platform);
    if (!observationData) return;

    // Extract data based on platform
    let cardData: any = {};
    
    if (platform === "inat" && observationData.results?.[0]) {
      const obs = observationData.results[0];
      cardData = {
        scientificName: obs.taxon?.name || obs.species_guess || "Unknown species",
        commonName: obs.taxon?.preferred_common_name,
        location: obs.place_guess || "Unknown location",
        state: obs.place_ids ? "Unknown state" : undefined,
        country: "Unknown country",
        imageUrl: obs.photos?.[0]?.url?.replace("square", "medium") || obs.observation_photos?.[0]?.photo?.url,
        observer: obs.user?.name || obs.user?.login,
        observedOn: obs.observed_on,
        platform: "iNaturalist"
      };
    }

    // Generate three different card designs
    generateCardDesign1(cardData, 0);
    generateCardDesign2(cardData, 1);
    generateCardDesign3(cardData, 2);
  };

  // Card Design 1: Classic Scientific Card
  const generateCardDesign1 = (data: any, canvasIndex: number) => {
    const canvas = canvasRefs[canvasIndex].current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 400;
    canvas.height = 600;

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 600);
    gradient.addColorStop(0, '#1a365d');
    gradient.addColorStop(1, '#2d3748');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 400, 600);

    // Border
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 380, 580);

    // Title area
    ctx.fillStyle = '#2b6cb0';
    ctx.fillRect(20, 20, 360, 60);
    
    // Scientific name
    ctx.fillStyle = 'white';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    const scientificName = data.scientificName || 'Unknown Species';
    ctx.fillText(scientificName, 200, 45);
    
    // Common name
    if (data.commonName) {
      ctx.font = '14px Arial';
      ctx.fillText(data.commonName, 200, 65);
    }

    // Image placeholder
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(50, 100, 300, 250);
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.fillText('Observation Image', 200, 230);

    // Details section
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    
    let yPosition = 380;
    ctx.fillText(`Location: ${data.location || 'Unknown'}`, 30, yPosition);
    yPosition += 25;
    if (data.state) {
      ctx.fillText(`State: ${data.state}`, 30, yPosition);
      yPosition += 25;
    }
    ctx.fillText(`Observer: ${data.observer || 'Unknown'}`, 30, yPosition);
    yPosition += 25;
    ctx.fillText(`Platform: ${data.platform}`, 30, yPosition);
    yPosition += 25;
    if (data.observedOn) {
      ctx.fillText(`Date: ${data.observedOn}`, 30, yPosition);
    }

    // Footer
    ctx.fillStyle = '#2b6cb0';
    ctx.fillRect(20, 540, 360, 40);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('BioRecord Trading Card', 200, 565);
  };

  // Card Design 2: Modern Minimal
  const generateCardDesign2 = (data: any, canvasIndex: number) => {
    const canvas = canvasRefs[canvasIndex].current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 400;
    canvas.height = 600;

    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 400, 600);

    // Colored accent bar
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, 0, 400, 20);

    // Scientific name
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    const scientificName = data.scientificName || 'Unknown Species';
    ctx.fillText(scientificName, 200, 60);

    // Common name
    if (data.commonName) {
      ctx.fillStyle = '#6b7280';
      ctx.font = 'italic 16px Arial';
      ctx.fillText(data.commonName, 200, 85);
    }

    // Image area
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(50, 110, 300, 250);
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(51, 111, 298, 248);
    
    ctx.fillStyle = '#9ca3af';
    ctx.font = '14px Arial';
    ctx.fillText('Observation Photo', 200, 240);

    // Info cards
    const infoY = 390;
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(30, infoY, 340, 120);
    ctx.strokeStyle = '#e5e7eb';
    ctx.strokeRect(30, infoY, 340, 120);

    ctx.fillStyle = '#374151';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    
    let y = infoY + 25;
    ctx.fillText(`📍 ${data.location || 'Unknown location'}`, 50, y);
    y += 20;
    if (data.state) {
      ctx.fillText(`🗺️ ${data.state}, ${data.country || 'Unknown country'}`, 50, y);
      y += 20;
    }
    ctx.fillText(`👤 ${data.observer || 'Unknown observer'}`, 50, y);
    y += 20;
    ctx.fillText(`🔬 ${data.platform}`, 50, y);
    y += 20;
    if (data.observedOn) {
      ctx.fillText(`📅 ${data.observedOn}`, 50, y);
    }

    // Bottom accent
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, 580, 400, 20);
  };

  // Card Design 3: Vintage Style
  const generateCardDesign3 = (data: any, canvasIndex: number) => {
    const canvas = canvasRefs[canvasIndex].current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 400;
    canvas.height = 600;

    // Vintage background
    ctx.fillStyle = '#fef7ed';
    ctx.fillRect(0, 0, 400, 600);

    // Ornate border
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 4;
    ctx.strokeRect(15, 15, 370, 570);
    
    ctx.lineWidth = 2;
    ctx.strokeRect(25, 25, 350, 550);

    // Header banner
    ctx.fillStyle = '#92400e';
    ctx.fillRect(40, 40, 320, 50);

    // Title
    ctx.fillStyle = '#fef7ed';
    ctx.font = 'bold 18px serif';
    ctx.textAlign = 'center';
    ctx.fillText('SPECIMEN RECORD', 200, 70);

    // Scientific name in decorative box
    ctx.fillStyle = '#451a03';
    ctx.font = 'italic 20px serif';
    const scientificName = data.scientificName || 'Unknown Species';
    ctx.fillText(scientificName, 200, 130);

    // Common name
    if (data.commonName) {
      ctx.font = '14px serif';
      ctx.fillText(`"${data.commonName}"`, 200, 155);
    }

    // Image frame
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 6;
    ctx.strokeRect(60, 180, 280, 200);
    ctx.fillStyle = '#f4f4f5';
    ctx.fillRect(66, 186, 268, 188);
    
    ctx.fillStyle = '#71717a';
    ctx.font = '12px serif';
    ctx.fillText('Specimen Photograph', 200, 285);

    // Information panel
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(50, 410, 300, 130);
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 2;
    ctx.strokeRect(50, 410, 300, 130);

    ctx.fillStyle = '#451a03';
    ctx.font = 'bold 12px serif';
    ctx.textAlign = 'left';
    
    let yPos = 435;
    ctx.fillText(`Collection Site: ${data.location || 'Unknown'}`, 70, yPos);
    yPos += 20;
    if (data.state) {
      ctx.fillText(`Region: ${data.state}, ${data.country || 'Unknown'}`, 70, yPos);
      yPos += 20;
    }
    ctx.fillText(`Collector: ${data.observer || 'Unknown'}`, 70, yPos);
    yPos += 20;
    ctx.fillText(`Source: ${data.platform}`, 70, yPos);
    yPos += 20;
    if (data.observedOn) {
      ctx.fillText(`Date: ${data.observedOn}`, 70, yPos);
    }

    // Footer seal
    ctx.fillStyle = '#92400e';
    ctx.beginPath();
    ctx.arc(200, 565, 15, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.fillStyle = '#fef7ed';
    ctx.font = 'bold 10px serif';
    ctx.textAlign = 'center';
    ctx.fillText('BR', 200, 570);
  };

  // Download card as image
  const downloadCard = (canvasIndex: number, designName: string) => {
    const canvas = canvasRefs[canvasIndex].current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `biorecord-${observationId}-${designName.toLowerCase().replace(/\s+/g, '-')}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          BioRecord Playing Card Generator
        </CardTitle>
        <CardDescription>
          Generate playing card designs from observation data across platforms
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Input Form */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="platform">Platform</Label>
            <Select value={platform} onValueChange={(value: "inat" | "mo" | "mycoportal") => setPlatform(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inat">iNaturalist</SelectItem>
                <SelectItem value="mo">Mushroom Observer</SelectItem>
                <SelectItem value="mycoportal">MyCoPortal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observationId">Observation ID</Label>
            <Input
              id="observationId"
              placeholder="Enter observation ID"
              value={observationId}
              onChange={(e) => setObservationId(e.target.value)}
            />
          </div>

          <div className="flex items-end">
            <Button 
              onClick={generatePlayingCards}
              disabled={isGenerating}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Generate Cards
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Generated Cards Display */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Design 1: Classic Scientific */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Classic Scientific</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCard(0, "Classic Scientific")}
              >
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
            </div>
            <canvas
              ref={canvasRefs[0]}
              className="border rounded-lg shadow-lg max-w-full h-auto"
              style={{ maxHeight: "400px" }}
            />
          </div>

          {/* Design 2: Modern Minimal */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Modern Minimal</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCard(1, "Modern Minimal")}
              >
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
            </div>
            <canvas
              ref={canvasRefs[1]}
              className="border rounded-lg shadow-lg max-w-full h-auto"
              style={{ maxHeight: "400px" }}
            />
          </div>

          {/* Design 3: Vintage Style */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Vintage Style</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCard(2, "Vintage Style")}
              >
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
            </div>
            <canvas
              ref={canvasRefs[2]}
              className="border rounded-lg shadow-lg max-w-full h-auto"
              style={{ maxHeight: "400px" }}
            />
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">How to use:</h4>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>1. Select the platform (iNaturalist, Mushroom Observer, or MyCoPortal)</li>
            <li>2. Enter the observation ID from that platform</li>
            <li>3. Click "Generate Cards" to create three different design variations</li>
            <li>4. Use the download buttons to save your preferred card designs</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">BioRecord Management</h1>
              <p className="text-muted-foreground">
                Manage historical snapshots and mint BioRecords from fully validated observations
              </p>
            </div>
          </div>

          <Tabs defaultValue="biorecords" className="space-y-4">
            <TabsList>
              <TabsTrigger value="biorecords">Historical BioRecords</TabsTrigger>
              <TabsTrigger value="validation">Create from Validated</TabsTrigger>
              <TabsTrigger value="images">BioRecord Images</TabsTrigger>
            </TabsList>

            <TabsContent value="biorecords" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Archive className="w-5 h-5" />
                    BioRecord Archive ({filteredBiorecords.length})
                  </CardTitle>
                  <CardDescription>
                    Historical snapshots of fully validated observations with BioRecord minting capabilities
                  </CardDescription>
                  <div className="flex items-center space-x-2">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search biorecords..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="max-w-sm"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  {biorecordsLoading ? (
                    <div className="text-center py-8">Loading biorecords...</div>
                  ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Observation ID</TableHead>
                      <TableHead>Scientific Name</TableHead>
                      <TableHead>Observer</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Validated Date</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>BioRecord Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBiorecords.map((record: Biorecord) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-mono">{record.observationId}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{record.scientificName}</div>
                            {record.commonName && (
                              <div className="text-sm text-muted-foreground">{record.commonName}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{record.observer || record.collector || "Unknown"}</TableCell>
                        <TableCell>{record.state || "Unknown"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(record.validatedAt), "MMM d, yyyy")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">v{record.validationVersion}</Badge>
                        </TableCell>
                        <TableCell>
                          {record.nftMinted ? (
                            <div className="space-y-1">
                              <Badge variant="default" className="bg-purple-500 hover:bg-purple-600">
                                <Coins className="w-3 h-3 mr-1" />
                                BioRecord Minted
                              </Badge>
                              {record.nftTokenId && (
                                <div className="text-xs text-muted-foreground font-mono">
                                  {record.nftTokenId.substring(0, 12)}...
                                </div>
                              )}
                              {record.nftBlockchainNetwork && (
                                <div className="text-xs text-muted-foreground capitalize">
                                  {record.nftBlockchainNetwork}
                                </div>
                              )}
                            </div>
                          ) : (
                            <Badge variant="secondary">
                              <Clock className="w-3 h-3 mr-1" />
                              Ready to Mint
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {!record.nftMinted && (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => mintNftMutation.mutate(record.id)}
                                disabled={mintNftMutation.isPending}
                                className="bg-purple-500 hover:bg-purple-600"
                              >
                                <Coins className="w-3 h-3 mr-1" />
                                {mintNftMutation.isPending ? "Minting..." : "Mint BioRecord"}
                              </Button>
                            )}
                            {record.nftMinted && record.nftMetadataUri && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(record.nftMetadataUri, '_blank')}
                              >
                                <ExternalLink className="w-3 h-3 mr-1" />
                                View BioRecord
                              </Button>
                            )}
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedObservationId(record.observationId)}
                                >
                                  <History className="w-3 h-3 mr-1" />
                                  History
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl">
                                <DialogHeader>
                                  <DialogTitle>Biorecord History - {record.observationId}</DialogTitle>
                                  <DialogDescription>
                                    All historical snapshots for this observation
                                  </DialogDescription>
                                </DialogHeader>
                                <ScrollArea className="h-96">
                                  <div className="space-y-4">
                                    {biorecordHistory.map((historyRecord: Biorecord, index: number) => (
                                      <Card key={historyRecord.id}>
                                        <CardHeader className="pb-2">
                                          <div className="flex justify-between items-start">
                                            <div>
                                              <CardTitle className="text-lg">
                                                Snapshot #{biorecordHistory.length - index}
                                              </CardTitle>
                                              <CardDescription>
                                                {format(new Date(historyRecord.validatedAt), "PPP 'at' p")}
                                              </CardDescription>
                                            </div>
                                            <Badge variant="outline">v{historyRecord.validationVersion}</Badge>
                                          </div>
                                        </CardHeader>
                                        <CardContent className="pt-0">
                                          <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                              <div className="font-medium">Scientific Name</div>
                                              <div>{historyRecord.scientificName}</div>
                                            </div>
                                            <div>
                                              <div className="font-medium">Observer</div>
                                              <div>{historyRecord.observer || "Unknown"}</div>
                                            </div>
                                            {historyRecord.inatScientificName && (
                                              <div>
                                                <div className="font-medium">iNaturalist Name</div>
                                                <div>{historyRecord.inatScientificName}</div>
                                              </div>
                                            )}
                                            {historyRecord.moScientificName && (
                                              <div>
                                                <div className="font-medium">MO Name</div>
                                                <div>{historyRecord.moScientificName}</div>
                                              </div>
                                            )}
                                          </div>
                                        </CardContent>
                                      </Card>
                                    ))}
                                  </div>
                                </ScrollArea>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Create BioRecords from Validated Observations
              </CardTitle>
              <CardDescription>
                Select fully validated observations to create historical snapshots
              </CardDescription>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search validated observations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
                <Button 
                  onClick={handleBatchCreate}
                  disabled={batchCreateMutation.isPending || filteredValidatedObservations.length === 0}
                >
                  {batchCreateMutation.isPending ? "Creating..." : `Create All (${filteredValidatedObservations.length})`}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {validationLoading ? (
                <div className="text-center py-8">Loading validated observations...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Observation ID</TableHead>
                      <TableHead>Scientific Name</TableHead>
                      <TableHead>Observer</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredValidatedObservations.map((observation: ValidationObservation) => (
                      <TableRow key={observation.id}>
                        <TableCell className="font-mono">{observation.observationId}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{observation.scientificName}</div>
                            {observation.commonName && (
                              <div className="text-sm text-muted-foreground">{observation.commonName}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{observation.observer || "Unknown"}</TableCell>
                        <TableCell>{observation.state || "Unknown"}</TableCell>
                        <TableCell>{getValidationStatusBadge(observation)}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCreateBiorecord(observation.observationId)}
                            disabled={createBiorecordMutation.isPending}
                          >
                            {createBiorecordMutation.isPending ? "Creating..." : "Create BioRecord"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="images" className="space-y-4">
          <BioRecordImageGenerator />
        </TabsContent>
      </Tabs>
        </div>
      </div>
    </div>
  );
}