import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, MapPin, TrendingUp } from "lucide-react";
import { Link } from "wouter";

interface TopProspectSpecies {
  scientificName: string;
  commonName?: string;
  northCount: number;
  southCount: number;
  eastCount: number;
  westCount: number;
  totalRecords: number;
}

interface TopProspectsData {
  species: TopProspectSpecies[];
  stateInfo: {
    name: string;
    centerLatitude: number;
    centerLongitude: number;
  };
}

export default function TopProspects() {
  const [selectedState, setSelectedState] = useState<string>("");

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

  const handleDownloadCsv = () => {
    if (!prospectsData?.species) return;

    const headers = ['Scientific Name', 'Common Name', 'North Count', 'South Count', 'East Count', 'West Count', 'Total Records'];
    const csvData = prospectsData.species.map(species => [
      species.scientificName,
      species.commonName || '',
      species.northCount.toString(),
      species.southCount.toString(),
      species.eastCount.toString(),
      species.westCount.toString(),
      species.totalRecords.toString()
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
                        <TableHead className="text-center">North</TableHead>
                        <TableHead className="text-center">South</TableHead>
                        <TableHead className="text-center">East</TableHead>
                        <TableHead className="text-center">West</TableHead>
                        <TableHead className="text-center">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prospectsData.species.map((species, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div>
                              <div className="font-medium text-gray-900 italic">
                                {species.scientificName}
                              </div>
                              {species.commonName && (
                                <div className="text-sm text-gray-600">
                                  {species.commonName}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {species.northCount > 0 ? (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                N ({species.northCount})
                              </Badge>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {species.southCount > 0 ? (
                              <Badge variant="secondary" className="bg-green-100 text-green-800">
                                S ({species.southCount})
                              </Badge>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {species.eastCount > 0 ? (
                              <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                                E ({species.eastCount})
                              </Badge>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {species.westCount > 0 ? (
                              <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                                W ({species.westCount})
                              </Badge>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center font-medium">
                            {species.totalRecords}
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
    </div>
  );
}