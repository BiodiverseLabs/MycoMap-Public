import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Calendar } from "lucide-react";

interface GlobalFirstsByWeekProps {
  dateRange: string;
  selectedState?: string | null;
  collectorSearch?: string;
}

export function GlobalFirstsByWeek({ dateRange, selectedState, collectorSearch }: GlobalFirstsByWeekProps) {
  const { data: globalFirstsWeekData = [], isLoading } = useQuery({
    queryKey: ["/api/global-firsts-by-week", selectedState, collectorSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedState) params.set('state', selectedState);
      if (collectorSearch) params.set('collector', collectorSearch);
      const url = `/api/global-firsts-by-week${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch global firsts by week');
      return response.json();
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Global First Records by Week (Seasonal Pattern)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 flex items-center justify-center">
            <div className="text-slate-500">Loading...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Global First Records by Week (Seasonal Pattern)
        </CardTitle>
        <p className="text-sm text-slate-600 mt-1">
          Shows when global first discoveries typically occur during the year (weeks 1-52, aggregated across all years)
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={globalFirstsWeekData}
              margin={{ top: 20, right: 30, left: 80, bottom: 30 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="week" 
                type="category"
                interval={3}
                tick={{ fontSize: 12 }}
                label={{ value: 'Week of Year', position: 'insideBottom', offset: -10 }}
              />
              <YAxis 
                label={{ value: 'Records', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                formatter={(value) => [value, 'Global First Records']}
                labelFormatter={(label) => `Week ${label} of the year`}
              />
              <Bar 
                dataKey="count" 
                fill="#059669" 
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}