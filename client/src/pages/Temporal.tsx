import { useState, useCallback, useMemo } from "react";
import { TemporalChart } from "@/components/dashboard/TemporalChart";
import { GlobalFirstsByYear } from "@/components/dashboard/GlobalFirstsByYear";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { useQuery } from "@tanstack/react-query";
import { Search, MapPin, Calendar, Filter, ChevronDown, ChevronUp } from "lucide-react";

export default function Temporal() {
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

  // Fetch unique states for filter
  const { data: states = [] } = useQuery<string[]>({
    queryKey: ["/api/states"],
    queryFn: async () => {
      const response = await fetch('/api/states');
      if (!response.ok) throw new Error('Failed to fetch states');
      return response.json();
    }
  });

  // Fetch unique collectors for autocomplete
  const { data: collectors = [], isLoading: collectorsLoading } = useQuery<string[]>({
    queryKey: ["/api/collectors", collectorQuery],
    queryFn: async () => {
      const response = await fetch(`/api/collectors?search=${encodeURIComponent(collectorQuery)}`);
      if (!response.ok) throw new Error('Failed to fetch collectors');
      return response.json();
    },
    enabled: collectorQuery.length >= 2 // Only search when user types at least 2 characters
  });

  // Debounced search handler for collector autocomplete
  const handleCollectorSearch = useCallback((query: string) => {
    setCollectorQuery(query);
  }, []);

  const hasActiveFilters = searchTerm || collectorSearch || selectedState || startDate || endDate || goingBackYears !== "0";

  // Build query parameters for filtering
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (selectedState) params.set('state', selectedState);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (goingBackYears !== "0") params.set('goingBackYears', goingBackYears);
    if (collectorSearch) params.set('collector', collectorSearch);
    return params.toString();
  };

  const { data: seasonalData = [], isLoading: seasonalLoading } = useQuery({
    queryKey: ["/api/seasonal-patterns", selectedState, startDate, endDate, goingBackYears, collectorSearch],
    queryFn: async () => {
      const queryParams = buildQueryParams();
      const url = `/api/seasonal-patterns${queryParams ? `?${queryParams}` : ''}`;
      console.log('Seasonal patterns query:', { collectorSearch, url, queryParams });
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch seasonal patterns');
      const data = await response.json();
      console.log('Seasonal patterns response:', data);
      return data;
    }
  });

  // Calculate total observations from current data
  const totalObservations = useMemo(() => {
    return seasonalData.reduce((sum: number, item: any) => sum + item.count, 0);
  }, [seasonalData]);

  const { data: monthlyData = [], isLoading: monthlyLoading } = useQuery({
    queryKey: ["/api/monthly-statistics", selectedState, startDate, endDate, goingBackYears, collectorSearch],
    queryFn: async () => {
      const queryParams = buildQueryParams();
      const url = `/api/monthly-statistics${queryParams ? `?${queryParams}` : ''}`;
      console.log('Monthly statistics query:', { collectorSearch, url, queryParams });
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch monthly statistics');
      const data = await response.json();
      console.log('Monthly statistics response:', data);
      return data;
    }
  });

  const { data: yearlyData = [], isLoading: yearlyLoading } = useQuery({
    queryKey: ["/api/temporal-trends", { groupBy: 'year' }, selectedState, startDate, endDate, goingBackYears, collectorSearch],
    queryFn: async () => {
      const queryParams = buildQueryParams();
      const url = `/api/temporal-trends?groupBy=year${queryParams ? `&${queryParams}` : ''}`;
      console.log('Temporal trends query:', { collectorSearch, url, queryParams });
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch yearly trends');
      const data = await response.json();
      console.log('Temporal trends response:', data);
      return data;
    }
  });

  // Calculate year-over-year growth rates from yearly data
  const growthRates = yearlyData.length > 1 ? (() => {
    // Group by year and sum counts
    const yearlyTotals = yearlyData.reduce((acc: any, item: any) => {
      const year = item.period.split('-')[0]; // Extract year from "YYYY-MM" format
      acc[year] = (acc[year] || 0) + item.count;
      return acc;
    }, {});
    
    const sortedYears = Object.entries(yearlyTotals)
      .map(([year, count]: [string, any]) => ({ year: parseInt(year), count }))
      .sort((a, b) => a.year - b.year);
    
    const rates = [];
    
    for (let i = 1; i < sortedYears.length; i++) {
      const curr = sortedYears[i];
      const prev = sortedYears[i - 1];
      
      if (prev.count > 0) {
        const rate = ((curr.count - prev.count) / prev.count * 100);
        rates.push({ 
          year: curr.year.toString(), 
          rate: Number(rate.toFixed(1)),
          count: curr.count,
          prevCount: prev.count
        });
      }
    }
    
    return rates.slice(-5); // Show last 5 years of growth
  })() : [];

  return (
    <div className="flex flex-col h-full">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Temporal Trends</h2>
          <p className="text-slate-600 mt-1">
            Time-based analysis of observation patterns
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
                    {hasActiveFilters && (
                      <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        {totalObservations > 0 ? `${totalObservations.toLocaleString()} observations` : 'No results'}
                      </span>
                    )}
                  </div>
                  {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              
              <CollapsibleContent className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column - Search and Location */}
                  <div className="space-y-4">
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
                          <SelectValue placeholder="All Regions" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Regions</SelectItem>
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
                        onChange={setCollectorSearch}
                        placeholder="Type collector name..."
                        suggestions={collectors}
                        onSearch={handleCollectorSearch}
                        loading={collectorsLoading}
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
                
                {hasActiveFilters && (
                  <div className="mt-4 pt-4 border-t text-sm text-slate-600">
                    Showing {searchTerm && `"${searchTerm}" species`}{searchTerm && (selectedState || startDate || endDate || goingBackYears !== "0") && ", "}
                    {selectedState && `from ${selectedState}`}{selectedState && (startDate || endDate || goingBackYears !== "0") && ", "}
                    {startDate && endDate && `from ${startDate} to ${endDate}`}
                    {goingBackYears !== "0" && `, going back ${goingBackYears} years`}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <TemporalChart />
          
          <Card>
            <CardHeader>
              <CardTitle>Monthly Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80 flex items-center justify-center">
                {monthlyLoading ? (
                  <div className="text-slate-500">Loading monthly data...</div>
                ) : (
                  <div className="relative w-80 h-80">
                    <svg width="320" height="320" className="transform -rotate-90">
                      {(() => {
                        const total = monthlyData.reduce((sum: number, month: any) => sum + month.count, 0);
                        let currentAngle = 0;
                        const colors = [
                          '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
                          '#8B5CF6', '#06B6D4', '#84CC16', '#F97316',
                          '#EC4899', '#6366F1', '#14B8A6', '#F43F5E'
                        ];
                        
                        return monthlyData.slice(0, 12).map((month: any, index: number) => {
                          const angle = (month.count / total) * 360;
                          const startAngle = currentAngle;
                          const endAngle = currentAngle + angle;
                          const midAngle = startAngle + angle / 2;
                          currentAngle += angle;
                          
                          const x1 = 160 + 120 * Math.cos((startAngle * Math.PI) / 180);
                          const y1 = 160 + 120 * Math.sin((startAngle * Math.PI) / 180);
                          const x2 = 160 + 120 * Math.cos((endAngle * Math.PI) / 180);
                          const y2 = 160 + 120 * Math.sin((endAngle * Math.PI) / 180);
                          
                          // Label position
                          const labelX = 160 + 80 * Math.cos((midAngle * Math.PI) / 180);
                          const labelY = 160 + 80 * Math.sin((midAngle * Math.PI) / 180);
                          
                          const largeArcFlag = angle > 180 ? 1 : 0;
                          const monthName = month.month.trim().substring(0, 3);
                          
                          return (
                            <g key={month.month}>
                              <path
                                d={`M 160 160 L ${x1} ${y1} A 120 120 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                                fill={colors[index % colors.length]}
                                stroke="white"
                                strokeWidth="2"
                                className="hover:opacity-80 transition-opacity cursor-pointer"
                              >
                                <title>{`${month.month.trim()}: ${month.count.toLocaleString()} observations`}</title>
                              </path>
                              <text
                                x={labelX}
                                y={labelY}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className="fill-white text-xs font-medium pointer-events-none transform rotate-90"
                                style={{ transformOrigin: `${labelX}px ${labelY}px` }}
                              >
                                {monthName}
                              </text>
                            </g>
                          );
                        });
                      })()}
                    </svg>
                  </div>
                )}
              </div>

            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Peak Season</CardTitle>
            </CardHeader>
            <CardContent>
              {seasonalLoading ? (
                <div className="text-slate-500 text-sm">Loading...</div>
              ) : (
                <div className="space-y-2 text-sm">
                  {seasonalData.slice(0, 4).map((season: any) => (
                    <div key={season.season} className="flex justify-between">
                      <span>{season.season}</span>
                      <span className="font-medium">{season.percentage}%</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Trends</CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyLoading ? (
                <div className="text-slate-500 text-sm">Loading...</div>
              ) : (
                <div className="space-y-2 text-sm">
                  {monthlyData.slice(0, 3).map((month: any) => (
                    <div key={month.month} className="flex justify-between">
                      <span>{month.month}</span>
                      <span className="font-medium">{month.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Growth Rate</CardTitle>
            </CardHeader>
            <CardContent>
              {yearlyLoading ? (
                <div className="text-slate-500 text-sm">Loading...</div>
              ) : growthRates.length > 0 ? (
                <div className="space-y-2 text-sm">
                  {growthRates.map((item: any) => (
                    <div key={item.year} className="flex justify-between">
                      <span>{item.year}</span>
                      <span className={`font-medium ${item.rate > 0 ? 'text-green-600' : item.rate < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                        {item.rate > 0 ? '+' : ''}{item.rate}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-slate-500 text-sm">
                  Insufficient data for growth calculation
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {yearlyLoading ? (
                <div className="text-slate-500 text-sm">Loading...</div>
              ) : (
                <div className="space-y-2 text-sm">
                  {yearlyData.slice(-3).map((year: any) => (
                    <div key={year.period} className="flex justify-between">
                      <span>{year.period}</span>
                      <span className="font-medium">{year.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Global First Records by Year Chart */}
        <div className="mb-6">
          <GlobalFirstsByYear dateRange={dateRange} selectedState={selectedState} />
        </div>
      </div>
    </div>
  );
}
