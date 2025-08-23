import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Map, Square, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapData {
  latitude: number;
  longitude: number;
  species?: string;
}

export default function FieldGuideCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const drawingRef = useRef<boolean>(false);
  const rectangleRef = useRef<L.Rectangle | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  
  const [boundingBox, setBoundingBox] = useState<{
    north: number;
    south: number;
    east: number;
    west: number;
  } | null>(null);
  
  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch map data for observation locations (optimized for performance)
  const { data: observations = [], isLoading } = useQuery<MapData[]>({
    queryKey: ["/api/map-data"],
    queryFn: async () => {
      const response = await fetch('/api/map-data?limit=2000');
      if (!response.ok) throw new Error('Failed to fetch map data');
      return response.json();
    }
  });

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !observations.length || mapInstanceRef.current) return;

    // Create map
    const map = L.map(mapRef.current).setView([39.8283, -98.5795], 4); // Center of US

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Add observation points using clustering for better performance
    const sampleSize = Math.min(observations.length, 1500); // Limit to 1500 points max
    const step = Math.max(1, Math.floor(observations.length / sampleSize));
    
    // Sample observations for display (every nth point)
    const sampledObservations = observations.filter((_, index) => index % step === 0);
    
    // Create a feature group for better performance
    const pointsGroup = L.featureGroup();
    
    sampledObservations.forEach(obs => {
      const marker = L.circleMarker([obs.latitude, obs.longitude], {
        radius: 3,
        fillColor: '#3b82f6',
        color: '#1e40af',
        weight: 1,
        opacity: 0.7,
        fillOpacity: 0.5
      });
      pointsGroup.addLayer(marker);
    });
    
    pointsGroup.addTo(map);

    // Add drawing functionality
    let startLatLng: L.LatLng | null = null;
    
    map.on('mousedown', (e) => {
      if (e.originalEvent.shiftKey) {
        drawingRef.current = true;
        startLatLng = e.latlng;
        
        // Remove existing rectangle
        if (rectangleRef.current) {
          map.removeLayer(rectangleRef.current);
          rectangleRef.current = null;
          setBoundingBox(null);
        }
        
        map.dragging.disable();
      }
    });

    map.on('mousemove', (e) => {
      if (drawingRef.current && startLatLng) {
        // Remove previous temporary rectangle
        if (rectangleRef.current) {
          map.removeLayer(rectangleRef.current);
        }

        // Create new rectangle
        const bounds = L.latLngBounds(startLatLng, e.latlng);
        rectangleRef.current = L.rectangle(bounds, {
          color: '#ef4444',
          weight: 2,
          fillOpacity: 0.2
        }).addTo(map);
      }
    });

    map.on('mouseup', (e) => {
      if (drawingRef.current && startLatLng) {
        drawingRef.current = false;
        map.dragging.enable();
        
        const bounds = L.latLngBounds(startLatLng, e.latlng);
        const north = bounds.getNorth();
        const south = bounds.getSouth();
        const east = bounds.getEast();
        const west = bounds.getWest();
        
        setBoundingBox({ north, south, east, west });
        
        toast({
          title: "Bounding box created",
          description: `Selected region: ${Math.abs(north - south).toFixed(3)}° × ${Math.abs(east - west).toFixed(3)}°`,
        });
      }
    });

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [observations, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Please enter a field guide name.",
        variant: "destructive",
      });
      return;
    }

    if (!boundingBox) {
      toast({
        title: "Error",
        description: "Please draw a bounding box on the map by holding Shift and dragging.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    try {
      // Create field guide
      const createResponse = await fetch('/api/field-guides', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          boundingBoxNorth: boundingBox.north.toString(),
          boundingBoxSouth: boundingBox.south.toString(),
          boundingBoxEast: boundingBox.east.toString(),
          boundingBoxWest: boundingBox.west.toString(),
        }),
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create field guide');
      }

      const newGuide = await createResponse.json();

      // Generate species list
      const generateResponse = await fetch(`/api/field-guides/${newGuide.id}/generate-species`, {
        method: 'POST',
      });

      if (!generateResponse.ok) {
        throw new Error('Failed to generate species list');
      }

      const result = await generateResponse.json();

      toast({
        title: "Field guide created!",
        description: `Successfully created "${formData.name}" with ${result.speciesCount} species.`,
      });

      // Invalidate field guides cache to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/field-guides'] });

      // Navigate back to field guides list
      setLocation('/field-guides');
    } catch (error) {
      console.error('Error creating field guide:', error);
      toast({
        title: "Error",
        description: "Failed to create field guide. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 space-y-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading map data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          onClick={() => setLocation('/field-guides')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Field Guides
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Create Field Guide</h1>
          <p className="text-slate-600 mt-1">
            Create a regional species guide by selecting an area on the map
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Square className="w-5 h-5" />
                Field Guide Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="e.g., Rocky Mountain Fungi"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Optional description of this field guide"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>

                {boundingBox && (
                  <div className="bg-slate-50 p-3 rounded-lg space-y-2">
                    <h4 className="font-medium text-sm text-slate-900">Selected Area</h4>
                    <div className="text-xs text-slate-600 space-y-1">
                      <p><strong>North:</strong> {boundingBox.north.toFixed(4)}°</p>
                      <p><strong>South:</strong> {boundingBox.south.toFixed(4)}°</p>
                      <p><strong>East:</strong> {boundingBox.east.toFixed(4)}°</p>
                      <p><strong>West:</strong> {boundingBox.west.toFixed(4)}°</p>
                    </div>
                  </div>
                )}

                <Alert>
                  <Map className="w-4 h-4" />
                  <AlertDescription>
                    Hold <strong>Shift</strong> and drag on the map to draw a bounding box for your field guide area.
                  </AlertDescription>
                </Alert>

                <Button 
                  type="submit" 
                  className="w-full flex items-center gap-2"
                  disabled={isGenerating}
                >
                  <Save className="w-4 h-4" />
                  {isGenerating ? 'Creating...' : 'Create Field Guide'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Map */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Map className="w-5 h-5" />
                Observation Locations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div 
                ref={mapRef}
                className="w-full h-96 rounded-lg border"
                style={{ minHeight: '400px' }}
              />
              <p className="text-sm text-slate-500 mt-2">
                Blue dots show a sample of observation locations ({observations.length > 1500 ? '~1,500 of ' + observations.length.toLocaleString() : observations.length.toLocaleString()} total). Hold Shift and drag to select an area.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}