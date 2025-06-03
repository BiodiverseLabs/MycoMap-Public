import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload } from "lucide-react";
import { FileUpload } from "@/components/admin/FileUpload";

export default function AdminUpload() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Data Upload
          </h1>
          <p className="text-slate-600">
            Upload observation data files from iNaturalist, Mushroom Observer, or sequence databases
          </p>
        </div>

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
      </div>
    </div>
  );
}