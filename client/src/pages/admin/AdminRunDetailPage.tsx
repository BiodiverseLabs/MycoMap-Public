import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, FlaskConical, Grid3X3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Plate {
  id: number;
  plateNumber: number;
  name: string | null;
  status: string;
  orientation: string;
  defaultForwardPrimer: string | null;
  defaultReversePrimer: string | null;
}

interface LabRun {
  id: number;
  name: string;
  status: string;
  notes: string | null;
  createdAt: string;
  plates: Plate[];
}

const statusColors: Record<string, string> = {
  empty: "bg-gray-100 text-gray-600",
  partial: "bg-yellow-100 text-yellow-700",
  full: "bg-blue-100 text-blue-700",
  validated: "bg-green-100 text-green-700",
};

export default function AdminRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const runId = parseInt(id);
  const { toast } = useToast();
  
  const { data: run, isLoading } = useQuery<LabRun>({
    queryKey: ['/api/admin/runs', runId],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <FlaskConical className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h2 className="text-xl font-semibold mb-2">Run Not Found</h2>
            <Link href="/admin/runs">
              <Button>Back to Runs</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/runs">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ChevronLeft className="h-4 w-4 mr-1" /> Lab Runs
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900" data-testid="text-run-title">
                {run.name}
              </h1>
              <p className="text-gray-600">
                Created {format(new Date(run.createdAt), 'MMMM d, yyyy')} • {run.plates.length} plates
              </p>
            </div>
          </div>
          <Badge className={statusColors[run.status] || "bg-gray-100"}>
            {run.status.replace('_', ' ')}
          </Badge>
        </div>

        {run.notes && (
          <Card>
            <CardContent className="py-4">
              <p className="text-gray-600">{run.notes}</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {run.plates.map((plate) => (
            <Link key={plate.id} href={`/admin/plates/${plate.id}`}>
              <Card 
                className="cursor-pointer hover:shadow-md transition-shadow"
                data-testid={`card-plate-${plate.plateNumber}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Grid3X3 className="h-5 w-5 text-gray-500" />
                      <span className="font-semibold">Plate {plate.plateNumber}</span>
                    </div>
                    <Badge className={statusColors[plate.status] || statusColors.empty} variant="secondary">
                      {plate.status}
                    </Badge>
                  </div>
                  {plate.name && plate.name !== `Plate ${plate.plateNumber}` && (
                    <p className="text-sm text-gray-500 truncate">{plate.name}</p>
                  )}
                  {plate.defaultForwardPrimer && (
                    <p className="text-xs text-gray-400 mt-1 truncate">
                      F: {plate.defaultForwardPrimer}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
