import { TaxonomicChart } from "@/components/dashboard/TaxonomicChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Taxonomic() {
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

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <TaxonomicChart />
          
          <Card>
            <CardHeader>
              <CardTitle>Family Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Agaricaceae</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-16 bg-slate-200 rounded-full h-2">
                      <div className="bg-primary h-2 rounded-full w-[85%]"></div>
                    </div>
                    <span className="text-sm font-medium w-12">1,234</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Polyporaceae</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-16 bg-slate-200 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full w-[68%]"></div>
                    </div>
                    <span className="text-sm font-medium w-12">987</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Boletaceae</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-16 bg-slate-200 rounded-full h-2">
                      <div className="bg-yellow-500 h-2 rounded-full w-[52%]"></div>
                    </div>
                    <span className="text-sm font-medium w-12">756</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Russulaceae</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-16 bg-slate-200 rounded-full h-2">
                      <div className="bg-purple-500 h-2 rounded-full w-[45%]"></div>
                    </div>
                    <span className="text-sm font-medium w-12">623</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Phylum Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Basidiomycota</span>
                  <span className="font-medium">8,234</span>
                </div>
                <div className="flex justify-between">
                  <span>Ascomycota</span>
                  <span className="font-medium">3,891</span>
                </div>
                <div className="flex justify-between">
                  <span>Others</span>
                  <span className="font-medium">722</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Class Diversity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Agaricomycetes</span>
                  <span className="font-medium">6,543</span>
                </div>
                <div className="flex justify-between">
                  <span>Sordariomycetes</span>
                  <span className="font-medium">1,876</span>
                </div>
                <div className="flex justify-between">
                  <span>Eurotiomycetes</span>
                  <span className="font-medium">1,234</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Agaricales</span>
                  <span className="font-medium">4,567</span>
                </div>
                <div className="flex justify-between">
                  <span>Polyporales</span>
                  <span className="font-medium">2,134</span>
                </div>
                <div className="flex justify-between">
                  <span>Boletales</span>
                  <span className="font-medium">1,876</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">New Taxa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>This Year</span>
                  <span className="font-medium text-green-600">23</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Year</span>
                  <span className="font-medium">18</span>
                </div>
                <div className="flex justify-between">
                  <span>Total New</span>
                  <span className="font-medium">156</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
