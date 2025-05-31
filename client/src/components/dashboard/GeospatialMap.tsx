import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const { data: observations = [], isLoading } = useQuery<Observation[]>({
    queryKey: ["/api/observations", dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange) {
        params.append('dateRange', dateRange);
      }
      params.append('limit', '1000'); // Limit for performance
      const response = await fetch(`/api/observations?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch observations');
      return response.json();
    }
  });

  // Group observations by state for summary view
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
        <CardTitle>Geographic Distribution</CardTitle>
        <p className="text-sm text-slate-600">
          Top states by observation count ({observations.length.toLocaleString()} total observations)
        </p>
      </CardHeader>
      <CardContent>
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
        
        {observations.length >= 1000 && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              Showing geographic distribution for sample of {observations.length.toLocaleString()} observations
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}