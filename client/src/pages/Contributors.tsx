import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { MapPin, User, Calendar, Award, X, Search } from "lucide-react";
import { ContributorMap } from "@/components/dashboard/ContributorMap";

interface Contributor {
  id: string;
  name: string;
  affiliation?: string;
  observationCount: number;
}

export default function Contributors() {
  const [selectedContributor, setSelectedContributor] = useState<Contributor | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch all contributors
  const { data: contributors = [], isLoading: contributorsLoading } = useQuery({
    queryKey: ["/api/contributors"],
    queryFn: async () => {
      const response = await fetch('/api/contributors'); // Get all contributors (no limit)
      if (!response.ok) throw new Error('Failed to fetch contributors');
      return response.json();
    }
  });

  // Filter contributors based on search term
  const filteredContributors = useMemo(() => {
    if (!searchTerm) return contributors;
    
    const searchLower = searchTerm.toLowerCase();
    return contributors.filter((contributor: Contributor) =>
      contributor.name.toLowerCase().includes(searchLower) ||
      (contributor.affiliation && contributor.affiliation.toLowerCase().includes(searchLower))
    );
  }, [contributors, searchTerm]);

  // Fetch contributor's specific observations when selected
  const { data: contributorObservations = [], isLoading: observationsLoading } = useQuery({
    queryKey: ["/api/observations", { contributor: selectedContributor?.name }],
    queryFn: async () => {
      if (!selectedContributor) return [];
      const response = await fetch(`/api/observations?contributor=${encodeURIComponent(selectedContributor.name)}`);
      if (!response.ok) throw new Error('Failed to fetch contributor observations');
      return response.json();
    },
    enabled: !!selectedContributor
  });

  // Process contributor's data
  const contributorStats = selectedContributor ? (() => {
    const observations = contributorObservations;
    
    // Top species - use clean species name construction
    const speciesCounts = observations.reduce((acc: { [key: string]: number }, obs: any) => {
      // Use species field if available, otherwise construct from genus + species, fallback to scientificName
      let speciesName = obs.species;
      if (!speciesName && obs.genus && obs.species) {
        speciesName = `${obs.genus} ${obs.species}`;
      } else if (!speciesName) {
        speciesName = obs.scientificName;
      }
      
      acc[speciesName] = (acc[speciesName] || 0) + 1;
      return acc;
    }, {});
    const topSpecies = Object.entries(speciesCounts)
      .map(([species, count]) => ({ species, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Top states
    const stateCounts = observations.reduce((acc: { [key: string]: number }, obs: any) => {
      if (obs.state) acc[obs.state] = (acc[obs.state] || 0) + 1;
      return acc;
    }, {});
    const topStates = Object.entries(stateCounts)
      .map(([state, count]) => ({ state, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Recent activity
    const recentObservations = observations
      .filter((obs: any) => obs.observedOn)
      .sort((a: any, b: any) => new Date(b.observedOn).getTime() - new Date(a.observedOn).getTime())
      .slice(0, 5);

    // Years active
    const years = new Set(observations
      .filter((obs: any) => obs.observedOn)
      .map((obs: any) => new Date(obs.observedOn).getFullYear())
    );

    return {
      topSpecies,
      topStates,
      recentObservations,
      yearsActive: years.size,
      totalStates: Object.keys(stateCounts).length,
      validObservations: observations.filter((obs: any) => obs.latitude && obs.longitude).length
    };
  })() : null;

  return (
    <div className="flex flex-col h-full">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Contributors Analysis</h2>
            <p className="text-slate-600 mt-1">
              {selectedContributor 
                ? `Detailed profile for ${selectedContributor.name}`
                : "Individual contributor profiles and contribution patterns"
              }
            </p>
          </div>
          {selectedContributor && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedContributor(null)}
              className="flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              Back to Overview
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {!selectedContributor ? (
          // Overview Mode
          <>
            <div className="mb-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Top Contributors
                  </CardTitle>
                  <div className="mt-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <Input
                        placeholder="Search contributors by name or affiliation..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {contributorsLoading ? (
                    <div className="text-slate-500">Loading contributors...</div>
                  ) : (
                    <>
                      <div className="mb-4 text-sm text-slate-600">
                        Showing {filteredContributors.slice(0, 12).length} of {filteredContributors.length} contributors
                        {searchTerm && ` matching "${searchTerm}"`}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredContributors.slice(0, 12).map((contributor: Contributor) => (
                          <div
                            key={contributor.id}
                            className="p-4 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                            onClick={() => setSelectedContributor(contributor)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <p className="font-medium text-slate-900 truncate">{contributor.name}</p>
                                {contributor.affiliation && (
                                  <p className="text-sm text-slate-600 truncate">{contributor.affiliation}</p>
                                )}
                              </div>
                              <div className="text-right">
                                <Badge variant="secondary">{contributor.observationCount}</Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {filteredContributors.length === 0 && searchTerm && (
                        <div className="text-center py-8 text-slate-500">
                          No contributors found matching "{searchTerm}"
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Contribution Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Total Contributors</span>
                      <span className="font-medium">{contributors.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Active (10+ obs)</span>
                      <span className="font-medium">
                        {contributors.filter((c: Contributor) => c.observationCount > 10).length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Power Users (100+ obs)</span>
                      <span className="font-medium text-green-600">
                        {contributors.filter((c: Contributor) => c.observationCount > 100).length}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top Affiliations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {(() => {
                      const affiliationCounts = contributors.reduce((acc: { [key: string]: number }, contributor: Contributor) => {
                        const affiliation = contributor.affiliation || 'Independent';
                        acc[affiliation] = (acc[affiliation] || 0) + 1;
                        return acc;
                      }, {});
                      
                      return Object.entries(affiliationCounts)
                        .sort(([,a], [,b]) => (b as number) - (a as number))
                        .slice(0, 3)
                        .map(([affiliation, count]) => (
                          <div key={affiliation} className="flex justify-between">
                            <span className="truncate">{affiliation}</span>
                            <span className="font-medium">{count as number}</span>
                          </div>
                        ));
                    })()}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Contribution Levels</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>1-10 observations</span>
                      <span className="font-medium">
                        {contributors.filter((c: Contributor) => c.observationCount >= 1 && c.observationCount <= 10).length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>11-50 observations</span>
                      <span className="font-medium">
                        {contributors.filter((c: Contributor) => c.observationCount >= 11 && c.observationCount <= 50).length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>51+ observations</span>
                      <span className="font-medium text-blue-600">
                        {contributors.filter((c: Contributor) => c.observationCount > 50).length}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Click on a contributor</span>
                      <span className="font-medium text-slate-400">→</span>
                    </div>
                    <div className="flex justify-between">
                      <span>to view detailed</span>
                      <span className="font-medium text-slate-400">→</span>
                    </div>
                    <div className="flex justify-between">
                      <span>profile analysis</span>
                      <span className="font-medium text-slate-400">→</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          // Detailed Contributor Mode
          <div className="space-y-8">
            {/* Contributor Header */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">{selectedContributor.name}</h3>
                    {selectedContributor.affiliation && (
                      <p className="text-slate-600 mt-1">{selectedContributor.affiliation}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-primary">{selectedContributor.observationCount}</div>
                    <div className="text-sm text-slate-600">Total Observations</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {observationsLoading ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="text-slate-500">Loading contributor details...</div>
                </CardContent>
              </Card>
            ) : contributorStats ? (
              <>
                {/* Statistics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Award className="w-4 h-4" />
                        Activity Stats
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Years Active</span>
                          <span className="font-medium">{contributorStats.yearsActive}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>States Covered</span>
                          <span className="font-medium">{contributorStats.totalStates}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Geolocated</span>
                          <span className="font-medium">{contributorStats.validObservations}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Top Species</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        {contributorStats.topSpecies.slice(0, 3).map((item: any) => (
                          <div key={item.species} className="flex justify-between">
                            <span className="truncate">{item.species}</span>
                            <span className="font-medium">{item.count}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Top States
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        {contributorStats.topStates.slice(0, 3).map((item: any) => (
                          <div key={item.state} className="flex justify-between">
                            <span className="truncate">{item.state}</span>
                            <span className="font-medium">{item.count}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Recent Activity
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        {contributorStats.recentObservations.slice(0, 3).map((obs: any, index: number) => (
                          <div key={index} className="flex justify-between">
                            <span className="truncate">{obs.scientificName}</span>
                            <span className="font-medium text-slate-600">
                              {new Date(obs.observedOn).getFullYear()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Map and Details */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Contributor Map */}
                  <div className="lg:col-span-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <MapPin className="w-5 h-5" />
                          Contribution Map
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-96">
                          <ContributorMap observations={contributorObservations} />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Geographic Summary */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Geographic Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {contributorStats.topStates.map((item: any, index: number) => (
                          <div key={item.state} className="flex items-center justify-between p-2 border border-slate-100 rounded">
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-6 bg-green-100 text-green-700 rounded text-sm flex items-center justify-center">
                                {index + 1}
                              </div>
                              <span className="text-sm text-slate-700">{item.state}</span>
                            </div>
                            <Badge variant="outline">{item.count}</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Species Details */}
                <Card>
                  <CardHeader>
                    <CardTitle>Species Contributions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {contributorStats.topSpecies.map((item: any, index: number) => (
                        <div key={item.species} className="flex items-center justify-between p-3 border border-slate-100 rounded">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 bg-primary/10 text-primary rounded text-sm flex items-center justify-center">
                              {index + 1}
                            </div>
                            <span className="text-sm text-slate-700 truncate">{item.species}</span>
                          </div>
                          <Badge variant="secondary">{item.count}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="text-slate-500">No detailed data available for this contributor</div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
