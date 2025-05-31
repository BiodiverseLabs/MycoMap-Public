import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { MapPin, BarChart3 } from "lucide-react";

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
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'map' | 'chart'>('map');

  const { data: observations = [], isLoading } = useQuery<Observation[]>({
    queryKey: ["/api/observations", dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange) {
        params.append('dateRange', dateRange);
      }
      params.append('limit', '500'); // Limit for map performance
      const response = await fetch(`/api/observations?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch observations');
      return response.json();
    }
  });

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance || !observations.length || viewMode !== 'map') return;

    // Load Leaflet dynamically
    import('leaflet').then((L) => {
      // Fix default marker icons
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      });

      // Create map
      const map = L.map(mapRef.current!).setView([39.8283, -98.5795], 4);
      
      // Add tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      // Add markers
      const validObservations = observations.filter(obs => 
        obs.latitude && obs.longitude && 
        !isNaN(parseFloat(obs.latitude)) && !isNaN(parseFloat(obs.longitude))
      );

      validObservations.forEach(obs => {
        const lat = parseFloat(obs.latitude);
        const lng = parseFloat(obs.longitude);
        
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          L.marker([lat, lng])
            .bindPopup(`
              <div>
                <strong>${obs.scientificName}</strong><br>
                State: ${obs.state}<br>
                Date: ${new Date(obs.observedOn).toLocaleDateString()}
              </div>
            `)
            .addTo(map);
        }
      });

      setMapInstance(map);
    });

    return () => {
      if (mapInstance) {
        mapInstance.remove();
        setMapInstance(null);
      }
    };
  }, [observations, viewMode, mapInstance]);

  // Group observations by state for chart view
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
    .slice(0, 10);

  function getBarColor(index: number): string {
    const colors = [
      'bg-blue-500',
      'bg-green-500', 
      'bg-purple-500',
      'bg-orange-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-yellow-500',
      'bg-red-500',
      'bg-teal-500',
      'bg-cyan-500'
    ];
    return colors[index] || 'bg-slate-500';
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Geographic Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-slate-600">Loading geographic data...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Geographic Distribution</CardTitle>
            <p className="text-sm text-slate-600">
              {viewMode === 'map' ? 'Interactive map view' : 'Top states by observation count'} ({observations.length.toLocaleString()} observations)
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'map' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('map')}
            >
              <MapPin className="h-4 w-4 mr-1" />
              Map
            </Button>
            <Button
              variant={viewMode === 'chart' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('chart')}
            >
              <BarChart3 className="h-4 w-4 mr-1" />
              Chart
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === 'map' ? (
          <div className="space-y-4">
            <div 
              ref={mapRef} 
              className="w-full h-96 rounded-lg border"
              style={{ minHeight: '400px' }}
            />
            {observations.length > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  Showing {observations.filter(obs => 
                    obs.latitude && obs.longitude && 
                    !isNaN(parseFloat(obs.latitude)) && !isNaN(parseFloat(obs.longitude))
                  ).length} observations with valid coordinates
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {sortedStates.map((item, index) => {
              const percentage = (item.count / observations.length) * 100;
              return (
                <div key={item.state} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-slate-900">{item.state}</span>
                    <div className="text-right">
                      <span className="text-sm font-medium text-slate-900">
                        {item.count.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-600 ml-2">
                        ({item.speciesCount} species)
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${getBarColor(index)}`}
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {percentage.toFixed(1)}% of total observations
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}