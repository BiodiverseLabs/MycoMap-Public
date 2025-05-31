import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { Calendar } from "lucide-react";

interface TemporalData {
  period: string;
  count: number;
}

interface TemporalChartProps {
  dateRange?: string;
}

export function TemporalChart({ dateRange }: TemporalChartProps = {}) {
  const { data: trends = [], isLoading } = useQuery<TemporalData[]>({
    queryKey: ["/api/temporal-trends", { groupBy: 'year' }],
  });

  // Transform period data for yearly display, starting from 2010
  const yearlyData = trends
    .filter(item => item.period.match(/^\d{4}(-\d{2})?$/)) // Only year or year-month format
    .reduce((acc, item) => {
      const year = item.period.substring(0, 4);
      const existing = acc.find(d => d.period === year);
      if (existing) {
        existing.count += item.count;
      } else {
        acc.push({ period: year, count: item.count });
      }
      return acc;
    }, [] as TemporalData[])
    .filter(item => parseInt(item.period) >= 2010) // Filter to start from 2010
    .sort((a, b) => parseInt(a.period) - parseInt(b.period));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
          <p className="font-medium text-slate-900">{label}</p>
          <p className="text-sm text-slate-600">
            {payload[0].value.toLocaleString()} observations
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
            <Calendar className="w-5 h-5" />
            Temporal Trends
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
          Temporal Trends (Yearly)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {yearlyData.length > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="period" 
                  stroke="#64748b"
                  fontSize={12}
                />
                <YAxis 
                  stroke="#64748b"
                  fontSize={12}
                  tickFormatter={(value) => value.toLocaleString()}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="count" 
                  fill="#3b82f6" 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-80 flex items-center justify-center">
            <div className="text-center">
              <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No temporal data available</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}