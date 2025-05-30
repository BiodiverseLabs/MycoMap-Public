import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

interface RareSpecies {
  id: number;
  scientificName: string;
  commonName: string | null;
  observationCount: number;
  lastObserved: string | null;
}

export function RareSpecies() {
  const { data: species = [], isLoading } = useQuery<RareSpecies[]>({
    queryKey: ["/api/species", { type: 'rare', limit: '5' }],
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown date';
    try {
      return new Date(dateString).toLocaleDateString('en-US', { 
        month: 'short', 
        year: 'numeric' 
      });
    } catch {
      return dateString;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Rare Species</CardTitle>
            <Badge className="bg-orange-100 text-orange-800">≤ 3 Observations</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-start justify-between p-3 bg-slate-50 rounded-lg animate-pulse">
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded w-32 mb-1"></div>
                  <div className="h-3 bg-slate-200 rounded w-24 mb-2"></div>
                  <div className="h-3 bg-slate-200 rounded w-20"></div>
                </div>
                <div className="h-6 bg-slate-200 rounded w-6"></div>
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
        <div className="flex items-center justify-between">
          <CardTitle>Rare Species</CardTitle>
          <Badge className="bg-orange-100 text-orange-800">≤ 3 Observations</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {species.map((speciesItem) => (
            <div 
              key={speciesItem.id} 
              className="flex items-start justify-between p-3 bg-slate-50 rounded-lg"
            >
              <div>
                <p className="font-medium text-slate-900 italic">
                  {speciesItem.scientificName}
                </p>
                <p className="text-sm text-slate-600">
                  {speciesItem.commonName || 'Unknown common name'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Last observed: {formatDate(speciesItem.lastObserved)}
                </p>
              </div>
              <Badge 
                variant="secondary"
                className="bg-orange-100 text-orange-700"
              >
                {speciesItem.observationCount}
              </Badge>
            </div>
          ))}
        </div>
        {species.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            No rare species found
          </div>
        )}
      </CardContent>
    </Card>
  );
}
