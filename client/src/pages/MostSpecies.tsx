import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Dna } from "lucide-react";
import { Link } from "wouter";

interface ContributorSpecies {
  id: string;
  name: string;
  affiliation?: string;
  speciesCount: number;
}

export default function MostSpecies() {
  const { data: speciesData = [], isLoading } = useQuery<ContributorSpecies[]>({
    queryKey: ['/api/contributors/species'],
  });

  return (
    <div className="flex h-screen bg-background">
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <Link href="/records" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Records
              </Link>
              <h1 className="text-3xl font-bold tracking-tight">Contributors with Most Species Documented</h1>
              <p className="text-muted-foreground mt-2">
                Complete ranking of contributors by their unique species documentation count in macrofungi data
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Dna className="h-5 w-5" />
                  All Contributors by Species Discoveries
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 20 }, (_, i) => (
                      <div key={i} className="h-16 bg-muted animate-pulse rounded" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {speciesData.map((contributor, index) => {
                      const isTopThree = index < 3;
                      const badgeColors = ['bg-blue-500', 'bg-blue-500', 'bg-blue-500'];
                      
                      return (
                        <div key={contributor.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <span className={`flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-bold ${
                              isTopThree ? badgeColors[index] : 'bg-muted-foreground'
                            }`}>
                              {index + 1}
                            </span>
                            <div>
                              <div className={isTopThree ? "font-semibold text-lg" : "font-medium"}>{contributor.name}</div>
                              {contributor.affiliation && (
                                <div className="text-sm text-muted-foreground">{contributor.affiliation}</div>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={isTopThree ? "font-bold text-xl" : "font-semibold text-lg"}>{contributor.speciesCount.toLocaleString()}</div>
                            <div className="text-sm text-muted-foreground">species</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}