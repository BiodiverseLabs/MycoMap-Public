import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GeospatialMap } from "@/components/dashboard/GeospatialMap";
import { StateRecords } from "@/components/dashboard/StateRecords";
import { TopContributors } from "@/components/dashboard/TopContributors";
import { SpeciesFrequency } from "@/components/dashboard/SpeciesFrequency";
import { RegionalAnalysis } from "@/components/dashboard/RegionalAnalysis";
import { MostRecords } from "@/components/dashboard/MostRecords";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Calendar, X, Target } from "lucide-react";
import { Link } from "wouter";

export default function Geospatial() {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState("all_time");

  // Fetch unique states for filter
  const { data: states = [] } = useQuery<string[]>({
    queryKey: ["/api/states"],
    queryFn: async () => {
      const response = await fetch('/api/states');
      if (!response.ok) throw new Error('Failed to fetch states');
      return response.json();
    }
  });

  const handleStateSelect = (state: string) => {
    setSelectedState(state);
  };

  const clearStateFilter = () => {
    setSelectedState(null);
  };

  const hasActiveFilters = searchTerm || selectedState || dateRange !== "all_time";

  return (
    <div className="flex flex-col h-full">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Geospatial Analysis</h2>
            <p className="text-slate-600 mt-1">
              Geographic distribution and biodiversity hotspots
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Link href="/geospatial/top-prospects">
              <Button variant="outline" size="sm">
                <Target className="w-4 h-4 mr-2" />
                Top Prospects
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-slate-500" />
              <CardTitle className="text-lg">Species Search & Filters</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by species name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                <Select value={selectedState || "all"} onValueChange={(value) => setSelectedState(value === "all" ? null : value)}>
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
              
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger className="pl-10">
                    <SelectValue placeholder="All Time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_time">All Time</SelectItem>
                    <SelectItem value="last_year">Last Year</SelectItem>
                    <SelectItem value="last_3_years">Last 3 Years</SelectItem>
                    <SelectItem value="last_5_years">Last 5 Years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {hasActiveFilters && (
              <div className="mt-3 text-sm text-slate-600">
                Showing {searchTerm && `"${searchTerm}" species`}{searchTerm && (selectedState || dateRange !== "all_time") && ", "}
                {selectedState && `from ${selectedState}`}{selectedState && dateRange !== "all_time" && ", "}
                {dateRange !== "all_time" && `${dateRange.replace("_", " ")}`}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-8">
          <GeospatialMap onStateSelect={handleStateSelect} selectedState={selectedState} />
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <SpeciesFrequency selectedState={selectedState} />
            <RegionalAnalysis selectedState={selectedState} />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <StateRecords selectedState={selectedState} />
            <TopContributors selectedState={selectedState} />
          </div>
        </div>
      </div>
    </div>
  );
}
