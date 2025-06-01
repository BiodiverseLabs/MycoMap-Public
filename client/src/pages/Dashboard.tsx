import { MetricsCards } from "@/components/dashboard/MetricsCards";
import { GeospatialMap } from "@/components/dashboard/GeospatialMap";
import { TemporalChart } from "@/components/dashboard/TemporalChart";
import { TaxonomicChart } from "@/components/dashboard/TaxonomicChart";
import { TopContributors } from "@/components/dashboard/TopContributors";
import { SpeciesFrequency } from "@/components/dashboard/SpeciesFrequency";
import { StateRecords } from "@/components/dashboard/StateRecords";
import { ObservationSources } from "@/components/dashboard/ObservationSources";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, X } from "lucide-react";
import { useState } from "react";

export default function Dashboard() {
  const [dateRange, setDateRange] = useState('all_time');
  const [selectedState, setSelectedState] = useState<string | null>(null);

  const handleExportData = () => {
    console.log('Exporting data...');
    // Download the original Excel file
    const link = document.createElement('a');
    link.href = '/api/export/original';
    link.download = 'Validated_Observations_05.30.25.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDateRangeChange = (newDateRange: string) => {
    console.log(`[Dashboard] Date range changing from "${dateRange}" to "${newDateRange}"`);
    setDateRange(newDateRange);
  };

  const handleStateSelect = (state: string) => {
    setSelectedState(state);
  };

  const clearStateFilter = () => {
    setSelectedState(null);
  };

  // Debug logging for state
  console.log(`[Dashboard] Current dateRange state: "${dateRange}"`);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 lg:px-6 py-3 lg:py-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg lg:text-2xl font-semibold text-slate-900 truncate">Dashboard Overview</h2>
            <div className="text-xs lg:text-sm text-slate-600 mt-1 break-words">
              <span className="block lg:inline">DNA-validated macrofungi observations from iNaturalist and Mushroom Observer</span>
              {selectedState && (
                <span className="block lg:inline lg:ml-2 mt-1 lg:mt-0">
                  - Filtered by {selectedState}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearStateFilter}
                    className="ml-2 h-4 w-4 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between lg:justify-end space-x-2 lg:space-x-4">
            <div className="flex items-center space-x-2 text-xs lg:text-sm">
              <label className="text-slate-600 hidden lg:inline">Date Range:</label>
              <Select value={dateRange} onValueChange={handleDateRangeChange}>
                <SelectTrigger className="w-32 lg:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_30_days">2025 data</SelectItem>
                  <SelectItem value="last_6_months">Last 6 months</SelectItem>
                  <SelectItem value="last_year">2024-2025</SelectItem>
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
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        <MetricsCards dateRange={dateRange} selectedState={selectedState} />

        <div className="mb-6 lg:mb-8">
          <GeospatialMap dateRange={dateRange} onStateSelect={handleStateSelect} selectedState={selectedState} />
        </div>

        <div className="mb-6 lg:mb-8">
          <TemporalChart dateRange={dateRange} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8 mb-6 lg:mb-8">
          <TaxonomicChart dateRange={dateRange} />
          <TopContributors dateRange={dateRange} />
          <SpeciesFrequency dateRange={dateRange} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8">
          <StateRecords dateRange={dateRange} />
          <ObservationSources dateRange={dateRange} />
        </div>
      </div>
    </div>
  );
}
