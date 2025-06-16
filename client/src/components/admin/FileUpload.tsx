import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CloudUpload, FileCheck, Loader2, Database, BarChart3, StopCircle } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface UploadState {
  uploadProgress: number;
  uploadPhase: 'idle' | 'uploading' | 'processing';
  processingProgress: number;
  processingPhase: string;
  processingMessage: string;
  batchInfo: any;
  uploadId: number | null;
}

const UPLOAD_STATE_KEY = 'mycomap_upload_state';

export function FileUpload() {
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'processing'>('idle');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingPhase, setProcessingPhase] = useState('');
  const [processingMessage, setProcessingMessage] = useState('');
  const [batchInfo, setBatchInfo] = useState<any>(null);
  const [uploadId, setUploadId] = useState<number | null>(null);
  const [restoredFromCache, setRestoredFromCache] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load upload state from localStorage on component mount
  useEffect(() => {
    const savedState = localStorage.getItem(UPLOAD_STATE_KEY);
    if (savedState) {
      try {
        const state: UploadState = JSON.parse(savedState);
        setUploadProgress(state.uploadProgress);
        setUploadPhase(state.uploadPhase);
        setProcessingProgress(state.processingProgress);
        setProcessingPhase(state.processingPhase);
        setProcessingMessage(state.processingMessage);
        setBatchInfo(state.batchInfo);
        setUploadId(state.uploadId);
        setRestoredFromCache(true);
        
        // Show notification about restored progress
        if (state.uploadPhase !== 'idle') {
          toast({
            title: "Upload Progress Restored",
            description: "Continuing from where you left off",
            duration: 3000,
          });
        }
      } catch (error) {
        console.error('Error loading upload state:', error);
        localStorage.removeItem(UPLOAD_STATE_KEY);
      }
    }
  }, []);

  // Save upload state to localStorage whenever it changes
  const saveUploadState = (state: Partial<UploadState>) => {
    const currentState: UploadState = {
      uploadProgress,
      uploadPhase,
      processingProgress,
      processingPhase,
      processingMessage,
      batchInfo,
      uploadId,
      ...state
    };
    
    if (currentState.uploadPhase === 'idle') {
      localStorage.removeItem(UPLOAD_STATE_KEY);
    } else {
      localStorage.setItem(UPLOAD_STATE_KEY, JSON.stringify(currentState));
    }
  };

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
      saveUploadState({ 
        uploadPhase: 'idle', 
        uploadProgress: 0, 
        processingProgress: 0, 
        processingPhase: '', 
        processingMessage: '', 
        batchInfo: null, 
        uploadId: null 
      });
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
          
          // Save progress to localStorage
          saveUploadState({
            processingProgress: data.progress,
            processingPhase: data.phase,
            processingMessage: data.message,
            batchInfo: data.batchInfo
          });
          
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
              saveUploadState({ 
                uploadPhase: 'idle', 
                uploadProgress: 0, 
                processingProgress: 0, 
                processingPhase: '', 
                processingMessage: '', 
                batchInfo: null, 
                uploadId: null 
              });
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
      
      // Save initial upload state
      saveUploadState({
        uploadPhase: 'uploading',
        uploadProgress: 0,
        processingProgress: 0,
        processingPhase: '',
        processingMessage: '',
        batchInfo: null
      });
      
      const formData = new FormData();
      formData.append('file', file);
      
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) return prev;
          const newProgress = prev + Math.random() * 10;
          saveUploadState({ uploadProgress: newProgress });
          return newProgress;
        });
      }, 100);
      
      try {
        const response = await apiRequest('POST', '/api/upload', formData);
        clearInterval(progressInterval);
        setUploadProgress(100);
        
        const result = await response.json();
        setUploadId(result.uploadId);
        setUploadPhase('processing');
        
        // Save processing state
        saveUploadState({
          uploadProgress: 100,
          uploadId: result.uploadId,
          uploadPhase: 'processing'
        });
        
        return result;
      } catch (error) {
        clearInterval(progressInterval);
        setUploadPhase('idle');
        setUploadProgress(0);
        // Clear localStorage on error
        localStorage.removeItem(UPLOAD_STATE_KEY);
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
      // Clear localStorage on error
      localStorage.removeItem(UPLOAD_STATE_KEY);
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
                        {restoredFromCache && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                            Restored
                          </span>
                        )}
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
                          <span className="font-medium">
                            {(batchInfo.insertedCount || batchInfo.processedRecords || 0).toLocaleString()} / {batchInfo.totalRecords?.toLocaleString()}
                          </span>
                        </div>
                        {batchInfo.avgTimePerRecord && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">Processing Speed:</span>
                            <span className="font-medium">{batchInfo.avgTimePerRecord}ms per record</span>
                          </div>
                        )}
                        {batchInfo.updatedCount !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">Records Updated:</span>
                            <span className="font-medium text-green-600">{batchInfo.updatedCount.toLocaleString()}</span>
                          </div>
                        )}
                        {batchInfo.inatLookups !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">API Lookups:</span>
                            <span className="font-medium text-blue-600">{batchInfo.inatLookups.toLocaleString()}</span>
                          </div>
                        )}
                        {batchInfo.estimatedTimeRemaining && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">Time Remaining:</span>
                            <span className="font-medium text-orange-600">{batchInfo.estimatedTimeRemaining}s</span>
                          </div>
                        )}
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
                      {processingPhase === 'classification-updates' && (
                        <p>• Running automated genus-based taxonomy completion with iNaturalist API fallback</p>
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
