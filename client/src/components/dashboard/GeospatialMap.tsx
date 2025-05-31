import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
  onStateSelect?: (state: string) => void;
  selectedState?: string | null;
}

export function GeospatialMap({ dateRange, onStateSelect, selectedState }: GeospatialMapProps = {}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

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

  // Filter observations with valid coordinates and by state if selected
  const validObservations = observations.filter(obs => {
    const hasValidCoords = obs.latitude && obs.longitude && 
      !isNaN(parseFloat(obs.latitude)) && !isNaN(parseFloat(obs.longitude));
    
    if (!hasValidCoords) return false;
    if (selectedState && obs.state !== selectedState) return false;
    
    return true;
  });

  // Group observations by state for state selector
  const stateGroups = observations.reduce((acc, obs) => {
    const state = obs.state || 'Unknown';
    if (!acc[state]) {
      acc[state] = { count: 0, species: new Set() };
    }
    acc[state].count++;
    acc[state].species.add(obs.scientificName);
    return acc;
  }, {} as Record<string, { count: number; species: Set<string> }>);

  const sortedStates = Object.entries(stateGroups)
    .map(([state, data]) => ({
      state,
      count: data.count,
      speciesCount: data.species.size
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15); // Show top 15 states

  // Initialize map when component mounts and observations are available
  useEffect(() => {
    if (!mapRef.current || isLoading) return;

    // Clean up existing map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    // Load Leaflet.heat plugin dynamically
    const loadHeatPlugin = async () => {
      if (!(window as any).L || !(window as any).L.heatLayer) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
        document.head.appendChild(script);
        
        return new Promise((resolve) => {
          script.onload = resolve;
          script.onerror = resolve;
        });
      }
    };

    const initializeMap = async () => {
      await loadHeatPlugin();

      // Create map instance centered on continental US
      const map = L.map(mapRef.current).setView([39.8283, -98.5795], 4);
      
      // Set bounds to continental US if no observations to fit
      const continentalUSBounds = L.latLngBounds(
        [20.0, -130.0], // Southwest corner
        [50.0, -65.0]   // Northeast corner
      );

      // Add OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      // Create heatmap data points
      const heatmapData: [number, number, number][] = [];
      const bounds: L.LatLngBounds = L.latLngBounds([]);
      
      validObservations.forEach(obs => {
        const lat = parseFloat(obs.latitude);
        const lng = parseFloat(obs.longitude);
        
        if (!isNaN(lat) && !isNaN(lng)) {
          heatmapData.push([lat, lng, 0.8]); // [latitude, longitude, intensity]
          bounds.extend([lat, lng]);
        }
      });

      // Add heatmap layer if plugin is available
      if (heatmapData.length > 0) {
        if ((window as any).L && (window as any).L.heatLayer) {
          const heat = (window as any).L.heatLayer(heatmapData, {
            radius: 25,
            blur: 25,
            maxZoom: 17,
            max: 0.6,
            minOpacity: 0.3,
            gradient: {
              0.0: 'rgba(0, 0, 255, 0.4)',     // More visible blue
              0.15: 'rgba(0, 255, 255, 0.5)',  // Cyan
              0.3: 'rgba(0, 255, 0, 0.6)',     // Green
              0.45: 'rgba(255, 255, 0, 0.7)',  // Yellow
              0.65: 'rgba(255, 165, 0, 0.75)', // Orange
              1.0: 'rgba(255, 0, 0, 0.8)'      // Less bold red
            }
          }).addTo(map);
          
          // Fit map to observation bounds or default to continental US
          // Always use continental US bounds for consistent view
          map.fitBounds(continentalUSBounds);
        } else {
          // Fallback to simple markers if heat plugin fails
          validObservations.slice(0, 500).forEach(obs => {
            const lat = parseFloat(obs.latitude);
            const lng = parseFloat(obs.longitude);
            
            if (!isNaN(lat) && !isNaN(lng)) {
              L.circleMarker([lat, lng], {
                radius: 3,
                fillColor: '#3388ff',
                color: 'white',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.7
              }).addTo(map).bindPopup(`
                <div style="font-family: system-ui;">
                  <h4 style="margin: 0 0 8px 0; font-weight: 600;">${obs.scientificName}</h4>
                  <p style="margin: 0 0 4px 0; color: #666; font-size: 12px;">${obs.state}</p>
                  <p style="margin: 0 0 4px 0; color: #888; font-size: 12px;">${new Date(obs.observedOn).toLocaleDateString()}</p>
                </div>
              `);
            }
          });
          
          // Use continental US bounds for consistent view
          map.fitBounds(continentalUSBounds);
        }
      }

      mapInstanceRef.current = map;
    };

    initializeMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [validObservations, isLoading]);

  console.log('[GeospatialMap] Render', {
    isLoading,
    observationsCount: observations.length,
    validObservationsCount: validObservations.length,
    selectedState
  });

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
          {selectedState && (
            <span className="ml-2 text-blue-600 font-medium">- Filtered by {selectedState}</span>
          )}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Map */}
          <div className="lg:col-span-3">
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
                    <p className="text-slate-500">
                      {selectedState 
                        ? `No observations found in ${selectedState}` 
                        : "No observations with GPS coordinates found"
                      }
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* State Selector */}
          <div className="lg:col-span-1">
            <div className="bg-slate-50 rounded-lg p-4">
              <h4 className="font-medium text-slate-900 mb-3">Filter by State</h4>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {sortedStates.map((item) => (
                  <button
                    key={item.state}
                    onClick={() => onStateSelect?.(item.state)}
                    className={`w-full text-left p-2 rounded text-sm transition-colors ${
                      selectedState === item.state
                        ? 'bg-blue-100 text-blue-800 border border-blue-200'
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className="font-medium">{item.state}</div>
                    <div className="text-xs text-slate-500">
                      {item.count.toLocaleString()} obs, {item.speciesCount} species
                    </div>
                  </button>
                ))}
              </div>
              {selectedState && (
                <button
                  onClick={() => onStateSelect?.('')}
                  className="w-full mt-3 px-3 py-1 text-xs bg-slate-200 hover:bg-slate-300 rounded text-slate-700"
                >
                  Clear Filter
                </button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}