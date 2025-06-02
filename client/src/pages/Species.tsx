import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [dateFilter, setDateFilter] = useState<string>("all_time");
  const [extrapolate, setExtrapolate] = useState(false);

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
    }
  });

  // Fetch observations for filtering
  const { data: observations = [] } = useQuery({
    queryKey: ["/api/observations", selectedState],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedState && selectedState !== 'all') {
        params.append('state', selectedState);
      }
      const response = await fetch(`/api/observations?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch observations');
      return response.json();
    }
  });

  // Fetch species accumulation curve data
  const { data: accumulationData = [], isLoading: accumulationLoading } = useQuery({
    queryKey: ["/api/species-accumulation", selectedState],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedState && selectedState !== 'all') {
        params.append('state', selectedState);
      }
      const response = await fetch(`/api/species-accumulation?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch accumulation data');
      return response.json();
    }
  });

  // Get unique states for filter
  const states = useMemo(() => {
    const stateSet = new Set(observations.map((obs: any) => obs.state).filter(Boolean));
    return Array.from(stateSet).sort();
  }, [observations]);

  // Filter species based on search and filters
  const filteredSpecies = useMemo(() => {
    let filtered = allSpecies;

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter((species: Species) =>
        species.scientificName.toLowerCase().includes(searchLower) ||
        (species.commonName && species.commonName.toLowerCase().includes(searchLower))
      );
    }

    // State filter
    if (selectedState !== "all") {
      const stateSpeciesIds = new Set(
        observations
          .filter((obs: any) => obs.state === selectedState)
          .map((obs: any) => obs.species || obs.scientificName)
      );
      filtered = filtered.filter((species: Species) => stateSpeciesIds.has(species.scientificName));
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

      const recentSpeciesIds = new Set(
        observations
          .filter((obs: any) => obs.observedOn && new Date(obs.observedOn) >= cutoffDate)
          .map((obs: any) => obs.scientificName)
      );
      filtered = filtered.filter((species: Species) => recentSpeciesIds.has(species.scientificName));
    }

    return filtered.sort((a, b) => (b.observationCount || 0) - (a.observationCount || 0));
  }, [allSpecies, searchTerm, selectedState, dateFilter, observations]);

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

  // Calculate extrapolation data and estimates
  const extrapolationData = useMemo(() => {
    if (!extrapolate || accumulationData.length < 10) {
      return { 
        extendedData: accumulationData, 
        estimatedTotal: null, 
        observationsFor95: null 
      };
    }

    // Use power law model: S = a * N^b which transforms to log(S) = log(a) + b*log(N)
    // This is more appropriate for species accumulation curves and avoids negative values
    const n = accumulationData.length;
    const lastPoint = accumulationData[n - 1];
    
    // Take last 50% of data for fitting to get stable portion of curve
    const fitStart = Math.floor(n * 0.5);
    const fitData = accumulationData.slice(fitStart).filter(point => 
      point.uniqueSpeciesCount > 0 && point.observationNumber > 0
    );
    
    // Calculate power law regression: log(S) = log(a) + b*log(N)
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
    
    // Estimate asymptotic maximum using current rate of change
    const currentSpecies = lastPoint.uniqueSpeciesCount;
    const currentObs = lastPoint.observationNumber;
    
    // Project to much larger observation count to estimate asymptote
    const futureObs = currentObs * 10;
    const projectedSpecies = a * Math.pow(futureObs, b);
    const estimatedTotal = Math.round(projectedSpecies * 1.2); // Add 20% buffer
    const observationsFor95 = Math.round(Math.pow((estimatedTotal * 0.95) / a, 1 / b));
    
    // Create full extrapolation line showing both fitted and projected portions
    const maxExtension = Math.max(currentObs * 2, observationsFor95 * 1.2);
    const extendedData = accumulationData.map(point => ({
      ...point,
      fittedSpecies: Math.round(a * Math.pow(point.observationNumber, b)), // Power law fit
      extrapolatedSpecies: null
    }));
    
    // Add extrapolated points beyond current observations
    for (let i = currentObs + 1000; i <= maxExtension; i += 1000) {
      const predictedSpecies = Math.round(a * Math.pow(i, b));
      extendedData.push({
        observationNumber: i,
        uniqueSpeciesCount: null,
        fittedSpecies: null,
        extrapolatedSpecies: Math.min(predictedSpecies, estimatedTotal)
      });
    }
    
    return { extendedData, estimatedTotal, observationsFor95 };
  }, [accumulationData, extrapolate]);

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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  {states.map((state) => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Date Filter */}
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger>
                  <Calendar className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Select time period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_time">All Time</SelectItem>
                  <SelectItem value="last_year">Last Year</SelectItem>
                  <SelectItem value="last_5_years">Last 5 Years</SelectItem>
                  <SelectItem value="recent">Since 2020</SelectItem>
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
              {dateFilter !== "all_time" && (
                <Badge variant="secondary">
                  Time: {dateFilter.replace("_", " ").toUpperCase()}
                </Badge>
              )}
              {(searchTerm || selectedState !== "all" || dateFilter !== "all_time") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedState("all");
                    setDateFilter("all_time");
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
                Species Accumulation Curve
                {selectedState !== "all" && (
                  <Badge variant="secondary">State: {selectedState}</Badge>
                )}
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="extrapolate"
                  checked={extrapolate}
                  onCheckedChange={(checked) => setExtrapolate(checked === true)}
                />
                <label htmlFor="extrapolate" className="text-sm font-medium">
                  Extrapolate
                </label>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {accumulationLoading ? (
              <div className="h-80 flex items-center justify-center">
                <div className="text-slate-500">Loading accumulation curve...</div>
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
                          value: 'Cumulative Species Count', 
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
                        name="Observed Species"
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
                          name="Projected Species"
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
                          <CardTitle className="text-base">Estimated Total Species (Smax)</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-primary">
                            {extrapolationData.estimatedTotal?.toLocaleString()}
                          </div>
                          <p className="text-sm text-slate-600 mt-1">
                            Asymptotic species richness estimate
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
                            Current species discovery rate
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
                            {accumulationData.length > 1000 ? 
                              ((accumulationData[accumulationData.length - 1]?.uniqueSpeciesCount - 
                                accumulationData[accumulationData.length - 1000]?.uniqueSpeciesCount) / 1000).toFixed(3)
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
                        <CardTitle className="text-sm">Model Performance</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                          <div>
                            <div className="text-lg font-bold text-primary">Power Law</div>
                            <p className="text-xs text-slate-600">Model Type</p>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-primary">
                              {accumulationData.length > 0 ? Math.floor(accumulationData.length * 0.5) : 0}
                            </div>
                            <p className="text-xs text-slate-600">Fit Data Points</p>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-primary">
                              {extrapolationData.observationsFor95 && accumulationData.length > 0 ? 
                                Math.round((extrapolationData.observationsFor95 / accumulationData[accumulationData.length - 1]?.observationNumber) * 100) / 100 + 'x'
                                : 'N/A'}
                            </div>
                            <p className="text-xs text-slate-600">Effort Multiplier</p>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-primary">
                              {accumulationData.length > 0 ? 
                                Math.floor(accumulationData.length * 0.5).toLocaleString() + '-' + accumulationData.length.toLocaleString()
                                : 'N/A'}
                            </div>
                            <p className="text-xs text-slate-600">Fitting Range</p>
                          </div>
                        </div>
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