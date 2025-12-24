import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { 
  Package, 
  FlaskConical, 
  Dna, 
  Archive, 
  AlertCircle,
  ArrowRight,
  Clock,
  CheckCircle2,
  Database
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface SpecimenStats {
  total: number;
  accessioned: number;
  byStatus: Record<string, number>;
}

export default function AdminFungariumOverview() {
  const { data: stats, isLoading } = useQuery<SpecimenStats>({
    queryKey: ["/api/admin/specimens/stats"],
  });

  const statusConfig: Record<string, { label: string; icon: any; color: string; bgColor: string }> = {
    received: { 
      label: "Received", 
      icon: Package, 
      color: "text-blue-600",
      bgColor: "bg-blue-50"
    },
    processing: { 
      label: "Processing", 
      icon: FlaskConical, 
      color: "text-amber-600",
      bgColor: "bg-amber-50"
    },
    sequenced: { 
      label: "Sequenced", 
      icon: Dna, 
      color: "text-purple-600",
      bgColor: "bg-purple-50"
    },
    accessioned: { 
      label: "Accessioned", 
      icon: CheckCircle2, 
      color: "text-[#8CBD45]",
      bgColor: "bg-[#8CBD45]/10"
    },
    archived: { 
      label: "Archived", 
      icon: Archive, 
      color: "text-slate-600",
      bgColor: "bg-slate-100"
    },
  };

  const readyForAccession = stats?.readyForAccession || 0;
  const accessioned = stats?.accessioned || 0;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Fungarium Overview</h1>
          <p className="text-slate-600 mt-1">
            MYCO Fungarium specimen management and accession tracking
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <Card className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-slate-200 rounded w-32 mb-2"></div>
                <div className="h-8 bg-slate-200 rounded w-20"></div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-slate-200 rounded w-24 mb-2"></div>
                  <div className="h-8 bg-slate-200 rounded w-16"></div>
                </CardContent>
              </Card>
              <Card className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-slate-200 rounded w-24 mb-2"></div>
                  <div className="h-8 bg-slate-200 rounded w-16"></div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <>
            <Card data-testid="card-total-specimens">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-[#A87146]/10">
                      <Database className="w-6 h-6 text-[#A87146]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-600">Total Specimens in System</p>
                      <p className="text-3xl font-bold text-[#A87146]">{stats?.total?.toLocaleString() || 0}</p>
                    </div>
                  </div>
                  <Link href="/admin/specimens">
                    <Button className="bg-[#8CBD45] hover:bg-[#7AAD35] gap-2" data-testid="button-browse-all">
                      Browse All Specimens
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-[#8CBD45]/30" data-testid="card-accessioned">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CheckCircle2 className="w-5 h-5 text-[#8CBD45]" />
                    Accessioned
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-3xl font-bold text-[#8CBD45]">{accessioned.toLocaleString()}</p>
                      <p className="text-sm text-slate-600 mt-1">
                        Specimens with assigned MYCO accession numbers
                      </p>
                    </div>
                    <Link href="/admin/specimens?status=accessioned">
                      <Button variant="outline" className="gap-2" data-testid="button-view-accessioned">
                        View
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-amber-300/50" data-testid="card-ready-for-accession">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Clock className="w-5 h-5 text-amber-600" />
                    Ready for Accession
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-3xl font-bold text-amber-600">{readyForAccession.toLocaleString()}</p>
                      <p className="text-sm text-slate-600 mt-1">
                        Specimen records awaiting MYCO accession numbers
                      </p>
                    </div>
                    <Link href="/admin/specimens?status=pending_accession">
                      <Button variant="outline" className="gap-2" data-testid="button-view-ready">
                        View Queue
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                  {readyForAccession === 0 && (
                    <div className="mt-4 p-4 bg-slate-50 rounded-lg flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-slate-400" />
                      <span className="text-sm text-slate-600">
                        No specimens are currently awaiting accession
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {Object.entries(statusConfig).map(([status, config]) => {
                const Icon = config.icon;
                const count = stats?.byStatus?.[status] || 0;
                return (
                  <Card key={status} className="hover:shadow-md transition-shadow" data-testid={`card-status-${status}`}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-600">{config.label}</span>
                        <div className={`p-2 rounded-lg ${config.bgColor}`}>
                          <Icon className={`w-4 h-4 ${config.color}`} />
                        </div>
                      </div>
                      <div className={`text-2xl font-bold ${config.color}`}>
                        {count.toLocaleString()}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
