import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, Leaf, MapPin, TrendingUp, AlertTriangle } from "lucide-react";
import type { Observation } from "@shared/schema";

export default function Conservation() {
  const { data: rareSpecies = [], isLoading: rareLoading } = useQuery<any[]>({
    queryKey: ["/api/species?type=rare&limit=50"]
  });

  const { data: observations = [], isLoading: observationsLoading } = useQuery<Observation[]>({
    queryKey: ["/api/observations?limit=1000"]
  });

  // Calculate conservation metrics
  const conservationMetrics = {
    totalSpecies: rareSpecies.length,
    criticallyRare: rareSpecies.filter(s => s.observationCount === 1).length,
    vulnerable: rareSpecies.filter(s => s.observationCount <= 3).length,
    endemic: rareSpecies.filter(s => s.stateCount === 1).length
  };

  // Get state distribution for rare species
  const stateDistribution = observations.reduce((acc: { [key: string]: Set<string> }, obs) => {
    if (obs.state && obs.scientificName) {
      if (!acc[obs.state]) {
        acc[obs.state] = new Set();
      }
      acc[obs.state].add(obs.scientificName);
    }
    return acc;
  }, {});

  const stateConservationData = Object.entries(stateDistribution)
    .map(([state, speciesSet]) => ({
      state,
      uniqueSpecies: speciesSet.size,
      rareSpeciesCount: rareSpecies.filter(rs => 
        Array.from(speciesSet).includes(rs.scientificName)
      ).length
    }))
    .sort((a, b) => b.rareSpeciesCount - a.rareSpeciesCount);

  return (
    <div className="flex-1 h-full overflow-y-auto">
      <div className="space-y-6 p-6">
        <div className="flex items-center space-x-3">
          <Shield className="w-8 h-8 text-green-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Conservation Status</h1>
            <p className="text-slate-500">Analysis of rare and endangered fungal species distribution</p>
          </div>
        </div>

        {/* Conservation Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <div>
                  <div className="text-2xl font-bold text-red-600">
                    {conservationMetrics.criticallyRare}
                  </div>
                  <div className="text-sm text-slate-500">Critically Rare</div>
                  <div className="text-xs text-slate-400">Single observation</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <Leaf className="w-5 h-5 text-orange-500" />
                <div>
                  <div className="text-2xl font-bold text-orange-600">
                    {conservationMetrics.vulnerable}
                  </div>
                  <div className="text-sm text-slate-500">Vulnerable</div>
                  <div className="text-xs text-slate-400">≤3 observations</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <MapPin className="w-5 h-5 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    {conservationMetrics.endemic}
                  </div>
                  <div className="text-sm text-slate-500">State Endemic</div>
                  <div className="text-xs text-slate-400">Single state only</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-green-500" />
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {conservationMetrics.totalSpecies}
                  </div>
                  <div className="text-sm text-slate-500">Rare Species</div>
                  <div className="text-xs text-slate-400">Total tracked</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="species" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="species">Rare Species</TabsTrigger>
            <TabsTrigger value="states">State Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="species" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Rare Species Inventory</CardTitle>
                <CardDescription>
                  Species with limited observations requiring conservation attention
                </CardDescription>
              </CardHeader>
              <CardContent>
                {rareLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-slate-500">Loading rare species data...</div>
                  </div>
                ) : (
                  <ScrollArea className="h-96">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Scientific Name</TableHead>
                          <TableHead>Common Name</TableHead>
                          <TableHead>Observations</TableHead>
                          <TableHead>States Found</TableHead>
                          <TableHead>Conservation Status</TableHead>
                          <TableHead>First Recorded</TableHead>
                          <TableHead>Last Seen</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rareSpecies.map((species) => {
                          let status = 'Rare';
                          let statusColor = 'bg-yellow-100 text-yellow-800';
                          
                          if (species.observationCount === 1) {
                            status = 'Critically Rare';
                            statusColor = 'bg-red-100 text-red-800';
                          } else if (species.observationCount <= 2) {
                            status = 'Very Rare';
                            statusColor = 'bg-orange-100 text-orange-800';
                          }
                          
                          if (species.stateCount === 1) {
                            status += ' (Endemic)';
                          }

                          return (
                            <TableRow key={species.id}>
                              <TableCell>
                                <div className="font-medium">{species.scientificName}</div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-slate-500">
                                  {species.commonName || 'Unknown'}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="font-mono">
                                  {species.observationCount}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">
                                  {species.stateCount || 1}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={statusColor}>
                                  {status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-slate-500">
                                  {species.firstObserved ? new Date(species.firstObserved).getFullYear() : 'Unknown'}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-slate-500">
                                  {species.lastObserved ? new Date(species.lastObserved).getFullYear() : 'Unknown'}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="states" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>State Conservation Analysis</CardTitle>
                <CardDescription>
                  Biodiversity hotspots and conservation priorities by state
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>State</TableHead>
                        <TableHead>Total Species</TableHead>
                        <TableHead>Rare Species</TableHead>
                        <TableHead>Conservation Priority</TableHead>
                        <TableHead>Rarity Percentage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stateConservationData.slice(0, 20).map((state) => {
                        const rarityPercentage = ((state.rareSpeciesCount / state.uniqueSpecies) * 100).toFixed(1);
                        let priority = 'Low';
                        let priorityColor = 'bg-green-100 text-green-800';
                        
                        if (state.rareSpeciesCount >= 10) {
                          priority = 'High';
                          priorityColor = 'bg-red-100 text-red-800';
                        } else if (state.rareSpeciesCount >= 5) {
                          priority = 'Medium';
                          priorityColor = 'bg-orange-100 text-orange-800';
                        }

                        return (
                          <TableRow key={state.state}>
                            <TableCell>
                              <div className="font-medium">{state.state}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {state.uniqueSpecies}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {state.rareSpeciesCount}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={priorityColor}>
                                {priority}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-mono">
                                {rarityPercentage}%
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Conservation Recommendations */}
        <Card>
          <CardHeader>
            <CardTitle>Conservation Recommendations</CardTitle>
            <CardDescription>
              Actionable insights for fungal conservation efforts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-semibold text-slate-900">Priority Actions</h4>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                    <div>Immediate survey efforts needed for critically rare species with single observations</div>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 flex-shrink-0"></div>
                    <div>Habitat protection for endemic species found in single states</div>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                    <div>Long-term monitoring programs for vulnerable species</div>
                  </li>
                </ul>
              </div>
              <div className="space-y-4">
                <h4 className="font-semibold text-slate-900">Research Gaps</h4>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <div>Increased sampling in states with high rare species concentration</div>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0"></div>
                    <div>Ecological niche modeling for rare species distribution</div>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                    <div>Climate change impact assessments for vulnerable populations</div>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}