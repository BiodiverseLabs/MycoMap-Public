import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { MapPin, SortAsc, BarChart3 } from "lucide-react";
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
  const [sortBy, setSortBy] = useState<'count' | 'alphabetical'>('count');

  // Fetch optimized map data using GPS index for faster loading (up to 15k points)
  const { data: observations = [], isLoading } = useQuery<Array<{
    latitude: number;
    longitude: number;
    species?: string;
  }>>({
    queryKey: ["/api/map-data", selectedState],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedState) {
        params.append('state', selectedState);
        params.append('limit', '75000');
      } else {
        params.append('limit', '75000');
      }
      const response = await fetch(`/api/map-data?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch map data');
      return response.json();
    }
  });

  // Fetch state counts from full dataset for filters
  const { data: stateCounts = [] } = useQuery({
    queryKey: ["/api/state-counts", dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange) {
        params.append('dateRange', dateRange);
      }
      params.append('aggregate', 'states');
      const response = await fetch(`/api/observations/summary?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch state counts');
      return response.json();
    }
  });

  // Fetch total record count to show records without GPS coordinates
  const { data: totalRecords } = useQuery({
    queryKey: ["/api/metrics", selectedState],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedState) {
        params.append('state', selectedState);
      }
      const response = await fetch(`/api/metrics?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch total records');
      return response.json();
    }
  });

  // GPS index returns pre-validated coordinates, minimal filtering needed
  const validObservations = observations.filter(obs => {
    const lat = obs.latitude;
    const lng = obs.longitude;
    
    return lat && lng && 
      !isNaN(lat) && !isNaN(lng) &&
      lat !== 0 && lng !== 0 &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180;
  });

  // Use full dataset state counts for filter sidebar with sorting
  const sortedStates = stateCounts
    .filter((item: any) => item.state && item.state !== 'Unknown')
    .sort((a: any, b: any) => {
      if (sortBy === 'alphabetical') {
        return a.state.localeCompare(b.state);
      } else {
        return b.count - a.count; // Sort by count descending
      }
    }); // Show all states with scrolling

  // Initialize map when component mounts and observations are available
  useEffect(() => {
    if (!mapRef.current || isLoading) return;

    // Clean up existing map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    // Load Leaflet.heat plugin dynamically with better error handling
    const loadHeatPlugin = async () => {
      if (!(window as any).L || !(window as any).L.heatLayer) {
        await new Promise<void>((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
          script.onload = () => resolve();
          script.onerror = () => resolve(); // Continue even if it fails
          document.head.appendChild(script);
          
          // Timeout fallback to prevent hanging
          setTimeout(resolve, 3000);
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
        const lat = typeof obs.latitude === 'string' ? parseFloat(obs.latitude) : obs.latitude;
        const lng = typeof obs.longitude === 'string' ? parseFloat(obs.longitude) : obs.longitude;
        
        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
          heatmapData.push([lat, lng, 0.8]); // [latitude, longitude, intensity]
          bounds.extend([lat, lng]);
        }
      });

      console.log('[GeospatialMap] Heatmap data ready:', {
        heatmapLength: heatmapData.length,
        hasLeaflet: !!(window as any).L,
        hasHeatLayer: !!(window as any).L && !!(window as any).L.heatLayer,
        sampleData: heatmapData.slice(0, 3),
        environment: process.env.NODE_ENV || 'unknown',
        timestamp: new Date().toISOString()
      });

      // Multiple attempts to add heatmap with fallback markers
      if (heatmapData.length > 0) {
        let attemptCount = 0;
        const maxAttempts = 3;
        
        const attemptHeatmap = () => {
          attemptCount++;
          console.log(`[GeospatialMap] Heatmap attempt ${attemptCount}/${maxAttempts}`);
          
          if (mapInstanceRef.current && (window as any).L && (window as any).L.heatLayer) {
            try {
              console.log('[GeospatialMap] Creating heatmap with', heatmapData.length, 'data points');
              const heat = (window as any).L.heatLayer(heatmapData, {
                radius: 22,
                blur: 12,
                maxZoom: 17,
                max: 0.8,
                minOpacity: 0.2,
                gradient: {
                  0.0: 'rgba(0, 0, 255, 0.3)',
                  0.2: 'rgba(0, 255, 255, 0.5)',
                  0.4: 'rgba(0, 255, 0, 0.6)',
                  0.6: 'rgba(255, 255, 0, 0.7)',
                  0.8: 'rgba(255, 165, 0, 0.8)',
                  1.0: 'rgba(255, 0, 0, 0.9)'
                }
              }).addTo(mapInstanceRef.current);
              
              console.log('[GeospatialMap] Heatmap layer added successfully');
              return true;
            } catch (error) {
              console.error('[GeospatialMap] Heatmap creation failed:', error);
            }
          }
          
          // If heatmap failed and we have attempts left, try again
          if (attemptCount < maxAttempts) {
            setTimeout(attemptHeatmap, 1000 * attemptCount);
            return false;
          }
          
          // Final fallback - add circle markers to ensure visibility
          console.log('[GeospatialMap] All heatmap attempts failed, adding circle markers');
          let markersAdded = 0;
          validObservations.slice(0, 500).forEach(obs => {
            const lat = typeof obs.latitude === 'string' ? parseFloat(obs.latitude) : obs.latitude;
            const lng = typeof obs.longitude === 'string' ? parseFloat(obs.longitude) : obs.longitude;
            
            if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && mapInstanceRef.current) {
              try {
                L.circleMarker([lat, lng], {
                  radius: 2,
                  fillColor: '#2563eb',
                  color: '#ffffff',
                  weight: 1,
                  opacity: 1,
                  fillOpacity: 0.7
                }).addTo(mapInstanceRef.current);
                markersAdded++;
              } catch (error) {
                console.error('[GeospatialMap] Marker creation failed:', error);
              }
            }
          });
          console.log('[GeospatialMap] Added', markersAdded, 'fallback circle markers');
          return true;
        };
        
        // Start first attempt immediately
        setTimeout(attemptHeatmap, 500);
        
        // Use continental US bounds for consistent view
        map.fitBounds(continentalUSBounds);
      } else {
        console.log('[GeospatialMap] No observation data available');
        map.fitBounds(continentalUSBounds);
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
          {totalRecords && (
            <span className="text-slate-500">
              {" "}• {(totalRecords.totalObservations - validObservations.length).toLocaleString()} without coordinates
            </span>
          )}
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
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-slate-900">Filter by State</h4>
                <div className="flex gap-1">
                  <button
                    onClick={() => setSortBy('count')}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      sortBy === 'count'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-white text-slate-600 hover:bg-slate-100'
                    }`}
                    title="Sort by observation count"
                  >
                    <BarChart3 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setSortBy('alphabetical')}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      sortBy === 'alphabetical'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-white text-slate-600 hover:bg-slate-100'
                    }`}
                    title="Sort alphabetically"
                  >
                    <SortAsc className="w-3 h-3" />
                  </button>
                </div>
              </div>
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
                      {item.count.toLocaleString()} observations
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