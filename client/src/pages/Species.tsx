import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Search, Calendar, MapPin, TrendingUp, Eye, Clock, Award } from "lucide-react";

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

  // Fetch all species data
  const { data: allSpecies = [], isLoading: speciesLoading } = useQuery({
    queryKey: ["/api/species", { limit: 10000 }],
    queryFn: async () => {
      const response = await fetch('/api/species?limit=10000');
      if (!response.ok) throw new Error('Failed to fetch species');
      return response.json();
    }
  });

  // Fetch observations for filtering
  const { data: observations = [] } = useQuery({
    queryKey: ["/api/observations"],
    queryFn: async () => {
      const response = await fetch('/api/observations');
      if (!response.ok) throw new Error('Failed to fetch observations');
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
          .map((obs: any) => obs.scientificName)
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
    const commonSpecies = filteredSpecies.filter(s => (s.observationCount || 0) > 100).length;
    const rareSpecies = filteredSpecies.filter(s => (s.observationCount || 0) <= 3).length;
    const recentSpecies = filteredSpecies.filter(s => {
      if (!s.lastObserved) return false;
      const lastYear = new Date();
      lastYear.setFullYear(lastYear.getFullYear() - 1);
      return new Date(s.lastObserved) >= lastYear;
    }).length;

    return { totalSpecies, commonSpecies, rareSpecies, recentSpecies };
  }, [filteredSpecies]);

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
                <Award className="w-4 h-4" />
                Common Species
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.commonSpecies}</div>
              <p className="text-sm text-slate-600 mt-1">
                Over 100 observations each
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Rare Species
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600">{stats.rareSpecies}</div>
              <p className="text-sm text-slate-600 mt-1">
                3 or fewer observations
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
                Observed in last year
              </p>
            </CardContent>
          </Card>
        </div>

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
                  <div key={species.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-lg hover:bg-slate-50">
                    <div className="flex-1">
                      <h3 className="font-medium text-slate-900 italic">{species.scientificName}</h3>
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
                        (species.observationCount || 0) > 100 ? "default" :
                        (species.observationCount || 0) > 10 ? "secondary" : "outline"
                      }>
                        {species.observationCount || 0} obs
                      </Badge>
                    </div>
                  </div>
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
      </div>
    </div>
  );
}