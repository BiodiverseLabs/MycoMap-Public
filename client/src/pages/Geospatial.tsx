import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GeospatialMap } from "@/components/dashboard/GeospatialMap";
import { StateRecords } from "@/components/dashboard/StateRecords";

export default function Geospatial() {
  return (
    <div className="flex flex-col h-full">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Geospatial Analysis</h2>
          <p className="text-slate-600 mt-1">
            Geographic distribution and biodiversity hotspots
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2">
            <GeospatialMap />
          </div>
          <div className="space-y-6">
            <StateRecords />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Biodiversity Hotspots</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>California</span>
                  <span className="font-medium">2,847</span>
                </div>
                <div className="flex justify-between">
                  <span>Florida</span>
                  <span className="font-medium">1,923</span>
                </div>
                <div className="flex justify-between">
                  <span>Texas</span>
                  <span className="font-medium">1,456</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Species Richness</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Pacific Northwest</span>
                  <span className="font-medium">456</span>
                </div>
                <div className="flex justify-between">
                  <span>Southeast</span>
                  <span className="font-medium">389</span>
                </div>
                <div className="flex justify-between">
                  <span>Northeast</span>
                  <span className="font-medium">334</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Endemic Species</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Hawaii</span>
                  <span className="font-medium">23</span>
                </div>
                <div className="flex justify-between">
                  <span>Alaska</span>
                  <span className="font-medium">18</span>
                </div>
                <div className="flex justify-between">
                  <span>Florida</span>
                  <span className="font-medium">12</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coverage Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>States Covered</span>
                  <span className="font-medium">48/50</span>
                </div>
                <div className="flex justify-between">
                  <span>Protected Areas</span>
                  <span className="font-medium">234</span>
                </div>
                <div className="flex justify-between">
                  <span>Urban Areas</span>
                  <span className="font-medium">67</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
