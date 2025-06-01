import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CloudUpload, FileCheck, Loader2 } from "lucide-react";
import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export function FileUpload() {
  const [uploadSettings, setUploadSettings] = useState({
    validateDuplicates: true,
    requireGeolocation: true,
    autoNotify: false,
  });
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'processing'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploadPhase('uploading');
      setUploadProgress(0);
      
      const formData = new FormData();
      formData.append('file', file);
      
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 10;
        });
      }, 100);
      
      try {
        const response = await apiRequest('POST', '/api/upload', formData);
        clearInterval(progressInterval);
        setUploadProgress(100);
        setUploadPhase('processing');
        
        return response.json();
      } catch (error) {
        clearInterval(progressInterval);
        setUploadPhase('idle');
        setUploadProgress(0);
        throw error;
      }
    },
    onSuccess: () => {
      setTimeout(() => {
        setUploadPhase('idle');
        setUploadProgress(0);
      }, 2000);
      
      toast({
        title: "Upload Successful",
        description: "File uploaded successfully and is being processed",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/uploads'] });
    },
    onError: (error: Error) => {
      setUploadPhase('idle');
      setUploadProgress(0);
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast({
        title: "Invalid File Type",
        description: "Please select an Excel file (.xlsx or .xls)",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "File size must be less than 50MB",
        variant: "destructive",
      });
      return;
    }

    uploadMutation.mutate(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload New Data</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragOver 
                ? 'border-primary bg-primary/5' 
                : 'border-slate-300 hover:border-primary/40'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="mb-4">
              {uploadPhase === 'uploading' ? (
                <Loader2 className="mx-auto h-12 w-12 text-blue-500 animate-spin" />
              ) : uploadPhase === 'processing' ? (
                <FileCheck className="mx-auto h-12 w-12 text-green-500" />
              ) : (
                <CloudUpload className="mx-auto h-12 w-12 text-slate-400" />
              )}
            </div>
            
            {uploadPhase !== 'idle' && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    {uploadPhase === 'uploading' ? 'Uploading...' : 'Processing...'}
                  </span>
                  <span className="text-sm text-slate-500">
                    {Math.round(uploadProgress)}%
                  </span>
                </div>
                <Progress value={uploadProgress} className="w-full" />
                {uploadPhase === 'processing' && (
                  <p className="text-xs text-slate-500 mt-2">
                    File uploaded successfully, processing data...
                  </p>
                )}
              </div>
            )}
            
            {uploadPhase === 'idle' && (
              <>
                <p className="text-slate-600 mb-2">Drop your Excel file here or</p>
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                >
                  Choose File
                </Button>
                <p className="text-sm text-slate-500 mt-3">
                  Supports .xlsx, .xls files up to 50MB
                </p>
              </>
            )}
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="validate-duplicates"
                checked={uploadSettings.validateDuplicates}
                onCheckedChange={(checked) =>
                  setUploadSettings(prev => ({ ...prev, validateDuplicates: Boolean(checked) }))
                }
              />
              <Label htmlFor="validate-duplicates" className="text-sm">
                Validate for duplicates
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="require-geolocation"
                checked={uploadSettings.requireGeolocation}
                onCheckedChange={(checked) =>
                  setUploadSettings(prev => ({ ...prev, requireGeolocation: Boolean(checked) }))
                }
              />
              <Label htmlFor="require-geolocation" className="text-sm">
                Require geolocation data
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="auto-notify"
                checked={uploadSettings.autoNotify}
                onCheckedChange={(checked) =>
                  setUploadSettings(prev => ({ ...prev, autoNotify: Boolean(checked) }))
                }
              />
              <Label htmlFor="auto-notify" className="text-sm">
                Notify contributors of new data
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
