import { useState } from "react";
import { TemporalChart } from "@/components/dashboard/TemporalChart";
import { GlobalFirstsByYear } from "@/components/dashboard/GlobalFirstsByYear";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { Search, MapPin, Calendar } from "lucide-react";

export default function Temporal() {
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

  const hasActiveFilters = searchTerm || selectedState || dateRange !== "all_time";

  const { data: seasonalData = [], isLoading: seasonalLoading } = useQuery({
    queryKey: ["/api/seasonal-patterns"],
    queryFn: async () => {
      const response = await fetch('/api/seasonal-patterns');
      if (!response.ok) throw new Error('Failed to fetch seasonal patterns');
      return response.json();
    }
  });

  const { data: monthlyData = [], isLoading: monthlyLoading } = useQuery({
    queryKey: ["/api/monthly-statistics"],
    queryFn: async () => {
      const response = await fetch('/api/monthly-statistics');
      if (!response.ok) throw new Error('Failed to fetch monthly statistics');
      return response.json();
    }
  });

  const { data: yearlyData = [], isLoading: yearlyLoading } = useQuery({
    queryKey: ["/api/temporal-trends", { groupBy: 'year' }],
    queryFn: async () => {
      const response = await fetch('/api/temporal-trends?groupBy=year');
      if (!response.ok) throw new Error('Failed to fetch yearly trends');
      return response.json();
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <TemporalChart />
          <GlobalFirstsByYear dateRange={dateRange} selectedState={selectedState} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
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
      </div>
    </div>
  );
}
