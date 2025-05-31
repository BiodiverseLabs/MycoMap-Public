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
        <div className="w-full">
          <GeospatialMap />
        </div>
      </div>
    </div>
  );
}
