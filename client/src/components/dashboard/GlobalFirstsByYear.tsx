import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";

interface GlobalFirstsByYearProps {
  dateRange: string;
  selectedState?: string | null;
}

export function GlobalFirstsByYear({ dateRange, selectedState }: GlobalFirstsByYearProps) {
  const { data: globalFirstsData = [], isLoading } = useQuery({
    queryKey: ["/api/global-firsts-by-year"],
    queryFn: async () => {
      const response = await fetch('/api/global-firsts-by-year');
      if (!response.ok) throw new Error('Failed to fetch global firsts by year');
      return response.json();
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Global First Records by Year
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
          <TrendingUp className="w-5 h-5" />
          Global First Records by Year
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={globalFirstsData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="year" 
                type="number"
                scale="linear"
                domain={['dataMin', 'dataMax']}
              />
              <YAxis />
              <Tooltip 
                formatter={(value) => [value, 'Global First Records']}
                labelFormatter={(label) => `Year: ${label}`}
              />
              <Bar 
                dataKey="count" 
                fill="#16a34a" 
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}