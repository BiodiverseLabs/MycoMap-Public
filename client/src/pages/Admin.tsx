import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Database, Settings, AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "wouter";

export default function Admin() {
  // Get upload history
  const { data: uploads, isLoading: uploadsLoading } = useQuery({
    queryKey: ['/api/uploads'],
  });

  // Get system metrics
  const { data: metrics } = useQuery({
    queryKey: ['/api/metrics'],
  });

  const adminPages = [
    {
      id: "validation",
      label: "Data Validation",
      icon: Database,
      description: "Validate and sync observation data with external sources",
      href: "/admin/validation"
    },
    {
      id: "upload",
      label: "Data Upload",
      icon: Upload,
      description: "Upload observation data files from various sources",
      href: "/admin/upload"
    },
    {
      id: "redlist",
      label: "Red List Management", 
      icon: AlertTriangle,
      description: "Manage IUCN Red List assessment data",
      href: "/admin/redlist"
    },
    {
      id: "settings",
      label: "System Settings",
      icon: Settings,
      description: "Configure application settings and preferences",
      href: "/admin/settings"
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Admin Dashboard
          </h1>
          <p className="text-slate-600">
            Manage data uploads, system settings, and platform configuration
          </p>
        </div>

        {/* System Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Observations</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics?.totalObservations?.toLocaleString() || '0'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fully Validated</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics?.fullyValidated?.toLocaleString() || '0'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Uploads</CardTitle>
              <Upload className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {uploads?.length || '0'}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Admin Page Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {adminPages.map((page) => {
            const Icon = page.icon;
            return (
              <Link key={page.id} href={page.href}>
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer group">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-5 h-5 text-blue-600" />
                        {page.label}
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                    </CardTitle>
                    <CardDescription>
                      {page.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}