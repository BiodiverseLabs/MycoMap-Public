import { MetricsCards } from "@/components/dashboard/MetricsCards";
import { GeospatialMap } from "@/components/dashboard/GeospatialMap";
import { TemporalChart } from "@/components/dashboard/TemporalChart";
import { TaxonomicChart } from "@/components/dashboard/TaxonomicChart";
import { TopContributors } from "@/components/dashboard/TopContributors";
import { SpeciesFrequency } from "@/components/dashboard/SpeciesFrequency";
import { StateRecords } from "@/components/dashboard/StateRecords";
import { RareSpecies } from "@/components/dashboard/RareSpecies";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";
import { useState } from "react";

export default function Dashboard() {
  const [dateRange, setDateRange] = useState('last_30_days');

  const handleExportData = () => {
    // Export functionality would be implemented here
    console.log('Exporting data...');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Dashboard Overview</h2>
            <p className="text-slate-600 mt-1">
              DNA-validated macrofungi observations from iNaturalist and Mushroom Observer
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm">
              <label className="text-slate-600">Date Range:</label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_30_days">Last 30 days</SelectItem>
                  <SelectItem value="last_6_months">Last 6 months</SelectItem>
                  <SelectItem value="last_year">Last year</SelectItem>
                  <SelectItem value="all_time">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleExportData} className="bg-primary hover:bg-primary/90">
              <Download className="mr-2 h-4 w-4" />
              Export Data
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <MetricsCards />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <GeospatialMap />
          <TemporalChart />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <TaxonomicChart />
          <TopContributors />
          <SpeciesFrequency />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <StateRecords />
          <RareSpecies />
        </div>
      </div>
    </div>
  );
}
