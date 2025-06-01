import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Upload, FileText, Trash2, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface RedListAssessment {
  id: number;
  assessmentId: string;
  scientificName: string;
  redlistCategory: string;
  redlistCriteria: string;
  yearPublished: number;
  assessmentDate: string;
  language: string;
  possiblyExtinct: boolean;
  possiblyExtinctInTheWild: boolean;
  createdAt: string;
}

export function RedListUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: assessments = [], isLoading } = useQuery<RedListAssessment[]>({
    queryKey: ['/api/redlist-assessments']
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/redlist-upload', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Red List Upload Successful",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/redlist-assessments'] });
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload Red List assessments",
        variant: "destructive",
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/redlist-assessments', { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(`Clear failed: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Red List Data Cleared",
        description: "All Red List assessments have been removed from the database",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/redlist-assessments'] });
    },
    onError: (error: any) => {
      toast({
        title: "Clear Failed",
        description: error.message || "Failed to clear Red List assessments",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        setSelectedFile(file);
      } else {
        toast({
          title: "Invalid File Type",
          description: "Please select a CSV file",
          variant: "destructive",
        });
        event.target.value = '';
      }
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  const handleClear = () => {
    if (window.confirm('Are you sure you want to clear all Red List assessments? This action cannot be undone.')) {
      clearMutation.mutate();
    }
  };

  const getCategoryBadgeColor = (category: string) => {
    switch (category?.toLowerCase()) {
      case 'critically endangered':
        return 'bg-red-100 text-red-800';
      case 'endangered':
        return 'bg-orange-100 text-orange-800';
      case 'vulnerable':
        return 'bg-yellow-100 text-yellow-800';
      case 'near threatened':
        return 'bg-blue-100 text-blue-800';
      case 'least concern':
        return 'bg-green-100 text-green-800';
      case 'data deficient':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-red-600" />
            <span>Red List Species Upload</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="cursor-pointer"
              />
              <p className="text-xs text-slate-500 mt-1">
                Upload CSV file with Red List species assessments
              </p>
            </div>

            {selectedFile && (
              <div className="flex items-center space-x-2 p-3 bg-slate-50 rounded-lg">
                <FileText className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium">{selectedFile.name}</span>
                <span className="text-xs text-slate-500">
                  ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            )}

            <div className="flex space-x-2">
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || uploadMutation.isPending}
                className="flex-1"
              >
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload CSV
                  </>
                )}
              </Button>

              {assessments.length > 0 && (
                <Button
                  variant="destructive"
                  onClick={handleClear}
                  disabled={clearMutation.isPending}
                >
                  {clearMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              )}
            </div>
          </div>

          {assessments.length > 0 && (
            <div className="flex items-center space-x-2 p-3 bg-green-50 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-800">
                {assessments.length} Red List assessments loaded
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {assessments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Red List Assessments Database</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="ml-2">Loading assessments...</span>
              </div>
            ) : (
              <ScrollArea className="h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scientific Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Criteria</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assessments.slice(0, 100).map((assessment) => (
                      <TableRow key={assessment.id}>
                        <TableCell>
                          <div className="font-medium text-sm">
                            {assessment.scientificName}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getCategoryBadgeColor(assessment.redlistCategory)}>
                            {assessment.redlistCategory}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-mono text-slate-600">
                            {assessment.redlistCriteria || 'N/A'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-slate-600">
                            {assessment.yearPublished || 'Unknown'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1">
                            {assessment.possiblyExtinct && (
                              <Badge variant="destructive" className="text-xs">
                                Possibly Extinct
                              </Badge>
                            )}
                            {assessment.possiblyExtinctInTheWild && (
                              <Badge variant="outline" className="text-xs">
                                Extinct in Wild
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {assessments.length > 100 && (
                  <div className="text-center py-4 text-sm text-slate-500">
                    Showing first 100 of {assessments.length} assessments
                  </div>
                )}
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}