import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GeospatialMap } from "@/components/dashboard/GeospatialMap";
import { StateRecords } from "@/components/dashboard/StateRecords";
import { TopContributors } from "@/components/dashboard/TopContributors";
import { SpeciesFrequency } from "@/components/dashboard/SpeciesFrequency";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export default function Geospatial() {
  const [selectedState, setSelectedState] = useState<string | null>(null);

  const handleStateSelect = (state: string) => {
    setSelectedState(state);
  };

  const clearStateFilter = () => {
    setSelectedState(null);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Geospatial Analysis</h2>
          <p className="text-slate-600 mt-1">
            Geographic distribution and biodiversity hotspots
            {selectedState && (
              <span className="ml-2">
                - Filtered by: <strong>{selectedState}</strong>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearStateFilter}
                  className="ml-2 h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </span>
            )}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-8">
          <GeospatialMap onStateSelect={handleStateSelect} selectedState={selectedState} />
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <StateRecords state={selectedState || undefined} />
            <TopContributors state={selectedState || undefined} />
            <SpeciesFrequency state={selectedState || undefined} />
          </div>
        </div>
      </div>
    </div>
  );
}
