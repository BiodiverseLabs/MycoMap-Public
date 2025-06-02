import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Database, Settings, FileText, AlertTriangle } from "lucide-react";
import { FileUpload } from "@/components/admin/FileUpload";
import { RedListUpload } from "@/components/admin/RedListUpload";
import { ObservationValidation } from "@/components/admin/ObservationValidation";

export default function Admin() {
  const [activeTab, setActiveTab] = useState("validation");

  // Get upload history
  const { data: uploads, isLoading: uploadsLoading } = useQuery({
    queryKey: ['/api/uploads'],
  });

  // Get system metrics
  const { data: metrics } = useQuery({
    queryKey: ['/api/metrics'],
  });

  const menuItems = [
    {
      id: "upload",
      label: "Upload Data",
      icon: Upload,
      description: "Upload observation data files"
    },
    {
      id: "redlist",
      label: "Red List Uploads", 
      icon: Database,
      description: "Manage IUCN Red List data"
    },
    {
      id: "settings",
      label: "System Settings",
      icon: Settings,
      description: "Configure application settings"
    },
    {
      id: "logs",
      label: "System Logs",
      icon: FileText,
      description: "View system logs and activity"
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
              <CardTitle className="text-sm font-medium">Unique Species</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics?.uniqueSpecies?.toLocaleString() || '0'}
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

        {/* Admin Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <TabsTrigger key={item.id} value={item.id} className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Upload Observation Data
                </CardTitle>
                <CardDescription>
                  Upload CSV or Excel files containing observation data from iNaturalist, Mushroom Observer, or sequence databases.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileUpload />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="redlist" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  IUCN Red List Data
                </CardTitle>
                <CardDescription>
                  Upload and manage IUCN Red List assessment data for conservation analysis.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RedListUpload />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  System Settings
                </CardTitle>
                <CardDescription>
                  Configure application settings and preferences.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-slate-600">
                  Settings functionality will be added here.
                </div>
                <Button variant="outline" disabled>
                  Coming Soon
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  System Logs
                </CardTitle>
                <CardDescription>
                  View system activity and error logs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-slate-600">
                  Log viewing functionality will be added here.
                </div>
                <Button variant="outline" disabled>
                  Coming Soon
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}