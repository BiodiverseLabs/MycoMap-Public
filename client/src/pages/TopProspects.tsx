import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Download, MapPin, TrendingUp, Map } from "lucide-react";
import { Link } from "wouter";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface TopProspectSpecies {
  scientificName: string;
  commonName?: string;
  northCount: number;
  southCount: number;
  eastCount: number;
  westCount: number;
  northNearbyCount: number;
  southNearbyCount: number;
  eastNearbyCount: number;
  westNearbyCount: number;
  totalRecords: number;
  nearbyTotal: number;
  neighboringStatesCount: number;
}

interface TopProspectsData {
  species: TopProspectSpecies[];
  stateInfo: {
    name: string;
    centerLatitude: number;
    centerLongitude: number;
  };
}

interface SpeciesRecord {
  id: number;
  latitude: number;
  longitude: number;
  state: string;
  locality: string;
  dateCollected: string;
  collector: string;
}

export default function TopProspects() {
  const [selectedState, setSelectedState] = useState<string>("");
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [mapDialogOpen, setMapDialogOpen] = useState(false);

  // Fetch available states
  const { data: states = [] } = useQuery<string[]>({
    queryKey: ['/api/states'],
    enabled: true
  });

  // Fetch top prospects data for selected state
  const { 
    data: prospectsData, 
    isLoading: isProspectsLoading,
    error: prospectsError 
  } = useQuery<TopProspectsData>({
    queryKey: [`/api/geospatial/top-prospects/${selectedState}`],
    enabled: !!selectedState
  });

  // Fetch species records for map display
  const { 
    data: speciesRecords = [], 
    isLoading: isRecordsLoading 
  } = useQuery<SpeciesRecord[]>({
    queryKey: [`/api/species/${selectedSpecies}/records`],
    enabled: !!selectedSpecies && mapDialogOpen
  });

  const handleDownloadCsv = () => {
    if (!prospectsData?.species) return;

    const headers = ['Scientific Name', 'Common Name', 'North All', 'North 10°', 'South All', 'South 10°', 'East All', 'East 10°', 'West All', 'West 10°', 'Neighboring States', 'Total Records', 'Nearby Total'];
    const csvData = prospectsData.species.map(species => [
      species.scientificName,
      species.commonName || '',
      species.northCount.toString(),
      species.northNearbyCount.toString(),
      species.southCount.toString(),
      species.southNearbyCount.toString(),
      species.eastCount.toString(),
      species.eastNearbyCount.toString(),
      species.westCount.toString(),
      species.westNearbyCount.toString(),
      species.neighboringStatesCount.toString(),
      species.totalRecords.toString(),
      species.nearbyTotal.toString()
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `top-prospects-${selectedState}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSpeciesClick = (scientificName: string) => {
    setSelectedSpecies(scientificName);
    setMapDialogOpen(true);
  };

  const SpeciesRecordsDialog = () => {
    if (!selectedSpecies) return null;

    const centerLat = speciesRecords.length > 0 
      ? speciesRecords.reduce((sum, record) => sum + record.latitude, 0) / speciesRecords.length 
      : 39.8283;
    const centerLon = speciesRecords.length > 0 
      ? speciesRecords.reduce((sum, record) => sum + record.longitude, 0) / speciesRecords.length 
      : -98.5795;

    // Calculate zoom level based on data spread
    const getInitialZoom = () => {
      if (speciesRecords.length === 0) return 4;
      
      const lats = speciesRecords.map(r => r.latitude);
      const lons = speciesRecords.map(r => r.longitude);
      
      const latSpread = Math.max(...lats) - Math.min(...lats);
      const lonSpread = Math.max(...lons) - Math.min(...lons);
      const maxSpread = Math.max(latSpread, lonSpread);
      
      // Adjust zoom based on geographic spread
      if (maxSpread > 30) return 3;      // Continental scale
      if (maxSpread > 15) return 4;      // Multi-state scale  
      if (maxSpread > 8) return 5;       // Regional scale
      if (maxSpread > 4) return 6;       // State scale
      if (maxSpread > 2) return 7;       // Local scale
      return 8;                          // City scale
    };

    return (
      <Dialog open={mapDialogOpen} onOpenChange={setMapDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Map className="w-5 h-5 mr-2" />
              {selectedSpecies} Distribution
            </DialogTitle>
          </DialogHeader>
          
          {isRecordsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">Loading records...</div>
            </div>
          ) : speciesRecords.length > 0 ? (
            <div className="space-y-4">
              <div className="text-sm text-gray-600">
                Showing {speciesRecords.length} records for {selectedSpecies}
              </div>
              
              {/* Map Display */}
              <div className="h-80 w-full border rounded-lg overflow-hidden">
                <MapContainer
                  center={[centerLat, centerLon]}
                  zoom={getInitialZoom()}
                  className="h-full w-full"
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {speciesRecords.map((record) => (
                    <CircleMarker
                      key={record.id}
                      center={[record.latitude, record.longitude]}
                      radius={6}
                      fillColor="#ef4444"
                      color="#dc2626"
                      weight={2}
                      fillOpacity={0.7}
                    >
                      <Popup>
                        <div className="text-sm">
                          <p className="font-medium italic">{selectedSpecies}</p>
                          <p><strong>Location:</strong> {record.locality}</p>
                          <p><strong>State:</strong> {record.state}</p>
                          <p><strong>Date:</strong> {record.dateCollected}</p>
                          <p><strong>Collector:</strong> {record.collector}</p>
                          <p><strong>Coordinates:</strong> {record.latitude.toFixed(4)}, {record.longitude.toFixed(4)}</p>
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>
              
              {/* Records Table */}
              <div className="max-h-60 overflow-y-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Location</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Collector</TableHead>
                      <TableHead>Coordinates</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {speciesRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{record.locality}</TableCell>
                        <TableCell>{record.state}</TableCell>
                        <TableCell>{record.dateCollected}</TableCell>
                        <TableCell>{record.collector}</TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {record.latitude.toFixed(4)}, {record.longitude.toFixed(4)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              <div className="flex justify-between items-center pt-4 border-t">
                <div className="text-sm text-gray-600">
                  Geographic range: 
                  {Math.min(...speciesRecords.map(r => r.latitude)).toFixed(2)}° to {Math.max(...speciesRecords.map(r => r.latitude)).toFixed(2)}° N, 
                  {Math.min(...speciesRecords.map(r => r.longitude)).toFixed(2)}° to {Math.max(...speciesRecords.map(r => r.longitude)).toFixed(2)}° W
                </div>
                <Button
                  onClick={() => {
                    const csv = [
                      ['Location', 'State', 'Date', 'Collector', 'Latitude', 'Longitude'],
                      ...speciesRecords.map(r => [
                        r.locality, r.state, r.dateCollected, r.collector, r.latitude, r.longitude
                      ])
                    ].map(row => row.join(',')).join('\n');
                    
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${selectedSpecies.replace(/\s+/g, '_')}_records.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  size="sm"
                  variant="outline"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600">No location records found for {selectedSpecies}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/geospatial">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Geospatial Analysis
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Top Prospects</h1>
            <p className="text-gray-600 mt-1">
              Discover species that occur in adjacent regions to your selected state
            </p>
          </div>
        </div>
      </div>

      {/* State Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <MapPin className="w-5 h-5 mr-2" />
            Select Target State
          </CardTitle>
          <CardDescription>
            Choose a state to analyze species distributions in surrounding regions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-md">
            <Select value={selectedState} onValueChange={setSelectedState}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a state..." />
              </SelectTrigger>
              <SelectContent>
                {states.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {selectedState && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Species Distribution Around {selectedState}
                </CardTitle>
                <CardDescription>
                  Species found in adjacent regions that could potentially occur in {selectedState}
                </CardDescription>
              </div>
              {prospectsData?.species && (
                <Button 
                  onClick={handleDownloadCsv}
                  variant="outline"
                  size="sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download CSV
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isProspectsLoading && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="mt-2 text-sm text-gray-600">Analyzing species distributions...</p>
              </div>
            )}

            {prospectsError && (
              <div className="text-center py-8">
                <p className="text-red-600">Error loading data. Please try again.</p>
              </div>
            )}

            {prospectsData?.species && (
              <>
                <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>{prospectsData.species.length}</strong> species found in regions surrounding {selectedState}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[300px]">Species</TableHead>
                        <TableHead className="text-center">
                          <div className="text-center">
                            <div>North</div>
                            <div className="text-xs text-gray-500">(All) (10°)</div>
                          </div>
                        </TableHead>
                        <TableHead className="text-center">
                          <div className="text-center">
                            <div>South</div>
                            <div className="text-xs text-gray-500">(All) (10°)</div>
                          </div>
                        </TableHead>
                        <TableHead className="text-center">
                          <div className="text-center">
                            <div>East</div>
                            <div className="text-xs text-gray-500">(All) (10°)</div>
                          </div>
                        </TableHead>
                        <TableHead className="text-center">
                          <div className="text-center">
                            <div>West</div>
                            <div className="text-xs text-gray-500">(All) (10°)</div>
                          </div>
                        </TableHead>
                        <TableHead className="text-center">Neighboring States</TableHead>
                        <TableHead className="text-center">Weighted Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prospectsData.species.map((species, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div>
                              <button
                                onClick={() => handleSpeciesClick(species.scientificName)}
                                className="font-medium text-blue-600 hover:text-blue-800 italic text-left hover:underline cursor-pointer"
                              >
                                {species.scientificName}
                              </button>
                              {species.commonName && (
                                <div className="text-sm text-gray-600">
                                  {species.commonName}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {species.northCount > 0 || species.northNearbyCount > 0 ? (
                              <div className="text-sm">
                                <span className="font-medium">N ({species.northCount}) ({species.northNearbyCount})</span>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {species.southCount > 0 || species.southNearbyCount > 0 ? (
                              <div className="text-sm">
                                <span className="font-medium">S ({species.southCount}) ({species.southNearbyCount})</span>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {species.eastCount > 0 || species.eastNearbyCount > 0 ? (
                              <div className="text-sm">
                                <span className="font-medium">E ({species.eastCount}) ({species.eastNearbyCount})</span>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {species.westCount > 0 || species.westNearbyCount > 0 ? (
                              <div className="text-sm">
                                <span className="font-medium">W ({species.westCount}) ({species.westNearbyCount})</span>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="text-sm font-medium">
                              {species.neighboringStatesCount > 0 ? (
                                <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                                  {species.neighboringStatesCount}
                                </span>
                              ) : (
                                <span className="text-gray-400">0</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-medium">
                            <div className="text-sm">
                              <div className="font-bold text-blue-600">{species.nearbyTotal}</div>
                              <div className="text-xs text-gray-500">({species.totalRecords} total)</div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            {prospectsData?.species && prospectsData.species.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-600">No species found in adjacent regions to {selectedState}.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <SpeciesRecordsDialog />
    </div>
  );
}