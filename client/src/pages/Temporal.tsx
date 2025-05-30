import { TemporalChart } from "@/components/dashboard/TemporalChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Temporal() {
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
              <div className="h-80 flex items-center justify-center text-slate-500">
                Seasonal analysis chart would be implemented here
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
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Fall</span>
                  <span className="font-medium">45%</span>
                </div>
                <div className="flex justify-between">
                  <span>Spring</span>
                  <span className="font-medium">28%</span>
                </div>
                <div className="flex justify-between">
                  <span>Summer</span>
                  <span className="font-medium">18%</span>
                </div>
                <div className="flex justify-between">
                  <span>Winter</span>
                  <span className="font-medium">9%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>October</span>
                  <span className="font-medium">1,847</span>
                </div>
                <div className="flex justify-between">
                  <span>September</span>
                  <span className="font-medium">1,623</span>
                </div>
                <div className="flex justify-between">
                  <span>November</span>
                  <span className="font-medium">1,456</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Growth Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>2024</span>
                  <span className="font-medium text-green-600">+25.3%</span>
                </div>
                <div className="flex justify-between">
                  <span>2023</span>
                  <span className="font-medium text-green-600">+18.7%</span>
                </div>
                <div className="flex justify-between">
                  <span>2022</span>
                  <span className="font-medium text-green-600">+12.1%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Forecasting</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Next Month</span>
                  <span className="font-medium">~1,200</span>
                </div>
                <div className="flex justify-between">
                  <span>Next Quarter</span>
                  <span className="font-medium">~3,800</span>
                </div>
                <div className="flex justify-between">
                  <span>Next Year</span>
                  <span className="font-medium">~16,000</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
