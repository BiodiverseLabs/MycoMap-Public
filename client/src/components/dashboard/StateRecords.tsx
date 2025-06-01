import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

interface StateRecord {
  id: number;
  species: string;
  state: string;
  reportDate: string;
  source: string;
  referenceNumber: string;
  datasetRecordNumber: number;
  stateRecordNumber: number;
  isFirstGlobal: boolean;
  isFirstInState: boolean;
}

interface StateRecordsProps {
  dateRange?: string;
  selectedState?: string | null;
}

export function StateRecords({ dateRange, selectedState }: StateRecordsProps) {
  const { data: records = [], isLoading } = useQuery<StateRecord[]>({
    queryKey: ["/api/record-index", { recent: true }, dateRange, selectedState],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('limit', '10');
      params.append('recent', 'true');
      if (dateRange) {
        params.append('dateRange', dateRange);
      }
      if (selectedState) {
        params.append('state', selectedState);
      }
      const response = await fetch(`/api/record-index?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch recent records');
      return response.json();
    }
  });

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown date';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const getObservationLink = (source: string, referenceNumber: string) => {
    if (!referenceNumber || referenceNumber === 'N/A') return null;
    
    if (source?.toLowerCase().includes('inaturalist') || source?.toLowerCase().includes('inat')) {
      return `https://www.inaturalist.org/observations/${referenceNumber}`;
    } else if (source?.toLowerCase().includes('mushroom') || source?.toLowerCase().includes('observer')) {
      return `https://www.mushroomobserver.org/${referenceNumber}`;
    }
    return null;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent State Records</CardTitle>
            <Badge className="bg-green-100 text-green-800">New Discoveries</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-sm font-medium text-slate-600 pb-3">Species</th>
                  <th className="text-left text-sm font-medium text-slate-600 pb-3">State</th>
                  <th className="text-left text-sm font-medium text-slate-600 pb-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3"><div className="h-4 bg-slate-200 rounded w-32"></div></td>
                    <td className="py-3"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                    <td className="py-3"><div className="h-4 bg-slate-200 rounded w-20"></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Records</CardTitle>
          <Badge className="bg-green-100 text-green-800">New Discoveries</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left text-sm font-medium text-slate-600 pb-3">Species</th>
                <th className="text-left text-sm font-medium text-slate-600 pb-3">State</th>
                <th className="text-left text-sm font-medium text-slate-600 pb-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.slice(0, 5).map((record) => {
                const observationLink = getObservationLink(record.source, record.referenceNumber);
                
                return (
                  <tr key={record.id}>
                    <td className="py-3 text-sm text-slate-900 italic">
                      {observationLink ? (
                        <a 
                          href={observationLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {record.species}
                        </a>
                      ) : (
                        record.species
                      )}
                      {record.isFirstGlobal && (
                        <Badge className="ml-2 bg-blue-100 text-blue-800 text-xs">1st Global</Badge>
                      )}
                      {record.isFirstInState && (
                        <Badge className="ml-2 bg-green-100 text-green-800 text-xs">1st State</Badge>
                      )}
                    </td>
                    <td className="py-3 text-sm text-slate-600">
                      {record.state}
                    </td>
                    <td className="py-3 text-sm text-slate-600">
                      {formatDate(record.reportDate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {records.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            No recent state records found
          </div>
        )}
      </CardContent>
    </Card>
  );
}
