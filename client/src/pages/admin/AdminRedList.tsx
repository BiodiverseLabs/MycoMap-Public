import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database } from "lucide-react";
import { RedListUpload } from "@/components/admin/RedListUpload";

export default function AdminRedList() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Red List Management
          </h1>
          <p className="text-slate-600">
            Upload and manage IUCN Red List assessment data for conservation analysis
          </p>
        </div>

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
      </div>
    </div>
  );
}