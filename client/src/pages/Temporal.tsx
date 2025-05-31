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

  // Calculate growth rates from yearly data
  const growthRates = yearlyData.slice(-3).map((curr: any, index: number, arr: any[]) => {
    if (index === 0) return { year: curr.period, rate: 0 };
    const prev = arr[index - 1];
    const rate = ((curr.count - prev.count) / prev.count * 100).toFixed(1);
    return { year: curr.period, rate: parseFloat(rate) };
  }).filter((item: any) => item.rate > 0);

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
              <CardTitle>Seasonal Patterns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80 flex items-center justify-center">
                {seasonalLoading ? (
                  <div className="text-slate-500">Loading seasonal data...</div>
                ) : (
                  <div className="w-full space-y-4">
                    {seasonalData.map((season: any, index: number) => (
                      <div key={season.season} className="flex items-center justify-between">
                        <span className="text-sm font-medium">{season.season}</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-32 bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${
                                index === 0 ? 'bg-blue-600' : 
                                index === 1 ? 'bg-green-600' : 
                                index === 2 ? 'bg-yellow-600' : 'bg-gray-600'
                              }`}
                              style={{ width: `${season.percentage}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-600">{season.percentage}%</span>
                        </div>
                      </div>
                    ))}
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
              ) : (
                <div className="space-y-2 text-sm">
                  {growthRates.slice(-3).map((item: any) => (
                    <div key={item.year} className="flex justify-between">
                      <span>{item.year}</span>
                      <span className={`font-medium ${item.rate > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.rate > 0 ? '+' : ''}{item.rate}%
                      </span>
                    </div>
                  ))}
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
