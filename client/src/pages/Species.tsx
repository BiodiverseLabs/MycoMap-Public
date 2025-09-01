import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Search, Calendar, MapPin, TrendingUp, Eye, Clock, Award, BarChart3 } from "lucide-react";
import { Link } from "wouter";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Checkbox } from "@/components/ui/checkbox";

interface Species {
  id: number;
  scientificName: string;
  commonName: string | null;
  observationCount: number;
  firstObserved: string | null;
  lastObserved: string | null;
  stateCount: number | null;
}

export default function Species() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedState, setSelectedState] = useState<string>("all");

  const [extrapolate, setExtrapolate] = useState(false);
  const [showGenera, setShowGenera] = useState(false);
  const [showDiscoveryRate, setShowDiscoveryRate] = useState(false);
  const [selectedModel, setSelectedModel] = useState("power-law");

  // Fetch species data with state filtering
  const { data: allSpecies = [], isLoading: speciesLoading } = useQuery({
    queryKey: ["/api/species", selectedState],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedState && selectedState !== 'all') {
        params.append('state', selectedState);
      }
      const response = await fetch(`/api/species?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch species');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - species data is relatively stable
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
  });

  // Fetch state counts for efficient filtering using optimized endpoint
  const { data: stateCounts = [] } = useQuery({
    queryKey: ["/api/observations/summary", "states"],
    queryFn: async () => {
      const response = await fetch('/api/observations/summary?aggregate=states&dateRange=all_time');
      if (!response.ok) throw new Error('Failed to fetch state summary');
      return response.json();
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - state data very stable
    gcTime: 30 * 60 * 1000, // 30 minutes cache retention
  });

  // Extract states from state counts for dropdown
  const states = stateCounts.map((item: any) => item.state).filter(Boolean);

  // Remove the expensive observations fetch - we don't need all 70k+ records for species filtering

  // Fetch species/genera accumulation curve data with search term filter
  const { data: accumulationData = [], isLoading: accumulationLoading } = useQuery({
    queryKey: [showGenera ? "/api/genera-accumulation" : "/api/species-accumulation", selectedState, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedState && selectedState !== 'all') {
        params.append('state', selectedState);
      }
      if (searchTerm) {
        params.append('search', searchTerm);
      }
      const endpoint = showGenera ? '/api/genera-accumulation' : '/api/species-accumulation';
      const response = await fetch(`${endpoint}?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch accumulation data');
      return response.json();
    },
    staleTime: 3 * 60 * 1000, // 3 minutes for dynamic chart data
    gcTime: 10 * 60 * 1000, // 10 minutes cache retention
    enabled: !!selectedState && !showDiscoveryRate, // Only fetch when state is selected and not showing discovery rate
  });

  // Fetch species discovery rate data
  const { data: discoveryRateData = [], isLoading: discoveryLoading } = useQuery({
    queryKey: ["/api/species-discovery-rate", selectedState, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedState && selectedState !== 'all') {
        params.append('state', selectedState);
      }
      if (searchTerm) {
        params.append('search', searchTerm);
      }
      const response = await fetch(`/api/species-discovery-rate?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch discovery rate data');
      return response.json();
    },
    staleTime: 3 * 60 * 1000, // 3 minutes for dynamic chart data
    gcTime: 10 * 60 * 1000, // 10 minutes cache retention
    enabled: !!selectedState, // Always fetch when state is selected (needed for recent discovery rate calculation)
  });

  // Filter species based on search and filters
  const filteredSpecies = useMemo(() => {
    let filtered = allSpecies;

    // Filter out Fungi and Unknown entries
    filtered = filtered.filter((species: Species) =>
      species.scientificName !== 'Fungi' && species.scientificName !== 'Unknown'
    );

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter((species: Species) =>
        species.scientificName.toLowerCase().includes(searchLower) ||
        (species.commonName && species.commonName.toLowerCase().includes(searchLower))
      );
    }

    // Note: State filtering is now handled server-side in the species API endpoint
    // Note: Date filtering removed as it required full observations dataset

    return filtered.sort((a, b) => (b.observationCount || 0) - (a.observationCount || 0));
  }, [allSpecies, searchTerm]);

  // Calculate statistics
  const stats = useMemo(() => {
    const totalSpecies = filteredSpecies.length;
    const veryCommon = filteredSpecies.filter(s => (s.observationCount || 0) >= 50).length;
    const common = filteredSpecies.filter(s => (s.observationCount || 0) >= 11 && (s.observationCount || 0) <= 49).length;
    const uncommon = filteredSpecies.filter(s => (s.observationCount || 0) >= 5 && (s.observationCount || 0) <= 9).length;
    const rare = filteredSpecies.filter(s => (s.observationCount || 0) >= 2 && (s.observationCount || 0) <= 4).length;
    const veryRare = filteredSpecies.filter(s => (s.observationCount || 0) === 1).length;
    const recentSpecies = filteredSpecies.filter(s => {
      if (!s.lastObserved) return false;
      try {
        const threeYearsAgo = new Date();
        threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
        const lastObservedDate = new Date(s.lastObserved);
        return lastObservedDate >= threeYearsAgo;
      } catch {
        return false;
      }
    }).length;
    
    // Count temporary code names (species with quotes or numerals)
    const temporaryCodeNames = filteredSpecies.filter(s => {
      const name = s.scientificName || '';
      return /['"\d]/.test(name); // Contains single quote, double quote, or numeral
    }).length;

    return { totalSpecies, veryCommon, common, uncommon, rare, veryRare, recentSpecies, temporaryCodeNames };
  }, [filteredSpecies]);

  // Multiple model calculations
  const modelCalculations = useMemo(() => {
    if (!extrapolate || accumulationData.length < 10) {
      return { 
        powerLaw: { extendedData: accumulationData, estimatedTotal: null, observationsFor95: null, rSquared: null },
        michaelisMenten: { extendedData: accumulationData, estimatedTotal: null, observationsFor95: null, rSquared: null },
        weibull: { extendedData: accumulationData, estimatedTotal: null, observationsFor95: null, rSquared: null },
        chapman: { extendedData: accumulationData, estimatedTotal: null, observationsFor95: null, rSquared: null }
      };
    }

    const n = accumulationData.length;
    const lastPoint = accumulationData[n - 1];
    const currentSpecies = lastPoint.uniqueSpeciesCount;
    const currentObs = lastPoint.observationNumber;
    
    // Take last 30% of data for fitting (changed from 50%)
    const fitStart = Math.floor(n * 0.7);
    const fitData = accumulationData.slice(fitStart).filter(point => 
      point.uniqueSpeciesCount > 0 && point.observationNumber > 0
    );

    // Calculate data-driven projection parameters
    const recent10Percent = accumulationData.slice(-Math.floor(n * 0.1));
    const avgRecentRate = recent10Percent.length > 1 ? 
      (recent10Percent[recent10Percent.length - 1].uniqueSpeciesCount - recent10Percent[0].uniqueSpeciesCount) / 
      (recent10Percent[recent10Percent.length - 1].observationNumber - recent10Percent[0].observationNumber) : 0.01;
    
    // Data-driven projection: project until rate drops to 5% of current rate
    const stabilizationThreshold = avgRecentRate * 0.05;
    const projectionMultiplier = Math.max(2, Math.min(20, Math.ceil(avgRecentRate / stabilizationThreshold)));

    function calculateRSquared(actual: number[], predicted: number[]) {
      const mean = actual.reduce((a, b) => a + b, 0) / actual.length;
      const ssTotal = actual.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
      const ssResidual = actual.reduce((sum, val, i) => sum + Math.pow(val - predicted[i], 2), 0);
      return 1 - (ssResidual / ssTotal);
    }

    // 1. Power Law Model: S = a * N^b
    function calculatePowerLaw() {
      let sumLogX = 0, sumLogY = 0, sumLogXLogY = 0, sumLogX2 = 0;
      fitData.forEach(point => {
        const logX = Math.log(point.observationNumber);
        const logY = Math.log(point.uniqueSpeciesCount);
        sumLogX += logX;
        sumLogY += logY;
        sumLogXLogY += logX * logY;
        sumLogX2 += logX * logX;
      });
      
      const m = fitData.length;
      const b = (m * sumLogXLogY - sumLogX * sumLogY) / (m * sumLogX2 - sumLogX * sumLogX);
      const logA = (sumLogY - b * sumLogX) / m;
      const a = Math.exp(logA);
      
      const projectedObs = currentObs * projectionMultiplier;
      const projectedSpecies = a * Math.pow(projectedObs, b);
      const estimatedTotal = Math.round(projectedSpecies);
      const observationsFor95 = Math.round(Math.pow((estimatedTotal * 0.95) / a, 1 / b));
      
      // Calculate R²
      const predicted = fitData.map(point => a * Math.pow(point.observationNumber, b));
      const actual = fitData.map(point => point.uniqueSpeciesCount);
      const rSquared = calculateRSquared(actual, predicted);

      const maxExtension = Math.max(currentObs * 2, observationsFor95 * 1.2);
      const extendedData = accumulationData.map(point => ({
        ...point,
        fittedSpecies: Math.round(a * Math.pow(point.observationNumber, b)),
        extrapolatedSpecies: null
      }));
      
      for (let i = currentObs + 1000; i <= maxExtension; i += 1000) {
        const predictedSpecies = Math.round(a * Math.pow(i, b));
        extendedData.push({
          observationNumber: i,
          uniqueSpeciesCount: null,
          fittedSpecies: null,
          extrapolatedSpecies: Math.min(predictedSpecies, estimatedTotal)
        });
      }
      
      return { extendedData, estimatedTotal, observationsFor95, rSquared };
    }

    // 2. Michaelis-Menten Model: S = (a*N)/(b + N) - Classic for species accumulation
    function calculateMichaelisMenten() {
      // Linear transformation: 1/S = b/(a*N) + 1/a
      // Or: N/S = b/a + N/a, so N/S vs N gives slope 1/a, intercept b/a
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      fitData.forEach(point => {
        const x = point.observationNumber;
        const y = point.observationNumber / point.uniqueSpeciesCount;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
      });
      
      const m = fitData.length;
      const slope = (m * sumXY - sumX * sumY) / (m * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / m;
      
      const a = 1 / slope; // Maximum asymptote
      const b = intercept / slope; // Half-saturation constant
      
      const estimatedTotal = Math.round(a);
      const observationsFor95 = Math.round((0.95 * b) / (1 - 0.95)); // 95% of asymptote
      
      // Calculate R²
      const predicted = fitData.map(point => (a * point.observationNumber) / (b + point.observationNumber));
      const actual = fitData.map(point => point.uniqueSpeciesCount);
      const rSquared = calculateRSquared(actual, predicted);

      const maxExtension = Math.max(currentObs * 2, observationsFor95 * 1.2);
      const extendedData = accumulationData.map(point => ({
        ...point,
        fittedSpecies: Math.round((a * point.observationNumber) / (b + point.observationNumber)),
        extrapolatedSpecies: null
      }));
      
      for (let i = currentObs + 1000; i <= maxExtension; i += 1000) {
        const predictedSpecies = Math.round((a * i) / (b + i));
        extendedData.push({
          observationNumber: i,
          uniqueSpeciesCount: null,
          fittedSpecies: null,
          extrapolatedSpecies: Math.min(predictedSpecies, estimatedTotal)
        });
      }
      
      return { extendedData, estimatedTotal, observationsFor95, rSquared };
    }

    // 3. Weibull Model: S = a * (1 - exp(-(N/b)^c)) - Flexible growth curve
    function calculateWeibull() {
      const maxObserved = Math.max(...fitData.map(p => p.uniqueSpeciesCount));
      const a = maxObserved * 1.3; // Asymptote estimate
      let bestB = currentObs / 3; // Scale parameter
      let bestC = 0.5; // Shape parameter
      let bestSSE = Infinity;

      // Grid search for optimal parameters
      for (let c = 0.1; c <= 2.0; c += 0.1) {
        for (let b = currentObs * 0.1; b <= currentObs * 2; b += currentObs * 0.1) {
          const sse = fitData.reduce((sum, point) => {
            const predicted = a * (1 - Math.exp(-Math.pow(point.observationNumber / b, c)));
            return sum + Math.pow(point.uniqueSpeciesCount - predicted, 2);
          }, 0);
          if (sse < bestSSE) {
            bestSSE = sse;
            bestB = b;
            bestC = c;
          }
        }
      }

      const estimatedTotal = Math.round(a * 0.98); // 98% of asymptote
      const observationsFor95 = Math.round(bestB * Math.pow(-Math.log(1 - 0.95), 1/bestC));
      
      // Calculate R²
      const predicted = fitData.map(point => a * (1 - Math.exp(-Math.pow(point.observationNumber / bestB, bestC))));
      const actual = fitData.map(point => point.uniqueSpeciesCount);
      const rSquared = calculateRSquared(actual, predicted);

      const maxExtension = Math.max(currentObs * 2, observationsFor95 * 1.2);
      const extendedData = accumulationData.map(point => ({
        ...point,
        fittedSpecies: Math.round(a * (1 - Math.exp(-Math.pow(point.observationNumber / bestB, bestC)))),
        extrapolatedSpecies: null
      }));
      
      for (let i = currentObs + 1000; i <= maxExtension; i += 1000) {
        const predictedSpecies = Math.round(a * (1 - Math.exp(-Math.pow(i / bestB, bestC))));
        extendedData.push({
          observationNumber: i,
          uniqueSpeciesCount: null,
          fittedSpecies: null,
          extrapolatedSpecies: Math.min(predictedSpecies, estimatedTotal)
        });
      }
      
      return { extendedData, estimatedTotal, observationsFor95, rSquared };
    }

    // 4. Chapman-Richards Model: S = a * (1 - exp(-b*N))^c - Growth model with flexible approach
    function calculateChapman() {
      const maxObserved = Math.max(...fitData.map(p => p.uniqueSpeciesCount));
      const a = maxObserved * 1.4; // Asymptote estimate
      let bestB = 0.001;
      let bestC = 1.0;
      let bestSSE = Infinity;

      // Grid search for optimal parameters
      for (let c = 0.1; c <= 3.0; c += 0.2) {
        for (let b = 0.0001; b <= 0.01; b += 0.0005) {
          const sse = fitData.reduce((sum, point) => {
            const exp_term = Math.exp(-b * point.observationNumber);
            const predicted = a * Math.pow(1 - exp_term, c);
            return sum + Math.pow(point.uniqueSpeciesCount - predicted, 2);
          }, 0);
          if (sse < bestSSE) {
            bestSSE = sse;
            bestB = b;
            bestC = c;
          }
        }
      }

      const estimatedTotal = Math.round(a * 0.97); // 97% of asymptote
      const observationsFor95 = Math.round(-Math.log(1 - Math.pow(0.95, 1/bestC)) / bestB);
      
      // Calculate R²
      const predicted = fitData.map(point => {
        const exp_term = Math.exp(-bestB * point.observationNumber);
        return a * Math.pow(1 - exp_term, bestC);
      });
      const actual = fitData.map(point => point.uniqueSpeciesCount);
      const rSquared = calculateRSquared(actual, predicted);

      const maxExtension = Math.max(currentObs * 2, observationsFor95 * 1.2);
      const extendedData = accumulationData.map(point => ({
        ...point,
        fittedSpecies: Math.round(a * Math.pow(1 - Math.exp(-bestB * point.observationNumber), bestC)),
        extrapolatedSpecies: null
      }));
      
      for (let i = currentObs + 1000; i <= maxExtension; i += 1000) {
        const predictedSpecies = Math.round(a * Math.pow(1 - Math.exp(-bestB * i), bestC));
        extendedData.push({
          observationNumber: i,
          uniqueSpeciesCount: null,
          fittedSpecies: null,
          extrapolatedSpecies: Math.min(predictedSpecies, estimatedTotal)
        });
      }
      
      return { extendedData, estimatedTotal, observationsFor95, rSquared };
    }

    return {
      powerLaw: calculatePowerLaw(),
      michaelisMenten: calculateMichaelisMenten(),
      weibull: calculateWeibull(),
      chapman: calculateChapman()
    };
  }, [accumulationData, extrapolate]);

  // Get the currently selected model data
  const modelKey = selectedModel === 'michaelis-menten' ? 'michaelisMenten' : 
                   selectedModel === 'chapman-richards' ? 'chapman' :
                   selectedModel.replace('-', '');
  const extrapolationData = modelCalculations[modelKey as keyof typeof modelCalculations] || modelCalculations.powerLaw;

  return (
    <div className="flex flex-col h-full">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Species Analysis</h2>
          <p className="text-slate-600 mt-1">
            Search, filter, and analyze macrofungi species observations
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Search and Filter Panel */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Species Search & Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Species Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search by species name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* State Filter */}
              <Select value={selectedState} onValueChange={setSelectedState}>
                <SelectTrigger>
                  <MapPin className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {states.map((state: any) => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter Summary */}
            <div className="mt-4 flex items-center gap-4 text-sm text-slate-600">
              <span>
                Showing {filteredSpecies.length} of {allSpecies.length} species
              </span>
              {searchTerm && (
                <Badge variant="secondary">Search: "{searchTerm}"</Badge>
              )}
              {selectedState !== "all" && (
                <Badge variant="secondary">State: {selectedState}</Badge>
              )}
              {(searchTerm || selectedState !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedState("all");
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Total Species
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{stats.totalSpecies}</div>
              <p className="text-sm text-slate-600 mt-1">
                {allSpecies.length > 0 ? ((stats.totalSpecies / allSpecies.length) * 100).toFixed(1) : 0}% of database
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="w-4 h-4" />
                Temporary Code Names
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">{stats.temporaryCodeNames}</div>
              <p className="text-sm text-slate-600 mt-1">
                Species with quotes or numerals
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Recently Active
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{stats.recentSpecies}</div>
              <p className="text-sm text-slate-600 mt-1">
                Observed in last 3 years
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Rare-Common Distribution Panel */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Species Rarity Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="text-2xl font-bold text-green-700">{stats.veryCommon}</div>
                <div className="text-sm font-medium text-green-600">Very Common</div>
                <div className="text-xs text-green-500">50+ obs.</div>
              </div>
              
              <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-2xl font-bold text-blue-700">{stats.common}</div>
                <div className="text-sm font-medium text-blue-600">Common</div>
                <div className="text-xs text-blue-500">11-49 obs.</div>
              </div>
              
              <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="text-2xl font-bold text-yellow-700">{stats.uncommon}</div>
                <div className="text-sm font-medium text-yellow-600">Uncommon</div>
                <div className="text-xs text-yellow-500">5-10 obs.</div>
              </div>
              
              <div className="text-center p-4 bg-orange-50 rounded-lg border border-orange-200">
                <div className="text-2xl font-bold text-orange-700">{stats.rare}</div>
                <div className="text-sm font-medium text-orange-600">Rare</div>
                <div className="text-xs text-orange-500">2-4 obs.</div>
              </div>
              
              <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
                <div className="text-2xl font-bold text-red-700">{stats.veryRare}</div>
                <div className="text-sm font-medium text-red-600">Very Rare</div>
                <div className="text-xs text-red-500">1 obs.</div>
              </div>
            </div>
            
            <div className="mt-4 text-sm text-slate-600 text-center">
              Distribution based on total observation counts per species
            </div>
          </CardContent>
        </Card>

        {/* Species List */}
        <Card>
          <CardHeader>
            <CardTitle>Species Results</CardTitle>
          </CardHeader>
          <CardContent>
            {speciesLoading ? (
              <div className="text-slate-500">Loading species data...</div>
            ) : filteredSpecies.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No species found matching your filters
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredSpecies.slice(0, 50).map((species: Species) => (
                  <Link key={species.id} href={`/species/${encodeURIComponent(species.scientificName)}`}>
                    <div className="flex items-center justify-between p-4 border border-slate-100 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                      <div className="flex-1">
                        <h3 className="font-medium text-slate-900 italic hover:text-primary">{species.scientificName}</h3>
                        {species.commonName && (
                          <p className="text-sm text-slate-600">{species.commonName}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                          {species.firstObserved && (
                            <span>First: {new Date(species.firstObserved).getFullYear()}</span>
                          )}
                          {species.lastObserved && (
                            <span>Last: {new Date(species.lastObserved).getFullYear()}</span>
                          )}
                          {species.stateCount && (
                            <span>{species.stateCount} states</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={
                          (species.observationCount || 0) >= 50 ? "default" :
                          (species.observationCount || 0) >= 11 ? "secondary" : "outline"
                        }>
                          {species.observationCount || 0} obs
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))}
                {filteredSpecies.length > 50 && (
                  <div className="text-center py-4 text-slate-500">
                    Showing first 50 of {filteredSpecies.length} species
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Species Accumulation Curve */}
        <Card className="mt-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                {showDiscoveryRate 
                  ? "Species Discovery Rate (per 1,000 observations)" 
                  : showGenera 
                    ? "Genera Accumulation Curve" 
                    : "Species Accumulation Curve"}
                {selectedState !== "all" && (
                  <Badge variant="secondary">State: {selectedState}</Badge>
                )}
              </CardTitle>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="showDiscoveryRate"
                    checked={showDiscoveryRate}
                    onCheckedChange={(checked) => {
                      setShowDiscoveryRate(checked === true);
                      if (checked) {
                        setShowGenera(false);
                        setExtrapolate(false);
                      }
                    }}
                  />
                  <label htmlFor="showDiscoveryRate" className="text-sm font-medium">
                    Discovery Rate
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="showGenera"
                    checked={showGenera}
                    onCheckedChange={(checked) => {
                      setShowGenera(checked === true);
                      if (checked) {
                        setShowDiscoveryRate(false);
                      }
                    }}
                    disabled={showDiscoveryRate}
                  />
                  <label htmlFor="showGenera" className="text-sm font-medium">
                    Show Genera
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="extrapolate"
                    checked={extrapolate}
                    onCheckedChange={(checked) => setExtrapolate(checked === true)}
                    disabled={showDiscoveryRate}
                  />
                  <label htmlFor="extrapolate" className="text-sm font-medium">
                    Extrapolate
                  </label>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {(accumulationLoading || discoveryLoading) ? (
              <div className="h-80 flex items-center justify-center">
                <div className="text-slate-500">
                  {showDiscoveryRate ? "Loading discovery rate..." : "Loading accumulation curve..."}
                </div>
              </div>
            ) : showDiscoveryRate && discoveryRateData.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={discoveryRateData} margin={{ top: 5, right: 30, left: 80, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="observationChunk" 
                      tickFormatter={(value) => `${value}k`}
                      interval="preserveStartEnd"
                      tick={{ fontSize: 12 }}
                      label={{ value: 'Observation Chunk (thousands)', position: 'insideBottom', offset: -10 }}
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      label={{ 
                        value: 'New Species Discovered', 
                        angle: -90, 
                        position: 'insideLeft',
                        style: { textAnchor: 'middle' }
                      }}
                    />
                    <Tooltip 
                      formatter={(value, name) => [value, "New Species"]}
                      labelFormatter={(label) => `Observations ${((label - 1) * 1000 + 1).toLocaleString()}-${(label * 1000).toLocaleString()}`}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="newSpeciesCount" 
                      stroke="#ff7300" 
                      strokeWidth={3}
                      dot={{ r: 4, fill: "#ff7300" }}
                      name="New Species Per 1,000 Observations"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : extrapolationData.extendedData.length > 0 ? (
              <div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={extrapolationData.extendedData} margin={{ top: 5, right: 30, left: 80, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="observationNumber" 
                        tickFormatter={(value) => {
                          if (value >= 10000) {
                            return `${(value / 1000).toFixed(0)}k`;
                          }
                          return value.toString();
                        }}
                        interval="preserveStartEnd"
                        tick={{ fontSize: 12 }}
                        label={{ value: 'Number of Observations', position: 'insideBottom', offset: -10 }}
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => {
                          if (value >= 1000) {
                            return `${(value / 1000).toFixed(0)}k`;
                          }
                          return value.toString();
                        }}
                        label={{ 
                          value: showGenera ? 'Cumulative Genera Count' : 'Cumulative Species Count', 
                          angle: -90, 
                          position: 'insideLeft',
                          style: { textAnchor: 'middle' }
                        }}
                      />
                      <Tooltip 
                        formatter={(value, name) => [value.toLocaleString(), name]}
                        labelFormatter={(label) => `Observation ${label.toLocaleString()}`}
                      />
                      {/* Observed data line */}
                      <Line 
                        type="monotone" 
                        dataKey="uniqueSpeciesCount" 
                        stroke="#8884d8" 
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                        name={showGenera ? "Observed Genera" : "Observed Species"}
                      />
                      {/* Fitted line showing model over actual data */}
                      {extrapolate && (
                        <Line 
                          type="monotone" 
                          dataKey="fittedSpecies" 
                          stroke="#82ca9d" 
                          strokeWidth={2}
                          dot={false}
                          strokeDasharray="3 3"
                          connectNulls={false}
                          name="Fitted Model"
                        />
                      )}
                      {/* Extrapolated line beyond current data */}
                      {extrapolate && (
                        <Line 
                          type="monotone" 
                          dataKey="extrapolatedSpecies" 
                          stroke="#ff7300" 
                          strokeWidth={2}
                          dot={false}
                          strokeDasharray="5 5"
                          connectNulls={false}
                          name={showGenera ? "Projected Genera" : "Projected Species"}
                        />
                      )}
                      {/* Reference line for estimated total */}
                      {extrapolate && extrapolationData.estimatedTotal && (
                        <ReferenceLine 
                          y={extrapolationData.estimatedTotal} 
                          stroke="red" 
                          strokeDasharray="3 3" 
                          label={{ value: "Estimated Total", position: "insideTopRight" }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                
                {/* Extrapolation Statistics */}
                {extrapolate && extrapolationData.estimatedTotal && (
                  <div className="space-y-6 mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">
                            {showGenera ? "Estimated Total Genera (Gmax)" : "Estimated Total Species (Smax)"}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-primary">
                            {extrapolationData.estimatedTotal?.toLocaleString()}
                          </div>
                          <p className="text-sm text-slate-600 mt-1">
                            {showGenera ? "Asymptotic genera richness estimate" : "Asymptotic species richness estimate"}
                          </p>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">Sampling Completeness</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-primary">
                            {extrapolationData.estimatedTotal ? 
                              Math.round((accumulationData[accumulationData.length - 1]?.uniqueSpeciesCount / extrapolationData.estimatedTotal) * 100) : 0}%
                          </div>
                          <p className="text-sm text-slate-600 mt-1">
                            {showGenera ? "Current genera discovery rate" : "Current species discovery rate"}
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Observations for 95% Coverage</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-xl font-bold text-primary">
                            {extrapolationData.observationsFor95?.toLocaleString()}
                          </div>
                          <p className="text-xs text-slate-600 mt-1">
                            Required sampling effort
                          </p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Recent Discovery Rate</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-xl font-bold text-primary">
                            {discoveryRateData.length > 0 ? 
                              discoveryRateData[discoveryRateData.length - 1]?.newSpeciesCount || 'N/A'
                              : 'N/A'}
                          </div>
                          <p className="text-xs text-slate-600 mt-1">
                            Species per 1000 recent observations
                          </p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Remaining Species</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-xl font-bold text-primary">
                            {extrapolationData.estimatedTotal && accumulationData.length > 0 ? 
                              (extrapolationData.estimatedTotal - accumulationData[accumulationData.length - 1]?.uniqueSpeciesCount).toLocaleString()
                              : 'N/A'}
                          </div>
                          <p className="text-xs text-slate-600 mt-1">
                            Undiscovered species estimate
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Model Comparison</CardTitle>
                        <p className="text-sm text-slate-600">Compare different extrapolation models</p>
                      </CardHeader>
                      <CardContent>
                        <Tabs value={selectedModel} onValueChange={setSelectedModel}>
                          <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="power-law">Power Law</TabsTrigger>
                            <TabsTrigger value="michaelis-menten">Michaelis-Menten</TabsTrigger>
                            <TabsTrigger value="weibull">Weibull</TabsTrigger>
                            <TabsTrigger value="chapman-richards">Chapman-Richards</TabsTrigger>
                          </TabsList>
                          <TabsContent value="power-law" className="mt-4">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div className="text-center p-3 bg-muted/50 rounded-lg">
                                <div className="text-lg font-bold text-primary">{modelCalculations.powerLaw.estimatedTotal?.toLocaleString()}</div>
                                <p className="text-xs text-slate-600">Estimated Total</p>
                              </div>
                              <div className="text-center p-3 bg-muted/50 rounded-lg">
                                <div className="text-lg font-bold text-primary">{modelCalculations.powerLaw.observationsFor95?.toLocaleString()}</div>
                                <p className="text-xs text-slate-600">Obs for 95%</p>
                              </div>
                              <div className="text-center p-3 bg-muted/50 rounded-lg">
                                <div className="text-lg font-bold text-primary">{modelCalculations.powerLaw.rSquared ? (modelCalculations.powerLaw.rSquared * 100).toFixed(1) + '%' : 'N/A'}</div>
                                <p className="text-xs text-slate-600">Model Fit (R²)</p>
                              </div>
                              <div className="text-center p-3 bg-muted/50 rounded-lg">
                                <div className="text-lg font-bold text-primary">S = a×N^b</div>
                                <p className="text-xs text-slate-600">Model Formula</p>
                              </div>
                            </div>
                            <p className="text-sm text-slate-600 mt-2">Power law model uses last 30% of data and data-driven projection parameters</p>
                          </TabsContent>
                          <TabsContent value="michaelis-menten" className="mt-4">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div className="text-center p-3 bg-muted/50 rounded-lg">
                                <div className="text-lg font-bold text-primary">{modelCalculations.michaelisMenten.estimatedTotal?.toLocaleString()}</div>
                                <p className="text-xs text-slate-600">Estimated Total</p>
                              </div>
                              <div className="text-center p-3 bg-muted/50 rounded-lg">
                                <div className="text-lg font-bold text-primary">{modelCalculations.michaelisMenten.observationsFor95?.toLocaleString()}</div>
                                <p className="text-xs text-slate-600">Obs for 95%</p>
                              </div>
                              <div className="text-center p-3 bg-muted/50 rounded-lg">
                                <div className="text-lg font-bold text-primary">{modelCalculations.michaelisMenten.rSquared ? (modelCalculations.michaelisMenten.rSquared * 100).toFixed(1) + '%' : 'N/A'}</div>
                                <p className="text-xs text-slate-600">Model Fit (R²)</p>
                              </div>
                              <div className="text-center p-3 bg-muted/50 rounded-lg">
                                <div className="text-lg font-bold text-primary">S = (a×N)/(b+N)</div>
                                <p className="text-xs text-slate-600">Model Formula</p>
                              </div>
                            </div>
                            <p className="text-sm text-slate-600 mt-2">Michaelis-Menten model - classic for species accumulation curves</p>
                          </TabsContent>
                          <TabsContent value="weibull" className="mt-4">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div className="text-center p-3 bg-muted/50 rounded-lg">
                                <div className="text-lg font-bold text-primary">{modelCalculations.weibull.estimatedTotal?.toLocaleString()}</div>
                                <p className="text-xs text-slate-600">Estimated Total</p>
                              </div>
                              <div className="text-center p-3 bg-muted/50 rounded-lg">
                                <div className="text-lg font-bold text-primary">{modelCalculations.weibull.observationsFor95?.toLocaleString()}</div>
                                <p className="text-xs text-slate-600">Obs for 95%</p>
                              </div>
                              <div className="text-center p-3 bg-muted/50 rounded-lg">
                                <div className="text-lg font-bold text-primary">{modelCalculations.weibull.rSquared ? (modelCalculations.weibull.rSquared * 100).toFixed(1) + '%' : 'N/A'}</div>
                                <p className="text-xs text-slate-600">Model Fit (R²)</p>
                              </div>
                              <div className="text-center p-3 bg-muted/50 rounded-lg">
                                <div className="text-lg font-bold text-primary">S = a×(1-e^(-(N/b)^c))</div>
                                <p className="text-xs text-slate-600">Model Formula</p>
                              </div>
                            </div>
                            <p className="text-sm text-slate-600 mt-2">Weibull model with flexible shape parameter for varied growth patterns</p>
                          </TabsContent>
                          <TabsContent value="chapman-richards" className="mt-4">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div className="text-center p-3 bg-muted/50 rounded-lg">
                                <div className="text-lg font-bold text-primary">{modelCalculations.chapman.estimatedTotal?.toLocaleString()}</div>
                                <p className="text-xs text-slate-600">Estimated Total</p>
                              </div>
                              <div className="text-center p-3 bg-muted/50 rounded-lg">
                                <div className="text-lg font-bold text-primary">{modelCalculations.chapman.observationsFor95?.toLocaleString()}</div>
                                <p className="text-xs text-slate-600">Obs for 95%</p>
                              </div>
                              <div className="text-center p-3 bg-muted/50 rounded-lg">
                                <div className="text-lg font-bold text-primary">{modelCalculations.chapman.rSquared ? (modelCalculations.chapman.rSquared * 100).toFixed(1) + '%' : 'N/A'}</div>
                                <p className="text-xs text-slate-600">Model Fit (R²)</p>
                              </div>
                              <div className="text-center p-3 bg-muted/50 rounded-lg">
                                <div className="text-lg font-bold text-primary">S = a×(1-e^(-b×N))^c</div>
                                <p className="text-xs text-slate-600">Model Formula</p>
                              </div>
                            </div>
                            <p className="text-sm text-slate-600 mt-2">Chapman-Richards model with flexible approach to asymptote</p>
                          </TabsContent>
                        </Tabs>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center">
                <div className="text-slate-500">No data available for accumulation curve</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}