import { TemporalChart } from "@/components/dashboard/TemporalChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";

export default function Temporal() {
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
    const sortedYears = [...yearlyData].sort((a: any, b: any) => parseInt(a.period) - parseInt(b.period));
    const rates = [];
    
    for (let i = 1; i < sortedYears.length; i++) {
      const curr = sortedYears[i];
      const prev = sortedYears[i - 1];
      
      if (prev.count > 0) {
        const rate = ((curr.count - prev.count) / prev.count * 100);
        rates.push({ 
          year: curr.period, 
          rate: Number(rate.toFixed(1)),
          count: curr.count,
          prevCount: prev.count
        });
      }
    }
    
    return rates.slice(-3); // Show last 3 years of growth
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
                  <div className="relative w-64 h-64">
                    <svg width="256" height="256" className="transform -rotate-90">
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
                          currentAngle += angle;
                          
                          const x1 = 128 + 100 * Math.cos((startAngle * Math.PI) / 180);
                          const y1 = 128 + 100 * Math.sin((startAngle * Math.PI) / 180);
                          const x2 = 128 + 100 * Math.cos((endAngle * Math.PI) / 180);
                          const y2 = 128 + 100 * Math.sin((endAngle * Math.PI) / 180);
                          
                          const largeArcFlag = angle > 180 ? 1 : 0;
                          
                          return (
                            <path
                              key={month.month}
                              d={`M 128 128 L ${x1} ${y1} A 100 100 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                              fill={colors[index % colors.length]}
                              stroke="white"
                              strokeWidth="2"
                              className="hover:opacity-80 transition-opacity"
                            />
                          );
                        });
                      })()}
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">
                          {monthlyData.reduce((sum: number, month: any) => sum + month.count, 0).toLocaleString()}
                        </div>
                        <div className="text-sm text-gray-600">Total</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {!monthlyLoading && monthlyData.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  {monthlyData.slice(0, 12).map((month: any, index: number) => {
                    const colors = [
                      '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
                      '#8B5CF6', '#06B6D4', '#84CC16', '#F97316',
                      '#EC4899', '#6366F1', '#14B8A6', '#F43F5E'
                    ];
                    return (
                      <div key={month.month} className="flex items-center space-x-1">
                        <div 
                          className="w-3 h-3 rounded-sm" 
                          style={{ backgroundColor: colors[index % colors.length] }}
                        />
                        <span className="truncate">{month.month.trim()}</span>
                      </div>
                    );
                  })}
                </div>
              )}
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
