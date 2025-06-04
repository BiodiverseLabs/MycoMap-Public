import { useState, useCallback, useMemo } from "react";
import { TaxonomicChart } from "@/components/dashboard/TaxonomicChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ExternalLink, Search, MapPin, Calendar, Filter, ChevronDown, ChevronUp } from "lucide-react";

export default function Taxonomic() {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [collectorSearch, setCollectorSearch] = useState("");
  const [collectorQuery, setCollectorQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [goingBackYears, setGoingBackYears] = useState("0");
  const [filtersOpen, setFiltersOpen] = useState(false);
  
  // Convert to legacy dateRange for existing components
  const dateRange = startDate && endDate ? `${startDate}_to_${endDate}` : "all_time";

  // Fetch unique states for dropdown
  const { data: states = [] } = useQuery<string[]>({
    queryKey: ["/api/states"],
    queryFn: async () => {
      const response = await fetch('/api/states');
      if (!response.ok) throw new Error('Failed to fetch states');
      return response.json();
    }
  });

  // Fetch contributors for autocomplete
  const { data: contributors = [] } = useQuery({
    queryKey: ["/api/contributors", { limit: 10000 }],
    queryFn: async () => {
      const response = await fetch('/api/contributors?limit=10000');
      if (!response.ok) throw new Error('Failed to fetch contributors');
      return response.json();
    }
  });

  // Filtered contributors for autocomplete
  const filteredContributors = useMemo(() => {
    return contributors.filter((contributor: any) => 
      contributor.name.toLowerCase().includes(collectorSearch.toLowerCase())
    ).slice(0, 20);
  }, [contributors, collectorSearch]);

  const handleContributorSelect = (value: string) => {
    setCollectorQuery(value);
    setCollectorSearch(value);
  };

  const handleContributorSearch = (query: string) => {
    setCollectorSearch(query);
    if (query.length === 0) {
      setCollectorQuery("");
    }
  };

  const handleSuggestionSelect = (suggestion: string) => {
    setCollectorSearch(suggestion);
    setCollectorQuery(suggestion);
  };

  const handleStateSelect = (state: string) => {
    setSelectedState(state === "all" ? null : state);
  };

  const clearDateFilters = () => {
    setStartDate("");
    setEndDate("");
    setGoingBackYears("0");
  };

  const clearAllFilters = () => {
    setSelectedState(null);
    setStartDate("");
    setEndDate("");
    setGoingBackYears("0");
    setCollectorQuery("");
    setCollectorSearch("");
  };

  // Create query parameters for API calls
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedState) params.append('state', selectedState);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (goingBackYears && goingBackYears !== '0') params.append('goingBackYears', goingBackYears);
    if (collectorQuery) params.append('collector', collectorQuery);
    return params;
  }, [selectedState, startDate, endDate, goingBackYears, collectorQuery]);

  // Fetch family distribution data
  const { data: familyData = [], isLoading: familyLoading } = useQuery({
    queryKey: ["/api/family-distribution", selectedState, startDate, endDate, goingBackYears, collectorQuery],
    queryFn: async () => {
      const response = await fetch(`/api/family-distribution?${queryParams.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch family distribution');
      return response.json();
    }
  });

  // Fetch phylum distribution data
  const { data: phylumData = [], isLoading: phylumLoading } = useQuery({
    queryKey: ["/api/taxonomic-distribution", selectedState, startDate, endDate, goingBackYears, collectorQuery],
    queryFn: async () => {
      const response = await fetch(`/api/taxonomic-distribution?${queryParams.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch phylum distribution');
      return response.json();
    }
  });

  // Fetch class distribution data
  const { data: classData = [], isLoading: classLoading } = useQuery({
    queryKey: ["/api/class-distribution", selectedState, startDate, endDate, goingBackYears, collectorQuery],
    queryFn: async () => {
      const response = await fetch(`/api/class-distribution?${queryParams.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch class distribution');
      return response.json();
    }
  });

  // Fetch order distribution data
  const { data: orderData = [], isLoading: orderLoading } = useQuery({
    queryKey: ["/api/order-distribution", selectedState, startDate, endDate, goingBackYears, collectorQuery],
    queryFn: async () => {
      const response = await fetch(`/api/order-distribution?${queryParams.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch order distribution');
      return response.json();
    }
  });

  // Fetch genus distribution data
  const { data: genusData = [], isLoading: genusLoading } = useQuery({
    queryKey: ["/api/genus-distribution", selectedState, startDate, endDate, goingBackYears, collectorQuery],
    queryFn: async () => {
      const response = await fetch(`/api/genus-distribution?${queryParams.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch genus distribution');
      return response.json();
    }
  });

  const getProgressWidth = (count: number, maxCount: number) => {
    return Math.round((count / maxCount) * 100);
  };

  const maxFamilyCount = familyData.length > 0 ? familyData[0].count : 1;

  return (
    <div className="flex flex-col h-full">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Taxonomic Analysis</h2>
          <p className="text-slate-600 mt-1">
            Distribution across taxonomic hierarchies
          </p>
        </div>
      </header>

      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
        <Card>
          <CardContent className="p-4">
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    <span>Filters</span>
                  </div>
                  {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              
              <CollapsibleContent className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column - Search and Location */}
                  <div className="space-y-4">
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                      <Select value={selectedState || "all"} onValueChange={handleStateSelect}>
                        <SelectTrigger className="pl-10">
                          <SelectValue placeholder="All States" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All States</SelectItem>
                          {states.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Search by Collector</Label>
                      <AutocompleteInput
                        value={collectorSearch}
                        onChange={handleContributorSearch}
                        placeholder="Type collector name..."
                        suggestions={filteredContributors.map((contributor: any) => contributor.name)}
                        onSearch={handleContributorSearch}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Right Column - Date Controls */}
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Calendar className="h-4 w-4 text-slate-500" />
                        <Label className="text-sm font-medium">Dates</Label>
                      </div>
                      
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Date Range</Label>
                        <div className="flex items-center gap-2 text-sm">
                          <span>Between</span>
                          <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="flex-1"
                          />
                          <span>and</span>
                          <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="flex-1"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Going Back</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          value={goingBackYears}
                          onChange={(e) => setGoingBackYears(e.target.value)}
                          className="w-20"
                        />
                        <span className="text-sm text-slate-600">years</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t flex gap-2">
                  <Button variant="outline" size="sm" onClick={clearDateFilters}>
                    Clear Dates
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearAllFilters}>
                    Clear All
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <TaxonomicChart 
            selectedState={selectedState}
            startDate={startDate}
            endDate={endDate}
            goingBackYears={goingBackYears}
            collectorQuery={collectorQuery}
          />
          
          <Card>
            <CardHeader>
              <CardTitle>Family Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {familyLoading ? (
                <div className="text-slate-500">Loading family data...</div>
              ) : (
                <div className="space-y-3">
                  {familyData.slice(0, 10).map((family: any, index: number) => (
                    <div key={family.family} className="flex items-center justify-between">
                      <span className="text-sm text-slate-600 truncate flex-1">{family.family}</span>
                      <div className="flex items-center space-x-2 ml-2">
                        <div className="w-16 bg-slate-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${
                              index === 0 ? 'bg-primary' : 
                              index === 1 ? 'bg-green-500' : 
                              index === 2 ? 'bg-yellow-500' : 
                              index === 3 ? 'bg-purple-500' : 
                              index === 4 ? 'bg-blue-500' :
                              index === 5 ? 'bg-pink-500' :
                              index === 6 ? 'bg-indigo-500' :
                              index === 7 ? 'bg-orange-500' :
                              index === 8 ? 'bg-teal-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${getProgressWidth(family.count, maxFamilyCount)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-12 text-right">{family.count.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                  <div className="pt-3 mt-3 border-t">
                    <Link href="/taxonomic/family">
                      <div className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 cursor-pointer">
                        <span>See all records</span>
                        <ExternalLink className="h-4 w-4" />
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Phylum Stats</CardTitle>
            </CardHeader>
            <CardContent>
              {phylumLoading ? (
                <div className="text-slate-500 text-sm">Loading...</div>
              ) : (
                <div className="space-y-2 text-sm">
                  {phylumData.slice(0, 3).map((phylum: any) => (
                    <div key={phylum.phylum} className="flex justify-between">
                      <span className="truncate">{phylum.phylum}</span>
                      <span className="font-medium">{phylum.count.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t">
                    <Link href="/taxonomic/phylum">
                      <div className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 cursor-pointer">
                        <span>See all records</span>
                        <ExternalLink className="h-3 w-3" />
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Class Diversity</CardTitle>
            </CardHeader>
            <CardContent>
              {classLoading ? (
                <div className="text-slate-500 text-sm">Loading...</div>
              ) : (
                <div className="space-y-2 text-sm">
                  {classData.slice(0, 3).map((classItem: any) => (
                    <div key={classItem.class} className="flex justify-between">
                      <span className="truncate">{classItem.class}</span>
                      <span className="font-medium">{classItem.count.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t">
                    <Link href="/taxonomic/class">
                      <div className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 cursor-pointer">
                        <span>See all records</span>
                        <ExternalLink className="h-3 w-3" />
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              {orderLoading ? (
                <div className="text-slate-500 text-sm">Loading...</div>
              ) : (
                <div className="space-y-2 text-sm">
                  {orderData.slice(0, 3).map((order: any) => (
                    <div key={order.order} className="flex justify-between">
                      <span className="truncate">{order.order}</span>
                      <span className="font-medium">{order.count.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t">
                    <Link href="/taxonomic/order">
                      <div className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 cursor-pointer">
                        <span>See all records</span>
                        <ExternalLink className="h-3 w-3" />
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Genus Stats</CardTitle>
            </CardHeader>
            <CardContent>
              {genusLoading ? (
                <div className="text-slate-500 text-sm">Loading...</div>
              ) : (
                <div className="space-y-2 text-sm">
                  {genusData.slice(0, 3).map((genus: any) => (
                    <div key={genus.genus} className="flex justify-between">
                      <span className="truncate">{genus.genus}</span>
                      <span className="font-medium">{genus.count.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t">
                    <Link href="/taxonomic/genus">
                      <div className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 cursor-pointer">
                        <span>See all records</span>
                        <ExternalLink className="h-3 w-3" />
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
