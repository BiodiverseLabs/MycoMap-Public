import { useEffect, useRef } from 'react';
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
  const mapInstanceRef = useRef<L.Map | null>(null);
  const heatLayerRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Create map instance if it doesn't exist
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        center: [39.8283, -98.5795], // Center of US
        zoom: 4,
        zoomControl: true,
      });

      // Add tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(mapInstanceRef.current);
    }

    // Filter observations with valid coordinates
    const validObservations = observations.filter(obs => 
      obs.latitude && obs.longitude && 
      !isNaN(parseFloat(obs.latitude)) && !isNaN(parseFloat(obs.longitude))
    );

    console.log(`[ContributorMap] Processing ${validObservations.length} valid observations out of ${observations.length} total`);

    if (validObservations.length === 0) {
      // Clear existing layers if no data
      if (heatLayerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      return;
    }

    // Create heatmap data
    const heatData = validObservations.map(obs => [
      parseFloat(obs.latitude),
      parseFloat(obs.longitude),
      1 // weight
    ]);

    // Remove existing heat layer
    if (heatLayerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(heatLayerRef.current);
    }

    // Add new heat layer
    if (window.L && (window.L as any).heatLayer) {
      heatLayerRef.current = (window.L as any).heatLayer(heatData, {
        radius: 20,
        blur: 15,
        maxZoom: 10,
        gradient: {
          0.0: '#3388ff',
          0.2: '#44bb44',
          0.4: '#ffbb44',
          0.6: '#ff8844',
          0.8: '#ff4444',
          1.0: '#cc2244'
        }
      }).addTo(mapInstanceRef.current);

      // Fit map to bounds of observations
      if (validObservations.length > 0) {
        const bounds = L.latLngBounds(
          validObservations.map(obs => [parseFloat(obs.latitude), parseFloat(obs.longitude)])
        );
        mapInstanceRef.current.fitBounds(bounds, { padding: [20, 20] });
      }
    } else {
      // Fallback to markers if heatmap plugin not available
      const markers: L.Marker[] = [];
      
      validObservations.forEach(obs => {
        if (mapInstanceRef.current) {
          const marker = L.marker([parseFloat(obs.latitude), parseFloat(obs.longitude)])
            .bindPopup(`
              <div>
                <strong>${obs.scientificName}</strong><br>
                ${obs.state}<br>
                ${obs.observedOn}
              </div>
            `);
          marker.addTo(mapInstanceRef.current);
          markers.push(marker);
        }
      });

      // Fit map to markers
      if (markers.length > 0 && mapInstanceRef.current) {
        const group = new L.FeatureGroup(markers);
        mapInstanceRef.current.fitBounds(group.getBounds(), { padding: [20, 20] });
      }
    }

  }, [observations]);

  useEffect(() => {
    // Load heatmap plugin
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/leaflet.heat@0.2.0/dist/leaflet-heat.js';
    script.async = true;
    document.head.appendChild(script);

    return () => {
      // Cleanup map on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div 
      ref={mapRef} 
      className="w-full h-full rounded-md border border-slate-200"
      style={{ minHeight: '384px' }}
    />
  );
}