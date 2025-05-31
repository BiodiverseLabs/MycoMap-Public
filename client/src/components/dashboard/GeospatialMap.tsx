import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface Observation {
  id: number;
  latitude: string;
  longitude: string;
  scientificName: string;
  state: string;
  observedOn: string;
}

interface GeospatialMapProps {
  dateRange?: string;
}

export function GeospatialMap({ dateRange }: GeospatialMapProps = {}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [viewMode, setViewMode] = useState<'markers' | 'heatmap'>('markers');

  const { data: observations = [], isLoading } = useQuery<Observation[]>({
    queryKey: ["/api/observations"],
  });

  useEffect(() => {
    if (!mapRef.current || mapInstance) return;

    // Initialize Leaflet map
    const L = (window as any).L;
    if (!L) return;

    const map = L.map(mapRef.current).setView([39.8283, -98.5795], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    setMapInstance(map);

    return () => {
      map.remove();
      setMapInstance(null);
    };
  }, [mapRef.current]);

  useEffect(() => {
    if (!mapInstance || !observations.length) return;

    const L = (window as any).L;
    if (!L) return;

    // Clear existing layers
    mapInstance.eachLayer((layer: any) => {
      if (layer instanceof L.Marker) {
        mapInstance.removeLayer(layer);
      }
    });

    if (viewMode === 'markers') {
      // Add markers for each observation
      observations.forEach((obs) => {
        if (obs.latitude && obs.longitude) {
          const lat = parseFloat(obs.latitude);
          const lng = parseFloat(obs.longitude);
          
          if (!isNaN(lat) && !isNaN(lng)) {
            L.marker([lat, lng])
              .addTo(mapInstance)
              .bindPopup(`
                <div>
                  <strong>${obs.scientificName}</strong><br>
                  ${obs.state}<br>
                  ${obs.observedOn}
                </div>
              `);
          }
        }
      });
    } else {
      // Add heatmap layer (would require leaflet-heat plugin)
      const heatData = observations
        .filter(obs => obs.latitude && obs.longitude)
        .map(obs => [
          parseFloat(obs.latitude),
          parseFloat(obs.longitude),
          1
        ]);

      if (heatData.length > 0 && L.heatLayer) {
        L.heatLayer(heatData, { radius: 25 }).addTo(mapInstance);
      }
    }
  }, [mapInstance, observations, viewMode]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Observation Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 bg-slate-100 rounded-lg animate-pulse flex items-center justify-center">
            <p className="text-slate-500">Loading map...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Observation Distribution</CardTitle>
          <div className="flex items-center space-x-2">
            <Button
              size="sm"
              variant={viewMode === 'heatmap' ? 'default' : 'outline'}
              onClick={() => setViewMode('heatmap')}
            >
              Heatmap
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'markers' ? 'default' : 'outline'}
              onClick={() => setViewMode('markers')}
            >
              Markers
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div 
          ref={mapRef} 
          className="h-80 rounded-lg border border-slate-200"
        />
      </CardContent>
    </Card>
  );
}
