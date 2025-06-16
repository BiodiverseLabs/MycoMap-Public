import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CloudUpload, FileCheck, Loader2, Database, BarChart3, StopCircle } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export function FileUpload() {
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'processing'>('idle');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingPhase, setProcessingPhase] = useState('');
  const [processingMessage, setProcessingMessage] = useState('');
  const [batchInfo, setBatchInfo] = useState<any>(null);
  const [uploadId, setUploadId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Stop processing mutation
  const stopProcessingMutation = useMutation({
    mutationFn: async (uploadId: number) => {
      const response = await apiRequest('POST', `/api/upload/stop/${uploadId}`);
      return response.json();
    },
    onSuccess: () => {
      setUploadPhase('idle');
      setUploadProgress(0);
      setProcessingProgress(0);
      setProcessingPhase('');
      setProcessingMessage('');
      setBatchInfo(null);
      setUploadId(null);
      toast({
        title: "Processing Stopped",
        description: "Data processing has been cancelled",
        variant: "destructive",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Stop Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleStopProcessing = () => {
    if (uploadId && uploadPhase === 'processing') {
      stopProcessingMutation.mutate(uploadId);
    }
  };

  // SSE connection for processing progress
  useEffect(() => {
    if (uploadId && uploadPhase === 'processing') {
      const eventSource = new EventSource(`/api/upload/progress/${uploadId}`);
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setProcessingProgress(data.progress);
          setProcessingPhase(data.phase);
          setProcessingMessage(data.message);
          setBatchInfo(data.batchInfo);
          
          if (data.phase === 'completed' && data.progress >= 100) {
            eventSource.close();
            setTimeout(() => {
              setUploadPhase('idle');
              setUploadProgress(0);
              setProcessingProgress(0);
              setProcessingPhase('');
              setProcessingMessage('');
              setBatchInfo(null);
              setUploadId(null);
            }, 3000);
          }
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        eventSource.close();
      };
      
      return () => {
        eventSource.close();
      };
    }
  }, [uploadId, uploadPhase]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploadPhase('uploading');
      setUploadProgress(0);
      setProcessingProgress(0);
      setProcessingPhase('');
      setProcessingMessage('');
      setBatchInfo(null);
      
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
        
        const result = await response.json();
        setUploadId(result.uploadId);
        setUploadPhase('processing');
        
        return result;
      } catch (error) {
        clearInterval(progressInterval);
        setUploadPhase('idle');
        setUploadProgress(0);
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Upload Successful",
        description: "File uploaded successfully and is being processed",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/uploads'] });
    },
    onError: (error: Error) => {
      setUploadPhase('idle');
      setUploadProgress(0);
      setProcessingProgress(0);
      setProcessingPhase('');
      setProcessingMessage('');
      setBatchInfo(null);
      setUploadId(null);
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
              <div className="mb-4 space-y-3">
                {/* Upload Progress */}
                {uploadPhase === 'uploading' && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Uploading file...
                      </span>
                      <span className="text-sm text-slate-500">
                        {Math.round(uploadProgress)}%
                      </span>
                    </div>
                    <Progress value={uploadProgress} className="w-full" />
                  </div>
                )}

                {/* Processing Progress */}
                {uploadPhase === 'processing' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium flex items-center gap-2">
                        {processingPhase === 'completed' ? (
                          <FileCheck className="w-4 h-4 text-green-500" />
                        ) : processingPhase === 'post-processing' ? (
                          <BarChart3 className="w-4 h-4 text-blue-500" />
                        ) : (
                          <Database className="w-4 h-4 text-orange-500" />
                        )}
                        {processingPhase === 'completed' ? 'Processing Complete!' : 'Processing data...'}
                      </span>
                      <span className="text-sm text-slate-500">
                        {Math.round(processingProgress)}%
                      </span>
                    </div>
                    <Progress value={processingProgress} className="w-full" />
                    
                    {/* Stop Processing Button */}
                    {processingPhase !== 'completed' && (
                      <div className="flex justify-center">
                        <Button
                          onClick={handleStopProcessing}
                          disabled={stopProcessingMutation.isPending}
                          variant="destructive"
                          size="sm"
                          className="flex items-center gap-2"
                        >
                          {stopProcessingMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <StopCircle className="w-4 h-4" />
                          )}
                          {stopProcessingMutation.isPending ? 'Stopping...' : 'Stop Processing'}
                        </Button>
                      </div>
                    )}
                    
                    {processingMessage && (
                      <p className="text-xs text-slate-600 font-medium">
                        {processingMessage}
                      </p>
                    )}

                    {/* Detailed batch information */}
                    {batchInfo && (
                      <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Current Batch:</span>
                          <span className="font-medium">{batchInfo.currentBatch} / {batchInfo.totalBatches}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Records Processed:</span>
                          <span className="font-medium">{batchInfo.insertedCount?.toLocaleString()} / {batchInfo.totalRecords?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Processing Speed:</span>
                          <span className="font-medium">{batchInfo.avgTimePerRecord}ms per record</span>
                        </div>
                      </div>
                    )}

                    {/* Phase descriptions */}
                    <div className="text-xs text-slate-500 space-y-1">
                      {processingPhase === 'initializing' && (
                        <p>• Preparing incremental data upload (preserving existing records)</p>
                      )}
                      {processingPhase === 'reading' && (
                        <p>• Loading and parsing Excel file data</p>
                      )}
                      {processingPhase === 'processing' && (
                        <p>• Transforming and validating observation records</p>
                      )}
                      {processingPhase === 'inserting' && (
                        <p>• Inserting observations into database in optimized batches</p>
                      )}
                      {processingPhase === 'post-processing' && (
                        <p>• Building indexes, updating statistics, and running classification updates</p>
                      )}
                      {processingPhase === 'completed' && (
                        <p className="text-green-600 font-medium">• All data processing completed successfully!</p>
                      )}
                    </div>
                  </div>
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


    </div>
  );
}
