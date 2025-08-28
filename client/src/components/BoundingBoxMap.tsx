import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";

interface BoundingBoxMapProps {
  north: number;
  south: number;
  east: number;
  west: number;
  className?: string;
}

export function BoundingBoxMap({ north, south, east, west, className = "" }: BoundingBoxMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    // Dynamically import Leaflet to avoid SSR issues
    const initializeMap = async () => {
      if (typeof window === 'undefined' || !mapRef.current) return;

      const L = await import('leaflet');
      
      // Clear existing map if it exists
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      // Calculate center point
      const centerLat = (north + south) / 2;
      const centerLng = (east + west) / 2;

      // Create map centered on the bounding box
      const map = L.map(mapRef.current, {
        center: [centerLat, centerLng],
        zoom: 9,
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
        dragging: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false
      });

      mapInstanceRef.current = map;

      // Add tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map);

      // Create bounding box rectangle
      const bounds = L.latLngBounds(
        L.latLng(south, west), // Southwest corner
        L.latLng(north, east)  // Northeast corner
      );

      // Add rectangle to show the bounding box
      L.rectangle(bounds, {
        color: '#3b82f6',
        weight: 2,
        fillColor: '#3b82f6',
        fillOpacity: 0.2
      }).addTo(map);

      // Fit map to bounding box with some padding
      map.fitBounds(bounds, { padding: [10, 10] });
    };

    initializeMap();

    // Cleanup on unmount
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [north, south, east, west]);

  return (
    <Card className={`overflow-hidden ${className}`}>
      <div 
        ref={mapRef} 
        className="w-full h-32 bg-slate-100"
        style={{ minHeight: '128px' }}
      />
      <div className="p-2 bg-slate-50 text-xs text-slate-600 text-center">
        Study Area: {Math.abs(north - south).toFixed(3)}° × {Math.abs(east - west).toFixed(3)}°
      </div>
    </Card>
  );
}