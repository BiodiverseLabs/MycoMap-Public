import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

interface StateRecord {
  id: number;
  scientificName: string;
  state: string;
  observedOn: string;
}

export function StateRecords() {
  const { data: records = [], isLoading } = useQuery<StateRecord[]>({
    queryKey: ["/api/state-records"],
  });

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown date';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
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
              {records.slice(0, 5).map((record) => (
                <tr key={record.id}>
                  <td className="py-3 text-sm text-slate-900 italic">
                    {record.scientificName}
                  </td>
                  <td className="py-3 text-sm text-slate-600">
                    {record.state}
                  </td>
                  <td className="py-3 text-sm text-slate-600">
                    {formatDate(record.observedOn)}
                  </td>
                </tr>
              ))}
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
