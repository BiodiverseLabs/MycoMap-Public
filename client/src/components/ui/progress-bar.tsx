import React, { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface ProgressData {
  type: string;
  stage: string;
  current: number;
  total: number;
  message: string;
}

interface INaturalistProgressBarProps {
  onComplete?: () => void;
}

export function INaturalistProgressBar({ onComplete }: INaturalistProgressBarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);

  useEffect(() => {
    // Connect to WebSocket on specific path
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/progress`;
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('[WebSocket] Connected to progress updates');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ProgressData;
        
        if (data.type === 'inat-caching-progress') {
          setProgress(data);
          setIsVisible(true);
          
          // Hide progress bar when completed
          if (data.stage === 'completed') {
            setTimeout(() => {
              setIsVisible(false);
              setProgress(null);
              if (onComplete) {
                onComplete();
              }
            }, 2000); // Show completion for 2 seconds
          }
        }
      } catch (error) {
        console.error('[WebSocket] Error parsing message:', error);
      }
    };

    ws.onclose = () => {
      console.log('[WebSocket] Disconnected from progress updates');
    };

    ws.onerror = (error) => {
      console.error('[WebSocket] Connection error:', error);
    };

    return () => {
      ws.close();
    };
  }, [onComplete]);

  if (!isVisible || !progress) {
    return null;
  }

  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  
  return (
    <Card className="fixed bottom-4 right-4 z-50 w-96 shadow-lg border-2 border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          {progress.stage !== 'completed' ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
              <div className="h-2 w-2 bg-white rounded-full" />
            </div>
          )}
          <h3 className="font-semibold text-sm">
            {progress.stage === 'fetching' && 'Fetching iNaturalist Data'}
            {progress.stage === 'caching' && 'Caching to Database'}
            {progress.stage === 'completed' && 'Caching Complete!'}
          </h3>
        </div>
        
        <div className="space-y-3">
          <Progress value={percentage} className="h-2" />
          
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress.current.toLocaleString()} / {progress.total.toLocaleString()}</span>
            <span>{percentage}%</span>
          </div>
          
          <p className="text-xs text-muted-foreground leading-relaxed">
            {progress.message}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}