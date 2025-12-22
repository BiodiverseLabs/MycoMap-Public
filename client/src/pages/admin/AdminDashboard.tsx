import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Database, 
  Dna, 
  Upload, 
  AlertTriangle, 
  Leaf, 
  Package, 
  FlaskConical, 
  Settings,
  Terminal,
  Archive,
  ArrowRight
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface LabRun {
  id: number;
  name: string;
  status: string;
}

interface Shipment {
  id: number;
  status: string;
}

export default function AdminDashboard() {
  const { data: runs, isLoading: runsLoading } = useQuery<LabRun[]>({
    queryKey: ['/api/admin/runs'],
  });

  const { data: shipments, isLoading: shipmentsLoading } = useQuery<Shipment[]>({
    queryKey: ['/api/admin/shipments'],
  });

  const pendingShipments = shipments?.filter(s => s.status === 'pending' || s.status === 'submitted')?.length || 0;
  const activeRuns = runs?.filter(r => r.status === 'in_progress')?.length || 0;
  const draftRuns = runs?.filter(r => r.status === 'draft')?.length || 0;

  const quickLinks = [
    { href: "/admin/validation", label: "Data Validation", icon: Database, description: "Validate observation records", color: "bg-blue-500" },
    { href: "/admin/biorecords", label: "BioRecord Management", icon: Dna, description: "Manage biological records", color: "bg-purple-500" },
    { href: "/admin/upload", label: "Data Upload", icon: Upload, description: "Upload new data files", color: "bg-green-500" },
    { href: "/admin/shipments", label: "Pending Shipments", icon: Package, description: "Process specimen shipments", color: "bg-orange-500" },
    { href: "/admin/runs", label: "Lab Runs", icon: FlaskConical, description: "Manage sequencing runs", color: "bg-teal-500" },
    { href: "/admin/bioinformatics", label: "Bioinformatics", icon: Terminal, description: "Pipeline code tracking", color: "bg-indigo-500" },
    { href: "/admin/redlist", label: "Red List Management", icon: AlertTriangle, description: "Conservation status tracking", color: "bg-red-500" },
    { href: "/admin/foraging-lists", label: "Foraging Lists", icon: Leaf, description: "Manage foraging data", color: "bg-lime-500" },
    { href: "/admin/settings", label: "System Settings", icon: Settings, description: "Configure system options", color: "bg-gray-500" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#A87146]" data-testid="text-admin-title">
              Admin Dashboard
            </h1>
            <p className="text-gray-600">Manage MycoMap data, shipments, and laboratory workflows</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-orange-700">
                <Package className="h-5 w-5" />
                Pending Shipments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {shipmentsLoading ? (
                <Skeleton className="h-10 w-20" />
              ) : (
                <div className="text-3xl font-bold text-orange-600">{pendingShipments}</div>
              )}
              <p className="text-sm text-orange-600/70">Awaiting processing</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-teal-50 to-teal-100 border-teal-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-teal-700">
                <FlaskConical className="h-5 w-5" />
                Active Lab Runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {runsLoading ? (
                <Skeleton className="h-10 w-20" />
              ) : (
                <div className="text-3xl font-bold text-teal-600">{activeRuns}</div>
              )}
              <p className="text-sm text-teal-600/70">In progress</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-gray-700">
                <Archive className="h-5 w-5" />
                Draft Runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {runsLoading ? (
                <Skeleton className="h-10 w-20" />
              ) : (
                <div className="text-3xl font-bold text-gray-600">{draftRuns}</div>
              )}
              <p className="text-sm text-gray-600/70">Ready for setup</p>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Quick Access</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href}>
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer group h-full">
                    <CardContent className="p-4 flex items-start gap-4">
                      <div className={`p-3 rounded-lg ${link.color} text-white`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-800 group-hover:text-[#8CBD45] transition-colors flex items-center gap-2">
                          {link.label}
                          <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </h3>
                        <p className="text-sm text-gray-500">{link.description}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
