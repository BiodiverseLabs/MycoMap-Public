import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";

interface Observation {
  id: number;
  latitude: string;
  longitude: string;
  scientificName: string;
  state: string;
  observedOn: string;
  source?: string;
}

interface GeospatialMapProps {
  dateRange?: string;
}

export function GeospatialMap({ dateRange }: GeospatialMapProps = {}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  const { data: observations = [], isLoading } = useQuery<Observation[]>({
    queryKey: ["/api/observations", dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange) {
        params.append('dateRange', dateRange);
      }
      params.append('limit', '2000');
      const response = await fetch(`/api/observations?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch observations');
      return response.json();
    }
  });

  // Filter observations with valid coordinates
  const validObservations = observations.filter(obs => 
    obs.latitude && obs.longitude && 
    !isNaN(parseFloat(obs.latitude)) && !isNaN(parseFloat(obs.longitude))
  );

  useEffect(() => {
    if (!mapRef.current || !validObservations.length) return;

    // Load Leaflet dynamically
    const loadLeaflet = async () => {
      if (typeof window !== 'undefined' && !(window as any).L) {
        // Add Leaflet CSS
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);

        // Load Leaflet JS
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        document.head.appendChild(script);

        return new Promise((resolve) => {
          script.onload = resolve;
        });
      }
    };

    const initializeMap = async () => {
      await loadLeaflet();
      
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      const L = (window as any).L;
      if (!L) return;

      // Initialize map
      const map = L.map(mapRef.current).setView([39.8283, -98.5795], 4); // Center on USA

      // Add tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      // Create marker clusters for better performance
      const markers = L.markerClusterGroup ? L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 50
      }) : L.layerGroup();

      // Add observation markers
      validObservations.forEach(obs => {
        const lat = parseFloat(obs.latitude);
        const lng = parseFloat(obs.longitude);
        
        if (!isNaN(lat) && !isNaN(lng)) {
          const marker = L.marker([lat, lng]);
          
          // Create popup content
          const popupContent = `
            <div class="p-2">
              <h4 class="font-semibold text-sm mb-1">${obs.scientificName}</h4>
              <p class="text-xs text-gray-600 mb-1">${obs.state}</p>
              <p class="text-xs text-gray-500">${new Date(obs.observedOn).toLocaleDateString()}</p>
              ${obs.source ? `<p class="text-xs text-blue-600">${obs.source}</p>` : ''}
            </div>
          `;
          
          marker.bindPopup(popupContent);
          markers.addLayer(marker);
        }
      });

      map.addLayer(markers);
      mapInstanceRef.current = map;

      // Fit map to markers if we have observations
      if (validObservations.length > 0) {
        const group = new L.featureGroup(markers.getLayers());
        map.fitBounds(group.getBounds().pad(0.1));
      }
    };

    initializeMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [validObservations]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Observation Locations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-slate-600">Loading map data...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          Observation Locations
        </CardTitle>
        <p className="text-sm text-slate-600">
          {validObservations.length.toLocaleString()} observations with GPS coordinates
          {observations.length > validObservations.length && 
            ` (${observations.length - validObservations.length} without coordinates)`
          }
        </p>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div 
            ref={mapRef} 
            className="w-full h-96 rounded-lg border border-slate-200"
            style={{ minHeight: '400px' }}
          />
          {validObservations.length === 0 && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 rounded-lg">
              <div className="text-center">
                <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No observations with GPS coordinates found</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}