import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, Calendar as CalendarIcon, Search, Loader2, Activity, Eye, Route, Timer, Flame, Info, Settings, CircleDot, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { format, differenceInMinutes, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface FitnessObservation {
  id: number;
  latitude: string;
  longitude: string;
  scientificName: string;
  commonName: string;
  observedOn: string;
  timeObserved: string;
  photoUrl: string | null;
}

interface ProcessedObservation extends FitnessObservation {
  observationNumber: number;
  dateTime: Date;
  distanceFromPrevious: number;
  speedMph: number | null;
  locationId: number;
  isNewLocation: boolean;
}

const LOCATION_COLORS = [
  '#8CBD45', '#A87146', '#3B82F6', '#EF4444', '#8B5CF6', 
  '#F59E0B', '#10B981', '#EC4899', '#06B6D4', '#84CC16'
];

const NEW_LOCATION_DISTANCE_THRESHOLD = 1; // miles - if distance >= 1 mile, it's a new location

interface OutingSummary {
  date: string;
  observations: ProcessedObservation[];
  totalDistance: number;
  totalTimeMinutes: number;
  avgSpeedMph: number | null;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const CALORIES_PER_SQUAT = 0.32;
const SQUATS_PER_OBSERVATION = 2;
const DEFAULT_WALKING_SPEED = 1; // mph

interface LocationPoint {
  lat: number;
  lng: number;
  type: 'start' | 'end';
  locationId: number;
}

export default function FitnessTracker() {
  const [username, setUsername] = useState("");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [isSearching, setIsSearching] = useState(false);
  const [observations, setObservations] = useState<FitnessObservation[]>([]);
  const [processedObservations, setProcessedObservations] = useState<ProcessedObservation[]>([]);
  const [outings, setOutings] = useState<OutingSummary[]>([]);
  const [showCaloriesDialog, setShowCaloriesDialog] = useState(false);
  const [showLocationsDialog, setShowLocationsDialog] = useState(false);
  const [locationPoints, setLocationPoints] = useState<LocationPoint[]>([]);
  const [mapClickMode, setMapClickMode] = useState<{ type: 'start' | 'end'; locationId: number } | null>(null);
  const [outlierIds, setOutlierIds] = useState<number[]>([]);
  const [outlierRemoveMode, setOutlierRemoveMode] = useState(false);
  
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const locationPointMarkersRef = useRef<L.Marker[]>([]);
  const locationPointLinesRef = useRef<L.Polyline[]>([]);
  const { toast } = useToast();

  // Filter out outliers for calculations
  const activeObservations = processedObservations.filter(o => !outlierIds.includes(o.id));
  const outlierObservations = processedObservations.filter(o => outlierIds.includes(o.id));
  
  const totalObservations = activeObservations.length;
  const totalLocations = activeObservations.length > 0 
    ? Math.max(...activeObservations.map(o => o.locationId)) + 1 
    : 0;
  
  // Calculate extra distance from location points (start/end points)
  const calculateLocationPointsDistance = () => {
    let extraDistance = 0;
    for (let locId = 0; locId < totalLocations; locId++) {
      const locObs = activeObservations.filter(o => o.locationId === locId);
      if (locObs.length === 0) continue;
      
      const startPoint = locationPoints.find(p => p.locationId === locId && p.type === 'start');
      const endPoint = locationPoints.find(p => p.locationId === locId && p.type === 'end');
      
      if (startPoint) {
        const firstObs = locObs[0];
        extraDistance += haversineDistance(startPoint.lat, startPoint.lng, parseFloat(firstObs.latitude), parseFloat(firstObs.longitude));
      }
      if (endPoint) {
        const lastObs = locObs[locObs.length - 1];
        extraDistance += haversineDistance(parseFloat(lastObs.latitude), parseFloat(lastObs.longitude), endPoint.lat, endPoint.lng);
      }
    }
    return extraDistance;
  };
  
  const locationPointsDistance = calculateLocationPointsDistance();
  const baseDistance = outings.reduce((sum, o) => sum + o.totalDistance, 0);
  const totalMiles = baseDistance + locationPointsDistance;
  
  // Calculate time per location (sum of time spent at each location, not first-to-last across all)
  const calculateLocationBasedTime = () => {
    let totalTime = 0;
    for (let locId = 0; locId < totalLocations; locId++) {
      const locObs = activeObservations.filter(o => o.locationId === locId);
      if (locObs.length < 2) continue;
      const firstObs = locObs[0].dateTime;
      const lastObs = locObs[locObs.length - 1].dateTime;
      totalTime += differenceInMinutes(lastObs, firstObs);
    }
    return totalTime;
  };
  
  // Calculate time including location points (at default walking speed)
  const locationPointsMinutes = (locationPointsDistance / DEFAULT_WALKING_SPEED) * 60;
  const baseMinutes = calculateLocationBasedTime();
  const totalMinutes = baseMinutes + locationPointsMinutes;
  
  const avgSpeedMph = totalMiles > 0 && totalMinutes > 0 ? (totalMiles / totalMinutes) * 60 : null;
  const totalSquats = totalObservations * SQUATS_PER_OBSERVATION;
  const squatCalories = Math.round(totalSquats * CALORIES_PER_SQUAT);
  const walkingCalories = Math.round(3.5 * 72.6 * (totalMinutes / 60)); // 3.5 MET, 160 lb person (72.6 kg)
  const totalCalories = squatCalories + walkingCalories;

  useEffect(() => {
    if (processedObservations.length > 0 && mapRef.current) {
      initializeMap(processedObservations);
    }
  }, [processedObservations]);

  // Update location point markers without reinitializing the whole map
  useEffect(() => {
    if (!mapInstanceRef.current || processedObservations.length === 0) return;
    updateLocationPointMarkers(processedObservations);
  }, [locationPoints]);

  // Handle map click mode
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!mapClickMode) return;
      
      const newPoint: LocationPoint = {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        type: mapClickMode.type,
        locationId: mapClickMode.locationId,
      };
      
      // Remove existing point of same type and location
      setLocationPoints(prev => [
        ...prev.filter(p => !(p.type === newPoint.type && p.locationId === newPoint.locationId)),
        newPoint
      ]);
      
      toast({
        title: `${mapClickMode.type === 'start' ? 'Start' : 'End'} Point Added`,
        description: `Location ${mapClickMode.locationId + 1} ${mapClickMode.type} point set`
      });
      
      setMapClickMode(null);
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [mapClickMode, toast]);

  useEffect(() => {
    if (observations.length > 0) {
      processObservations(observations);
    }
  }, [observations]);

  const processObservations = (obs: FitnessObservation[]) => {
    const sorted = [...obs].sort((a, b) => {
      const dateA = new Date(`${a.observedOn}T${a.timeObserved || '00:00:00'}`);
      const dateB = new Date(`${b.observedOn}T${b.timeObserved || '00:00:00'}`);
      return dateA.getTime() - dateB.getTime();
    });

    let currentLocationId = 0;
    const processed: ProcessedObservation[] = sorted.map((o, index) => {
      const dateTime = new Date(`${o.observedOn}T${o.timeObserved || '00:00:00'}`);
      let distanceFromPrevious = 0;
      let speedMph: number | null = null;
      let isNewLocation = index === 0;

      if (index > 0) {
        const prev = sorted[index - 1];
        const prevDateTime = new Date(`${prev.observedOn}T${prev.timeObserved || '00:00:00'}`);
        const rawDistance = haversineDistance(
          parseFloat(prev.latitude),
          parseFloat(prev.longitude),
          parseFloat(o.latitude),
          parseFloat(o.longitude)
        );
        const timeDiffMinutes = differenceInMinutes(dateTime, prevDateTime);
        if (rawDistance > 0 && timeDiffMinutes > 0) {
          speedMph = (rawDistance / timeDiffMinutes) * 60;
        }
        
        // If distance >= 1 mile, this is a new location
        if (rawDistance >= NEW_LOCATION_DISTANCE_THRESHOLD) {
          isNewLocation = true;
          currentLocationId++;
          distanceFromPrevious = 0; // Don't count travel distance
        } else {
          distanceFromPrevious = rawDistance;
        }
      }

      return {
        ...o,
        observationNumber: index + 1,
        dateTime,
        distanceFromPrevious,
        speedMph,
        locationId: currentLocationId,
        isNewLocation,
      };
    });

    setProcessedObservations(processed);

    const outingMap = new Map<string, ProcessedObservation[]>();
    processed.forEach(p => {
      const dateKey = p.observedOn;
      if (!outingMap.has(dateKey)) {
        outingMap.set(dateKey, []);
      }
      outingMap.get(dateKey)!.push(p);
    });

    const summaries: OutingSummary[] = Array.from(outingMap.entries()).map(([date, dayObs]) => {
      // Only count walking distances (not travel between locations)
      const totalDistance = dayObs.reduce((sum, o) => sum + o.distanceFromPrevious, 0);
      const firstObs = dayObs[0].dateTime;
      const lastObs = dayObs[dayObs.length - 1].dateTime;
      const totalTimeMinutes = differenceInMinutes(lastObs, firstObs);
      const avgSpeedMph = totalDistance > 0 && totalTimeMinutes > 0 ? (totalDistance / totalTimeMinutes) * 60 : null;

      return { date, observations: dayObs, totalDistance, totalTimeMinutes, avgSpeedMph };
    });

    setOutings(summaries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };

  const initializeMap = (obs: ProcessedObservation[]) => {
    if (!mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    const map = L.map(mapRef.current).setView([39.8283, -98.5795], 4);
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    if (obs.length === 0) return;

    const bounds = L.latLngBounds([]);

    // Group observations by location for drawing separate polylines
    const locationSegments = new Map<number, ProcessedObservation[]>();
    obs.forEach(o => {
      if (!locationSegments.has(o.locationId)) {
        locationSegments.set(o.locationId, []);
      }
      locationSegments.get(o.locationId)!.push(o);
    });

    // Draw polylines for each location segment (only within same location)
    locationSegments.forEach((segment, locationId) => {
      if (segment.length > 1) {
        const latlngs = segment
          .map(o => [parseFloat(o.latitude), parseFloat(o.longitude)] as [number, number])
          .filter(ll => !isNaN(ll[0]) && !isNaN(ll[1]));
        const color = LOCATION_COLORS[locationId % LOCATION_COLORS.length];
        L.polyline(latlngs, { color, weight: 3, opacity: 0.7 }).addTo(map);
      }
    });

    // Add markers with location-colored backgrounds
    obs.forEach((o) => {
      const lat = parseFloat(o.latitude);
      const lng = parseFloat(o.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const color = LOCATION_COLORS[o.locationId % LOCATION_COLORS.length];
      const numberedIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 11px;">${o.observationNumber}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([lat, lng], { icon: numberedIcon }).addTo(map);
      marker.bindPopup(`
        <div style="min-width: 200px;">
          <strong>#${o.observationNumber}: ${o.scientificName}</strong><br/>
          <small>${o.commonName || ''}</small><br/>
          <small>${format(o.dateTime, 'MMM d, yyyy h:mm a')}</small><br/>
          ${o.isNewLocation ? '<small><em>New Location</em></small><br/>' : ''}
          ${o.distanceFromPrevious > 0 ? `<small>Distance: ${o.distanceFromPrevious.toFixed(2)} mi</small><br/>` : ''}
          ${o.speedMph ? `<small>Speed: ${o.speedMph.toFixed(1)} mph</small>` : ''}
        </div>
      `);
      bounds.extend([lat, lng]);
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
    
    // Add location points after map is initialized
    updateLocationPointMarkers(obs);
  };

  const updateLocationPointMarkers = (obs: ProcessedObservation[]) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing location point markers and lines
    locationPointMarkersRef.current.forEach(m => m.remove());
    locationPointMarkersRef.current = [];
    locationPointLinesRef.current.forEach(l => l.remove());
    locationPointLinesRef.current = [];
    
    locationPoints.forEach(point => {
      const color = LOCATION_COLORS[point.locationId % LOCATION_COLORS.length];
      const isStart = point.type === 'start';
      const pointIcon = L.divIcon({
        className: 'location-point-marker',
        html: `<div style="background-color: ${isStart ? '#22c55e' : '#ef4444'}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid ${color}; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 10px;">${isStart ? 'S' : 'E'}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      
      const marker = L.marker([point.lat, point.lng], { icon: pointIcon }).addTo(map);
      marker.bindPopup(`
        <div>
          <strong>${isStart ? 'Start' : 'End'} Point</strong><br/>
          <small>Location ${point.locationId + 1}</small><br/>
          <small>Walking at ${DEFAULT_WALKING_SPEED} mph</small>
        </div>
      `);
      locationPointMarkersRef.current.push(marker);
      
      // Draw line from start point to first observation or last observation to end point
      const locObs = obs.filter(o => o.locationId === point.locationId);
      if (locObs.length > 0) {
        const targetObs = isStart ? locObs[0] : locObs[locObs.length - 1];
        const lineCoords: [number, number][] = [
          [point.lat, point.lng],
          [parseFloat(targetObs.latitude), parseFloat(targetObs.longitude)]
        ];
        const polyline = L.polyline(lineCoords, { 
          color: isStart ? '#22c55e' : '#ef4444', 
          weight: 2, 
          opacity: 0.8,
          dashArray: '5, 5'
        }).addTo(map);
        locationPointLinesRef.current.push(polyline);
      }
    });
  };

  const formatSpeed = (mph: number | null): string => {
    if (!mph || mph <= 0 || !isFinite(mph)) return '--';
    return `${mph.toFixed(1)} mph`;
  };

  const handleSearch = async () => {
    if (!username.trim()) {
      toast({ title: "Username required", description: "Please enter an iNaturalist username", variant: "destructive" });
      return;
    }
    if (!dateRange.from || !dateRange.to) {
      toast({ title: "Date range required", description: "Please select a date range", variant: "destructive" });
      return;
    }

    setIsSearching(true);
    try {
      const params = new URLSearchParams({
        username: username.trim(),
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd'),
      });

      const response = await fetch(`/api/fitness/observations?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch observations');
      }
      const data = await response.json();
      setObservations(data.observations || []);
      
      if (data.observations?.length === 0) {
        toast({ title: "No observations found", description: "Try adjusting the date range or username" });
      } else {
        toast({ title: "Success", description: `Found ${data.observations.length} observations` });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Activity className="h-8 w-8 text-[#8CBD45]" />
        <h1 className="text-3xl font-bold">Fitness Tracker</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Search Observations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="username">iNaturalist Username</Label>
              <Input
                id="username"
                data-testid="input-username"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[250px]">
              <Label>Date Range</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    data-testid="button-date-range"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button
              onClick={handleSearch}
              disabled={isSearching}
              className="bg-[#8CBD45] hover:bg-[#7AAD35]"
              data-testid="button-search"
            >
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {processedObservations.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <Card 
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setShowLocationsDialog(true)}
              data-testid="card-locations"
            >
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <MapPin className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      Total Locations
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </p>
                    <p className="text-2xl font-bold" data-testid="text-total-locations">{totalLocations}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Eye className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Observations</p>
                    <p className="text-2xl font-bold" data-testid="text-total-observations">{totalObservations}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Route className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Miles</p>
                    <p className="text-2xl font-bold" data-testid="text-total-miles">{totalMiles.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <Timer className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Time</p>
                    <p className="text-2xl font-bold" data-testid="text-total-time">
                      {totalMinutes >= 60 
                        ? `${Math.floor(totalMinutes / 60)}h ${Math.round(totalMinutes % 60)}m`
                        : `${Math.round(totalMinutes)}m`
                      }
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Activity className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Average Speed</p>
                    <p className="text-2xl font-bold" data-testid="text-avg-pace">{formatSpeed(avgSpeedMph)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card 
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setShowCaloriesDialog(true)}
              data-testid="card-calories"
            >
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <Flame className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      Calories Burned
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </p>
                    <p className="text-2xl font-bold" data-testid="text-calories">{totalCalories}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="relative">
            <CardContent className="p-0">
              <div 
                ref={mapRef} 
                className="h-[500px] w-full rounded-lg" 
                style={{ cursor: mapClickMode ? 'crosshair' : undefined }}
                data-testid="map-container" 
              />
              {mapClickMode && (
                <div className="absolute top-2 left-2 right-2 bg-blue-100 border border-blue-300 rounded-lg p-3 flex items-center justify-between z-[500]">
                  <div className="flex items-center gap-2">
                    <CircleDot className={`h-5 w-5 ${mapClickMode.type === 'start' ? 'text-green-500' : 'text-red-500'}`} />
                    <span className="text-sm font-medium">
                      Click on the map to set {mapClickMode.type === 'start' ? 'Start' : 'End'} Point 
                      {totalLocations > 1 ? ` for Location ${mapClickMode.locationId + 1}` : ''}
                    </span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setMapClickMode(null)}
                    data-testid="button-cancel-click-mode"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Observation Log</CardTitle>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-log-settings">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[1000]">
                  <DropdownMenuLabel>Add Points</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {Array.from({ length: totalLocations }).map((_, locId) => (
                    <div key={locId}>
                      {totalLocations > 1 && (
                        <DropdownMenuLabel className="text-xs text-muted-foreground py-1">
                          Location {locId + 1}
                        </DropdownMenuLabel>
                      )}
                      <DropdownMenuItem
                        onClick={() => {
                          setMapClickMode({ type: 'start', locationId: locId });
                          toast({ title: "Click on the map", description: `Click where Location ${locId + 1} started` });
                        }}
                        data-testid={`menu-add-start-${locId}`}
                      >
                        <CircleDot className="h-4 w-4 mr-2 text-green-500" />
                        {totalLocations > 1 ? `Add Start Point ${locId + 1}` : 'Add Start Point'}
                        {locationPoints.find(p => p.locationId === locId && p.type === 'start') && (
                          <span className="ml-2 text-xs text-green-500">✓</span>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setMapClickMode({ type: 'end', locationId: locId });
                          toast({ title: "Click on the map", description: `Click where Location ${locId + 1} ended` });
                        }}
                        data-testid={`menu-add-end-${locId}`}
                      >
                        <CircleDot className="h-4 w-4 mr-2 text-red-500" />
                        {totalLocations > 1 ? `Add End Point ${locId + 1}` : 'Add End Point'}
                        {locationPoints.find(p => p.locationId === locId && p.type === 'end') && (
                          <span className="ml-2 text-xs text-red-500">✓</span>
                        )}
                      </DropdownMenuItem>
                    </div>
                  ))}
                  {locationPoints.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setLocationPoints([])}
                        className="text-destructive"
                        data-testid="menu-clear-points"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Clear All Points
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Outliers</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => setOutlierRemoveMode(!outlierRemoveMode)}
                    data-testid="menu-remove-outlier"
                  >
                    <X className={`h-4 w-4 mr-2 ${outlierRemoveMode ? 'text-red-500' : ''}`} />
                    {outlierRemoveMode ? 'Done Removing Outliers' : 'Remove Outlier'}
                  </DropdownMenuItem>
                  {outlierObservations.map(obs => (
                    <DropdownMenuItem
                      key={obs.id}
                      onClick={() => setOutlierIds(prev => prev.filter(id => id !== obs.id))}
                      data-testid={`menu-restore-outlier-${obs.observationNumber}`}
                    >
                      <CircleDot className="h-4 w-4 mr-2 text-green-500" />
                      Restore Outlier {obs.observationNumber}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[12px] p-0"></TableHead>
                    <TableHead className="w-[60px]">#</TableHead>
                    <TableHead>Species</TableHead>
                    <TableHead>Date-Time</TableHead>
                    <TableHead className="text-right">Distance (mi)</TableHead>
                    <TableHead className="text-right">Speed (mph)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedObservations.map((obs, index) => {
                    const color = LOCATION_COLORS[obs.locationId % LOCATION_COLORS.length];
                    const isLastInLocation = index === processedObservations.length - 1 || 
                      processedObservations[index + 1].locationId !== obs.locationId;
                    const isOutlier = outlierIds.includes(obs.id);
                    return (
                      <TableRow 
                        key={obs.id} 
                        data-testid={`row-observation-${obs.id}`}
                        className={isOutlier ? 'opacity-40 line-through' : ''}
                      >
                        <TableCell className="p-0 relative">
                          <div 
                            className="absolute left-0 top-0 bottom-0 w-1"
                            style={{ 
                              backgroundColor: isOutlier ? '#9ca3af' : color,
                              borderRadius: obs.isNewLocation ? '4px 4px 0 0' : isLastInLocation ? '0 0 4px 4px' : '0'
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1">
                            {outlierRemoveMode && !isOutlier && (
                              <button
                                onClick={() => {
                                  setOutlierIds(prev => [...prev, obs.id]);
                                  toast({ title: "Outlier Removed", description: `Observation ${obs.observationNumber} excluded from calculations` });
                                }}
                                className="text-red-500 hover:text-red-700 p-0.5"
                                data-testid={`button-remove-outlier-${obs.observationNumber}`}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                            <div>
                              {obs.isNewLocation && obs.observationNumber > 1 && (
                                <span className="text-xs text-muted-foreground block">New Location</span>
                              )}
                              {obs.observationNumber}
                              {isOutlier && <span className="text-xs text-red-500 ml-1">(outlier)</span>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <a 
                              href={`https://www.inaturalist.org/observations/${obs.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-primary hover:underline"
                              data-testid={`link-observation-${obs.id}`}
                            >
                              {obs.scientificName}
                            </a>
                            {obs.commonName && (
                              <span className="text-muted-foreground ml-2">({obs.commonName})</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{format(obs.dateTime, 'MMM d, yyyy h:mm a')}</TableCell>
                        <TableCell className="text-right">
                          {obs.isNewLocation ? '--' : obs.distanceFromPrevious.toFixed(3)}
                        </TableCell>
                        <TableCell className="text-right">{obs.isNewLocation ? '--' : formatSpeed(obs.speedMph)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={showCaloriesDialog} onOpenChange={setShowCaloriesDialog}>
        <DialogContent className="z-[1000]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-red-500" />
              Calories Burned Calculation
            </DialogTitle>
            <DialogDescription>
              Here's how we calculate your calories burned while foraging:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {/* Walking Calories */}
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Route className="h-4 w-4" />
                Walking Calories
              </p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>Distance Walked:</span>
                  <span className="font-medium text-foreground">{totalMiles.toFixed(2)} miles</span>
                </div>
                <div className="flex justify-between">
                  <span>Time Walking:</span>
                  <span className="font-medium text-foreground">{Math.round(totalMinutes)} min</span>
                </div>
                <div className="flex justify-between">
                  <span>Average Pace:</span>
                  <span className="font-medium text-foreground">{avgSpeedMph ? `${avgSpeedMph.toFixed(1)} mph` : '--'}</span>
                </div>
                <div className="flex justify-between pt-1 border-t">
                  <span>Walking Calories (3.5 MET × 160 lb):</span>
                  <span className="font-medium text-foreground">{walkingCalories}</span>
                </div>
              </div>
            </div>

            {/* Squat Calories */}
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Observation Calories (Squats)
              </p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>Total Observations:</span>
                  <span className="font-medium text-foreground">{totalObservations}</span>
                </div>
                <div className="flex justify-between">
                  <span>Squats per Observation:</span>
                  <span className="font-medium text-foreground">{SQUATS_PER_OBSERVATION}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Squats:</span>
                  <span className="font-medium text-foreground">{totalSquats}</span>
                </div>
                <div className="flex justify-between pt-1 border-t">
                  <span>Squat Calories ({CALORIES_PER_SQUAT} cal each):</span>
                  <span className="font-medium text-foreground">{squatCalories}</span>
                </div>
              </div>
            </div>

            {/* Total */}
            <div className="border-t pt-3">
              <div className="flex justify-between text-lg font-semibold">
                <span>Total Calories Burned:</span>
                <span className="text-red-500">{totalCalories}</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Walking calories based on 3.5 MET (moderate walking pace) for 160 lb person. 
              Observation calories assume bending down (like squats) to photograph specimens.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showLocationsDialog} onOpenChange={setShowLocationsDialog}>
        <DialogContent className="z-[1000] max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-500" />
              Location Breakdown
            </DialogTitle>
            <DialogDescription>
              Summary statistics for each location visited:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4 max-h-[60vh] overflow-y-auto">
            {Array.from({ length: totalLocations }).map((_, locId) => {
              const locObs = activeObservations.filter(o => o.locationId === locId);
              const locDistance = locObs.reduce((sum, o) => sum + o.distanceFromPrevious, 0);
              const locStartPoint = locationPoints.find(p => p.locationId === locId && p.type === 'start');
              const locEndPoint = locationPoints.find(p => p.locationId === locId && p.type === 'end');
              let extraDist = 0;
              if (locStartPoint && locObs.length > 0) {
                extraDist += haversineDistance(locStartPoint.lat, locStartPoint.lng, parseFloat(locObs[0].latitude), parseFloat(locObs[0].longitude));
              }
              if (locEndPoint && locObs.length > 0) {
                extraDist += haversineDistance(parseFloat(locObs[locObs.length - 1].latitude), parseFloat(locObs[locObs.length - 1].longitude), locEndPoint.lat, locEndPoint.lng);
              }
              const locTotalDistance = locDistance + extraDist;
              const locFirstObs = locObs[0]?.dateTime;
              const locLastObs = locObs[locObs.length - 1]?.dateTime;
              const locTimeMinutes = locFirstObs && locLastObs ? differenceInMinutes(locLastObs, locFirstObs) : 0;
              const locExtraMinutes = (extraDist / DEFAULT_WALKING_SPEED) * 60;
              const locTotalMinutes = locTimeMinutes + locExtraMinutes;
              const locAvgSpeed = locTotalDistance > 0 && locTotalMinutes > 0 ? (locTotalDistance / locTotalMinutes) * 60 : null;
              const locSquats = locObs.length * SQUATS_PER_OBSERVATION;
              const locSquatCals = Math.round(locSquats * CALORIES_PER_SQUAT);
              const locWalkingCals = Math.round(3.5 * 72.6 * (locTotalMinutes / 60));
              const locTotalCals = locSquatCals + locWalkingCals;
              const color = LOCATION_COLORS[locId % LOCATION_COLORS.length];

              return (
                <div key={locId} className="bg-muted p-4 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 rounded-full" 
                      style={{ backgroundColor: color }}
                    />
                    <p className="text-sm font-medium">Location {locId + 1}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Observations</p>
                      <p className="font-medium">{locObs.length}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Distance</p>
                      <p className="font-medium">{locTotalDistance.toFixed(2)} mi</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Time</p>
                      <p className="font-medium">
                        {locTotalMinutes >= 60 
                          ? `${Math.floor(locTotalMinutes / 60)}h ${Math.round(locTotalMinutes % 60)}m`
                          : `${Math.round(locTotalMinutes)}m`
                        }
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Avg Speed</p>
                      <p className="font-medium">{locAvgSpeed ? `${locAvgSpeed.toFixed(1)} mph` : '--'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Calories</p>
                      <p className="font-medium">{locTotalCals}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Start/End Points</p>
                      <p className="font-medium">
                        {locStartPoint ? '✓ Start' : '—'} / {locEndPoint ? '✓ End' : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
