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

  // Card Design 1: Professional Scientific Card
  const generateCardDesign1 = (data: any, canvasIndex: number) => {
    const canvas = canvasRefs[canvasIndex].current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 400;
    canvas.height = 600;

    // Background with subtle texture
    const gradient = ctx.createLinearGradient(0, 0, 400, 600);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(0.5, '#1e293b');
    gradient.addColorStop(1, '#334155');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 400, 600);

    // Outer border with rounded corners effect
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 384, 584);
    
    // Inner border
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, 368, 568);

    // Header section with gradient
    const headerGradient = ctx.createLinearGradient(0, 20, 0, 80);
    headerGradient.addColorStop(0, '#1e40af');
    headerGradient.addColorStop(1, '#3b82f6');
    ctx.fillStyle = headerGradient;
    ctx.fillRect(24, 24, 352, 56);
    
    // Header border
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1;
    ctx.strokeRect(24, 24, 352, 56);

    // Scientific name with elegant typography
    ctx.fillStyle = 'white';
    ctx.font = 'bold 20px serif';
    ctx.textAlign = 'center';
    const scientificName = data.scientificName || 'Unknown Species';
    ctx.fillText(scientificName, 200, 48);
    
    // Common name in italics
    if (data.commonName) {
      ctx.font = 'italic 14px serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(`"${data.commonName}"`, 200, 68);
    }

    // Main image area with professional frame
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.strokeRect(32, 100, 336, 240);
    
    // Image background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(35, 103, 330, 234);
    
    // Image placeholder with professional styling
    ctx.fillStyle = '#64748b';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SPECIMEN PHOTOGRAPH', 200, 210);
    ctx.font = '12px sans-serif';
    ctx.fillText('High-resolution observation image', 200, 230);

    // Information panel with structured layout
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(32, 360, 336, 180);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.strokeRect(32, 360, 336, 180);

    // Data sections
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    
    // Location section
    ctx.fillText('COLLECTION DATA:', 45, 385);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`Location: ${data.location || 'Unknown'}`, 45, 405);
    if (data.state) {
      ctx.fillText(`State/Province: ${data.state}`, 45, 420);
    }
    ctx.fillText(`Country: ${data.country || 'Unknown'}`, 45, 435);
    
    // Observer section
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('OBSERVER DATA:', 45, 460);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`Observer: ${data.observer || 'Unknown'}`, 45, 480);
    ctx.fillText(`Platform: ${data.platform}`, 45, 495);
    if (data.observedOn) {
      ctx.fillText(`Date: ${data.observedOn}`, 45, 510);
    }

    // Footer with branding
    const footerGradient = ctx.createLinearGradient(0, 550, 0, 584);
    footerGradient.addColorStop(0, '#1e40af');
    footerGradient.addColorStop(1, '#3730a3');
    ctx.fillStyle = footerGradient;
    ctx.fillRect(24, 550, 352, 34);
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BIORECORD TRADING CARD', 200, 572);
  };

  // Card Design 2: Modern Botanical Style
  const generateCardDesign2 = (data: any, canvasIndex: number) => {
    const canvas = canvasRefs[canvasIndex].current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 400;
    canvas.height = 600;

    // Clean white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 400, 600);

    // Subtle outer border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, 384, 584);

    // Top accent with botanical green gradient
    const topGradient = ctx.createLinearGradient(0, 0, 400, 24);
    topGradient.addColorStop(0, '#059669');
    topGradient.addColorStop(0.5, '#10b981');
    topGradient.addColorStop(1, '#34d399');
    ctx.fillStyle = topGradient;
    ctx.fillRect(8, 8, 384, 24);

    // Scientific name with modern typography
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 22px system-ui';
    ctx.textAlign = 'center';
    const scientificName = data.scientificName || 'Unknown Species';
    
    // Handle long names by adjusting font size
    const textWidth = ctx.measureText(scientificName).width;
    if (textWidth > 360) {
      ctx.font = 'bold 18px system-ui';
    }
    ctx.fillText(scientificName, 200, 65);

    // Common name with subtle styling
    if (data.commonName) {
      ctx.fillStyle = '#6b7280';
      ctx.font = 'italic 16px system-ui';
      ctx.fillText(data.commonName, 200, 90);
    }

    // Main image frame with modern styling
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(24, 110, 352, 260);
    
    // Image border with shadow effect
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(24, 110, 352, 260);
    
    // Inner image area
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(32, 118, 336, 244);
    
    // Image placeholder with clean styling
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('OBSERVATION IMAGE', 200, 235);
    ctx.font = '11px system-ui';
    ctx.fillStyle = '#64748b';
    ctx.fillText('High-quality field photograph', 200, 250);

    // Information grid layout
    const cardY = 385;
    
    // Location card
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(24, cardY, 168, 95);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(24, cardY, 168, 95);
    
    // Location header
    ctx.fillStyle = '#059669';
    ctx.fillRect(24, cardY, 168, 25);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('LOCATION', 108, cardY + 16);
    
    // Location details
    ctx.fillStyle = '#374151';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    let locY = cardY + 35;
    const location = data.location || 'Unknown';
    if (location.length > 20) {
      const words = location.split(' ');
      const line1 = words.slice(0, Math.ceil(words.length/2)).join(' ');
      const line2 = words.slice(Math.ceil(words.length/2)).join(' ');
      ctx.fillText(line1, 28, locY);
      ctx.fillText(line2, 28, locY + 12);
      locY += 24;
    } else {
      ctx.fillText(location, 28, locY);
      locY += 12;
    }
    
    if (data.state) {
      ctx.fillText(`${data.state}, ${data.country || 'Unknown'}`, 28, locY);
    }

    // Observer card
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(208, cardY, 168, 95);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(208, cardY, 168, 95);
    
    // Observer header
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(208, cardY, 168, 25);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('OBSERVER', 292, cardY + 16);
    
    // Observer details
    ctx.fillStyle = '#374151';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    let obsY = cardY + 35;
    const observer = data.observer || 'Unknown';
    ctx.fillText(observer.length > 18 ? observer.substring(0, 18) + '...' : observer, 212, obsY);
    obsY += 12;
    ctx.fillText(`Platform: ${data.platform}`, 212, obsY);
    obsY += 12;
    if (data.observedOn) {
      ctx.fillText(`Date: ${data.observedOn}`, 212, obsY);
    }

    // Data source badge
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(24, 495, 352, 20);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('VALIDATED BIORECORD', 200, 508);

    // Bottom accent
    const bottomGradient = ctx.createLinearGradient(0, 568, 400, 592);
    bottomGradient.addColorStop(0, '#059669');
    bottomGradient.addColorStop(0.5, '#10b981');
    bottomGradient.addColorStop(1, '#34d399');
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(8, 568, 384, 24);
  };

  // Card Design 3: Victorian Specimen Card
  const generateCardDesign3 = (data: any, canvasIndex: number) => {
    const canvas = canvasRefs[canvasIndex].current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 400;
    canvas.height = 600;

    // Aged paper background with texture
    const paperGradient = ctx.createRadialGradient(200, 300, 0, 200, 300, 500);
    paperGradient.addColorStop(0, '#fefbf3');
    paperGradient.addColorStop(0.8, '#fef7ed');
    paperGradient.addColorStop(1, '#fed7aa');
    ctx.fillStyle = paperGradient;
    ctx.fillRect(0, 0, 400, 600);

    // Multiple ornate borders
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 5;
    ctx.strokeRect(12, 12, 376, 576);
    
    ctx.strokeStyle = '#a0522d';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 360, 560);
    
    ctx.strokeStyle = '#cd853f';
    ctx.lineWidth = 1;
    ctx.strokeRect(28, 28, 344, 544);

    // Decorative corner flourishes
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 3;
    // Top left corner
    ctx.beginPath();
    ctx.moveTo(35, 50);
    ctx.lineTo(50, 35);
    ctx.moveTo(35, 35);
    ctx.lineTo(50, 50);
    ctx.stroke();
    
    // Top right corner
    ctx.beginPath();
    ctx.moveTo(350, 50);
    ctx.lineTo(365, 35);
    ctx.moveTo(365, 50);
    ctx.lineTo(350, 35);
    ctx.stroke();
    
    // Bottom corners
    ctx.beginPath();
    ctx.moveTo(35, 550);
    ctx.lineTo(50, 565);
    ctx.moveTo(35, 565);
    ctx.lineTo(50, 550);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(350, 550);
    ctx.lineTo(365, 565);
    ctx.moveTo(365, 550);
    ctx.lineTo(350, 565);
    ctx.stroke();

    // Header with ornate design
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(40, 40, 320, 60);
    
    // Header decorative border
    ctx.strokeStyle = '#daa520';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 40, 320, 60);
    
    // Inner header decoration
    ctx.fillStyle = '#daa520';
    ctx.fillRect(50, 50, 300, 5);
    ctx.fillRect(50, 85, 300, 5);

    // Main title
    ctx.fillStyle = '#fefbf3';
    ctx.font = 'bold 16px serif';
    ctx.textAlign = 'center';
    ctx.fillText('MYCOLOGICAL SPECIMEN', 200, 62);
    ctx.font = '12px serif';
    ctx.fillText('Field Collection Record', 200, 78);

    // Scientific name with elegant frame
    ctx.fillStyle = '#fefbf3';
    ctx.fillRect(45, 115, 310, 45);
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 2;
    ctx.strokeRect(45, 115, 310, 45);
    
    ctx.fillStyle = '#2d1b0e';
    ctx.font = 'italic 18px serif';
    ctx.textAlign = 'center';
    const scientificName = data.scientificName || 'Unknown Species';
    ctx.fillText(scientificName, 200, 140);

    // Common name with quotation marks
    if (data.commonName) {
      ctx.font = '14px serif';
      ctx.fillStyle = '#654321';
      ctx.fillText(`"${data.commonName}"`, 200, 155);
    }

    // Specimen image with ornate frame
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(50, 175, 300, 220);
    
    ctx.fillStyle = '#daa520';
    ctx.fillRect(55, 180, 290, 210);
    
    ctx.fillStyle = '#f5f5dc';
    ctx.fillRect(60, 185, 280, 200);
    
    // Image placeholder with period styling
    ctx.fillStyle = '#8b7355';
    ctx.font = '14px serif';
    ctx.textAlign = 'center';
    ctx.fillText('PHOTOGRAPHIC PLATE', 200, 270);
    ctx.font = '10px serif';
    ctx.fillText('Natural habitat documentation', 200, 285);
    ctx.fillText('Captured in field conditions', 200, 300);

    // Classification section
    ctx.fillStyle = '#fefbf3';
    ctx.fillRect(40, 410, 320, 130);
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 410, 320, 130);
    
    // Classification header
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(45, 415, 310, 25);
    ctx.fillStyle = '#fefbf3';
    ctx.font = 'bold 12px serif';
    ctx.textAlign = 'center';
    ctx.fillText('COLLECTION PARTICULARS', 200, 430);

    // Collection data in formal style
    ctx.fillStyle = '#2d1b0e';
    ctx.font = '11px serif';
    ctx.textAlign = 'left';
    
    let dataY = 455;
    ctx.fillText(`Locality: ${data.location || 'Unknown locality'}`, 55, dataY);
    dataY += 16;
    
    if (data.state) {
      ctx.fillText(`Province: ${data.state}, ${data.country || 'Unknown'}`, 55, dataY);
      dataY += 16;
    }
    
    ctx.fillText(`Collected by: ${data.observer || 'Anonymous'}`, 55, dataY);
    dataY += 16;
    
    ctx.fillText(`Repository: ${data.platform} Database`, 55, dataY);
    dataY += 16;
    
    if (data.observedOn) {
      ctx.fillText(`Date of Collection: ${data.observedOn}`, 55, dataY);
    }

    // Authentication seal
    ctx.fillStyle = '#8b4513';
    ctx.beginPath();
    ctx.arc(200, 565, 20, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.strokeStyle = '#daa520';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(200, 565, 18, 0, 2 * Math.PI);
    ctx.stroke();
    
    ctx.fillStyle = '#fefbf3';
    ctx.font = 'bold 8px serif';
    ctx.textAlign = 'center';
    ctx.fillText('VERIFIED', 200, 562);
    ctx.fillText('BIORECORD', 200, 572);

    // Decorative flourish at bottom
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(120, 585);
    ctx.quadraticCurveTo(200, 575, 280, 585);
    ctx.stroke();
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