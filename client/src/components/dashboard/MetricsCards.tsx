import { Card, CardContent } from "@/components/ui/card";
import { Eye, Sprout, Users, MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface Metrics {
  totalObservations: number;
  uniqueSpecies: number;
  activeContributors: number;
  statesCovered: number;
  fullyValidated: number;
}

interface MetricsCardsProps {
  dateRange?: string;
  selectedState?: string | null;
}

export function MetricsCards({ dateRange, selectedState }: MetricsCardsProps) {
  const { data: metrics, isLoading, error } = useQuery<Metrics>({
    queryKey: ["/api/metrics", dateRange, selectedState],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange) {
        params.append('dateRange', dateRange);
      }
      if (selectedState) {
        params.append('state', selectedState);
      }
      const url = `/api/metrics?${params.toString()}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch metrics: ${response.status}`);
      
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
    gcTime: 10 * 60 * 1000, // 10 minutes - cache retention
  });

  // Add debug logging for props and state changes
  console.log(`[MetricsCards] Rendering with dateRange: ${dateRange}, isLoading: ${isLoading}, hasData: ${!!metrics}`);
  if (error) {
    console.error(`[MetricsCards] Error:`, error);
  }

  const cards = [
    {
      title: "Total Observations",
      value: metrics?.totalObservations || 0,
      icon: Eye,
      color: "bg-primary/10 text-primary",
      change: "+8.2%",
    },
    {
      title: "Unique Species",
      value: metrics?.uniqueSpecies || 0,
      icon: Sprout,
      color: "bg-green-100 text-green-600",
      change: "+12.1%",
    },
    {
      title: "Active Contributors",
      value: metrics?.activeContributors || 0,
      icon: Users,
      color: "bg-yellow-100 text-yellow-600",
      change: "+5.3%",
    },
    {
      title: "Regions Covered",
      value: metrics?.statesCovered || 0,
      icon: MapPin,
      color: "bg-purple-100 text-purple-600",
      change: "Complete coverage",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-24"></div>
                  <div className="h-8 bg-slate-200 rounded w-16"></div>
                </div>
                <div className="w-12 h-12 bg-slate-200 rounded-lg"></div>
              </div>
              <div className="mt-4 h-4 bg-slate-200 rounded w-20"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">{card.title}</p>
                  <p className="text-3xl font-bold text-slate-900 mt-1">
                    {card.value.toLocaleString()}
                  </p>
                </div>
                <div className={`w-12 h-12 ${card.color} rounded-lg flex items-center justify-center`}>
                  <Icon className="text-xl" />
                </div>
              </div>

            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
