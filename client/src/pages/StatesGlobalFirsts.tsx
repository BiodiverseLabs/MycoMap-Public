import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Trophy, ChevronRight, Download, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";

interface StateRecord {
  state: string;
  globalFirstCount: number;
  percentage: number;
}

interface GlobalFirstSpecies {
  scientific_name: string;
  common_name?: string;
  family?: string;
  creation_date: string;
  collector?: string;
  source?: string;
  observation_id?: string;
  inat_id?: string;
  mo_id?: string;
  catalog_number?: string;
}

// CSV export function for individual state species
const exportStateSpeciesToCSV = (stateName: string, speciesData: GlobalFirstSpecies[]) => {
  if (!speciesData || speciesData.length === 0) {
    return;
  }

  const headers = ['Scientific Name', 'Common Name', 'Family', 'First Recorded Date', 'Collector'];
  const csvContent = [
    headers.join(','),
    ...speciesData.map(species => [
      `"${species.scientific_name}"`,
      `"${species.common_name || ''}"`,
      `"${species.family || ''}"`,
      `"${new Date(species.creation_date).toLocaleDateString()}"`,
      `"${species.collector || ''}"`
    ].join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${stateName}_global_first_species.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};

// CSV export function for all states data
const exportAllStatesToCSV = (stateData: StateRecord[]) => {
  if (!stateData || stateData.length === 0) {
    return;
  }

  const headers = ['Rank', 'State', 'Global First Count', 'Percentage'];
  const csvContent = [
    headers.join(','),
    ...stateData.map((state, index) => [
      index + 1,
      `"${state.state}"`,
      state.globalFirstCount,
      `${state.percentage.toFixed(1)}%`
    ].join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `states_global_first_records.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};

// Function to generate external links
const getExternalLink = (species: GlobalFirstSpecies): { url: string, platform: string } | null => {
  // Use the observation_id based on the source
  if (species.source === 'iNaturalist' && species.observation_id) {
    return { 
      url: `https://www.inaturalist.org/observations/${species.observation_id}`, 
      platform: 'iNaturalist' 
    };
  }
  if (species.source === 'Mushroom Observer' && species.observation_id) {
    return { 
      url: `https://mushroomobserver.org/${species.observation_id}`, 
      platform: 'Mushroom Observer' 
    };
  }
  if (species.source === 'MyCoPortal' && species.observation_id) {
    return { 
      url: `https://mycoportal.org/portal/collections/individual/index.php?occid=${species.observation_id}`, 
      platform: 'MyCoPortal' 
    };
  }
  if (species.source === 'GenBank Accessions' && species.observation_id) {
    return { 
      url: `https://www.ncbi.nlm.nih.gov/nuccore/${species.observation_id}`, 
      platform: 'GenBank' 
    };
  }
  // Fallback to specific external IDs if available
  if (species.inat_id) {
    return { 
      url: `https://www.inaturalist.org/observations/${species.inat_id}`, 
      platform: 'iNaturalist' 
    };
  }
  if (species.mo_id) {
    return { 
      url: `https://mushroomobserver.org/${species.mo_id}`, 
      platform: 'Mushroom Observer' 
    };
  }
  if (species.catalog_number) {
    return { 
      url: `https://mycoportal.org/portal/collections/individual/index.php?occid=${species.catalog_number}`, 
      platform: 'MyCoPortal' 
    };
  }
  
  // Additional fallback for sources without specific external IDs
  if (species.source && species.observation_id) {
    if (species.source.toLowerCase().includes('mushroom')) {
      return { 
        url: `https://mushroomobserver.org/${species.observation_id}`, 
        platform: 'Mushroom Observer' 
      };
    }
    if (species.source.toLowerCase().includes('mycoportal') || species.source.toLowerCase().includes('myco')) {
      return { 
        url: `https://mycoportal.org/portal/collections/individual/index.php?occid=${species.observation_id}`, 
        platform: 'MyCoPortal' 
      };
    }
  }
  
  return null;
};

export default function StatesGlobalFirsts() {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  
  const { data: stateData = [], isLoading } = useQuery<StateRecord[]>({
    queryKey: ['/api/states/global-firsts'],
  });

  const { data: speciesData = [], isLoading: isLoadingSpecies } = useQuery<GlobalFirstSpecies[]>({
    queryKey: ['/api/states/global-firsts/species', selectedState],
    queryFn: () => selectedState ? fetch(`/api/states/global-firsts/species/${encodeURIComponent(selectedState)}`).then(res => res.json()) : [],
    enabled: !!selectedState,
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
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">States with Most Global First Records</h1>
                  <p className="text-muted-foreground mt-2">
                    Complete ranking of states by their global first records in macrofungi observations
                  </p>
                </div>
                <Button
                  onClick={() => exportAllStatesToCSV(stateData)}
                  disabled={isLoading || stateData.length === 0}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export All States CSV
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  All States Global First Records
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
                    {stateData.map((state, index) => {
                      const isTopThree = index < 3;
                      const badgeColors = ['bg-blue-500', 'bg-blue-500', 'bg-blue-500'];
                      const isExpanded = selectedState === state.state;
                      
                      return (
                        <div key={state.state} className="space-y-2">
                          <div 
                            className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                            onClick={() => setSelectedState(selectedState === state.state ? null : state.state)}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-bold ${
                                isTopThree ? badgeColors[index] : 'bg-muted-foreground'
                              }`}>
                                {index + 1}
                              </span>
                              <span className={isTopThree ? "font-semibold text-lg" : "font-medium"}>{state.state}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className={isTopThree ? "font-bold text-xl" : "font-semibold text-lg"}>{state.globalFirstCount.toLocaleString()}</div>
                                <div className="text-sm text-muted-foreground">{state.percentage.toFixed(1)}% of total</div>
                              </div>
                              <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            </div>
                          </div>
                          
                          {/* Inline species detail view */}
                          {isExpanded && (
                            <div className="ml-11 mr-4 p-4 bg-muted/30 rounded-lg border-l-4 border-blue-500">
                              <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-lg">Global First Species in {state.state}</h3>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    exportStateSpeciesToCSV(state.state, speciesData);
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <Download className="h-4 w-4" />
                                  Export CSV
                                </Button>
                              </div>
                              
                              {isLoadingSpecies ? (
                                <div className="space-y-2">
                                  {Array.from({ length: 5 }, (_, i) => (
                                    <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                                  ))}
                                </div>
                              ) : (
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                  {speciesData.map((species, speciesIndex) => {
                                    const externalLink = getExternalLink(species);
                                    return (
                                      <div key={speciesIndex} className="flex items-center justify-between p-3 bg-background rounded border">
                                        <div className="flex-1">
                                          <div className="font-medium">{species.scientific_name}</div>
                                          {species.common_name && (
                                            <div className="text-sm text-muted-foreground">{species.common_name}</div>
                                          )}
                                          {species.family && (
                                            <div className="text-xs text-muted-foreground">Family: {species.family}</div>
                                          )}
                                          {species.source && (
                                            <div className="text-xs text-muted-foreground">Source: {species.source}</div>
                                          )}
                                          {externalLink && (
                                            <a
                                              href={externalLink.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-1"
                                            >
                                              <ExternalLink className="h-3 w-3" />
                                              View on {externalLink.platform}
                                            </a>
                                          )}
                                          {!externalLink && species.source && (
                                            <div className="text-xs text-amber-600 mt-1">
                                              External link not available
                                            </div>
                                          )}
                                        </div>
                                        <div className="text-right text-sm text-muted-foreground">
                                          <div>
                                            {(() => {
                                              const date = new Date(species.creation_date);
                                              const dateStr = date.toLocaleDateString();
                                              return dateStr === '12/31/1969' ? 'Date Unavailable' : dateStr;
                                            })()}
                                          </div>
                                          {species.collector && (
                                            <div>{species.collector}</div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {speciesData.length === 0 && (
                                    <div className="text-center text-muted-foreground py-4">
                                      No global first species found for {state.state}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
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