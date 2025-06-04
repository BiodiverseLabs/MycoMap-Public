import { useEffect, useRef, useState } from 'react';
import { FullscreenModal, FullscreenButton } from '@/components/ui/fullscreen-modal';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Observation {
  id: number;
  latitude: string;
  longitude: string;
  scientificName: string;
  state: string;
  observedOn: string;
}

interface ContributorMapProps {
  observations: Observation[];
}

export function ContributorMap({ observations }: ContributorMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const fullscreenMapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const fullscreenMapInstanceRef = useRef<L.Map | null>(null);
  const heatLayerRef = useRef<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Function to create and initialize a map instance
  const createMapInstance = async (container: HTMLDivElement, mapInstance: React.MutableRefObject<L.Map | null>) => {
    // Load heatmap plugin first
    if (!(window as any).L || !(window as any).L.heatLayer) {
      await new Promise<void>((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
        script.onload = () => resolve();
        script.onerror = () => resolve(); // Continue even if it fails
        document.head.appendChild(script);
        
        // Timeout fallback
        setTimeout(resolve, 2000);
      });
    }

    // Clean up existing map
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    // Create new map instance
    mapInstance.current = L.map(container).setView([39.8283, -98.5795], 4);

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(mapInstance.current);

    // Filter observations with valid coordinates
    const validObservations = observations.filter(obs => 
      obs.latitude && obs.longitude && 
      !isNaN(parseFloat(obs.latitude)) && !isNaN(parseFloat(obs.longitude))
    );

    console.log(`[ContributorMap] Processing ${validObservations.length} valid observations out of ${observations.length} total`);

    if (validObservations.length === 0) {
      return;
    }

    // Create heatmap data
    const heatData = validObservations.map(obs => [
      parseFloat(obs.latitude),
      parseFloat(obs.longitude),
      0.8 // weight
    ]);

    // Add new heat layer - wait a bit for plugin to load
    setTimeout(() => {
      if (mapInstance.current && (window as any).L && (window as any).L.heatLayer) {
        (window as any).L.heatLayer(heatData, {
          radius: 22,
          blur: 12,
          maxZoom: 17,
          max: 0.8,
          minOpacity: 0.2,
          gradient: {
            0.0: 'rgba(0, 0, 255, 0.3)',     // Slightly more visible blue
            0.2: 'rgba(0, 255, 255, 0.5)',   // Cyan
            0.4: 'rgba(0, 255, 0, 0.6)',     // Green
            0.6: 'rgba(255, 255, 0, 0.7)',   // Yellow
            0.8: 'rgba(255, 165, 0, 0.8)',   // Orange
            1.0: 'rgba(255, 0, 0, 0.9)'      // Moderately bold red
          }
        }).addTo(mapInstance.current);

        // Fit map to bounds of observations
        if (validObservations.length > 0 && mapInstance.current) {
          const bounds = L.latLngBounds(
            validObservations.map(obs => [parseFloat(obs.latitude), parseFloat(obs.longitude)])
          );
          mapInstance.current.fitBounds(bounds, { padding: [20, 20] });
        }
      } else {
        // Fallback to markers if heatmap plugin not available
        const markers: L.Marker[] = [];
        
        validObservations.forEach(obs => {
          if (mapInstance.current) {
            const marker = L.marker([parseFloat(obs.latitude), parseFloat(obs.longitude)])
              .bindPopup(`
                <div>
                  <strong>${obs.scientificName}</strong><br>
                  ${obs.state}<br>
                  ${obs.observedOn}
                </div>
              `);
            marker.addTo(mapInstance.current);
            markers.push(marker);
          }
        });

        // Fit map to markers
        if (markers.length > 0 && mapInstance.current) {
          const group = new L.FeatureGroup(markers);
          mapInstance.current.fitBounds(group.getBounds(), { padding: [20, 20] });
        }
      }
    }, 500); // Small delay to ensure plugin is loaded
  };

  useEffect(() => {
    if (!mapRef.current) return;
    createMapInstance(mapRef.current, mapInstanceRef);
  }, [observations]);

  useEffect(() => {
    if (!fullscreenMapRef.current || !isFullscreen) return;
    createMapInstance(fullscreenMapRef.current, fullscreenMapInstanceRef);
  }, [isFullscreen, observations]);

  useEffect(() => {
    // Load heatmap plugin
    const loadHeatPlugin = async () => {
      if (!(window as any).L || !(window as any).L.heatLayer) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
        document.head.appendChild(script);
        
        return new Promise<void>((resolve) => {
          script.onload = () => resolve();
          script.onerror = () => resolve();
          // Also resolve after timeout to prevent hanging
          setTimeout(resolve, 3000);
        });
      }
    };

    loadHeatPlugin();

    return () => {
      // Cleanup map on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <div className="relative">
        <div 
          ref={mapRef} 
          className="w-full h-full rounded-md border border-slate-200"
          style={{ minHeight: '384px' }}
        />
        <FullscreenButton 
          onClick={() => setIsFullscreen(true)}
          className="absolute top-2 right-2 z-[1001]"
        />
      </div>

      <FullscreenModal
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        title="Contributor Heatmap - Fullscreen"
      >
        <div 
          ref={fullscreenMapRef} 
          className="w-full h-full"
        />
      </FullscreenModal>
    </>
  );
}