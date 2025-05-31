import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { Database } from "lucide-react";

interface SourceData {
  source: string;
  count: number;
  percentage: number;
}

interface ObservationSourcesProps {
  dateRange?: string;
}

export function ObservationSources({ dateRange }: ObservationSourcesProps) {
  const { data: rawSources = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/observation-sources", dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange && dateRange !== 'all_time') {
        params.append('dateRange', dateRange);
      }
      
      const response = await fetch(`/api/observation-sources?${params}`);
      if (!response.ok) throw new Error('Failed to fetch observation sources');
      return response.json();
    }
  });

  // Convert string values to numbers
  const sources: SourceData[] = rawSources.map(source => ({
    source: source.source,
    count: parseInt(source.count),
    percentage: parseFloat(source.percentage)
  }));

  const COLORS = [
    '#10B981', // Green for iNaturalist
    '#F59E0B', // Amber for Mushroom Observer
    '#3B82F6', // Blue for other sources
    '#8B5CF6', // Purple
    '#EF4444', // Red
    '#6B7280', // Gray
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
          <p className="font-medium text-slate-900">{data.source}</p>
          <p className="text-sm text-slate-600">
            {data.count.toLocaleString()} observations ({data.percentage.toFixed(1)}%)
          </p>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Observation Sources
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
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
          <Database className="w-5 h-5" />
          Observation Sources
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sources.length > 0 ? (
          <div className="space-y-4">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sources}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {sources.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-1 gap-2 text-xs">
              {sources.map((source, index) => (
                <div key={source.source} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-slate-700">
                    {source.source} ({source.percentage.toFixed(1)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center">
            <div className="text-center">
              <Database className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No source data available</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}