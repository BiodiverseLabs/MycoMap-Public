import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

interface Contributor {
  id: number;
  name: string;
  affiliation: string | null;
  observationCount: number;
}

interface TopContributorsProps {
  dateRange?: string;
}

export function TopContributors({ dateRange }: TopContributorsProps) {
  const { data: contributors = [], isLoading } = useQuery<Contributor[]>({
    queryKey: ["/api/contributors", dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange) {
        params.append('dateRange', dateRange);
      }
      const response = await fetch(`/api/contributors?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch contributors');
      return response.json();
    }
  });

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getGradient = (index: number) => {
    const gradients = [
      'bg-gradient-to-r from-blue-500 to-purple-600',
      'bg-gradient-to-r from-green-500 to-teal-600',
      'bg-gradient-to-r from-orange-500 to-red-600',
      'bg-gradient-to-r from-purple-500 to-pink-600',
      'bg-gradient-to-r from-yellow-500 to-orange-600',
    ];
    return gradients[index % gradients.length];
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Contributors</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between animate-pulse">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-slate-200 rounded-full"></div>
                  <div>
                    <div className="h-4 bg-slate-200 rounded w-24 mb-1"></div>
                    <div className="h-3 bg-slate-200 rounded w-20"></div>
                  </div>
                </div>
                <div className="h-4 bg-slate-200 rounded w-8"></div>
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
        <CardTitle>Top Contributors</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {contributors.slice(0, 5).map((contributor, index) => (
            <div key={contributor.id} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-8 h-8 ${getGradient(index)} rounded-full flex items-center justify-center text-white text-sm font-medium`}>
                  {getInitials(contributor.name)}
                </div>
                <div>
                  <p className="font-medium text-slate-900">{contributor.name}</p>
                  <p className="text-sm text-slate-600">
                    {contributor.affiliation || 'Independent Researcher'}
                  </p>
                </div>
              </div>
              <span className="text-sm font-medium text-slate-900">
                {contributor.observationCount ? contributor.observationCount.toLocaleString() : '0'}
              </span>
            </div>
          ))}
        </div>
        {contributors.length > 0 && (
          <Link href="/contributors">
            <Button variant="ghost" className="w-full mt-4 text-primary hover:text-primary/80">
              View All Contributors
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
