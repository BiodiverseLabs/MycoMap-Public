import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Clock, AlertCircle, Loader2 } from "lucide-react";

interface Upload {
  id: number;
  filename: string;
  originalName: string;
  recordCount: number;
  status: string;
  uploadedAt: string;
  errorMessage?: string;
}

interface Metrics {
  totalObservations: number;
  uniqueSpecies: number;
  activeContributors: number;
  statesCovered: number;
}

export function ProcessingStatus() {
  const { data: uploads = [] } = useQuery<Upload[]>({
    queryKey: ["/api/uploads"],
    refetchInterval: 2000, // Poll every 2 seconds
  });

  const { data: metrics } = useQuery<Metrics>({
    queryKey: ["/api/metrics"],
    refetchInterval: 2000, // Poll every 2 seconds
  });

  const latestUpload = uploads[0]; // Most recent upload
  const isProcessing = latestUpload?.status === "processing";
  const hasData = metrics && metrics.totalObservations > 0;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "processing":
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "processing":
        return "bg-blue-100 text-blue-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Processing Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {latestUpload ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStatusIcon(latestUpload.status)}
                <span className="text-sm font-medium truncate max-w-[150px]">
                  {latestUpload.originalName}
                </span>
              </div>
              <Badge className={getStatusColor(latestUpload.status)}>
                {latestUpload.status}
              </Badge>
            </div>

            {isProcessing && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Processing observations...</span>
                  <span>{metrics?.totalObservations || 0} loaded</span>
                </div>
                <Progress value={hasData ? 85 : 15} className="h-2" />
              </div>
            )}

            {latestUpload.status === "completed" && hasData && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="text-center p-2 bg-slate-50 rounded">
                  <div className="font-semibold text-slate-900">
                    {metrics.totalObservations.toLocaleString()}
                  </div>
                  <div className="text-slate-600">Observations</div>
                </div>
                <div className="text-center p-2 bg-slate-50 rounded">
                  <div className="font-semibold text-slate-900">
                    {metrics.uniqueSpecies.toLocaleString()}
                  </div>
                  <div className="text-slate-600">Species</div>
                </div>
              </div>
            )}

            {latestUpload.status === "failed" && latestUpload.errorMessage && (
              <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                {latestUpload.errorMessage}
              </div>
            )}

            <div className="text-xs text-slate-500">
              Uploaded: {new Date(latestUpload.uploadedAt).toLocaleString()}
            </div>
          </>
        ) : (
          <div className="text-center py-6 text-slate-500">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent uploads</p>
            <p className="text-xs">Upload a file to see processing status</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}