import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FullscreenModal, FullscreenButton } from '@/components/ui/fullscreen-modal';
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useRef, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, MapPin, Calendar, TrendingUp, Users, Eye, Clock, BarChart3, Camera, ExternalLink, TreePine } from "lucide-react";

declare global {
  interface Window {
    L: any;
  }
}

interface Observation {
  id: number;
  observationId: string;
  latitude: string;
  longitude: string;
  state: string;
  observedOn: string;
  source: string;
  contributor: string;
}

interface SpeciesDetailData {
  scientificName: string;
  commonName: string | null;
  observationCount: number;
  firstObserved: string | null;
  lastObserved: string | null;
  stateCount: number | null;
}

interface ObservationImage {
  observationId: string;
  imageUrl: string;
  imageId: string;
  observer: string | null;
  observedOn: string | null;
  state: string | null;
  placeGuess: string | null;
  source: string;
  scientificName: string;
}

interface TaxonomicClassification {
  scientificName: string;
  commonName: string | null;
  kingdom: string | null;
  phylum: string | null;
  class: string | null;
  order: string | null;
  family: string | null;
  genus: string | null;
  species: string | null;
  subspecies: string | null;
  rank: string | null;
  source: string | null;
}

export default function SpeciesDetail() {
  const [match, params] = useRoute("/species/:name");
  const speciesName = params?.name ? decodeURIComponent(params.name) : "";
  
  const [selectedState, setSelectedState] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all_time");
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const mapRef = useRef<HTMLDivElement>(null);
  const fullscreenMapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const fullscreenMapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // Fetch species seasonal distribution
  const { data: seasonalData = [], isLoading: seasonalLoading } = useQuery({
    queryKey: ["/api/species", speciesName, "seasonal"],
    queryFn: async () => {
      const response = await fetch(`/api/species/${encodeURIComponent(speciesName)}/seasonal`);
      if (!response.ok) throw new Error("Failed to fetch seasonal data");
      return response.json();
    }
  });

  // Fetch species observations
  const { data: observations = [], isLoading: observationsLoading } = useQuery({
    queryKey: ["/api/observations", { species: speciesName }],
    queryFn: async () => {
      const response = await fetch(`/api/observations?species=${encodeURIComponent(speciesName)}`);
      if (!response.ok) throw new Error('Failed to fetch observations');
      return response.json();
    },
    enabled: !!speciesName
  });

  // Fetch species details
  const { data: speciesData, isLoading: speciesLoading } = useQuery({
    queryKey: ["/api/species", { name: speciesName }],
    queryFn: async () => {
      const response = await fetch(`/api/species?name=${encodeURIComponent(speciesName)}`);
      if (!response.ok) throw new Error('Failed to fetch species details');
      const data = await response.json();
      return data[0] || null;
    },
    enabled: !!speciesName
  });

  // Fetch species images
  const { data: speciesImages = [], isLoading: imagesLoading } = useQuery({
    queryKey: ["/api/species", speciesName, "images", { state: selectedState }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '20'
      });
      
      if (selectedState && selectedState !== "all") {
        params.append('state', selectedState);
      }
      
      const response = await fetch(`/api/species/${encodeURIComponent(speciesName)}/images?${params}`);
      if (!response.ok) throw new Error('Failed to fetch species images');
      return response.json() as Promise<ObservationImage[]>;
    },
    enabled: !!speciesName
  });

  // Fetch species classification
  const { data: classification, isLoading: classificationLoading } = useQuery({
    queryKey: ["/api/species", speciesName, "classification"],
    queryFn: async () => {
      const response = await fetch(`/api/species/${encodeURIComponent(speciesName)}/classification`);
      if (!response.ok) throw new Error('Failed to fetch species classification');
      return response.json() as Promise<TaxonomicClassification>;
    },
    enabled: !!speciesName
  });

  // Get unique states for filter
  const states = useMemo(() => {
    const stateSet = new Set(observations.map((obs: Observation) => obs.state).filter(Boolean));
    return Array.from(stateSet).sort();
  }, [observations]);

  // Filter observations based on state and date
  const filteredObservations = useMemo(() => {
    let filtered = observations;

    // State filter
    if (selectedState !== "all") {
      filtered = filtered.filter((obs: Observation) => obs.state === selectedState);
    }

    // Date filter
    if (dateFilter !== "all_time") {
      const now = new Date();
      let cutoffDate: Date;
      
      switch (dateFilter) {
        case "last_year":
          cutoffDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        case "last_5_years":
          cutoffDate = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
          break;
        case "recent":
          cutoffDate = new Date(2020, 0, 1);
          break;
        default:
          cutoffDate = new Date(0);
      }

      filtered = filtered.filter((obs: Observation) => 
        obs.observedOn && new Date(obs.observedOn) >= cutoffDate
      );
    }

    return filtered;
  }, [observations, selectedState, dateFilter]);

  // Calculate species metrics
  const metrics = useMemo(() => {
    if (!observations.length) return null;

    const stateDistribution = observations.reduce((acc: { [key: string]: number }, obs: Observation) => {
      acc[obs.state] = (acc[obs.state] || 0) + 1;
      return acc;
    }, {});

    const contributors = new Set(observations.map((obs: any) => obs.collector || obs.observer)).size;
    
    const yearDistribution = observations.reduce((acc: { [key: string]: number }, obs: Observation) => {
      const year = new Date(obs.observedOn).getFullYear().toString();
      acc[year] = (acc[year] || 0) + 1;
      return acc;
    }, {});

    const sourceDistribution = observations.reduce((acc: { [key: string]: number }, obs: Observation) => {
      acc[obs.source] = (acc[obs.source] || 0) + 1;
      return acc;
    }, {});

    const collectorDistribution = observations.reduce((acc: { [key: string]: number }, obs: any) => {
      const collector = obs.collector || obs.observer;
      if (collector) {
        acc[collector] = (acc[collector] || 0) + 1;
      }
      return acc;
    }, {});

    return {
      stateDistribution,
      contributors,
      yearDistribution,
      sourceDistribution,
      collectorDistribution,
      totalObservations: observations.length,
      statesCount: Object.keys(stateDistribution).length
    };
  }, [observations]);

  // Helper function to format dates
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Unknown date';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  // Function to create and initialize a map instance
  const createMapInstance = (container: HTMLDivElement, mapInstance: React.MutableRefObject<any>) => {
    if (!window.L) return;

    // Clean up existing map
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    // Create custom marker icon that works in production
    const customIcon = window.L.divIcon({
      html: '<div style="background-color: #3b82f6; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
      className: 'custom-div-icon',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    // Store the icon for use in markers
    (window as any).customMarkerIcon = customIcon;

    // Create new map instance
    mapInstance.current = window.L.map(container).setView([39.8283, -98.5795], 4);

    // Add tile layer
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(mapInstance.current);
  };

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;
    createMapInstance(mapRef.current, mapInstanceRef);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Initialize fullscreen map when opened
  useEffect(() => {
    if (!fullscreenMapRef.current || !isFullscreen) return;
    createMapInstance(fullscreenMapRef.current, fullscreenMapInstanceRef);

    return () => {
      if (fullscreenMapInstanceRef.current) {
        fullscreenMapInstanceRef.current.remove();
        fullscreenMapInstanceRef.current = null;
      }
    };
  }, [isFullscreen]);

  // Update map markers
  useEffect(() => {
    if (!mapInstanceRef.current || !filteredObservations.length) return;

    // Clear existing markers
    markersRef.current.forEach(marker => mapInstanceRef.current.removeLayer(marker));
    markersRef.current = [];

    // Add new markers
    const validObservations = filteredObservations.filter((obs: Observation) => 
      obs.latitude && obs.longitude && 
      !isNaN(parseFloat(obs.latitude)) && !isNaN(parseFloat(obs.longitude))
    );

    validObservations.forEach((obs: Observation) => {
      const marker = window.L.marker([parseFloat(obs.latitude), parseFloat(obs.longitude)], {
        icon: (window as any).customMarkerIcon
      })
        .bindPopup(`
          <div>
            <strong>${obs.observedOn}</strong><br>
            ${obs.state}<br>
            Source: ${obs.source}<br>
            Collector: ${(obs as any).collector || (obs as any).observer || 'Unknown'}
          </div>
        `);
      marker.addTo(mapInstanceRef.current);
      markersRef.current.push(marker);
    });

    // Fit map to bounds
    if (validObservations.length > 0) {
      const bounds = window.L.latLngBounds(
        validObservations.map((obs: Observation) => [parseFloat(obs.latitude), parseFloat(obs.longitude)])
      );
      mapInstanceRef.current.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [filteredObservations]);

  if (!match || !speciesName) {
    return <div>Species not found</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/species">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Species
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 italic">{speciesName}</h2>
            {speciesData?.commonName && (
              <p className="text-slate-600 mt-1">{speciesData.commonName}</p>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Total Observations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{metrics?.totalObservations || 0}</div>
              <p className="text-sm text-slate-600 mt-1">
                {filteredObservations.length} matching filters
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Geographic Range
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{metrics?.statesCount || 0}</div>
              <p className="text-sm text-slate-600 mt-1">
                states/provinces
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                Contributors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{metrics?.contributors || 0}</div>
              <p className="text-sm text-slate-600 mt-1">
                unique observers
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Observation Period
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-orange-600">
                {speciesData?.firstObserved && speciesData?.lastObserved ? 
                  `${new Date(speciesData.firstObserved).getFullYear()} - ${new Date(speciesData.lastObserved).getFullYear()}` :
                  'Unknown'
                }
              </div>
              <p className="text-sm text-slate-600 mt-1">
                first to last observed
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Taxonomic Classification Panel */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TreePine className="h-5 w-5 text-green-600" />
              Taxonomic Classification
            </CardTitle>
          </CardHeader>
          <CardContent>
            {classificationLoading ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              </div>
            ) : classification ? (
              <div className="space-y-4">
                {classification.commonName && (
                  <div className="pb-2 border-b border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-muted-foreground">Common Name</p>
                    <p className="text-lg font-medium">{classification.commonName}</p>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { label: "Kingdom", value: classification.kingdom },
                    { label: "Phylum", value: classification.phylum },
                    { label: "Class", value: classification.class },
                    { label: "Order", value: classification.order },
                    { label: "Family", value: classification.family },
                    { label: "Genus", value: classification.genus },
                    { label: "Species", value: classification.species },
                    { label: "Subspecies", value: classification.subspecies }
                  ].map(({ label, value }) => (
                    value && (
                      <div key={label} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
                        <p className="text-sm font-medium mt-1">{value}</p>
                      </div>
                    )
                  ))}
                </div>
                
                {classification.source && (
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-muted-foreground">
                      Classification source: {classification.source}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center p-8 text-muted-foreground">
                No taxonomic classification data available for this species.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Map and Filters */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Observation Map
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex gap-4 relative z-50">
                  <div className="relative z-50">
                    <Select value={selectedState} onValueChange={setSelectedState}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Filter by state" />
                      </SelectTrigger>
                      <SelectContent className="z-[9999]" style={{ zIndex: 9999 }}>
                        <SelectItem value="all">All States</SelectItem>
                        {states.map((state) => (
                          <SelectItem key={state} value={state}>{state}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="relative z-50">
                    <Select value={dateFilter} onValueChange={setDateFilter}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Filter by date" />
                      </SelectTrigger>
                      <SelectContent className="z-[9999]" style={{ zIndex: 9999 }}>
                        <SelectItem value="all_time">All Time</SelectItem>
                        <SelectItem value="last_year">Last Year</SelectItem>
                        <SelectItem value="last_5_years">Last 5 Years</SelectItem>
                        <SelectItem value="recent">Since 2020</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="relative">
                  <div ref={mapRef} className="h-96 rounded-lg border border-slate-200 relative z-10"></div>
                  <FullscreenButton 
                    onClick={() => setIsFullscreen(true)}
                    className="absolute top-2 right-2 z-[1001]"
                  />
                </div>
                
                <div className="mt-2 text-sm text-slate-600">
                  Showing {filteredObservations.length} of {observations.length} observations
                </div>
              </CardContent>
            </Card>

            {/* Seasonal Distribution */}
            {seasonalData && seasonalData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Seasonal Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 overflow-x-auto">
                    {/* Chart */}
                    <div className="flex items-end justify-between h-32 gap-1 min-w-0 px-1">
                      {seasonalData.map((monthData: any) => {
                        const maxCount = Math.max(...seasonalData.map((m: any) => m.count));
                        const height = maxCount > 0 ? (monthData.count / maxCount) * 100 : 0;
                        
                        return (
                          <div key={monthData.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                            <div className="text-xs text-slate-600 font-medium h-4 text-center">
                              {monthData.count > 0 ? monthData.count : ''}
                            </div>
                            <div className="w-full flex justify-center">
                              <div 
                                className="bg-blue-500 rounded-sm transition-all duration-300 mx-auto"
                                style={{ 
                                  width: 'min(32px, calc(100% - 2px))',
                                  height: `${Math.max(height * 0.8, monthData.count > 0 ? 4 : 0)}px`,
                                  maxHeight: '96px'
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Month labels */}
                    <div className="flex justify-between px-1">
                      {seasonalData.map((monthData: any) => (
                        <div key={monthData.month} className="flex-1 text-center min-w-0">
                          <div className="text-xs text-slate-600 font-medium truncate">
                            {monthData.month}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-500 text-center">
                    Observations by month of year
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            {/* State Distribution */}
            {metrics && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top States</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(metrics.stateDistribution)
                      .sort(([,a], [,b]) => (b as number) - (a as number))
                      .slice(0, 5)
                      .map(([state, count]) => (
                        <div key={state} className="flex justify-between items-center">
                          <span className="text-sm">{state}</span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Top Collectors */}
            {metrics && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top Collectors</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(metrics.collectorDistribution)
                      .sort(([,a], [,b]) => (b as number) - (a as number))
                      .slice(0, 5)
                      .map(([collector, count]) => (
                        <div key={collector} className="flex justify-between items-center">
                          <span className="text-sm truncate">{collector}</span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Source Distribution */}
            {metrics && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Data Sources</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(metrics.sourceDistribution)
                      .sort(([,a], [,b]) => (b as number) - (a as number))
                      .map(([source, count]) => (
                        <div key={source} className="flex justify-between items-center">
                          <span className="text-sm">{source}</span>
                          <Badge variant="outline">{count}</Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Observation Images Gallery */}
        {speciesImages.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="w-5 h-5" />
                Observation Images
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-6">
                <Badge variant="secondary" className="text-sm">
                  {speciesImages.length} images from {new Set(
                    speciesImages.map(img => {
                      // Extract base observation ID
                      const id = img.observationId;
                      if (id.includes('-')) {
                        return id.split('-')[0];
                      }
                      return id;
                    })
                  ).size} observations
                </Badge>
              </div>

              {imagesLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-4 text-slate-600">Loading images...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {speciesImages.map((image) => (
                    <Card 
                      key={`${image.observationId}-${image.imageId}`}
                      className="transition-all hover:shadow-lg"
                    >
                      <CardContent className="p-0">
                        <div className="relative">
                          <img
                            src={image.imageUrl}
                            alt={`${image.scientificName} observation`}
                            className="w-full h-48 object-cover rounded-t-lg"
                            loading="lazy"
                          />
                          <div className="absolute top-2 right-2">
                            <div className="bg-slate-600 text-white rounded-full p-1 opacity-70">
                              <Camera className="w-3 h-3" />
                            </div>
                          </div>
                        </div>
                        
                        <div className="p-3 space-y-2">
                          {/* Platform and Link */}
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-xs">
                              {image.source}
                            </Badge>
                            {image.source === 'iNaturalist' && (
                              <a 
                                href={`https://www.inaturalist.org/observations/${
                                  image.observationId.includes('-') 
                                    ? image.observationId.split('-')[0]
                                    : image.observationId
                                }`}
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 transition-colors"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          
                          {/* Observer */}
                          {image.observer && (
                            <div className="text-xs text-slate-600 truncate">
                              <strong>Observer:</strong> {image.observer}
                            </div>
                          )}
                          
                          {/* Date */}
                          <div className="text-xs text-slate-600">
                            <strong>Date:</strong> {formatDate(image.observedOn)}
                          </div>
                          
                          {/* Location */}
                          {image.state && (
                            <div className="text-xs text-slate-600 truncate">
                              <strong>Location:</strong> {image.placeGuess || image.state}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              
              {!imagesLoading && speciesImages.length === 0 && (
                <div className="text-center py-8">
                  <Camera className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">No images found</h3>
                  <p className="text-slate-600">
                    No observations with images were found for <em>{speciesName}</em>{selectedState !== 'all' ? ` in ${selectedState}` : ''}.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Fullscreen Modal */}
        <FullscreenModal
          isOpen={isFullscreen}
          onClose={() => setIsFullscreen(false)}
          title={`${speciesData?.scientificName || speciesName} - Distribution Map`}
        >
          <div 
            ref={fullscreenMapRef} 
            className="w-full h-full"
          />
        </FullscreenModal>
      </div>
    </div>
  );
}