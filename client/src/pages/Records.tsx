import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Users, Eye, Dna } from "lucide-react";

interface StateRecord {
  state: string;
  globalFirstCount: number;
  percentage: number;
}

interface ContributorRecord {
  id: string;
  name: string;
  affiliation?: string;
  globalFirstCount: number;
  percentage: number;
}

interface ContributorObservations {
  id: string;
  name: string;
  affiliation?: string;
  observationCount: number;
}

interface ContributorSpecies {
  id: string;
  name: string;
  affiliation?: string;
  speciesCount: number;
}

function MostGlobalFirsts() {
  const { data: stateData = [], isLoading: stateLoading } = useQuery<StateRecord[]>({
    queryKey: ['/api/states/global-firsts'],
  });

  const { data: contributorData = [], isLoading: contributorLoading } = useQuery<ContributorRecord[]>({
    queryKey: ['/api/contributors/global-firsts'],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Most 1st Global Records
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="states" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="states">States</TabsTrigger>
            <TabsTrigger value="contributors">Contributors</TabsTrigger>
          </TabsList>
          
          <TabsContent value="states" className="space-y-3">
            {stateLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {stateData.slice(0, 10).map((state, index) => (
                  <div key={state.state} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                        {index + 1}
                      </span>
                      <span className="font-medium">{state.state}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{state.globalFirstCount.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{state.percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="contributors" className="space-y-3">
            {contributorLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {contributorData.slice(0, 10).map((contributor, index) => (
                  <div key={contributor.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                        {index + 1}
                      </span>
                      <div>
                        <div className="font-medium">{contributor.name}</div>
                        {contributor.affiliation && (
                          <div className="text-xs text-muted-foreground">{contributor.affiliation}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{contributor.globalFirstCount.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{contributor.percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function MostObservations() {
  const { data: contributorData = [], isLoading } = useQuery<ContributorObservations[]>({
    queryKey: ['/api/contributors'],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-blue-500" />
          Most Observations
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {contributorData.slice(0, 15).map((contributor, index) => (
              <div key={contributor.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    {index + 1}
                  </span>
                  <div>
                    <div className="font-medium">{contributor.name}</div>
                    {contributor.affiliation && (
                      <div className="text-xs text-muted-foreground">{contributor.affiliation}</div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{contributor.observationCount.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">observations</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MostSpecies() {
  const { data: speciesData = [], isLoading } = useQuery<ContributorSpecies[]>({
    queryKey: ['/api/contributors/species'],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Dna className="h-5 w-5 text-green-500" />
          Most Species Discovered
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : speciesData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No species discovery data found
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {speciesData.slice(0, 15).map((contributor, index) => (
              <div key={contributor.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    {index + 1}
                  </span>
                  <div>
                    <div className="font-medium">{contributor.name}</div>
                    {contributor.affiliation && (
                      <div className="text-xs text-muted-foreground">{contributor.affiliation}</div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{contributor.speciesCount.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">species</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Records() {
  return (
    <div className="flex h-screen bg-background">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold">Contributor Records</h1>
            <p className="text-muted-foreground mt-2">
              Rankings and achievements of researchers contributing to the macrofungi DNA sequence database
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
            <MostGlobalFirsts />
            <MostObservations />
            <MostSpecies />
          </div>
        </div>
      </div>
    </div>
  );
}