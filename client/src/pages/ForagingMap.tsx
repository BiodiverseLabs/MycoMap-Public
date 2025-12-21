import { useState, useEffect, useRef, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Navigation, Search, Calendar, Leaf, Loader2, Star, ChevronDown, ChevronRight, UtensilsCrossed, Heart, Palette, Sparkles, Skull, AlertTriangle, Cherry } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, subDays, addDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Observation {
  id: number;
  latitude: string;
  longitude: string;
  scientificName: string;
  commonName: string;
  state: string;
  observedOn: string;
  photoUrl: string | null;
  userName: string;
  qualityGrade: string;
  hasCurrentYearResearchGrade: boolean;
}

interface TopSpecies {
  name: string;
  commonName: string;
  count: number;
  hasCurrentYearResearchGrade: boolean;
}

interface SearchResults {
  observations: Observation[];
  topSpecies: TopSpecies[];
  totalCount: number;
  searchParams: { lat: number; lng: number; radiusKm: number };
}

const DATE_WINDOW_OPTIONS = [
  { value: "1", label: "1 day" },
  { value: "3", label: "3 days" },
  { value: "7", label: "7 days" },
  { value: "10", label: "10 days" },
  { value: "14", label: "14 days" },
  { value: "21", label: "21 days" },
  { value: "30", label: "30 days" },
];

const RANGE_OPTIONS = [
  { value: "10", label: "10 miles" },
  { value: "25", label: "25 miles" },
  { value: "50", label: "50 miles" },
  { value: "100", label: "100 miles" },
  { value: "200", label: "200 miles" },
  { value: "custom", label: "Custom" },
];

const MONTH_OPTIONS = [
  { value: "any", label: "Any Month" },
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const FORAGING_CATEGORIES = [
  { id: "choice-edibles", label: "Choice Edibles", color: "bg-emerald-500", icon: Cherry },
  { id: "edibles", label: "Edibles", color: "bg-green-500", icon: UtensilsCrossed },
  { id: "medicinals", label: "Medicinals", color: "bg-purple-500", icon: Heart },
  { id: "dyers", label: "Dyers", color: "bg-amber-500", icon: Palette },
  { id: "psychoactive", label: "Psychoactive", color: "bg-indigo-500", icon: Sparkles },
  { id: "poisonous", label: "Poisonous", color: "bg-orange-500", icon: AlertTriangle },
  { id: "deadly", label: "Deadly", color: "bg-red-500", icon: Skull },
];

interface SpeciesLookup {
  [scientificName: string]: {
    categories: string[];
    metadata: Record<string, Record<string, string>>;
  };
}

interface LocationSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

export default function ForagingMap() {
  const [location, setLocation] = useState("");
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [detectedLocation, setDetectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [range, setRange] = useState("50");
  const [customRange, setCustomRange] = useState("");
  const [dateWindow, setDateWindow] = useState("14");
  const [selectedMonth, setSelectedMonth] = useState("any");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(FORAGING_CATEGORIES.map(c => c.id))
  );
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [expandedSpecies, setExpandedSpecies] = useState<Set<string>>(new Set());
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [listSearchQuery, setListSearchQuery] = useState("");
  const suggestionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const { toast } = useToast();
  
  // Fetch species lookup data for category tags
  const { data: speciesLookup } = useQuery<SpeciesLookup>({
    queryKey: ['/api/foraging/species-lookup'],
  });
  
  // Filter observations based on selected categories
  const getFilteredObservations = (observations: Observation[]) => {
    if (!speciesLookup || selectedCategories.size === FORAGING_CATEGORIES.length) {
      return observations;
    }
    
    return observations.filter(obs => {
      const speciesInfo = speciesLookup[obs.scientificName];
      if (!speciesInfo) {
        // Include species without category data only if all categories are selected
        return selectedCategories.size === FORAGING_CATEGORIES.length;
      }
      // Include if species has any of the selected categories
      return speciesInfo.categories.some(cat => selectedCategories.has(cat));
    });
  };

  const today = new Date();
  const windowDays = parseInt(dateWindow);
  const startDate = subDays(today, windowDays);
  const endDate = addDays(today, windowDays);

  useEffect(() => {
    detectLocation();
  }, []);

  useEffect(() => {
    if (searchResults && mapRef.current) {
      let filteredObs = getFilteredObservations(searchResults.observations);
      if (selectedSpecies) {
        filteredObs = filteredObs.filter(obs => obs.scientificName === selectedSpecies);
      }
      initializeMap(filteredObs);
    }
  }, [searchResults, selectedSpecies, selectedCategories, speciesLookup]);

  const initializeMap = async (observations: Observation[]) => {
    if (!mapRef.current) return;

    if (!(window as any).L || !(window as any).L.heatLayer) {
      await new Promise<void>((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
        script.onload = () => resolve();
        script.onerror = () => resolve();
        document.head.appendChild(script);
        setTimeout(resolve, 2000);
      });
    }

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    mapInstanceRef.current = L.map(mapRef.current).setView([39.8283, -98.5795], 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(mapInstanceRef.current);

    const validObservations = observations.filter(obs => 
      obs.latitude && obs.longitude && 
      !isNaN(parseFloat(obs.latitude)) && !isNaN(parseFloat(obs.longitude))
    );

    if (validObservations.length === 0) {
      if (detectedLocation && mapInstanceRef.current) {
        mapInstanceRef.current.setView([detectedLocation.lat, detectedLocation.lng], 8);
      }
      return;
    }

    const heatData = validObservations.map(obs => [
      parseFloat(obs.latitude),
      parseFloat(obs.longitude),
      0.8
    ]);

    setTimeout(() => {
      if (mapInstanceRef.current && (window as any).L && (window as any).L.heatLayer) {
        const heatLayer = (window as any).L.heatLayer(heatData, {
          radius: 22,
          blur: 12,
          maxZoom: 17,
          max: 0.8,
          minOpacity: 0.2,
          gradient: {
            0.0: 'rgba(0, 0, 255, 0.3)',
            0.2: 'rgba(0, 255, 255, 0.5)',
            0.4: 'rgba(0, 255, 0, 0.6)',
            0.6: 'rgba(255, 255, 0, 0.7)',
            0.8: 'rgba(255, 165, 0, 0.8)',
            1.0: 'rgba(255, 0, 0, 0.9)'
          }
        }).addTo(mapInstanceRef.current);

        mapInstanceRef.current.on('zoomend', () => {
          if (mapInstanceRef.current) {
            const zoom = mapInstanceRef.current.getZoom();
            const newMinOpacity = Math.min(0.2 + (zoom * 0.04), 0.7);
            heatLayer.setOptions({
              minOpacity: newMinOpacity
            });
          }
        });

        if (validObservations.length > 0 && mapInstanceRef.current) {
          const bounds = L.latLngBounds(
            validObservations.map(obs => [parseFloat(obs.latitude), parseFloat(obs.longitude)])
          );
          mapInstanceRef.current.fitBounds(bounds, { padding: [20, 20] });
        }
      }
    }, 500);
  };

  const detectLocation = () => {
    setIsDetectingLocation(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setDetectedLocation({ lat, lng });
          
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`,
              { headers: { 'User-Agent': 'MycoMap/1.0' } }
            );
            const data = await response.json();
            const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || '';
            const state = data.address?.state || '';
            if (city && state) {
              setLocation(`${city}, ${state}`);
            } else if (city || state) {
              setLocation(city || state);
            } else {
              setLocation(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            }
          } catch (error) {
            console.error("Error reverse geocoding:", error);
            setLocation(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
          }
          setIsDetectingLocation(false);
        },
        (error) => {
          console.error("Error detecting location:", error);
          setIsDetectingLocation(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setIsDetectingLocation(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    const newCategories = new Set(selectedCategories);
    if (newCategories.has(categoryId)) {
      newCategories.delete(categoryId);
    } else {
      newCategories.add(categoryId);
    }
    setSelectedCategories(newCategories);
  };

  const selectAllCategories = () => {
    setSelectedCategories(new Set(FORAGING_CATEGORIES.map(c => c.id)));
  };

  const clearAllCategories = () => {
    setSelectedCategories(new Set());
  };

  const fetchLocationSuggestions = async (query: string) => {
    if (query.length < 3) {
      setLocationSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
        { headers: { 'User-Agent': 'MycoMap/1.0' } }
      );
      const data = await response.json();
      setLocationSuggestions(data);
      setShowSuggestions(data.length > 0);
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      setLocationSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleLocationChange = (value: string) => {
    setLocation(value);
    setDetectedLocation(null);
    
    if (suggestionTimeoutRef.current) {
      clearTimeout(suggestionTimeoutRef.current);
    }
    
    suggestionTimeoutRef.current = setTimeout(() => {
      fetchLocationSuggestions(value);
    }, 300);
  };

  const selectSuggestion = (suggestion: LocationSuggestion) => {
    const shortName = suggestion.display_name.split(',').slice(0, 2).join(',').trim();
    setLocation(shortName);
    setDetectedLocation({
      lat: parseFloat(suggestion.lat),
      lng: parseFloat(suggestion.lon)
    });
    setShowSuggestions(false);
    setLocationSuggestions([]);
  };

  const geocodeLocation = async (locationStr: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationStr)}&limit=1`,
        { headers: { 'User-Agent': 'MycoMap/1.0' } }
      );
      const data = await response.json();
      if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
      return null;
    } catch (error) {
      console.error("Geocoding error:", error);
      return null;
    }
  };

  const handleSearch = async () => {
    let searchCoords = detectedLocation;

    if (!searchCoords && location.trim()) {
      setIsSearching(true);
      const geocoded = await geocodeLocation(location.trim());
      if (geocoded) {
        searchCoords = geocoded;
        setDetectedLocation(geocoded);
      }
    }

    if (!searchCoords) {
      toast({
        title: "Location Required",
        description: "Please enter a location or use 'Use My Location' to search.",
        variant: "destructive"
      });
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const radiusMiles = range === "custom" ? customRange : range;
      const params = new URLSearchParams({
        lat: searchCoords.lat.toString(),
        lng: searchCoords.lng.toString(),
        radius: radiusMiles,
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
        month: selectedMonth,
      });

      const response = await fetch(`/api/foraging/search?${params}`);
      
      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data: SearchResults = await response.json();
      setSearchResults(data);
      setSelectedSpecies(null);
    } catch (error) {
      console.error("Search error:", error);
      toast({
        title: "Search Failed",
        description: "Unable to search iNaturalist. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3" data-testid="text-foraging-title">
          <Leaf className="h-8 w-8 text-myco-green" />
          Foraging Map
        </h1>
        <p className="text-slate-600 mt-2">
          Discover what's fruiting near you based on historical observation data
        </p>
      </div>

      <Card className="shadow-lg border-myco-green/20">
        <CardHeader className="bg-gradient-to-r from-myco-green/10 to-emerald-50 border-b py-4">
          <CardTitle className="flex items-center gap-2 text-myco-brown text-lg">
            <Search className="h-5 w-5" />
            Search for Foraging Locations
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2 space-y-2">
              <Label className="text-sm font-medium text-slate-700">Foraging Location</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                  <Input
                    placeholder="Enter city, state, country, or address..."
                    value={location}
                    onChange={(e) => handleLocationChange(e.target.value)}
                    onFocus={() => location.length >= 3 && locationSuggestions.length > 0 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    className="pl-10"
                    data-testid="input-location"
                  />
                  {showSuggestions && locationSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                      {locationSuggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          type="button"
                          className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm border-b last:border-b-0"
                          onMouseDown={() => selectSuggestion(suggestion)}
                          data-testid={`suggestion-${index}`}
                        >
                          {suggestion.display_name}
                        </button>
                      ))}
                    </div>
                  )}
                  {isLoadingSuggestions && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={detectLocation}
                  disabled={isDetectingLocation}
                  className="flex items-center gap-2 border-myco-green text-myco-green hover:bg-myco-green/10 whitespace-nowrap"
                  data-testid="button-detect-location"
                >
                  <Navigation className={`h-4 w-4 ${isDetectingLocation ? "animate-pulse" : ""}`} />
                  {isDetectingLocation ? "Detecting..." : "Use My Location"}
                </Button>
              </div>
              {detectedLocation && (
                <p className="text-xs text-myco-green">
                  GPS: {detectedLocation.lat.toFixed(4)}, {detectedLocation.lng.toFixed(4)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Range</Label>
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger data-testid="select-range">
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  {RANGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {range === "custom" && (
                <Input
                  type="number"
                  placeholder="Enter miles..."
                  value={customRange}
                  onChange={(e) => setCustomRange(e.target.value)}
                  data-testid="input-custom-range"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Date Window (+/- days)</Label>
              <Select value={dateWindow} onValueChange={setDateWindow}>
                <SelectTrigger data-testid="select-date-window">
                  <SelectValue placeholder="Select date window" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_WINDOW_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-end">
            <div className="flex gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">From</Label>
                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border text-sm">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  <span className="text-slate-700" data-testid="text-start-date">
                    {format(startDate, "MMM d")}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">To</Label>
                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border text-sm">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  <span className="text-slate-700" data-testid="text-end-date">
                    {format(endDate, "MMM d")}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-600">Or Select Month</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger data-testid="select-month">
                  <SelectValue placeholder="Any Month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-2">
              <Button
                onClick={handleSearch}
                disabled={isSearching || (!detectedLocation && !location.trim())}
                className="w-full bg-myco-green hover:bg-myco-green/90 text-white"
                data-testid="button-search"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Searching Foraging Locations...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Search Foraging Locations
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-slate-700">
                What are you foraging for?
              </Label>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAllCategories}
                  className="text-xs text-myco-green hover:text-myco-green/80"
                  data-testid="button-select-all"
                >
                  Select All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllCategories}
                  className="text-xs text-slate-500 hover:text-slate-700"
                  data-testid="button-clear-all"
                >
                  Clear All
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {FORAGING_CATEGORIES.map((category) => {
                const isSelected = selectedCategories.has(category.id);
                return (
                  <button
                    key={category.id}
                    onClick={() => toggleCategory(category.id)}
                    className={`
                      px-3 py-1.5 rounded-full font-medium text-xs transition-all
                      ${isSelected 
                        ? `${category.color} text-white shadow-md` 
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }
                    `}
                    data-testid={`button-category-${category.id}`}
                  >
                    {category.label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {searchResults && (
        <TooltipProvider>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
              <Card className="shadow-lg">
                <CardHeader className="py-3 border-b">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-myco-green" />
                    Observation Heatmap
                    <span className="text-sm font-normal text-slate-500">
                      ({searchResults.totalCount} observations)
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div ref={mapRef} className="h-[400px] w-full" data-testid="foraging-heatmap" />
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <Card className="shadow-lg h-full">
                <CardHeader className="py-3 border-b">
                  <CardTitle className="text-lg">Top Species</CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  <div className="space-y-2 max-h-[350px] overflow-y-auto">
                    {searchResults.topSpecies
                      .filter(species => {
                        if (!speciesLookup || selectedCategories.size === FORAGING_CATEGORIES.length) return true;
                        const speciesInfo = speciesLookup[species.name];
                        if (!speciesInfo) return selectedCategories.size === FORAGING_CATEGORIES.length;
                        return speciesInfo.categories.some(cat => selectedCategories.has(cat));
                      })
                      .map((species, index) => {
                        const speciesInfo = speciesLookup?.[species.name];
                        return (
                          <div 
                            key={species.name} 
                            className="flex items-center justify-between p-2 bg-slate-50 rounded hover:bg-slate-100 transition-colors"
                            data-testid={`species-row-${index}`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1">
                                {species.hasCurrentYearResearchGrade && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Star 
                                        className="h-4 w-4 text-yellow-500 fill-yellow-500 flex-shrink-0" 
                                        aria-label="Confirmed Out Now"
                                        data-testid={`star-species-${index}`}
                                      />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Confirmed Out Now</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-slate-800 truncate italic">
                                    {species.name}
                                  </p>
                                  {species.commonName && (
                                    <p className="text-xs text-slate-500 truncate">
                                      {species.commonName}
                                    </p>
                                  )}
                                </div>
                              </div>
                              {speciesInfo?.categories && speciesInfo.categories.length > 0 && (
                                <div className="flex gap-1 mt-1">
                                  {speciesInfo.categories.map(catId => {
                                    const category = FORAGING_CATEGORIES.find(c => c.id === catId);
                                    if (!category) return null;
                                    const Icon = category.icon;
                                    const metadata = speciesInfo.metadata[catId];
                                    const hasMetadata = metadata && Object.keys(metadata).length > 0;
                                    
                                    return (
                                      <Tooltip key={catId}>
                                        <TooltipTrigger asChild>
                                          <span 
                                            className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${category.color} text-white cursor-help`}
                                          >
                                            <Icon className="h-3 w-3" />
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                          <p className="font-semibold">{category.label}</p>
                                          {hasMetadata && (
                                            <div className="mt-1 text-xs space-y-0.5">
                                              {Object.entries(metadata).slice(0, 6).map(([key, value]) => (
                                                <p key={key}>
                                                  <span className="text-slate-400">{key}:</span> {value}
                                                </p>
                                              ))}
                                            </div>
                                          )}
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            <span className="ml-2 px-2 py-1 bg-myco-green/10 text-myco-green text-xs font-semibold rounded">
                              {species.count}
                            </span>
                          </div>
                        );
                      })}
                    {searchResults.topSpecies.length === 0 && (
                      <p className="text-sm text-slate-500 text-center py-4">
                        No species found
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="shadow-lg">
            <CardHeader className="py-3 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  All Observations
                  <span className="text-sm font-normal text-slate-500 ml-2">
                    ({getFilteredObservations(searchResults.observations).length} results)
                  </span>
                </CardTitle>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search list..."
                    value={listSearchQuery}
                    onChange={(e) => setListSearchQuery(e.target.value)}
                    className="pl-9 w-48 h-9"
                    data-testid="input-list-search"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left p-3 text-sm font-medium text-slate-700">Species Name</th>
                      <th className="text-left p-3 text-sm font-medium text-slate-700">Use Case</th>
                      <th className="text-left p-3 text-sm font-medium text-slate-700">Total Observations</th>
                      <th className="text-left p-3 text-sm font-medium text-slate-700">Location</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(() => {
                      const filteredObs = getFilteredObservations(searchResults.observations);
                      const speciesGroups = filteredObs.reduce((acc, obs) => {
                        const key = obs.scientificName;
                        if (!acc[key]) {
                          acc[key] = {
                            scientificName: obs.scientificName,
                            commonName: obs.commonName,
                            hasCurrentYearResearchGrade: obs.hasCurrentYearResearchGrade,
                            observations: [],
                            locationCounts: {} as Record<string, number>
                          };
                        }
                        acc[key].observations.push(obs);
                        if (obs.hasCurrentYearResearchGrade) {
                          acc[key].hasCurrentYearResearchGrade = true;
                        }
                        const loc = obs.state || "Unknown location";
                        acc[key].locationCounts[loc] = (acc[key].locationCounts[loc] || 0) + 1;
                        return acc;
                      }, {} as Record<string, { scientificName: string; commonName: string; hasCurrentYearResearchGrade: boolean; observations: Observation[]; locationCounts: Record<string, number> }>);

                      let sortedSpecies = Object.values(speciesGroups).sort((a, b) => b.observations.length - a.observations.length);
                      
                      // Apply search filter
                      if (listSearchQuery.trim()) {
                        const query = listSearchQuery.toLowerCase().trim();
                        sortedSpecies = sortedSpecies.filter(group => {
                          const speciesInfo = speciesLookup?.[group.scientificName];
                          const locations = Object.keys(group.locationCounts).join(' ').toLowerCase();
                          const categories = speciesInfo?.categories.map(c => {
                            const cat = FORAGING_CATEGORIES.find(fc => fc.id === c);
                            return cat?.label || c;
                          }).join(' ').toLowerCase() || '';
                          
                          return group.scientificName.toLowerCase().includes(query) ||
                            (group.commonName?.toLowerCase().includes(query)) ||
                            locations.includes(query) ||
                            categories.includes(query);
                        });
                      }

                      return sortedSpecies.slice(0, 100).map((group) => {
                        const isExpanded = expandedSpecies.has(group.scientificName);
                        const sortedLocations = Object.entries(group.locationCounts).sort((a, b) => b[1] - a[1]);
                        const topLocation = sortedLocations[0];
                        const hasMultipleLocations = sortedLocations.length > 1;
                        const speciesInfo = speciesLookup?.[group.scientificName];

                        return (
                          <Fragment key={group.scientificName}>
                            <tr 
                              className={`hover:bg-slate-50 cursor-pointer ${selectedSpecies === group.scientificName ? 'bg-myco-green/10 border-l-4 border-myco-green' : ''}`}
                              onClick={() => {
                                if (selectedSpecies === group.scientificName) {
                                  setSelectedSpecies(null);
                                } else {
                                  setSelectedSpecies(group.scientificName);
                                }
                              }}
                              data-testid={`observation-row-${group.scientificName}`}
                            >
                              <td className="p-3">
                                <div className="flex items-center gap-1">
                                  {group.hasCurrentYearResearchGrade && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Star 
                                          className="h-4 w-4 text-yellow-500 fill-yellow-500 flex-shrink-0" 
                                          aria-label="Confirmed Out Now"
                                          data-testid={`star-species-${group.scientificName}`}
                                        />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Confirmed Out Now</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                  <div>
                                    <p className="text-sm font-medium text-slate-800 italic">{group.scientificName}</p>
                                    {group.commonName && (
                                      <p className="text-xs text-slate-500">{group.commonName}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="flex flex-wrap gap-1">
                                  {speciesInfo?.categories.map(catId => {
                                    const category = FORAGING_CATEGORIES.find(c => c.id === catId);
                                    if (!category) return null;
                                    const Icon = category.icon;
                                    const metadata = speciesInfo.metadata[catId];
                                    const hasMetadata = metadata && Object.keys(metadata).length > 0;
                                    
                                    return (
                                      <Tooltip key={catId}>
                                        <TooltipTrigger asChild>
                                          <span 
                                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${category.color} text-white cursor-help`}
                                            data-testid={`icon-${catId}-${group.scientificName}`}
                                          >
                                            <Icon className="h-3.5 w-3.5" />
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                          <p className="font-semibold">{category.label}</p>
                                          {hasMetadata && (
                                            <div className="mt-1 text-xs space-y-0.5">
                                              {Object.entries(metadata).slice(0, 6).map(([key, value]) => (
                                                <p key={key}>
                                                  <span className="text-slate-400">{key}:</span> {value}
                                                </p>
                                              ))}
                                            </div>
                                          )}
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  })}
                                  {!speciesInfo?.categories.length && (
                                    <span className="text-xs text-slate-400">—</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-sm text-slate-600">
                                <span className="px-2 py-1 bg-myco-green/10 text-myco-green font-semibold rounded">
                                  {group.observations.length}
                                </span>
                              </td>
                              <td className="p-3 text-sm text-slate-600 max-w-xs truncate">
                                {topLocation ? `${topLocation[0]} (${topLocation[1]})` : "Unknown location"}
                              </td>
                              <td className="p-3 text-center">
                                {hasMultipleLocations && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedSpecies(prev => {
                                        const next = new Set(prev);
                                        if (next.has(group.scientificName)) {
                                          next.delete(group.scientificName);
                                        } else {
                                          next.add(group.scientificName);
                                        }
                                        return next;
                                      });
                                    }}
                                    className="p-1 hover:bg-slate-200 rounded transition-colors"
                                    data-testid={`expand-${group.scientificName}`}
                                  >
                                    {isExpanded ? 
                                      <ChevronDown className="h-4 w-4 text-slate-400" /> : 
                                      <ChevronRight className="h-4 w-4 text-slate-400" />
                                    }
                                  </button>
                                )}
                              </td>
                            </tr>
                            {isExpanded && sortedLocations.slice(1).map(([loc, count]) => (
                              <tr key={`${group.scientificName}-${loc}`} className="bg-slate-50/50">
                                <td className="p-3 pl-8 text-sm text-slate-500"></td>
                                <td className="p-3"></td>
                                <td className="p-3 text-sm text-slate-500">
                                  <span className="px-2 py-1 bg-slate-100 text-slate-600 font-medium rounded">
                                    {count}
                                  </span>
                                </td>
                                <td className="p-3 text-sm text-slate-500 max-w-xs truncate">
                                  {loc}
                                </td>
                                <td className="p-3"></td>
                              </tr>
                            ))}
                          </Fragment>
                        );
                      });
                    })()}
                  </tbody>
                </table>
                {Object.keys(getFilteredObservations(searchResults.observations).reduce((acc, obs) => { acc[obs.scientificName] = true; return acc; }, {} as Record<string, boolean>)).length > 100 && (
                  <div className="p-3 text-center text-sm text-slate-500 border-t">
                    Showing first 100 species
                  </div>
                )}
                {getFilteredObservations(searchResults.observations).length === 0 && (
                  <div className="p-8 text-center text-slate-500">
                    No observations found for this location and time period.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TooltipProvider>
      )}
    </div>
  );
}
