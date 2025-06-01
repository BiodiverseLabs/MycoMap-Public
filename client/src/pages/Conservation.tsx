import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Shield, Leaf, MapPin, TrendingUp, AlertTriangle, Search, ChevronDown, X } from "lucide-react";
import type { Observation } from "@shared/schema";

export default function Conservation() {
  const [redlistCategoryFilter, setRedlistCategoryFilter] = useState<string[]>([]);
  const [speciesSearchFilter, setSpeciesSearchFilter] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("species");

  const { data: rareSpecies = [], isLoading: rareLoading } = useQuery<any[]>({
    queryKey: ["/api/species?type=rare&limit=50"]
  });

  const { data: observations = [], isLoading: observationsLoading } = useQuery<Observation[]>({
    queryKey: ["/api/observations?limit=1000"]
  });

  const { data: redlistAssessments = [], isLoading: redlistLoading } = useQuery<any[]>({
    queryKey: ["/api/redlist-assessments"]
  });

  // Create a map of Red List species for quick lookup
  const redlistSpeciesMap = new Map(
    redlistAssessments.map(assessment => [
      assessment.scientificName.toLowerCase(),
      assessment
    ])
  );

  // Find observations that match Red List species
  const redlistMatches = observations.filter(obs => 
    obs.scientificName && redlistSpeciesMap.has(obs.scientificName.toLowerCase())
  );

  // Group Red List matches by species with their assessments
  const redlistSpeciesData = redlistMatches.reduce((acc: any[], obs) => {
    const assessment = redlistSpeciesMap.get(obs.scientificName!.toLowerCase());
    if (!assessment) return acc;

    const existing = acc.find(item => item.scientificName === obs.scientificName);
    if (existing) {
      existing.observationCount++;
      existing.states.add(obs.state);
    } else {
      acc.push({
        scientificName: obs.scientificName,
        redlistCategory: assessment.redlistCategory,
        redlistCriteria: assessment.redlistCriteria,
        yearPublished: assessment.yearPublished,
        possiblyExtinct: assessment.possiblyExtinct,
        possiblyExtinctInTheWild: assessment.possiblyExtinctInTheWild,
        observationCount: 1,
        states: new Set([obs.state]),
        firstObserved: obs.observedOn,
        lastObserved: obs.observedOn
      });
    }
    return acc;
  }, []).map(item => ({
    ...item,
    stateCount: item.states.size,
    states: Array.from(item.states)
  }));

  // Calculate conservation metrics
  const conservationMetrics = {
    totalSpecies: rareSpecies.length,
    criticallyRare: rareSpecies.filter(s => s.observationCount === 1).length,
    vulnerable: rareSpecies.filter(s => s.observationCount <= 3).length,
    endemic: rareSpecies.filter(s => s.stateCount === 1).length
  };

  // Calculate Red List metrics
  const redlistMetrics = {
    totalRedlistSpecies: redlistSpeciesData.length,
    criticallyEndangered: redlistSpeciesData.filter(s => s.redlistCategory?.toLowerCase().includes('critically endangered')).length,
    endangered: redlistSpeciesData.filter(s => s.redlistCategory?.toLowerCase().includes('endangered')).length,
    vulnerable: redlistSpeciesData.filter(s => s.redlistCategory?.toLowerCase().includes('vulnerable')).length,
    possiblyExtinct: redlistSpeciesData.filter(s => s.possiblyExtinct).length
  };

  // Get unique Red List categories for filter dropdown
  const uniqueCategories = Array.from(new Set(
    redlistSpeciesData.map(s => s.redlistCategory).filter(Boolean)
  )).sort();

  // Filter Red List species data based on filters
  const filteredRedlistSpecies = redlistSpeciesData.filter(species => {
    // Category filter - if categories are selected, species must match one of them
    if (redlistCategoryFilter.length > 0 && !redlistCategoryFilter.includes(species.redlistCategory || '')) {
      return false;
    }
    
    // Species search filter
    if (speciesSearchFilter && !species.scientificName.toLowerCase().includes(speciesSearchFilter.toLowerCase())) {
      return false;
    }
    
    return true;
  });

  // Helper function to toggle category selection
  const toggleCategory = (category: string) => {
    setRedlistCategoryFilter(prev => 
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  // Helper function to clear all category filters
  const clearCategoryFilters = () => {
    setRedlistCategoryFilter([]);
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

        {/* Dynamic Panels - Context-aware based on active tab */}
        {activeTab === "redlist" ? (
          // Red List Species Panels
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Shield className="w-5 h-5 text-red-500" />
                  <div>
                    <div className="text-2xl font-bold text-red-600">
                      {redlistSpeciesData.length}
                    </div>
                    <div className="text-sm text-slate-500">Total Red List Species</div>
                    <div className="text-xs text-slate-400">Species in database</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <div>
                    <div className="text-2xl font-bold text-red-600">
                      {redlistSpeciesData.filter(s => s.redlistCategory?.toLowerCase().includes('critically endangered')).length}
                    </div>
                    <div className="text-sm text-slate-500">Critically Endangered</div>
                    <div className="text-xs text-slate-400">Highest threat level</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                  <div>
                    <div className="text-2xl font-bold text-orange-600">
                      {redlistSpeciesData.filter(s => s.redlistCategory?.toLowerCase().includes('endangered') && !s.redlistCategory?.toLowerCase().includes('critically')).length}
                    </div>
                    <div className="text-sm text-slate-500">Endangered</div>
                    <div className="text-xs text-slate-400">High threat level</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  <div>
                    <div className="text-2xl font-bold text-yellow-600">
                      {redlistSpeciesData.filter(s => s.redlistCategory?.toLowerCase().includes('vulnerable')).length}
                    </div>
                    <div className="text-sm text-slate-500">Vulnerable</div>
                    <div className="text-xs text-slate-400">Moderate threat level</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          // General Conservation Metrics (for species and states tabs)
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
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="species">Rare Species</TabsTrigger>
            <TabsTrigger value="states">State Analysis</TabsTrigger>
            <TabsTrigger value="redlist">Red List Species</TabsTrigger>
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

          <TabsContent value="redlist" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Red List Species in Observations</CardTitle>
                <CardDescription>
                  Species from our observation database that appear on the IUCN Red List
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Filter Controls */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <Input
                        placeholder="Search species..."
                        value={speciesSearchFilter}
                        onChange={(e) => setSpeciesSearchFilter(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="sm:w-64">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          {redlistCategoryFilter.length === 0 
                            ? "Filter by Red List Category" 
                            : `${redlistCategoryFilter.length} categories selected`
                          }
                          <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-0">
                        <div className="p-3">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium">Red List Categories</h4>
                            {redlistCategoryFilter.length > 0 && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={clearCategoryFilters}
                                className="h-auto p-1"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {uniqueCategories.map((category) => (
                              <div key={category} className="flex items-center space-x-2">
                                <Checkbox
                                  id={category}
                                  checked={redlistCategoryFilter.includes(category)}
                                  onCheckedChange={() => toggleCategory(category)}
                                />
                                <label
                                  htmlFor={category}
                                  className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                                >
                                  {category}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                {redlistLoading || observationsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-slate-500">Loading Red List analysis...</div>
                  </div>
                ) : filteredRedlistSpecies.length === 0 ? (
                  <div className="text-center py-8">
                    <Shield className="w-12 h-12 text-green-500 mx-auto mb-4" />
                    <div className="text-lg font-medium text-slate-600">
                      {redlistSpeciesData.length === 0 ? "No Red List Species Found" : "No Species Match Filters"}
                    </div>
                    <div className="text-sm text-slate-500">
                      {redlistSpeciesData.length === 0 
                        ? "None of the observed species match the Red List database"
                        : "Try adjusting your filters to see more results"
                      }
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm text-slate-500 mb-4">
                      Showing {filteredRedlistSpecies.length} of {redlistSpeciesData.length} Red List species
                    </div>
                    <ScrollArea className="h-96">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Scientific Name</TableHead>
                            <TableHead>Red List Category</TableHead>
                            <TableHead>Red List Criteria</TableHead>
                            <TableHead>Year Published</TableHead>
                            <TableHead>Observations</TableHead>
                            <TableHead>States Found</TableHead>
                            <TableHead>Status Flags</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredRedlistSpecies.map((species, index) => {
                            let categoryColor = 'bg-gray-100 text-gray-800';
                          
                            if (species.redlistCategory?.toLowerCase().includes('critically endangered')) {
                              categoryColor = 'bg-red-100 text-red-800';
                            } else if (species.redlistCategory?.toLowerCase().includes('endangered')) {
                              categoryColor = 'bg-orange-100 text-orange-800';
                            } else if (species.redlistCategory?.toLowerCase().includes('vulnerable')) {
                              categoryColor = 'bg-yellow-100 text-yellow-800';
                            }

                            return (
                              <TableRow key={index}>
                                <TableCell>
                                  <div className="font-medium text-slate-900">
                                    {species.scientificName}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge className={categoryColor}>
                                    {species.redlistCategory || 'Not Specified'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="text-sm text-slate-600">
                                    {species.redlistCriteria || 'N/A'}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-sm text-slate-500">
                                    {species.yearPublished || 'Unknown'}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary">
                                    {species.observationCount}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="text-sm text-slate-600">
                                    {species.stateCount} state{species.stateCount !== 1 ? 's' : ''}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {species.possiblyExtinct && (
                                      <Badge className="bg-black text-white text-xs">
                                        Possibly Extinct
                                      </Badge>
                                    )}
                                    {species.possiblyExtinctInTheWild && (
                                      <Badge className="bg-gray-800 text-white text-xs">
                                        Possibly Extinct in Wild
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                )}
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