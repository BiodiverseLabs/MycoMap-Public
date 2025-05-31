import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import React from "react";

interface RegionalData {
  region: string;
  count: number;
  percentage: number;
}

interface RegionalAnalysisProps {
  dateRange?: string;
  selectedState?: string | null;
}

// US State to Region mapping
const STATE_TO_REGION: { [key: string]: string } = {
  // Northeast
  'Connecticut': 'Northeast',
  'Maine': 'Northeast', 
  'Massachusetts': 'Northeast',
  'New Hampshire': 'Northeast',
  'New Jersey': 'Northeast',
  'New York': 'Northeast',
  'Pennsylvania': 'Northeast',
  'Rhode Island': 'Northeast',
  'Vermont': 'Northeast',
  
  // Southeast
  'Alabama': 'Southeast',
  'Arkansas': 'Southeast',
  'Delaware': 'Southeast',
  'Florida': 'Southeast',
  'Georgia': 'Southeast',
  'Kentucky': 'Southeast',
  'Louisiana': 'Southeast',
  'Maryland': 'Southeast',
  'Mississippi': 'Southeast',
  'North Carolina': 'Southeast',
  'South Carolina': 'Southeast',
  'Tennessee': 'Southeast',
  'Virginia': 'Southeast',
  'West Virginia': 'Southeast',
  
  // Midwest
  'Illinois': 'Midwest',
  'Indiana': 'Midwest',
  'Iowa': 'Midwest',
  'Kansas': 'Midwest',
  'Michigan': 'Midwest',
  'Minnesota': 'Midwest',
  'Missouri': 'Midwest',
  'Nebraska': 'Midwest',
  'North Dakota': 'Midwest',
  'Ohio': 'Midwest',
  'South Dakota': 'Midwest',
  'Wisconsin': 'Midwest',
  
  // Southwest
  'Arizona': 'Southwest',
  'New Mexico': 'Southwest',
  'Oklahoma': 'Southwest',
  'Texas': 'Southwest',
  
  // West
  'Alaska': 'West',
  'California': 'West',
  'Colorado': 'West',
  'Hawaii': 'West',
  'Idaho': 'West',
  'Montana': 'West',
  'Nevada': 'West',
  'Oregon': 'West',
  'Utah': 'West',
  'Washington': 'West',
  'Wyoming': 'West'
};

export function RegionalAnalysis({ dateRange, selectedState }: RegionalAnalysisProps) {
  // Fetch observations data
  const { data: observations = [], isLoading } = useQuery({
    queryKey: ["/api/observations", { dateRange, state: selectedState }],
    queryFn: async () => {
      let url = '/api/observations';
      const params = new URLSearchParams();
      
      if (dateRange) {
        params.append('dateRange', dateRange);
      }
      if (selectedState) {
        params.append('state', selectedState);
      }
      
      if (params.toString()) {
        url += '?' + params.toString();
      }
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch observations');
      return response.json();
    }
  });

  // Process data based on whether a state is selected
  const regionalData: RegionalData[] = React.useMemo(() => {
    if (!observations.length) return [];

    if (selectedState) {
      // Show location breakdown for selected state using placeGuess field
      const locationCounts = observations.reduce((acc: { [key: string]: number }, obs: any) => {
        // Extract location from placeGuess field
        let location = 'Unknown Location';
        if (obs.placeGuess) {
          // Try to extract county or city from place guess
          const parts = obs.placeGuess.split(',').map((part: string) => part.trim());
          if (parts.length >= 2) {
            // Use the first part as the local area (city/county)
            location = parts[0];
          } else {
            location = obs.placeGuess;
          }
        }
        acc[location] = (acc[location] || 0) + 1;
        return acc;
      }, {});

      const total = observations.length;
      return Object.entries(locationCounts)
        .map(([location, count]) => ({
          region: location,
          count: count as number,
          percentage: Math.round(((count as number) / total) * 100)
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10 locations
    } else {
      // Show regional breakdown for entire US
      const regionCounts = observations.reduce((acc: { [key: string]: number }, obs: any) => {
        const state = obs.state;
        const region = STATE_TO_REGION[state] || 'Other';
        acc[region] = (acc[region] || 0) + 1;
        return acc;
      }, {});

      const total = observations.length;
      return Object.entries(regionCounts)
        .map(([region, count]) => ({
          region,
          count: count as number,
          percentage: Math.round(((count as number) / total) * 100)
        }))
        .sort((a, b) => b.count - a.count);
    }
  }, [observations, selectedState]);

  const getRegionColor = (index: number) => {
    const colors = [
      'bg-blue-500',
      'bg-green-500', 
      'bg-yellow-500',
      'bg-red-500',
      'bg-purple-500',
      'bg-indigo-500',
      'bg-pink-500',
      'bg-gray-500'
    ];
    return colors[index % colors.length];
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Regional Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <div className="text-slate-500">Loading regional data...</div>
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
          {selectedState ? `${selectedState} Locations` : 'US Regions'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {regionalData.length > 0 ? (
          <div className="space-y-3">
            {regionalData.map((item, index) => (
              <div key={item.region} className="flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1">
                  <div className={`w-3 h-3 rounded-full ${getRegionColor(index)}`} />
                  <span className="text-sm font-medium text-slate-700 truncate">
                    {item.region}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${getRegionColor(index)}`}
                      style={{ width: `${Math.min(item.percentage, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm text-slate-600 min-w-[3rem] text-right">
                    {item.count.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-500 min-w-[2.5rem] text-right">
                    {item.percentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center">
            <div className="text-center">
              <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No regional data available</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}