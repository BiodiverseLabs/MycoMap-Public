import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, Calendar as CalendarIcon, Search, Loader2, Activity, Eye, Route, Timer, Flame } from "lucide-react";
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

const MAX_WALKING_SPEED = 3;

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

function estimateCalories(miles: number, minutes: number): number {
  const avgWeight = 160;
  const met = miles / (minutes / 60) > 3.5 ? 5.0 : 3.5;
  return Math.round(met * avgWeight * 0.453592 * (minutes / 60));
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
  
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const { toast } = useToast();

  const totalObservations = processedObservations.length;
  const totalLocations = processedObservations.length > 0 
    ? Math.max(...processedObservations.map(o => o.locationId)) + 1 
    : 0;
  const totalMiles = outings.reduce((sum, o) => sum + o.totalDistance, 0);
  const totalMinutes = outings.reduce((sum, o) => sum + o.totalTimeMinutes, 0);
  const avgSpeedMph = totalMiles > 0 && totalMinutes > 0 ? (totalMiles / totalMinutes) * 60 : null;
  const totalCalories = estimateCalories(totalMiles, totalMinutes);

  useEffect(() => {
    if (processedObservations.length > 0 && mapRef.current) {
      initializeMap(processedObservations);
    }
  }, [processedObservations]);

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
        
        // If speed > 3 mph, this is travel (not walking) - new location
        if (speedMph && speedMph > MAX_WALKING_SPEED) {
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <MapPin className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Locations</p>
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
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Timer className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Average Speed</p>
                    <p className="text-2xl font-bold" data-testid="text-avg-pace">{formatSpeed(avgSpeedMph)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <Flame className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Calories Burned</p>
                    <p className="text-2xl font-bold" data-testid="text-calories">{totalCalories}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <div ref={mapRef} className="h-[500px] w-full rounded-lg" data-testid="map-container" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Observation Log</CardTitle>
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
                    return (
                      <TableRow key={obs.id} data-testid={`row-observation-${obs.id}`}>
                        <TableCell className="p-0 relative">
                          <div 
                            className="absolute left-0 top-0 bottom-0 w-1"
                            style={{ 
                              backgroundColor: color,
                              borderRadius: obs.isNewLocation ? '4px 4px 0 0' : isLastInLocation ? '0 0 4px 4px' : '0'
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {obs.isNewLocation && obs.observationNumber > 1 && (
                            <span className="text-xs text-muted-foreground block">New Location</span>
                          )}
                          {obs.observationNumber}
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium">{obs.scientificName}</span>
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
    </div>
  );
}
