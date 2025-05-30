import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

interface Upload {
  id: number;
  filename: string;
  originalName: string;
  recordCount: number;
  status: string;
  uploadedAt: string;
}

export function UploadHistory() {
  const { data: uploads = [], isLoading } = useQuery<Upload[]>({
    queryKey: ["/api/uploads"],
  });

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Upload History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">File Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Upload Date</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Records</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-32"></div></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                    <td className="px-4 py-3"><div className="h-6 bg-slate-200 rounded w-20"></div></td>
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
        <CardTitle>Upload History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">File Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Upload Date</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Records</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {uploads.map((upload) => (
                <tr key={upload.id}>
                  <td className="px-4 py-3 text-sm text-slate-900">
                    {upload.originalName}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatDate(upload.uploadedAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {upload.recordCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={getStatusColor(upload.status)}>
                      {upload.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {uploads.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            No uploads found
          </div>
        )}
      </CardContent>
    </Card>
  );
}
