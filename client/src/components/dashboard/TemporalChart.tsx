import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface TemporalData {
  period: string;
  count: number;
}

export function TemporalChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  const [groupBy, setGroupBy] = useState<'month' | 'quarter' | 'year'>('month');

  const { data: trends = [], isLoading } = useQuery<TemporalData[]>({
    queryKey: ["/api/temporal-trends", { groupBy }],
  });

  useEffect(() => {
    if (!canvasRef.current || !trends.length) return;

    const Chart = (window as any).Chart;
    if (!Chart) return;

    // Destroy existing chart
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: trends.map(t => t.period),
        datasets: [{
          label: 'Observations',
          data: trends.map(t => t.count),
          borderColor: 'hsl(var(--primary))',
          backgroundColor: 'hsla(var(--primary), 0.1)',
          tension: 0.4,
          fill: true,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: 'hsl(var(--border))',
            },
            ticks: {
              color: 'hsl(var(--muted-foreground))',
            }
          },
          x: {
            grid: {
              color: 'hsl(var(--border))',
            },
            ticks: {
              color: 'hsl(var(--muted-foreground))',
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
  }, [trends]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Temporal Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 bg-slate-100 rounded-lg animate-pulse flex items-center justify-center">
            <p className="text-slate-500">Loading chart...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Temporal Trends</CardTitle>
          <Select value={groupBy} onValueChange={(value: 'month' | 'quarter' | 'year') => setGroupBy(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="quarter">Quarterly</SelectItem>
              <SelectItem value="year">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <canvas ref={canvasRef} />
        </div>
      </CardContent>
    </Card>
  );
}
