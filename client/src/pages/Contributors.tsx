import { TopContributors } from "@/components/dashboard/TopContributors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Contributors() {
  return (
    <div className="flex flex-col h-full">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Contributors</h2>
          <p className="text-slate-600 mt-1">
            Observer and collector statistics and verification rates
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <TopContributors />
          
          <Card>
            <CardHeader>
              <CardTitle>Verification Rates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">Dr. Sarah Wilson</p>
                    <p className="text-sm text-slate-600">University Expert</p>
                  </div>
                  <Badge className="bg-green-100 text-green-800">98.5%</Badge>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">Mike Chen</p>
                    <p className="text-sm text-slate-600">Field Researcher</p>
                  </div>
                  <Badge className="bg-green-100 text-green-800">96.2%</Badge>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">Dr. Amanda Rodriguez</p>
                    <p className="text-sm text-slate-600">Mycological Institute</p>
                  </div>
                  <Badge className="bg-green-100 text-green-800">94.8%</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Institutions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>University of Biology</span>
                  <span className="font-medium">1,847</span>
                </div>
                <div className="flex justify-between">
                  <span>Mycological Institute</span>
                  <span className="font-medium">1,234</span>
                </div>
                <div className="flex justify-between">
                  <span>Field Research Center</span>
                  <span className="font-medium">987</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Citizen Scientists</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Active Contributors</span>
                  <span className="font-medium">234</span>
                </div>
                <div className="flex justify-between">
                  <span>New This Year</span>
                  <span className="font-medium text-green-600">67</span>
                </div>
                <div className="flex justify-between">
                  <span>Expert Level</span>
                  <span className="font-medium">45</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Geographic Coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>West Coast</span>
                  <span className="font-medium">156</span>
                </div>
                <div className="flex justify-between">
                  <span>East Coast</span>
                  <span className="font-medium">134</span>
                </div>
                <div className="flex justify-between">
                  <span>Midwest</span>
                  <span className="font-medium">89</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quality Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Avg. Verification</span>
                  <span className="font-medium">92.3%</span>
                </div>
                <div className="flex justify-between">
                  <span>DNA Validated</span>
                  <span className="font-medium">87.6%</span>
                </div>
                <div className="flex justify-between">
                  <span>Complete Records</span>
                  <span className="font-medium">94.1%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
