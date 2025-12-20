import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Navigation, Search, Calendar, Leaf } from "lucide-react";
import { format, subDays } from "date-fns";

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
  { id: "choice-edibles", label: "Choice Edibles", color: "bg-emerald-500" },
  { id: "edibles", label: "Edibles", color: "bg-green-500" },
  { id: "medicinals", label: "Medicinals", color: "bg-purple-500" },
  { id: "dyers", label: "Dyers", color: "bg-amber-500" },
  { id: "psychoactive", label: "Psychoactive", color: "bg-indigo-500" },
  { id: "novel-species", label: "Novel Species", color: "bg-rose-500" },
];

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

  const today = new Date();
  const windowDays = parseInt(dateWindow);
  const startDate = subDays(today, windowDays);
  const endDate = today;

  useEffect(() => {
    detectLocation();
  }, []);

  const detectLocation = () => {
    setIsDetectingLocation(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setDetectedLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setLocation(`${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`);
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

  const handleSearch = () => {
    console.log("Search params:", {
      location,
      detectedLocation,
      range: range === "custom" ? customRange : range,
      dateWindow,
      startDate,
      endDate,
      selectedMonth,
      categories: Array.from(selectedCategories),
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3" data-testid="text-foraging-title">
          <Leaf className="h-8 w-8 text-myco-green" />
          Foraging Map
        </h1>
        <p className="text-slate-600 mt-2">
          Discover what's fruiting near you based on historical observation data
        </p>
      </div>

      <Card className="shadow-lg border-myco-green/20">
        <CardHeader className="bg-gradient-to-r from-myco-green/10 to-emerald-50 border-b">
          <CardTitle className="flex items-center gap-2 text-myco-brown">
            <Search className="h-5 w-5" />
            Search for Foraging Locations
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-3">
            <Label className="text-base font-medium text-slate-700">Foraging Location</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Enter city, state, country, or address..."
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="pl-10"
                  data-testid="input-location"
                />
              </div>
              <Button
                variant="outline"
                onClick={detectLocation}
                disabled={isDetectingLocation}
                className="flex items-center gap-2 border-myco-green text-myco-green hover:bg-myco-green/10"
                data-testid="button-detect-location"
              >
                <Navigation className={`h-4 w-4 ${isDetectingLocation ? "animate-pulse" : ""}`} />
                {isDetectingLocation ? "Detecting..." : "Use My Location"}
              </Button>
            </div>
            {detectedLocation && (
              <p className="text-sm text-myco-green">
                GPS location detected: {detectedLocation.lat.toFixed(4)}, {detectedLocation.lng.toFixed(4)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label className="text-base font-medium text-slate-700">Range</Label>
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
                  className="mt-2"
                  data-testid="input-custom-range"
                />
              )}
            </div>

            <div className="space-y-3">
              <Label className="text-base font-medium text-slate-700">Date Window</Label>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-slate-600">From Date</Label>
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border">
                <Calendar className="h-4 w-4 text-slate-400" />
                <span className="text-slate-700" data-testid="text-start-date">
                  {format(startDate, "MMM d, yyyy")}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-slate-600">To Date</Label>
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border">
                <Calendar className="h-4 w-4 text-slate-400" />
                <span className="text-slate-700" data-testid="text-end-date">
                  {format(endDate, "MMM d, yyyy")}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-slate-600">Or Select Month</Label>
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
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium text-slate-700">
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
            <div className="flex flex-wrap gap-3">
              {FORAGING_CATEGORIES.map((category) => {
                const isSelected = selectedCategories.has(category.id);
                return (
                  <button
                    key={category.id}
                    onClick={() => toggleCategory(category.id)}
                    className={`
                      px-4 py-2 rounded-full font-medium text-sm transition-all
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

          <div className="pt-4 border-t">
            <Button
              onClick={handleSearch}
              className="w-full bg-myco-green hover:bg-myco-green/90 text-white py-6 text-lg"
              data-testid="button-search"
            >
              <Search className="h-5 w-5 mr-2" />
              Search Foraging Locations
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
