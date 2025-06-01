import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

interface Species {
  id: number;
  scientificName: string;
  commonName: string | null;
  observationCount: number;
}

interface SpeciesFrequencyProps {
  dateRange?: string;
  selectedState?: string | null;
}

export function SpeciesFrequency({ dateRange, selectedState }: SpeciesFrequencyProps) {
  const { data: species = [], isLoading } = useQuery<Species[]>({
    queryKey: ["/api/species", { type: 'top', limit: '5' }, dateRange, selectedState],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('type', 'top');
      params.append('limit', '5');
      if (dateRange) {
        params.append('dateRange', dateRange);
      }
      if (selectedState) {
        params.append('state', selectedState);
      }
      const response = await fetch(`/api/species?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch species');
      return response.json();
    }
  });

  const maxCount = species.length > 0 ? species[0].observationCount : 1;

  const getBarColor = (index: number) => {
    const colors = [
      'bg-primary',
      'bg-green-500',
      'bg-yellow-500',
      'bg-purple-500',
      'bg-red-500',
    ];
    return colors[index % colors.length];
  };

  const getBorderColor = (index: number) => {
    const colors = [
      'border-primary',
      'border-green-500',
      'border-yellow-500',
      'border-purple-500',
      'border-red-500',
    ];
    return colors[index % colors.length];
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Most Observed Species</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border-l-4 border-slate-200 pl-4 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-32 mb-1"></div>
                <div className="h-3 bg-slate-200 rounded w-24 mb-2"></div>
                <div className="flex items-center">
                  <div className="flex-1 bg-slate-200 rounded-full h-2 mr-3"></div>
                  <div className="h-4 bg-slate-200 rounded w-8"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Most Observed Species</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {species.map((speciesItem, index) => {
            const percentage = (speciesItem.observationCount / maxCount) * 100;
            
            return (
              <div 
                key={speciesItem.id} 
                className={`border-l-4 ${getBorderColor(index)} pl-4`}
              >
                <p className="font-medium text-slate-900 italic">
                  {speciesItem.scientificName}
                </p>
                <p className="text-sm text-slate-600">
                  {speciesItem.commonName || 'Unknown common name'}
                </p>
                <div className="flex items-center mt-2">
                  <div className="flex-1 bg-slate-200 rounded-full h-2">
                    <div 
                      className={`${getBarColor(index)} h-2 rounded-full transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="ml-3 text-sm font-medium text-slate-900">
                    {speciesItem.observationCount.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {species.length > 0 && (
          <Link href="/species">
            <Button variant="ghost" className="w-full mt-4 text-primary hover:text-primary/80">
              View All Species
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
