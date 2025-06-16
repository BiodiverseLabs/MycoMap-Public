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

  // Card Design 1: Vintage Light Trading Card (Based on your beige design)
  const generateCardDesign1 = (data: any, canvasIndex: number) => {
    const canvas = canvasRefs[canvasIndex].current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 400;
    canvas.height = 600;

    // Vintage beige background
    ctx.fillStyle = '#f4e5d3';
    ctx.fillRect(0, 0, 400, 600);

    // Multiple borders like your design
    ctx.strokeStyle = '#2c1810';
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, 376, 576);
    
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, 364, 564);
    
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, 352, 552);

    // Header section matching your design
    ctx.fillStyle = '#2c1810';
    ctx.fillRect(32, 32, 336, 60);
    
    // Orange/red accent circle like your design
    ctx.fillStyle = '#c44332';
    ctx.beginPath();
    ctx.arc(70, 62, 20, 0, 2 * Math.PI);
    ctx.fill();
    
    // Leaf icon in circle
    ctx.fillStyle = 'white';
    ctx.font = '16px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🍄', 70, 68);

    // Main title text
    ctx.fillStyle = '#f4e5d3';
    ctx.font = 'bold 20px serif';
    ctx.textAlign = 'left';
    ctx.fillText('SPECIES', 110, 55);
    ctx.fillText('OBSERVATIONS', 110, 78);

    // Main image frame with rounded corners effect
    ctx.fillStyle = '#2c1810';
    ctx.fillRect(40, 110, 320, 280);
    
    ctx.fillStyle = '#d4a574';
    ctx.fillRect(45, 115, 310, 270);
    
    ctx.fillStyle = '#f9f5f0';
    ctx.fillRect(50, 120, 300, 260);
    
    // Image placeholder
    ctx.fillStyle = '#8b7355';
    ctx.font = '14px serif';
    ctx.textAlign = 'center';
    ctx.fillText('SPECIMEN PHOTOGRAPH', 200, 245);
    ctx.font = '10px serif';
    ctx.fillText('Field observation image would appear here', 200, 260);

    // Bottom information panel
    ctx.fillStyle = '#d4a574';
    ctx.fillRect(40, 410, 320, 120);
    
    ctx.strokeStyle = '#2c1810';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 410, 320, 120);

    // Species name section
    const scientificName = data.scientificName || 'UNKNOWN SPECIES';
    ctx.fillStyle = '#2c1810';
    ctx.font = 'bold 18px serif';
    ctx.textAlign = 'center';
    ctx.fillText(scientificName.toUpperCase(), 200, 440);

    // Observer and location info
    ctx.font = '12px serif';
    ctx.fillText(data.observer || 'Unknown Observer', 200, 460);
    ctx.fillText(`${data.state || 'Unknown'}, ${data.country || 'Unknown'}`, 200, 480);

    // Platform ID at bottom
    ctx.fillStyle = '#2c1810';
    ctx.fillRect(40, 545, 320, 35);
    ctx.fillStyle = '#f4e5d3';
    ctx.font = 'bold 14px serif';
    ctx.textAlign = 'center';
    const platformId = data.platform === 'iNaturalist' ? `iNaturalist #${data.observationId || 'Unknown'}` : 
                      data.platform === 'Mushroom Observer' ? `MO #${data.observationId || 'Unknown'}` :
                      `${data.platform} #${data.observationId || 'Unknown'}`;
    ctx.fillText(platformId, 200, 567);
  };

  // Card Design 2: Vintage Dark Trading Card (Based on your brown design)
  const generateCardDesign2 = (data: any, canvasIndex: number) => {
    const canvas = canvasRefs[canvasIndex].current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 400;
    canvas.height = 600;

    // Dark brown background like your design
    ctx.fillStyle = '#3e2723';
    ctx.fillRect(0, 0, 400, 600);

    // Multiple borders matching your style
    ctx.strokeStyle = '#1a0e0a';
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, 376, 576);
    
    ctx.strokeStyle = '#8d6e63';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, 364, 564);
    
    ctx.strokeStyle = '#d7ccc8';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, 352, 552);

    // Header section
    ctx.fillStyle = '#1a0e0a';
    ctx.fillRect(32, 32, 336, 60);
    
    // Orange/red accent circle
    ctx.fillStyle = '#c44332';
    ctx.beginPath();
    ctx.arc(70, 62, 20, 0, 2 * Math.PI);
    ctx.fill();
    
    // Mushroom icon in circle
    ctx.fillStyle = 'white';
    ctx.font = '16px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🍄', 70, 68);

    // Main title text
    ctx.fillStyle = '#d7ccc8';
    ctx.font = 'bold 20px serif';
    ctx.textAlign = 'left';
    ctx.fillText('SPECIES', 110, 55);
    ctx.fillText('OBSERVATION', 110, 78);

    // Main image frame
    ctx.fillStyle = '#1a0e0a';
    ctx.fillRect(40, 110, 320, 280);
    
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(45, 115, 310, 270);
    
    ctx.fillStyle = '#efebe9';
    ctx.fillRect(50, 120, 300, 260);
    
    // Image placeholder
    ctx.fillStyle = '#5d4037';
    ctx.font = '14px serif';
    ctx.textAlign = 'center';
    ctx.fillText('SPECIMEN PHOTOGRAPH', 200, 245);
    ctx.font = '10px serif';
    ctx.fillText('Field observation image would appear here', 200, 260);

    // Species name section (like your design)
    ctx.fillStyle = '#d7ccc8';
    ctx.fillRect(40, 410, 320, 85);
    
    ctx.strokeStyle = '#1a0e0a';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 410, 320, 85);

    // Species name
    const scientificName = data.scientificName || 'UNKNOWN SPECIES';
    ctx.fillStyle = '#1a0e0a';
    ctx.font = 'bold 18px serif';
    ctx.textAlign = 'center';
    ctx.fillText(scientificName.toUpperCase(), 200, 435);

    // Observer and location
    ctx.font = '12px serif';
    ctx.fillText(data.observer || 'Unknown Observer', 200, 455);
    ctx.fillText(`${data.state || 'Unknown'}, ${data.country || 'Unknown'}`, 200, 475);

    // Platform ID section (dark like your design)
    ctx.fillStyle = '#1a0e0a';
    ctx.fillRect(40, 510, 320, 35);
    
    ctx.fillStyle = '#d7ccc8';
    ctx.font = 'bold 14px serif';
    ctx.textAlign = 'center';
    const platformId = data.platform === 'iNaturalist' ? `iNaturalist #${data.observationId || 'Unknown'}` : 
                      data.platform === 'Mushroom Observer' ? `MO #${data.observationId || 'Unknown'}` :
                      `${data.platform} #${data.observationId || 'Unknown'}`;
    ctx.fillText(platformId, 200, 532);
  };

  // Card Design 3: Vintage Green Trading Card (Similar style to first two but green)
  const generateCardDesign3 = (data: any, canvasIndex: number) => {
    const canvas = canvasRefs[canvasIndex].current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 400;
    canvas.height = 600;

    // Forest green background
    ctx.fillStyle = '#2e4f3e';
    ctx.fillRect(0, 0, 400, 600);

    // Multiple borders matching the vintage style
    ctx.strokeStyle = '#1a2e1a';
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, 376, 576);
    
    ctx.strokeStyle = '#4a6741';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, 364, 564);
    
    ctx.strokeStyle = '#8bc34a';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, 352, 552);

    // Header section
    ctx.fillStyle = '#1a2e1a';
    ctx.fillRect(32, 32, 336, 60);
    
    // Orange/red accent circle (keeping this consistent with other designs)
    ctx.fillStyle = '#c44332';
    ctx.beginPath();
    ctx.arc(70, 62, 20, 0, 2 * Math.PI);
    ctx.fill();
    
    // Mushroom icon in circle
    ctx.fillStyle = 'white';
    ctx.font = '16px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🍄', 70, 68);

    // Main title text
    ctx.fillStyle = '#c8e6c9';
    ctx.font = 'bold 20px serif';
    ctx.textAlign = 'left';
    ctx.fillText('SPECIES', 110, 55);
    ctx.fillText('OBSERVATION', 110, 78);

    // Main image frame
    ctx.fillStyle = '#1a2e1a';
    ctx.fillRect(40, 110, 320, 280);
    
    ctx.fillStyle = '#4a6741';
    ctx.fillRect(45, 115, 310, 270);
    
    ctx.fillStyle = '#f1f8e9';
    ctx.fillRect(50, 120, 300, 260);
    
    // Image placeholder
    ctx.fillStyle = '#2e4f3e';
    ctx.font = '14px serif';
    ctx.textAlign = 'center';
    ctx.fillText('SPECIMEN PHOTOGRAPH', 200, 245);
    ctx.font = '10px serif';
    ctx.fillText('Field observation image would appear here', 200, 260);

    // Species name section (like the other designs)
    ctx.fillStyle = '#c8e6c9';
    ctx.fillRect(40, 410, 320, 85);
    
    ctx.strokeStyle = '#1a2e1a';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 410, 320, 85);

    // Species name
    const scientificName = data.scientificName || 'UNKNOWN SPECIES';
    ctx.fillStyle = '#1a2e1a';
    ctx.font = 'bold 18px serif';
    ctx.textAlign = 'center';
    ctx.fillText(scientificName.toUpperCase(), 200, 435);

    // Observer and location
    ctx.font = '12px serif';
    ctx.fillText(data.observer || 'Unknown Observer', 200, 455);
    ctx.fillText(`${data.state || 'Unknown'}, ${data.country || 'Unknown'}`, 200, 475);

    // Platform ID section (dark like the other designs)
    ctx.fillStyle = '#1a2e1a';
    ctx.fillRect(40, 510, 320, 35);
    
    ctx.fillStyle = '#c8e6c9';
    ctx.font = 'bold 14px serif';
    ctx.textAlign = 'center';
    const platformId = data.platform === 'iNaturalist' ? `iNaturalist #${data.observationId || 'Unknown'}` : 
                      data.platform === 'Mushroom Observer' ? `MO #${data.observationId || 'Unknown'}` :
                      `${data.platform} #${data.observationId || 'Unknown'}`;
    ctx.fillText(platformId, 200, 532);
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
          {/* Design 1: Vintage Light */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Vintage Light</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCard(0, "Vintage Light")}
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

          {/* Design 2: Vintage Dark */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Vintage Dark</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCard(1, "Vintage Dark")}
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

          {/* Design 3: Vintage Green */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Vintage Green</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCard(2, "Vintage Green")}
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