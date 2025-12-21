import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Download, Leaf, Check, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

interface ForagingList {
  id: number;
  category: string;
  csvData: string | null;
  fileName: string | null;
  speciesCount: number | null;
  uploadedAt: string | null;
  uploadedBy: string | null;
}

const FORAGING_CATEGORIES = [
  { id: "choice-edibles", label: "Choice Edibles", color: "bg-emerald-500", description: "Premium edible species highly prized by foragers" },
  { id: "edibles", label: "Edibles", color: "bg-green-500", description: "General edible species suitable for consumption" },
  { id: "medicinals", label: "Medicinals", color: "bg-purple-500", description: "Species with medicinal or therapeutic properties" },
  { id: "dyers", label: "Dyers", color: "bg-amber-500", description: "Species used for natural dye production" },
  { id: "psychoactive", label: "Psychoactive", color: "bg-indigo-500", description: "Species with psychoactive compounds" },
  { id: "poisonous", label: "Poisonous", color: "bg-orange-500", description: "Species that are toxic if consumed" },
  { id: "deadly", label: "Deadly", color: "bg-red-600", description: "Species that can cause severe harm or death" },
];

export default function ForagingLists() {
  const { toast } = useToast();
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: lists, isLoading, isError, error } = useQuery<ForagingList[]>({
    queryKey: ['/api/admin/foraging-lists'],
    retry: false,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ category, file }: { category: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`/api/admin/foraging-lists/${category}/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Upload Successful",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/foraging-lists'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setUploadingCategory(null);
    },
  });

  const handleFileSelect = (category: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        toast({
          title: "Invalid File",
          description: "Please upload a CSV file",
          variant: "destructive",
        });
        return;
      }
      setUploadingCategory(category);
      uploadMutation.mutate({ category, file });
    }
    event.target.value = '';
  };

  const handleDownload = (category: string) => {
    window.open(`/api/admin/foraging-lists/${category}/download`, '_blank');
  };

  const getListForCategory = (categoryId: string): ForagingList | undefined => {
    return lists?.find(list => list.category === categoryId);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-myco-green" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Error Loading Foraging Lists
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-600">
              {(error as Error)?.message || "Failed to load foraging lists. Please make sure you are logged in."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3" data-testid="text-foraging-lists-title">
            <Leaf className="h-8 w-8 text-myco-green" />
            Foraging Lists
          </h1>
          <p className="text-slate-600">
            Manage species lists for each foraging category. Upload CSV files with species names to tag observations on the Foraging Map.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FORAGING_CATEGORIES.map((category) => {
            const list = getListForCategory(category.id);
            const hasData = list && list.csvData;
            const isUploading = uploadingCategory === category.id;

            return (
              <Card key={category.id} className="relative overflow-hidden" data-testid={`card-${category.id}`}>
                <div className={`absolute top-0 left-0 right-0 h-1 ${category.color}`} />
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${category.color}`} />
                    {category.label}
                  </CardTitle>
                  <CardDescription>{category.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {hasData ? (
                    <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                      <div className="flex items-center gap-2 text-green-600">
                        <Check className="h-4 w-4" />
                        <span className="text-sm font-medium">List uploaded</span>
                      </div>
                      <div className="text-sm text-slate-600">
                        <p><strong>File:</strong> {list.fileName}</p>
                        <p><strong>Species:</strong> {list.speciesCount?.toLocaleString() || 0}</p>
                        <p><strong>Last updated:</strong> {list.uploadedAt ? format(new Date(list.uploadedAt), "MMM d, yyyy 'at' h:mm a") : 'Unknown'}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 rounded-lg p-4 flex items-center gap-2 text-slate-500">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">No list uploaded yet</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      ref={(el) => { fileInputRefs.current[category.id] = el; }}
                      onChange={(e) => handleFileSelect(category.id, e)}
                      data-testid={`input-upload-${category.id}`}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => fileInputRefs.current[category.id]?.click()}
                      disabled={isUploading}
                      data-testid={`button-upload-${category.id}`}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload CSV
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleDownload(category.id)}
                      disabled={!hasData}
                      data-testid={`button-download-${category.id}`}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>CSV Format Guidelines</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 space-y-2">
            <p>Your CSV file should contain species names that will be tagged on the Foraging Map. The expected format:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>First row should be a header (e.g., "scientific_name" or "species")</li>
              <li>Each subsequent row should contain one species name</li>
              <li>Species names should match iNaturalist taxonomy for best results</li>
            </ul>
            <div className="bg-slate-100 p-3 rounded font-mono text-xs mt-3">
              scientific_name<br />
              Cantharellus cibarius<br />
              Morchella americana<br />
              Laetiporus sulphureus
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
