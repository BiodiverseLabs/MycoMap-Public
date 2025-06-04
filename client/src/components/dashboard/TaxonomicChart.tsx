import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ExternalLink } from "lucide-react";

interface TaxonomicData {
  phylum: string;
  count: number;
}

interface TaxonomicChartProps {
  dateRange?: string;
  selectedState?: string | null;
  startDate?: string;
  endDate?: string;
  goingBackYears?: string;
  collectorQuery?: string;
}

export function TaxonomicChart({ 
  dateRange, 
  selectedState, 
  startDate, 
  endDate, 
  goingBackYears, 
  collectorQuery 
}: TaxonomicChartProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  const { data: distribution = [], isLoading } = useQuery<TaxonomicData[]>({
    queryKey: ["/api/taxonomic-distribution", selectedState, startDate, endDate, goingBackYears, collectorQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedState) params.append('state', selectedState);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (goingBackYears && goingBackYears !== '0') params.append('goingBackYears', goingBackYears);
      if (collectorQuery) params.append('collector', collectorQuery);
      
      const response = await fetch(`/api/taxonomic-distribution?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch taxonomic distribution');
      return response.json();
    }
  });

  useEffect(() => {
    if (!canvasRef.current || !distribution.length) return;

    const Chart = (window as any).Chart;
    if (!Chart) return;

    // Destroy existing chart
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const colors = [
      '#2563eb', // Blue
      '#dc2626', // Red
      '#16a34a', // Green
      '#ca8a04', // Yellow
      '#7c3aed', // Purple
      '#ea580c', // Orange
      '#0891b2', // Cyan
      '#be185d', // Pink
      '#65a30d', // Lime
      '#0d9488', // Teal
      '#7c2d12', // Brown
      '#374151', // Gray
    ];

    chartRef.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: distribution.map(d => d.phylum),
        datasets: [{
          data: distribution.map(d => d.count),
          backgroundColor: colors.slice(0, distribution.length),
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: 'hsl(var(--foreground))',
              usePointStyle: true,
              padding: 20,
            }
          }
        }
      }
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [distribution]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Taxonomic Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-slate-100 rounded-lg animate-pulse flex items-center justify-center">
            <p className="text-slate-500">Loading chart...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Phylum Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <canvas ref={canvasRef} />
        </div>
        <div className="mt-4 space-y-2 text-sm">
          {distribution.slice(0, 3).map((item, index) => (
            <div key={item.phylum} className="flex items-center justify-between">
              <span className="text-slate-600">{item.phylum}</span>
              <span className="font-medium text-slate-900">{item.count.toLocaleString()}</span>
            </div>
          ))}
          <div className="pt-2 mt-2 border-t">
            <Link href="/taxonomic/phylum">
              <div className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 cursor-pointer">
                <span>See all records</span>
                <ExternalLink className="h-3 w-3" />
              </div>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
