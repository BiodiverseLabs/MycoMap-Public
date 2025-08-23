import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, MapPin, Download, Dna, Calendar, Check, Search, GitBranch, Activity, Users, X } from "lucide-react";
import { format } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";

interface FieldGuide {
  id: number;
  name: string;
  description: string | null;
  boundingBoxNorth: string;
  boundingBoxSouth: string;
  boundingBoxEast: string;
  boundingBoxWest: string;
  speciesCount: number;
  createdAt: string;
  updatedAt: string;
}

interface FieldGuideSpecies {
  id: number;
  fieldGuideId: number;
  scientificName: string;
  commonName: string | null;
  family: string | null;
  observationCount: number;
  selectedImageUrl: string | null;
  selectedImageSource: string | null;
  selectedObservationId: string | null;
  addedAt: string;
}

interface Contributor {
  name: string;
  observationCount: number;
  speciesCount: number;
}

export default function FieldGuideDetail() {
  const [, params] = useRoute('/field-guides/:id');
  const [, setLocation] = useLocation();
  const [searchFilter, setSearchFilter] = useState('');
  const [showContributorsModal, setShowContributorsModal] = useState(false);
  const fieldGuideId = params?.id ? parseInt(params.id) : null;

  const { data: fieldGuide, isLoading: isLoadingGuide, error: guideError } = useQuery({
    queryKey: ['/api/field-guides', fieldGuideId],
    queryFn: async () => {
      if (!fieldGuideId) throw new Error('No field guide ID');
      const response = await fetch(`/api/field-guides/${fieldGuideId}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Field guide not found');
        }
        throw new Error('Failed to fetch field guide');
      }
      return response.json() as Promise<FieldGuide>;
    },
    enabled: !!fieldGuideId
  });

  const { data: allSpecies = [], isLoading: isLoadingSpecies, error: speciesError } = useQuery({
    queryKey: ['/api/field-guides', fieldGuideId, 'species'],
    queryFn: async () => {
      if (!fieldGuideId) throw new Error('No field guide ID');
      const response = await fetch(`/api/field-guides/${fieldGuideId}/species`);
      if (!response.ok) throw new Error('Failed to fetch species');
      return response.json() as Promise<FieldGuideSpecies[]>;
    },
    enabled: !!fieldGuideId
  });

  const { data: contributorsData } = useQuery({
    queryKey: ['/api/field-guides', fieldGuideId, 'contributors'],
    queryFn: async () => {
      if (!fieldGuideId) throw new Error('No field guide ID');
      const response = await fetch(`/api/field-guides/${fieldGuideId}/contributors`);
      if (!response.ok) throw new Error('Failed to fetch contributors count');
      return response.json() as Promise<{ contributorsCount: number }>;
    },
    enabled: !!fieldGuideId
  });

  const { data: detailedContributorsData } = useQuery({
    queryKey: ['/api/field-guides', fieldGuideId, 'contributors', 'detailed'],
    queryFn: async () => {
      if (!fieldGuideId) throw new Error('No field guide ID');
      const response = await fetch(`/api/field-guides/${fieldGuideId}/contributors/detailed`);
      if (!response.ok) throw new Error('Failed to fetch detailed contributors');
      return response.json() as Promise<{ contributors: Contributor[] }>;
    },
    enabled: !!fieldGuideId && showContributorsModal
  });

  // Filter species based on search term
  const species = allSpecies.filter(s => 
    searchFilter === '' || 
    s.scientificName.toLowerCase().includes(searchFilter.toLowerCase())
  );

  // Calculate unique genera count from filtered species
  const uniqueGenera = new Set(
    species
      .map(s => s.scientificName.split(' ')[0])
      .filter(genus => genus && genus.length > 0)
  );
  const generaCount = uniqueGenera.size;

  // Calculate total observations count
  const totalObservations = species.reduce((sum, s) => sum + s.observationCount, 0);
  const allObservationsTotal = allSpecies.reduce((sum, s) => sum + s.observationCount, 0);

  const downloadCSV = () => {
    if (!fieldGuide || !species.length) return;

    const headers = ['Scientific Name', 'Common Name', 'Observation Count'];
    const csvContent = [
      headers.join(','),
      ...species.map(s => [
        `"${s.scientificName}"`,
        `"${s.commonName || ''}"`,
        s.observationCount.toString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `${fieldGuide.name.replace(/[^a-zA-Z0-9]/g, '_')}_species.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (!fieldGuideId) {
    return (
      <div className="container mx-auto p-4">
        <Alert variant="destructive">
          <AlertDescription>
            Invalid field guide ID.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoadingGuide || isLoadingSpecies) {
    return (
      <div className="container mx-auto p-4 space-y-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading field guide...</p>
        </div>
      </div>
    );
  }

  if (guideError || speciesError) {
    return (
      <div className="container mx-auto p-4">
        <Alert variant="destructive">
          <AlertDescription>
            {guideError?.message === 'Field guide not found' 
              ? 'Field guide not found.'
              : 'Failed to load field guide. Please try again later.'
            }
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!fieldGuide) {
    return (
      <div className="container mx-auto p-4">
        <Alert variant="destructive">
          <AlertDescription>
            Field guide not found.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            onClick={() => setLocation('/field-guides')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Field Guides
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{fieldGuide.name}</h1>
            {fieldGuide.description && (
              <p className="text-slate-600 mt-1">{fieldGuide.description}</p>
            )}
          </div>
        </div>
        <Button 
          onClick={downloadCSV}
          className="flex items-center gap-2"
          disabled={species.length === 0}
        >
          <Download className="w-4 h-4" />
          Download CSV
        </Button>
      </div>

      {/* Field Guide Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Dna className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">
                  {species.length}
                  {searchFilter && species.length !== allSpecies.length && (
                    <span className="text-lg text-slate-500 ml-1">
                      / {allSpecies.length}
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-600">
                  {searchFilter && species.length !== allSpecies.length ? 'Filtered Species' : 'Species'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">
                  {generaCount}
                  {searchFilter && generaCount !== new Set(allSpecies.map(s => s.scientificName.split(' ')[0]).filter(g => g && g.length > 0)).size && (
                    <span className="text-lg text-slate-500 ml-1">
                      / {new Set(allSpecies.map(s => s.scientificName.split(' ')[0]).filter(g => g && g.length > 0)).size}
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-600">
                  {searchFilter && generaCount !== new Set(allSpecies.map(s => s.scientificName.split(' ')[0]).filter(g => g && g.length > 0)).size ? 'Filtered Genera' : 'Genera'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">
                  {totalObservations.toLocaleString()}
                  {searchFilter && totalObservations !== allObservationsTotal && (
                    <span className="text-lg text-slate-500 ml-1">
                      / {allObservationsTotal.toLocaleString()}
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-600">
                  {searchFilter && totalObservations !== allObservationsTotal ? 'Filtered Observations' : 'Total Observations'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <button
              onClick={() => setShowContributorsModal(true)}
              className="flex items-center gap-2 w-full text-left hover:bg-slate-50 rounded-lg p-2 -m-2 transition-colors"
            >
              <Users className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">
                  {contributorsData?.contributorsCount || 0}
                </p>
                <p className="text-sm text-slate-600">Contributors</p>
              </div>
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Species List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Dna className="w-5 h-5" />
            Species List ({species.length}{searchFilter ? ` of ${allSpecies.length}` : ''})
          </CardTitle>
          
          {/* Search Filter */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Filter by scientific name..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {species.length === 0 ? (
            <div className="text-center py-8">
              <Dna className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {searchFilter ? 'No matching species' : 'No species found'}
              </h3>
              <p className="text-slate-600">
                {searchFilter 
                  ? `No species found matching "${searchFilter}". Try a different search term.`
                  : 'No species were found in the selected bounding box area.'
                }
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scientific Name</TableHead>
                    <TableHead>Family</TableHead>
                    <TableHead className="text-center">Image</TableHead>
                    <TableHead className="text-right">Observations</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {species.map((species) => (
                    <TableRow key={species.id}>
                      <TableCell className="font-medium">
                        <button
                          onClick={() => setLocation(`/field-guides/${fieldGuideId}/species/${encodeURIComponent(species.scientificName)}`)}
                          className="text-left italic text-primary hover:text-primary/80 hover:underline block"
                        >
                          {species.scientificName}
                        </button>
                      </TableCell>
                      <TableCell>
                        {species.family || (
                          <span className="text-slate-400">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Check 
                          className={`w-4 h-4 mx-auto ${
                            species.selectedImageUrl 
                              ? 'text-green-600' 
                              : 'text-slate-300'
                          }`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">
                          {species.observationCount}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contributors Modal */}
      <Dialog open={showContributorsModal} onOpenChange={setShowContributorsModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Contributors to {fieldGuide?.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Scientists and citizen naturalists contributing observations within this region
            </p>
            
            {detailedContributorsData?.contributors ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-4 text-sm font-medium text-slate-700 border-b pb-2">
                  <span>Contributor</span>
                  <span className="text-center">Species</span>
                  <span className="text-right">Observations</span>
                </div>
                
                {detailedContributorsData.contributors.map((contributor, index) => (
                  <div key={contributor.name} className="grid grid-cols-3 gap-4 py-2 border-b border-slate-100 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-mono">
                        #{index + 1}
                      </span>
                      <span className="font-medium">{contributor.name}</span>
                    </div>
                    <div className="text-center">
                      <Badge variant="outline">
                        {contributor.speciesCount?.toLocaleString() || 0}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <Badge variant="secondary">
                        {contributor.observationCount.toLocaleString()}
                      </Badge>
                    </div>
                  </div>
                ))}
                
                <div className="mt-4 pt-4 border-t bg-slate-50 rounded-lg p-3">
                  <div className="text-sm text-slate-600">
                    <strong>Total:</strong> {detailedContributorsData.contributors.reduce((sum, c) => sum + (c.speciesCount || 0), 0).toLocaleString()} species, {detailedContributorsData.contributors.reduce((sum, c) => sum + c.observationCount, 0).toLocaleString()} observations from {detailedContributorsData.contributors.length} contributors
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500">Loading contributors...</p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}