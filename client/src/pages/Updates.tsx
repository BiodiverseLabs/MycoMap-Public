import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Observation } from "@shared/schema";

export default function Updates() {
  const { data: nameUpdates = [], isLoading: nameLoading } = useQuery<Observation[]>({
    queryKey: ["/api/observations/name-updates"]
  });

  const { data: classificationUpdates = [], isLoading: classificationLoading } = useQuery<Observation[]>({
    queryKey: ["/api/observations/classification-updates"]
  });

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
      record.observationId,
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

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Name Updates Panel */}
          <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CardTitle className="text-xl">Name Updates Needed</CardTitle>
                <Badge variant="destructive" className="ml-2">
                  {nameLoading ? "..." : nameUpdates.length}
                </Badge>
              </div>
              <Button
                onClick={() => downloadRecords(nameUpdates, 'name')}
                disabled={nameLoading || nameUpdates.length === 0}
                size="sm"
                variant="outline"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Records
              </Button>
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
            ) : nameUpdates.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-slate-500">No name updates needed</div>
              </div>
            ) : (
              <ScrollArea className="h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Observation ID</TableHead>
                      <TableHead>Current Name</TableHead>
                      <TableHead>Collector</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nameUpdates.slice(0, 100).map((record) => (
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
                {nameUpdates.length > 100 && (
                  <div className="mt-4 text-center text-sm text-slate-500">
                    Showing first 100 of {nameUpdates.length} records. Download for complete list.
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
                            {record.observationId}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{record.species || record.scientificName}</div>
                            {record.infraspecies && (
                              <div className="text-sm text-slate-500">{record.infraspecies}</div>
                            )}
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
        </div>

        {/* Summary Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Update Summary</CardTitle>
            <CardDescription>Overview of records requiring taxonomic updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <div className="text-2xl font-bold text-red-600">
                {nameLoading || classificationLoading ? "..." : nameUpdates.length + classificationUpdates.length}
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