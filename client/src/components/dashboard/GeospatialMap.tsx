import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
  const [viewMode, setViewMode] = useState<'chart' | 'coordinates'>('chart');

  const { data: observations = [], isLoading } = useQuery<Observation[]>({
    queryKey: ["/api/observations", dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange) {
        params.append('dateRange', dateRange);
      }
      params.append('limit', '100'); // Small limit for performance
      const response = await fetch(`/api/observations?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch observations');
      return response.json();
    }
  });

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

  // Get valid coordinates for coordinate view
  const validCoordinates = observations
    .filter(obs => 
      obs.latitude && obs.longitude && 
      !isNaN(parseFloat(obs.latitude)) && !isNaN(parseFloat(obs.longitude))
    )
    .map(obs => ({
      ...obs,
      lat: parseFloat(obs.latitude),
      lng: parseFloat(obs.longitude)
    }))
    .filter(obs => 
      obs.lat >= -90 && obs.lat <= 90 && 
      obs.lng >= -180 && obs.lng <= 180
    )
    .slice(0, 20); // Limit to 20 for display

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
              {viewMode === 'chart' ? 'Top states by observation count' : 'Sample coordinates'} ({observations.length.toLocaleString()} observations)
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'chart' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('chart')}
            >
              <BarChart3 className="h-4 w-4 mr-1" />
              Chart
            </Button>
            <Button
              variant={viewMode === 'coordinates' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('coordinates')}
            >
              <MapPin className="h-4 w-4 mr-1" />
              Coordinates
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === 'chart' ? (
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
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
              {validCoordinates.map((obs, index) => (
                <div key={obs.id} className="p-3 border rounded-lg bg-slate-50">
                  <div className="font-medium text-sm text-slate-900 mb-1">
                    {obs.scientificName}
                  </div>
                  <div className="text-xs text-slate-600 space-y-1">
                    <div>📍 {obs.lat.toFixed(4)}, {obs.lng.toFixed(4)}</div>
                    <div>📍 {obs.state}</div>
                    <div>📅 {new Date(obs.observedOn).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
            {validCoordinates.length > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  Showing {validCoordinates.length} observations with valid coordinates from sample of {observations.length}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}