import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, AlertCircle, CheckCircle, Trash2, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export function RedListUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Get existing Red List assessments
  const { data: assessments, isLoading: assessmentsLoading } = useQuery({
    queryKey: ['/api/redlist-assessments'],
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      return apiRequest('/api/redlist-assessments/upload', {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: () => {
      toast({
        title: "Upload successful",
        description: "Red List data has been uploaded and processed successfully.",
      });
      setSelectedFile(null);
      setUploadProgress(0);
      queryClient.invalidateQueries({ queryKey: ['/api/redlist-assessments'] });
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload Red List data.",
        variant: "destructive",
      });
      setUploadProgress(0);
    },
  });

  // Clear assessments mutation
  const clearMutation = useMutation({
    mutationFn: () => apiRequest('/api/redlist-assessments/clear', { method: 'DELETE' }),
    onSuccess: () => {
      toast({
        title: "Data cleared",
        description: "All Red List assessments have been removed.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/redlist-assessments'] });
    },
    onError: (error: any) => {
      toast({
        title: "Clear failed",
        description: error.message || "Failed to clear Red List data.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) return;
    
    setUploadProgress(10);
    uploadMutation.mutate(selectedFile);
  };

  const handleClear = () => {
    if (window.confirm('Are you sure you want to clear all Red List data? This action cannot be undone.')) {
      clearMutation.mutate();
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Red List Data
          </CardTitle>
          <CardDescription>
            Upload CSV files containing IUCN Red List assessment data. The file should contain species names and conservation status information.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="redlist-file">Select CSV File</Label>
            <Input
              id="redlist-file"
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              disabled={uploadMutation.isPending}
            />
          </div>

          {selectedFile && (
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </AlertDescription>
            </Alert>
          )}

          {uploadMutation.isPending && (
            <div className="space-y-2">
              <Progress value={uploadProgress} className="w-full" />
              <p className="text-sm text-slate-600">Uploading and processing file...</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button 
              onClick={handleUpload}
              disabled={!selectedFile || uploadMutation.isPending}
              className="flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Upload File
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current Data Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Current Red List Data
          </CardTitle>
          <CardDescription>
            Overview of currently loaded IUCN Red List assessments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {assessmentsLoading ? (
            <div className="text-sm text-slate-600">Loading assessments...</div>
          ) : assessments && assessments.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="font-medium">
                    {assessments.length.toLocaleString()} assessments loaded
                  </span>
                </div>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={handleClear}
                  disabled={clearMutation.isPending}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All Data
                </Button>
              </div>

              {/* Sample of assessments */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Sample Assessments:</h4>
                <div className="grid gap-2 max-h-48 overflow-y-auto">
                  {assessments.slice(0, 10).map((assessment: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded-lg">
                      <span className="text-sm font-medium">{assessment.scientificName}</span>
                      <Badge variant={
                        assessment.redListCategory === 'LC' ? 'default' :
                        assessment.redListCategory === 'NT' ? 'secondary' :
                        assessment.redListCategory === 'VU' ? 'outline' :
                        assessment.redListCategory === 'EN' ? 'destructive' :
                        assessment.redListCategory === 'CR' ? 'destructive' :
                        'secondary'
                      }>
                        {assessment.redListCategory || 'Unknown'}
                      </Badge>
                    </div>
                  ))}
                  {assessments.length > 10 && (
                    <div className="text-sm text-slate-600 text-center py-2">
                      ... and {(assessments.length - 10).toLocaleString()} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No Red List assessments found. Upload a CSV file to get started.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>File Format Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-slate-600">
            <p>Your CSV file should contain the following columns:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>scientific_name</strong> - The scientific name of the species</li>
              <li><strong>red_list_category</strong> - IUCN Red List category (LC, NT, VU, EN, CR, etc.)</li>
              <li><strong>assessment_id</strong> - Unique assessment identifier (optional)</li>
              <li><strong>year_assessed</strong> - Year of assessment (optional)</li>
              <li><strong>population_trend</strong> - Population trend information (optional)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}