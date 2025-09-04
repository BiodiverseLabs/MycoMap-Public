import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download, ExternalLink, MapPin, Filter, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import type { Observation } from "@shared/schema";

export default function Updates() {
  const { data: nameUpdates = [], isLoading: nameLoading } = useQuery<Observation[]>({
    queryKey: ["/api/observations/name-updates"]
  });

  // State for Name Updates filtering and sorting
  const [nameUpdateSourceFilter, setNameUpdateSourceFilter] = useState<string>('all');
  const [nameUpdateSortOrder, setNameUpdateSortOrder] = useState<'asc' | 'desc'>('asc');

  const { data: classificationUpdates = [], isLoading: classificationLoading } = useQuery<Observation[]>({
    queryKey: ["/api/observations/classification-updates"]
  });

  const { data: encodingIssues = [], isLoading: encodingLoading } = useQuery<Observation[]>({
    queryKey: ["/api/observations/encoding-issues"]
  });

  const { data: missingGPS = [], isLoading: gpsLoading } = useQuery<Observation[]>({
    queryKey: ["/api/observations/missing-gps"]
  });

  // Filtered and sorted name updates
  const filteredAndSortedNameUpdates = useMemo(() => {
    let filtered = nameUpdates;
    
    // Apply source filter
    if (nameUpdateSourceFilter !== 'all') {
      filtered = nameUpdates.filter(record => record.source === nameUpdateSourceFilter);
    }
    
    // Apply sorting by source
    filtered.sort((a, b) => {
      const sourceA = a.source || 'Unknown';
      const sourceB = b.source || 'Unknown';
      const comparison = sourceA.localeCompare(sourceB);
      return nameUpdateSortOrder === 'asc' ? comparison : -comparison;
    });
    
    return filtered;
  }, [nameUpdates, nameUpdateSourceFilter, nameUpdateSortOrder]);

  // Get unique sources from nameUpdates
  const availableSources = useMemo(() => {
    const sources = Array.from(new Set(nameUpdates.map(record => record.source).filter((source): source is string => Boolean(source))));
    return sources.sort();
  }, [nameUpdates]);

  const downloadRecords = (records: Observation[], type: string) => {
    const csv = convertToCSV(records);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_updates_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const convertToCSV = (records: Observation[]): string => {
    if (records.length === 0) return '';
    
    const headers = [
      'ID', 'Observation ID', 'Scientific Name', 'Common Name', 'Kingdom', 'Phylum', 
      'Class', 'Order', 'Family', 'Genus', 'Species', 'Collector', 'Observer',
      'Observed On', 'State', 'Country', 'Latitude', 'Longitude', 'GenBank Accession',
      'Source', 'Source URL'
    ];
    
    const csvData = records.map(record => [
      record.id,
      record.observationId || (record as any).observation_id,
      record.scientificName,
      record.commonName || '',
      record.kingdom || '',
      record.phylum || '',
      record.class || '',
      record.order || '',
      record.family || '',
      record.genus || '',
      record.species || '',
      record.collector || '',
      record.observer || '',
      record.observedOn || '',
      record.state || '',
      record.country || '',
      record.latitude || '',
      record.longitude || '',
      record.genbankAccession || '',
      record.source || '',
      record.sourceUrl || ''
    ]);
    
    return [headers, ...csvData]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  };

  return (
    <div className="flex-1 h-full overflow-y-auto">
      <div className="space-y-6 p-6">
        <div className="flex items-center space-x-3">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Updates Needed</h1>
            <p className="text-slate-500">Records flagged for taxonomic updates and corrections</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Name Updates Panel */}
          <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CardTitle className="text-xl">Name Updates Needed</CardTitle>
                <Badge variant="destructive" className="ml-2">
                  {nameLoading ? "..." : filteredAndSortedNameUpdates.length}
                </Badge>
                {nameUpdateSourceFilter !== 'all' && (
                  <Badge variant="outline" className="ml-1 text-xs">
                    {nameUpdateSourceFilter} only
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Select value={nameUpdateSourceFilter} onValueChange={setNameUpdateSourceFilter}>
                  <SelectTrigger className="w-40">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Filter by source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    {availableSources.map((source) => (
                      <SelectItem key={source} value={source}>
                        {source}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => setNameUpdateSortOrder(nameUpdateSortOrder === 'asc' ? 'desc' : 'asc')}
                  variant="ghost"
                  size="sm"
                >
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  Sort {nameUpdateSortOrder === 'asc' ? '↑' : '↓'}
                </Button>
                <Button
                  onClick={() => downloadRecords(filteredAndSortedNameUpdates, 'name')}
                  disabled={nameLoading || filteredAndSortedNameUpdates.length === 0}
                  size="sm"
                  variant="outline"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Records
                </Button>
              </div>
            </div>
            <CardDescription>
              Records missing species or variety identification requiring taxonomic name updates
            </CardDescription>
          </CardHeader>
          <CardContent>
            {nameLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-slate-500">Loading records...</div>
              </div>
            ) : filteredAndSortedNameUpdates.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-slate-500">
                  {nameUpdateSourceFilter === 'all' ? 'No name updates needed' : `No name updates needed for ${nameUpdateSourceFilter}`}
                </div>
              </div>
            ) : (
              <ScrollArea className="h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Observation ID</TableHead>
                      <TableHead>Current Name</TableHead>
                      <TableHead>Source Database</TableHead>
                      <TableHead>Collector</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAndSortedNameUpdates.slice(0, 100).map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-mono text-sm">
                          {record.observationId}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{record.scientificName}</div>
                          {record.genus && record.genus !== record.scientificName && (
                            <div className="text-sm text-slate-500">{record.genus}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {record.source || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell>{record.collector || record.observer || 'Unknown'}</TableCell>
                        <TableCell>{record.state}</TableCell>
                        <TableCell>{record.observedOn}</TableCell>
                        <TableCell>
                          {record.sourceUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(record.sourceUrl!, '_blank')}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredAndSortedNameUpdates.length > 100 && (
                  <div className="mt-4 text-center text-sm text-slate-500">
                    Showing first 100 of {filteredAndSortedNameUpdates.length} records. Download for complete list.
                  </div>
                )}
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Classification Updates Panel */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CardTitle className="text-xl">Classification Updates Needed</CardTitle>
                <Badge variant="destructive" className="ml-2">
                  {classificationLoading ? "..." : classificationUpdates.length}
                </Badge>
              </div>
              <Button
                onClick={() => downloadRecords(classificationUpdates, 'classification')}
                disabled={classificationLoading || classificationUpdates.length === 0}
                size="sm"
                variant="outline"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Records
              </Button>
            </div>
            <CardDescription>
              Records with species/variety but missing higher taxonomy requiring classification updates
            </CardDescription>
          </CardHeader>
          <CardContent>
            {classificationLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-slate-500">Loading records...</div>
              </div>
            ) : classificationUpdates.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-slate-500">No classification updates needed</div>
              </div>
            ) : (
              <ScrollArea className="h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Observation ID</TableHead>
                      <TableHead>Species</TableHead>
                      <TableHead>Source Database</TableHead>
                      <TableHead>Missing Taxonomy</TableHead>
                      <TableHead>Collector</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classificationUpdates.slice(0, 100).map((record) => {
                      const missingFields = [];
                      if (!record.kingdom) missingFields.push('Kingdom');
                      if (!record.phylum) missingFields.push('Phylum');
                      if (!record.class) missingFields.push('Class');
                      if (!record.order) missingFields.push('Order');
                      if (!record.family) missingFields.push('Family');
                      if (!record.genus) missingFields.push('Genus');
                      
                      return (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono text-sm">
                            {record.observationId || (record as any).observation_id}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{record.species || record.scientificName}</div>
                            {record.infraspecies && (
                              <div className="text-sm text-slate-500">{record.infraspecies}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {record.source || 'Unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {missingFields.slice(0, 3).map(field => (
                                <Badge key={field} variant="secondary" className="text-xs">
                                  {field}
                                </Badge>
                              ))}
                              {missingFields.length > 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{missingFields.length - 3}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{record.collector || record.observer || 'Unknown'}</TableCell>
                          <TableCell>{record.state}</TableCell>
                          <TableCell>
                            {record.sourceUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(record.sourceUrl!, '_blank')}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {classificationUpdates.length > 100 && (
                  <div className="mt-4 text-center text-sm text-slate-500">
                    Showing first 100 of {classificationUpdates.length} records. Download for complete list.
                  </div>
                )}
              </ScrollArea>
            )}
          </CardContent>
          </Card>

          {/* Character Encoding Issues Panel */}
          <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CardTitle className="text-xl">Character Encoding Issues</CardTitle>
                <Badge variant="destructive" className="ml-2">
                  {encodingLoading ? "..." : encodingIssues.length}
                </Badge>
              </div>
              <Button
                onClick={() => downloadRecords(encodingIssues, 'encoding')}
                disabled={encodingLoading || encodingIssues.length === 0}
                size="sm"
                variant="outline"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
            <CardDescription>
              Records with UTF-8 character encoding corruption requiring fixes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {encodingLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-slate-500">Loading records...</div>
              </div>
            ) : encodingIssues.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-slate-500">No encoding issues found</div>
              </div>
            ) : (
              <ScrollArea className="h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Observation ID</TableHead>
                      <TableHead>Species</TableHead>
                      <TableHead>Collector</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Encoding Issues</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {encodingIssues.slice(0, 100).map((record) => {
                      const issues = [];
                      // Check for smart quotes and apostrophes
                      if (record.scientificName && (record.scientificName.includes('â€œ') || record.scientificName.includes('â€') || record.scientificName.includes('â€™'))) {
                        issues.push('Scientific Name');
                      }
                      if (record.collector && (record.collector.includes('â€œ') || record.collector.includes('â€') || record.collector.includes('â€™'))) {
                        issues.push('Collector');
                      }
                      if (record.state && (record.state.includes('â€œ') || record.state.includes('â€') || record.state.includes('â€™'))) {
                        issues.push('State');
                      }
                      // Check for accented character encoding corruption
                      if (record.state && (record.state.includes('Ã¡') || record.state.includes('Ã©') || record.state.includes('Ã­') || record.state.includes('Ã³') || record.state.includes('Ãº') || record.state.includes('Ã±') || record.state.includes('Ã§') || record.state.includes('Ã¼') || record.state.includes('Ã¨') || record.state.includes('Ã '))) {
                        issues.push('State (Accented)');
                      }
                      if (record.placeGuess && (record.placeGuess.includes('Ã¡') || record.placeGuess.includes('Ã©') || record.placeGuess.includes('Ã­') || record.placeGuess.includes('Ã³') || record.placeGuess.includes('Ãº') || record.placeGuess.includes('Ã±') || record.placeGuess.includes('Ã§') || record.placeGuess.includes('Ã¼') || record.placeGuess.includes('Ã¨') || record.placeGuess.includes('Ã '))) {
                        issues.push('Location (Accented)');
                      }
                      if (record.country && (record.country.includes('Ã¡') || record.country.includes('Ã©') || record.country.includes('Ã­') || record.country.includes('Ã³') || record.country.includes('Ãº') || record.country.includes('Ã±') || record.country.includes('Ã§') || record.country.includes('Ã¼') || record.country.includes('Ã¨') || record.country.includes('Ã '))) {
                        issues.push('Country (Accented)');
                      }
                      
                      return (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono text-sm">
                            {record.observationId}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{record.scientificName}</div>
                            {record.commonName && (
                              <div className="text-sm text-slate-500">{record.commonName}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{record.collector || 'Unknown'}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{record.state || 'Unknown'}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {issues.map((issue, index) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {issue}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {record.source || 'Unknown'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {encodingIssues.length > 100 && (
                  <div className="mt-4 text-center text-sm text-slate-500">
                    Showing first 100 of {encodingIssues.length} records. Download for complete list.
                  </div>
                )}
              </ScrollArea>
            )}
          </CardContent>
          </Card>

          {/* Missing GPS Coordinates Section */}
          <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-500" />
                Missing GPS Coordinates
                <Badge variant="destructive" className="ml-2">
                  {gpsLoading ? "..." : missingGPS.length}
                </Badge>
                {!gpsLoading && (() => {
                  const sequenceCount = missingGPS.filter(record => record.source === 'Sequences').length;
                  return sequenceCount > 0 ? (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      +{sequenceCount} sequences
                    </Badge>
                  ) : null;
                })()}
              </CardTitle>
              <CardDescription>
                Observations without valid latitude/longitude coordinates
                {!gpsLoading && (() => {
                  const sequenceCount = missingGPS.filter(record => record.source === 'Sequences').length;
                  return sequenceCount > 0 ? ` (${sequenceCount} sequence records included in CSV only)` : '';
                })()}
              </CardDescription>
            </div>
            <Button
              onClick={() => downloadRecords(missingGPS, 'missing_gps')}
              variant="outline"
              size="sm"
              disabled={gpsLoading || missingGPS.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Download CSV
            </Button>
          </CardHeader>
          <CardContent>
            {gpsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-slate-500">Loading missing GPS records...</div>
              </div>
            ) : missingGPS.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-slate-500">No records missing GPS coordinates found</div>
              </div>
            ) : (() => {
              // Filter out "Sequences" source for frontend display only
              const filteredGPS = missingGPS.filter(record => record.source !== 'Sequences');
              
              return (
                <ScrollArea className="h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Observation ID</TableHead>
                        <TableHead>Species</TableHead>
                        <TableHead>Collector</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>GPS Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredGPS.slice(0, 100).map((record) => {
                        const hasLat = record.latitude && record.latitude !== '0' && record.latitude !== '';
                        const hasLon = record.longitude && record.longitude !== '0' && record.longitude !== '';
                        
                        return (
                          <TableRow key={record.id}>
                            <TableCell className="font-mono text-sm">
                              {record.observationId}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{record.scientificName}</div>
                              {record.commonName && (
                                <div className="text-sm text-slate-500">{record.commonName}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{record.collector || 'Unknown'}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{record.state || 'Unknown'}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {record.source || 'Unknown'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {!hasLat && (
                                  <Badge variant="destructive" className="text-xs">
                                    No Latitude
                                  </Badge>
                                )}
                                {!hasLon && (
                                  <Badge variant="destructive" className="text-xs">
                                    No Longitude
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {filteredGPS.length > 100 ? (
                    <div className="mt-4 text-center text-sm text-slate-500">
                      Showing first 100 of {filteredGPS.length} records (excluding sequences). Download for complete list.
                    </div>
                  ) : filteredGPS.length === 0 ? (
                    <div className="mt-4 text-center text-sm text-slate-500">
                      All missing GPS records are sequence data. Download CSV for complete list.
                    </div>
                  ) : (
                    <div className="mt-4 text-center text-sm text-slate-500">
                      Showing {filteredGPS.length} records (excluding sequences). Download for complete list including sequences.
                    </div>
                  )}
                </ScrollArea>
              );
            })()}
          </CardContent>
          </Card>
        </div>

        {/* Summary Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Update Summary</CardTitle>
            <CardDescription>Overview of records requiring taxonomic updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-600">
                {nameLoading ? "..." : nameUpdates.length}
              </div>
              <div className="text-sm text-slate-500">Name Updates</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {classificationLoading ? "..." : classificationUpdates.length}
              </div>
              <div className="text-sm text-slate-500">Classification Updates</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {encodingLoading ? "..." : encodingIssues.length}
              </div>
              <div className="text-sm text-slate-500">Encoding Issues</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {gpsLoading ? "..." : missingGPS.length}
              </div>
              <div className="text-sm text-slate-500">Missing GPS</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-600">
                {nameLoading || classificationLoading || encodingLoading || gpsLoading ? "..." : nameUpdates.length + classificationUpdates.length + encodingIssues.length + missingGPS.length}
              </div>
              <div className="text-sm text-slate-500">Total Updates Needed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {nameLoading || classificationLoading ? "..." : 
                  `${(((70774 - nameUpdates.length - classificationUpdates.length) / 70774) * 100).toFixed(1)}%`}
              </div>
              <div className="text-sm text-slate-500">Records Complete</div>
            </div>
          </div>
        </CardContent>
        </Card>
      </div>
    </div>
  );
}