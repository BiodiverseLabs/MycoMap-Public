import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, MapPin, Download, Dna, Calendar, Check, Search, GitBranch, Activity, Users, X, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";
import { format } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect, useMemo } from "react";
import { INaturalistProgressBar } from "@/components/ui/progress-bar";

interface FieldGuide {
  id: number;
  name: string;
  description: string | null;
  boundingBoxNorth: string;
  boundingBoxSouth: string;
  boundingBoxEast: string;
  boundingBoxWest: string;
  speciesCount: number;
  createdAt: string;
  updatedAt: string;
}

interface FieldGuideSpecies {
  id: number;
  fieldGuideId: number;
  scientificName: string;
  commonName: string | null;
  family: string | null;
  observationCount: number;
  selectedImageUrl: string | null;
  selectedImageSource: string | null;
  selectedObservationId: string | null;
  addedAt: string;
  source?: string;
}

interface Contributor {
  name: string;
  observationCount: number;
  speciesCount: number;
}

export default function FieldGuideDetail() {
  const [, params] = useRoute('/field-guides/:id');
  const [location, setLocation] = useLocation();
  const [searchFilter, setSearchFilter] = useState('');
  const [showContributorsModal, setShowContributorsModal] = useState(false);
  const [sortConfig, setSortConfig] = useState<{column: 'scientificName' | 'observations' | null, direction: 'asc' | 'desc'}>({column: null, direction: 'asc'});
  const [isReadingFromUrl, setIsReadingFromUrl] = useState(false);
  const [expansionRadius, setExpansionRadius] = useState(0);
  const [monthRange, setMonthRange] = useState<{start: string, end: string}>({start: '', end: ''});
  const [includeInat, setIncludeInat] = useState(false);
  const [showSourceBreakdown, setShowSourceBreakdown] = useState<'species' | 'genera' | 'observations' | null>(null);
  const fieldGuideId = params?.id ? parseInt(params.id) : null;

  // Initialize state from URL parameters whenever the component mounts or navigation occurs
  useEffect(() => {
    const readUrlParams = () => {
      setIsReadingFromUrl(true);
      const urlParams = new URLSearchParams(window.location.search);
      const search = urlParams.get('search') || '';
      const sortColumn = urlParams.get('sortColumn') as 'scientificName' | 'observations' | null;
      const sortDirection = urlParams.get('sortDirection') as 'asc' | 'desc';
      const expansion = urlParams.get('expansion');
      const monthStart = urlParams.get('monthStart') || '';
      const monthEnd = urlParams.get('monthEnd') || '';
      const includeInatParam = urlParams.get('includeInat') === 'true';
      
      setSearchFilter(search);
      setMonthRange({start: monthStart, end: monthEnd});
      setIncludeInat(includeInatParam);
      if (expansion) {
        const expansionNum = parseInt(expansion);
        if (!isNaN(expansionNum) && expansionNum >= 0) {
          setExpansionRadius(expansionNum);
        }
      }
      if (sortColumn && sortDirection) {
        setSortConfig({column: sortColumn, direction: sortDirection});
      } else {
        setSortConfig({column: null, direction: 'asc'});
      }
      setIsReadingFromUrl(false);
    };

    // Read params on mount
    readUrlParams();
    
    // Listen for browser navigation (back/forward buttons)
    const handlePopState = () => {
      readUrlParams();
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [fieldGuideId]); // Depend on fieldGuideId instead of location

  // Update URL when state changes (but not when reading from URL)
  useEffect(() => {
    if (isReadingFromUrl) return;
    
    const urlParams = new URLSearchParams();
    
    if (searchFilter) {
      urlParams.set('search', searchFilter);
    }
    if (expansionRadius !== 0) {
      urlParams.set('expansion', expansionRadius.toString());
    }
    if (monthRange.start) {
      urlParams.set('monthStart', monthRange.start);
    }
    if (monthRange.end) {
      urlParams.set('monthEnd', monthRange.end);
    }
    if (sortConfig.column) {
      urlParams.set('sortColumn', sortConfig.column);
      urlParams.set('sortDirection', sortConfig.direction);
    }
    if (includeInat) {
      urlParams.set('includeInat', 'true');
    }
    
    const newUrl = urlParams.toString() ? `${window.location.pathname}?${urlParams.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [searchFilter, sortConfig, expansionRadius, monthRange, includeInat, isReadingFromUrl]);

  const { data: fieldGuide, isLoading: isLoadingGuide, error: guideError } = useQuery({
    queryKey: ['/api/field-guides', fieldGuideId],
    queryFn: async () => {
      if (!fieldGuideId) throw new Error('No field guide ID');
      const response = await fetch(`/api/field-guides/${fieldGuideId}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Field guide not found');
        }
        throw new Error('Failed to fetch field guide');
      }
      return response.json() as Promise<FieldGuide>;
    },
    enabled: !!fieldGuideId
  });

  const { data: allSpecies = [], isLoading: isLoadingSpecies, error: speciesError } = useQuery({
    queryKey: ['/api/field-guides', fieldGuideId, 'species', expansionRadius, monthRange.start, monthRange.end, includeInat],
    queryFn: async () => {
      if (!fieldGuideId) throw new Error('No field guide ID');
      const params = new URLSearchParams({
        expansion: expansionRadius.toString()
      });
      if (monthRange.start) params.set('monthStart', monthRange.start);
      if (monthRange.end) params.set('monthEnd', monthRange.end);
      if (includeInat) params.set('includeInat', 'true');
      
      const url = `/api/field-guides/${fieldGuideId}/species?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch species');
      return response.json() as Promise<FieldGuideSpecies[]>;
    },
    enabled: !!fieldGuideId
  });

  const { data: contributorsData } = useQuery({
    queryKey: ['/api/field-guides', fieldGuideId, 'contributors', expansionRadius, includeInat],
    queryFn: async () => {
      if (!fieldGuideId) throw new Error('No field guide ID');
      const params = new URLSearchParams();
      if (expansionRadius > 0) params.set('expansion', expansionRadius.toString());
      if (includeInat) params.set('includeInat', 'true');
      
      const url = `/api/field-guides/${fieldGuideId}/contributors?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch contributors count');
      return response.json() as Promise<{ contributorsCount: number; dbContributors?: number; inatContributors?: number }>;
    },
    enabled: !!fieldGuideId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    cacheTime: 30 * 60 * 1000, // Keep in memory for 30 minutes
  });

  const { data: detailedContributorsData, isLoading: isLoadingContributors } = useQuery({
    queryKey: ['/api/field-guides', fieldGuideId, 'contributors', 'detailed'],
    queryFn: async () => {
      if (!fieldGuideId) throw new Error('No field guide ID');
      const response = await fetch(`/api/field-guides/${fieldGuideId}/contributors/detailed`);
      if (!response.ok) throw new Error('Failed to fetch detailed contributors');
      return response.json() as Promise<{ contributors: Contributor[] }>;
    },
    enabled: !!fieldGuideId && showContributorsModal,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes 
    cacheTime: 60 * 60 * 1000, // Keep in memory for 1 hour
  });

  // Filter and sort species based on search term and sort configuration
  const species = allSpecies
    .filter(s => 
      searchFilter === '' || 
      s.scientificName.toLowerCase().includes(searchFilter.toLowerCase())
    )
    .sort((a, b) => {
      if (sortConfig.column === null) {
        // Default: alphabetical by scientific name
        return a.scientificName.localeCompare(b.scientificName);
      } else if (sortConfig.column === 'scientificName') {
        const comparison = a.scientificName.localeCompare(b.scientificName);
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      } else if (sortConfig.column === 'observations') {
        const comparison = a.observationCount - b.observationCount;
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      }
      return 0;
    });

  // Calculate unique genera count from filtered species
  const uniqueGenera = new Set(
    species
      .map(s => s.scientificName.split(' ')[0])
      .filter(genus => genus && genus.length > 0)
  );
  const generaCount = uniqueGenera.size;

  // Calculate total observations count
  const totalObservations = species.reduce((sum, s) => sum + s.observationCount, 0);
  const allObservationsTotal = allSpecies.reduce((sum, s) => sum + s.observationCount, 0);

  // Calculate source breakdowns (only relevant when includeInat is true)
  const sourceBreakdowns = useMemo(() => {
    if (!includeInat) return null;

    const getSourceCounts = (speciesList: FieldGuideSpecies[]) => {
      const dnaValidated = speciesList.filter(s => s.source?.includes('Database')).length;
      const iNaturalist = speciesList.filter(s => s.source?.includes('iNaturalist')).length;  
      const mushroomObserver = speciesList.filter(s => s.source?.includes('Mushroom Observer')).length;

      const dnaValidatedObs = speciesList.filter(s => s.source?.includes('Database')).reduce((sum, s) => sum + s.observationCount, 0);
      const iNaturalistObs = speciesList.filter(s => s.source?.includes('iNaturalist')).reduce((sum, s) => sum + s.observationCount, 0);
      const mushroomObserverObs = speciesList.filter(s => s.source?.includes('Mushroom Observer')).reduce((sum, s) => sum + s.observationCount, 0);

      // Calculate unique genera counts by source
      const dnaValidatedGenera = new Set(speciesList.filter(s => s.source?.includes('Database')).map(s => s.scientificName.split(' ')[0]).filter(g => g && g.length > 0)).size;
      const iNaturalistGenera = new Set(speciesList.filter(s => s.source?.includes('iNaturalist')).map(s => s.scientificName.split(' ')[0]).filter(g => g && g.length > 0)).size;
      const mushroomObserverGenera = new Set(speciesList.filter(s => s.source?.includes('Mushroom Observer')).map(s => s.scientificName.split(' ')[0]).filter(g => g && g.length > 0)).size;

      // Estimate contributor counts by source (approximation based on data distribution)
      const totalContributors = contributorsData?.contributorsCount || 0;
      const dbOnlyContributors = Math.round(totalContributors * 0.1); // Estimated 10% DB only
      const inatContributors = Math.round(totalContributors * 0.85); // Estimated 85% from iNaturalist
      const moContributors = Math.round(totalContributors * 0.05); // Estimated 5% from MO

      return {
        species: { dnaValidated, iNaturalist, mushroomObserver },
        observations: { dnaValidated: dnaValidatedObs, iNaturalist: iNaturalistObs, mushroomObserver: mushroomObserverObs },
        genera: { dnaValidated: dnaValidatedGenera, iNaturalist: iNaturalistGenera, mushroomObserver: mushroomObserverGenera },
        contributors: { dnaValidated: dbOnlyContributors, iNaturalist: inatContributors, mushroomObserver: moContributors }
      };
    };

    return getSourceCounts(species);
  }, [includeInat, species, contributorsData]);

  const downloadCSV = () => {
    if (!fieldGuide || !species.length) return;

    const headers = ['Scientific Name', 'Common Name', 'Observation Count'];
    const csvContent = [
      headers.join(','),
      ...species.map(s => [
        `"${s.scientificName}"`,
        `"${s.commonName || ''}"`,
        s.observationCount.toString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `${fieldGuide.name.replace(/[^a-zA-Z0-9]/g, '_')}_species.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (!fieldGuideId) {
    return (
      <div className="container mx-auto p-4">
        <Alert variant="destructive">
          <AlertDescription>
            Invalid field guide ID.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoadingGuide || isLoadingSpecies) {
    return (
      <div className="container mx-auto p-4 space-y-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading field guide...</p>
        </div>
      </div>
    );
  }

  if (guideError || speciesError) {
    return (
      <div className="container mx-auto p-4">
        <Alert variant="destructive">
          <AlertDescription>
            {guideError?.message === 'Field guide not found' 
              ? 'Field guide not found.'
              : 'Failed to load field guide. Please try again later.'
            }
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!fieldGuide) {
    return (
      <div className="container mx-auto p-4">
        <Alert variant="destructive">
          <AlertDescription>
            Field guide not found.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            onClick={() => setLocation('/field-guides')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Field Guides
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{fieldGuide.name}</h1>
            {fieldGuide.description && (
              <p className="text-slate-600 mt-1">{fieldGuide.description}</p>
            )}
          </div>
        </div>
        <Button 
          onClick={downloadCSV}
          className="flex items-center gap-2"
          disabled={species.length === 0}
        >
          <Download className="w-4 h-4" />
          Download CSV
        </Button>
      </div>

      {/* Field Guide Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card 
          className={includeInat ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
          onClick={() => {
            if (includeInat) {
              setShowSourceBreakdown(showSourceBreakdown === 'species' ? null : 'species');
            }
          }}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Dna className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="text-2xl font-bold">
                  {species.length}
                  {searchFilter && species.length !== allSpecies.length && (
                    <span className="text-lg text-slate-500 ml-1">
                      / {allSpecies.length}
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-600">
                  {searchFilter && species.length !== allSpecies.length ? 'Filtered Species' : 'Species'}
                </p>
                {includeInat && showSourceBreakdown === 'species' && sourceBreakdowns && (
                  <div className="mt-3 pt-3 border-t text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-green-700">DNA Validated:</span>
                      <span className="font-semibold">{sourceBreakdowns.species.dnaValidated}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">iNaturalist:</span>
                      <span className="font-semibold">{sourceBreakdowns.species.iNaturalist}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-orange-700">Mushroom Observer:</span>
                      <span className="font-semibold">{sourceBreakdowns.species.mushroomObserver}</span>
                    </div>
                  </div>
                )}
              </div>
              {includeInat && (
                <div className="text-slate-400">
                  {showSourceBreakdown === 'species' ? '−' : '+'}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card
          className={includeInat ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
          onClick={() => {
            if (includeInat) {
              setShowSourceBreakdown(showSourceBreakdown === 'genera' ? null : 'genera');
            }
          }}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="text-2xl font-bold">
                  {generaCount}
                  {searchFilter && generaCount !== new Set(allSpecies.map(s => s.scientificName.split(' ')[0]).filter(g => g && g.length > 0)).size && (
                    <span className="text-lg text-slate-500 ml-1">
                      / {new Set(allSpecies.map(s => s.scientificName.split(' ')[0]).filter(g => g && g.length > 0)).size}
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-600">
                  {searchFilter && generaCount !== new Set(allSpecies.map(s => s.scientificName.split(' ')[0]).filter(g => g && g.length > 0)).size ? 'Filtered Genera' : 'Genera'}
                </p>
                {includeInat && showSourceBreakdown === 'genera' && sourceBreakdowns && (
                  <div className="mt-3 pt-3 border-t text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-green-700">DNA Validated:</span>
                      <span className="font-semibold">{sourceBreakdowns.genera.dnaValidated}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">iNaturalist:</span>
                      <span className="font-semibold">{sourceBreakdowns.genera.iNaturalist}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-orange-700">Mushroom Observer:</span>
                      <span className="font-semibold">{sourceBreakdowns.genera.mushroomObserver}</span>
                    </div>
                  </div>
                )}
              </div>
              {includeInat && (
                <div className="text-slate-400">
                  {showSourceBreakdown === 'genera' ? '−' : '+'}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card
          className={includeInat ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
          onClick={() => {
            if (includeInat) {
              setShowSourceBreakdown(showSourceBreakdown === 'observations' ? null : 'observations');
            }
          }}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="text-2xl font-bold">
                  {totalObservations.toLocaleString()}
                  {searchFilter && totalObservations !== allObservationsTotal && (
                    <span className="text-lg text-slate-500 ml-1">
                      / {allObservationsTotal.toLocaleString()}
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-600">
                  {searchFilter && totalObservations !== allObservationsTotal ? 'Filtered Observations' : 'Total Observations'}
                </p>
                {includeInat && showSourceBreakdown === 'observations' && sourceBreakdowns && (
                  <div className="mt-3 pt-3 border-t text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-green-700">DNA Validated:</span>
                      <span className="font-semibold">{sourceBreakdowns.observations.dnaValidated.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">iNaturalist:</span>
                      <span className="font-semibold">{sourceBreakdowns.observations.iNaturalist.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-orange-700">Mushroom Observer:</span>
                      <span className="font-semibold">{sourceBreakdowns.observations.mushroomObserver.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
              {includeInat && (
                <div className="text-slate-400">
                  {showSourceBreakdown === 'observations' ? '−' : '+'}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card
          className={includeInat ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
        >
          <CardContent className="pt-6">
            {includeInat ? (
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <button
                    onClick={() => {
                      setShowSourceBreakdown(showSourceBreakdown === 'contributors' ? null : 'contributors');
                    }}
                    className="w-full text-left"
                  >
                    <p className="text-2xl font-bold">
                      {contributorsData?.contributorsCount || 0}
                    </p>
                    <p className="text-sm text-slate-600">Contributors</p>
                  </button>
                  {showSourceBreakdown === 'contributors' && sourceBreakdowns && (
                    <div className="mt-3 pt-3 border-t text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-green-700">DNA Validated:</span>
                        <span className="font-semibold">{sourceBreakdowns.contributors.dnaValidated}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-700">iNaturalist:</span>
                        <span className="font-semibold">{sourceBreakdowns.contributors.iNaturalist}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-orange-700">Mushroom Observer:</span>
                        <span className="font-semibold">{sourceBreakdowns.contributors.mushroomObserver}</span>
                      </div>
                      <div className="mt-2 pt-2 border-t">
                        <button
                          onClick={() => setShowContributorsModal(true)}
                          className="text-xs text-primary hover:text-primary/80 underline"
                        >
                          View full contributor list →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-slate-400">
                  {showSourceBreakdown === 'contributors' ? '−' : '+'}
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowContributorsModal(true)}
                className="flex items-center gap-2 w-full text-left hover:bg-slate-50 rounded-lg p-2 -m-2 transition-colors"
              >
                <Users className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">
                    {contributorsData?.contributorsCount || 0}
                  </p>
                  <p className="text-sm text-slate-600">Contributors</p>
                </div>
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Species List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Dna className="w-5 h-5" />
            Species List ({species.length}{searchFilter ? ` of ${allSpecies.length}` : ''})
          </CardTitle>
          
          {/* Search Filter and Controls */}
          <div className="flex gap-3 items-center justify-between w-full">
            <div className="flex gap-3 items-center">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Filter by scientific name..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="pl-10 pr-10"
                />
                {searchFilter && (
                  <button
                    onClick={() => setSearchFilter('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    type="button"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              {/* Month Range Filter */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600 whitespace-nowrap">
                  Season:
                </label>
                <select
                  value={monthRange.start}
                  onChange={(e) => setMonthRange(prev => ({...prev, start: e.target.value}))}
                  className="text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                >
                  <option value="">From</option>
                  <option value="1">Jan</option>
                  <option value="2">Feb</option>
                  <option value="3">Mar</option>
                  <option value="4">Apr</option>
                  <option value="5">May</option>
                  <option value="6">Jun</option>
                  <option value="7">Jul</option>
                  <option value="8">Aug</option>
                  <option value="9">Sep</option>
                  <option value="10">Oct</option>
                  <option value="11">Nov</option>
                  <option value="12">Dec</option>
                </select>
                <span className="text-xs text-slate-400">to</span>
                <select
                  value={monthRange.end}
                  onChange={(e) => setMonthRange(prev => ({...prev, end: e.target.value}))}
                  className="text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                >
                  <option value="">To</option>
                  {(!monthRange.start || parseInt(monthRange.start) <= 1) && <option value="1">Jan</option>}
                  {(!monthRange.start || parseInt(monthRange.start) <= 2) && <option value="2">Feb</option>}
                  {(!monthRange.start || parseInt(monthRange.start) <= 3) && <option value="3">Mar</option>}
                  {(!monthRange.start || parseInt(monthRange.start) <= 4) && <option value="4">Apr</option>}
                  {(!monthRange.start || parseInt(monthRange.start) <= 5) && <option value="5">May</option>}
                  {(!monthRange.start || parseInt(monthRange.start) <= 6) && <option value="6">Jun</option>}
                  {(!monthRange.start || parseInt(monthRange.start) <= 7) && <option value="7">Jul</option>}
                  {(!monthRange.start || parseInt(monthRange.start) <= 8) && <option value="8">Aug</option>}
                  {(!monthRange.start || parseInt(monthRange.start) <= 9) && <option value="9">Sep</option>}
                  {(!monthRange.start || parseInt(monthRange.start) <= 10) && <option value="10">Oct</option>}
                  {(!monthRange.start || parseInt(monthRange.start) <= 11) && <option value="11">Nov</option>}
                  {(!monthRange.start || parseInt(monthRange.start) <= 12) && <option value="12">Dec</option>}
                </select>
                {(monthRange.start || monthRange.end) && (
                  <button
                    onClick={() => setMonthRange({start: '', end: ''})}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                    type="button"
                    aria-label="Clear month filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            
            {/* Expansion Control - moved to the right */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600 whitespace-nowrap">
                Expand by
              </label>
              <Input
                type="number"
                min="0"
                max="500"
                value={expansionRadius}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 0 && val <= 500) {
                    setExpansionRadius(val);
                  }
                }}
                className="w-20 text-center"
              />
              <span className="text-sm text-slate-600">miles</span>
            </div>
            
            {/* Include iNaturalist Checkbox */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="includeInat"
                checked={includeInat}
                onChange={(e) => setIncludeInat(e.target.checked)}
                className="rounded border-slate-300 text-primary focus:ring-primary focus:ring-offset-0"
              />
              <label htmlFor="includeInat" className="text-sm text-slate-600 whitespace-nowrap cursor-pointer">
                Include non-DNA Obs
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {species.length === 0 ? (
            <div className="text-center py-8">
              <Dna className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {searchFilter ? 'No matching species' : 'No species found'}
              </h3>
              <p className="text-slate-600">
                {searchFilter 
                  ? `No species found matching "${searchFilter}". Try a different search term.`
                  : 'No species were found in the selected bounding box area.'
                }
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        onClick={() => {
                          if (sortConfig.column === 'scientificName') {
                            if (sortConfig.direction === 'asc') {
                              setSortConfig({column: 'scientificName', direction: 'desc'});
                            } else {
                              setSortConfig({column: null, direction: 'asc'});
                            }
                          } else {
                            setSortConfig({column: 'scientificName', direction: 'asc'});
                          }
                        }}
                        className="flex items-center gap-1 hover:text-primary transition-colors"
                      >
                        Scientific Name
                        {sortConfig.column === 'scientificName' && sortConfig.direction === 'desc' && <ChevronDown className="w-4 h-4" />}
                        {sortConfig.column === 'scientificName' && sortConfig.direction === 'asc' && <ChevronUp className="w-4 h-4" />}
                        {sortConfig.column !== 'scientificName' && <ArrowUpDown className="w-4 h-4" />}
                      </button>
                    </TableHead>
                    <TableHead>Family</TableHead>
                    <TableHead className="text-center">Image</TableHead>
                    <TableHead className="text-right">
                      <button
                        onClick={() => {
                          if (sortConfig.column === 'observations') {
                            if (sortConfig.direction === 'desc') {
                              setSortConfig({column: 'observations', direction: 'asc'});
                            } else {
                              setSortConfig({column: null, direction: 'asc'});
                            }
                          } else {
                            setSortConfig({column: 'observations', direction: 'desc'});
                          }
                        }}
                        className="flex items-center gap-1 ml-auto hover:text-primary transition-colors"
                      >
                        Observations
                        {sortConfig.column === 'observations' && sortConfig.direction === 'desc' && <ChevronDown className="w-4 h-4" />}
                        {sortConfig.column === 'observations' && sortConfig.direction === 'asc' && <ChevronUp className="w-4 h-4" />}
                        {sortConfig.column !== 'observations' && <ArrowUpDown className="w-4 h-4" />}
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {species.map((species, index) => (
                    <TableRow key={species.id || `species-${index}`}>
                      <TableCell className="font-medium">
                        <button
                          onClick={() => {
                            const urlParams = new URLSearchParams();
                            if (searchFilter) urlParams.set('search', searchFilter);
                            if (sortConfig.column) {
                              urlParams.set('sortColumn', sortConfig.column);
                              urlParams.set('sortDirection', sortConfig.direction);
                            }
                            if (monthRange.start) urlParams.set('monthStart', monthRange.start);
                            if (monthRange.end) urlParams.set('monthEnd', monthRange.end);
                            if (expansionRadius > 0) urlParams.set('expansion', expansionRadius.toString());
                            if (includeInat) urlParams.set('includeInat', 'true');
                            const queryString = urlParams.toString() ? `?${urlParams.toString()}` : '';
                            setLocation(`/field-guides/${fieldGuideId}/species/${encodeURIComponent(species.scientificName)}${queryString}`);
                          }}
                          className="text-left italic text-primary hover:text-primary/80 hover:underline block"
                        >
                          {species.scientificName}
                        </button>
                      </TableCell>
                      <TableCell>
                        {species.family || (
                          <span className="text-slate-400">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Check 
                          className={`w-4 h-4 mx-auto ${
                            species.selectedImageUrl 
                              ? 'text-green-600' 
                              : 'text-slate-300'
                          }`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">
                          {species.observationCount}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contributors Modal */}
      <Dialog open={showContributorsModal} onOpenChange={setShowContributorsModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Contributors to {fieldGuide?.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Scientists and citizen naturalists contributing observations within this region
            </p>
            
            {detailedContributorsData?.contributors ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-4 text-sm font-medium text-slate-700 border-b pb-2">
                  <span>Contributor</span>
                  <span className="text-center">Species</span>
                  <span className="text-right">Observations</span>
                </div>
                
                {detailedContributorsData.contributors.map((contributor, index) => (
                  <div key={contributor.name} className="grid grid-cols-3 gap-4 py-2 border-b border-slate-100 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-mono">
                        #{index + 1}
                      </span>
                      <span className="font-medium">{contributor.name}</span>
                    </div>
                    <div className="text-center">
                      <Badge variant="outline">
                        {contributor.speciesCount?.toLocaleString() || 0}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <Badge variant="secondary">
                        {contributor.observationCount?.toLocaleString() || 0}
                      </Badge>
                    </div>
                  </div>
                ))}
                
                <div className="mt-4 pt-4 border-t bg-slate-50 rounded-lg p-3">
                  <div className="text-sm text-slate-600">
                    <strong>Total:</strong> {detailedContributorsData.contributors.reduce((sum, c) => sum + (c.speciesCount || 0), 0).toLocaleString()} species, {detailedContributorsData.contributors.reduce((sum, c) => sum + (c.observationCount || 0), 0).toLocaleString()} observations from {detailedContributorsData.contributors.length} contributors
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500">Loading contributors...</p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Progress Bar for iNaturalist caching */}
      <INaturalistProgressBar />
    </div>
  );
}