import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Search, Archive, History, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface Biorecord {
  id: number;
  observationId: string;
  scientificName: string;
  commonName?: string;
  observer?: string;
  collector?: string;
  state?: string;
  validatedAt: string;
  validatedBy?: string;
  validationVersion: string;
  originalObservationId?: number;
  // External platform data
  inatScientificName?: string;
  inatObserver?: string;
  moScientificName?: string;
  moObserver?: string;
  mycoportalScientificName?: string;
  mycoportalRecordedBy?: string;
}

interface ValidationObservation {
  id: number;
  observationId: string;
  scientificName: string;
  commonName?: string;
  observer?: string;
  state?: string;
  hasInatData: boolean;
  hasMoData: boolean;
  hasMycoportalData: boolean;
  inatSyncStatus?: string;
  moSyncStatus?: string;
  mycoportalSyncStatus?: string;
  blastFilesDownloaded: boolean;
  traceFilesDownloaded: boolean;
  inatApiSaved: boolean;
}

export default function BioRecordManagement() {
  const [selectedObservationId, setSelectedObservationId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch biorecords
  const { data: biorecords = [], isLoading: biorecordsLoading } = useQuery({
    queryKey: ["/api/biorecords"],
    queryFn: async () => {
      const response = await fetch("/api/biorecords?limit=100");
      if (!response.ok) throw new Error("Failed to fetch biorecords");
      return response.json();
    }
  });

  // Fetch validated observations (potential candidates for biorecord creation)
  const { data: validatedObservations = [], isLoading: validationLoading } = useQuery({
    queryKey: ["/api/observations/validation"],
    queryFn: async () => {
      const response = await fetch("/api/observations/validation?limit=100&fullyValidated=true");
      if (!response.ok) throw new Error("Failed to fetch validated observations");
      return response.json();
    }
  });

  // Create biorecord mutation
  const createBiorecordMutation = useMutation({
    mutationFn: async (observationId: string) => {
      const response = await fetch(`/api/biorecords/create/${observationId}`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create biorecord");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Biorecord Created",
        description: `Historical snapshot created for observation ${data.biorecord.observationId}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/biorecords"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Batch create biorecords mutation
  const batchCreateMutation = useMutation({
    mutationFn: async (observationIds: string[]) => {
      const response = await fetch("/api/biorecords/batch-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observationIds }),
      });
      if (!response.ok) throw new Error("Failed to create batch biorecords");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Batch Creation Complete",
        description: `${data.message}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/biorecords"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Get biorecord history for an observation
  const { data: biorecordHistory = [] } = useQuery({
    queryKey: ["/api/biorecords", selectedObservationId, "history"],
    queryFn: async () => {
      if (!selectedObservationId) return [];
      const response = await fetch(`/api/biorecords/${selectedObservationId}/history`);
      if (!response.ok) throw new Error("Failed to fetch biorecord history");
      return response.json();
    },
    enabled: !!selectedObservationId,
  });

  const filteredBiorecords = biorecords.filter((record: Biorecord) =>
    record.scientificName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.observationId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (record.observer && record.observer.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (record.state && record.state.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredValidatedObservations = validatedObservations.filter((obs: ValidationObservation) =>
    obs.scientificName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    obs.observationId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (obs.observer && obs.observer.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleCreateBiorecord = (observationId: string) => {
    createBiorecordMutation.mutate(observationId);
  };

  const handleBatchCreate = () => {
    const observationIds = filteredValidatedObservations.map((obs: ValidationObservation) => obs.observationId);
    if (observationIds.length === 0) {
      toast({
        title: "No Records",
        description: "No validated observations available for biorecord creation",
        variant: "destructive",
      });
      return;
    }
    batchCreateMutation.mutate(observationIds);
  };

  const getValidationStatusBadge = (observation: ValidationObservation) => {
    const hasSpeciesLevel = observation.scientificName && observation.scientificName.split(' ').length >= 2;
    const hasRequiredFiles = observation.blastFilesDownloaded && observation.traceFilesDownloaded && observation.inatApiSaved;
    const hasSync = observation.inatSyncStatus === 'success' || observation.moSyncStatus === 'success' || observation.mycoportalSyncStatus === 'success';
    
    if (hasSpeciesLevel && hasRequiredFiles && hasSync) {
      return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Fully Validated</Badge>;
    }
    return <Badge variant="secondary"><AlertCircle className="w-3 h-3 mr-1" />Incomplete</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">BioRecord Management</h1>
          <p className="text-muted-foreground">
            Manage historical snapshots of fully validated observations
          </p>
        </div>
      </div>

      <Tabs defaultValue="biorecords" className="space-y-4">
        <TabsList>
          <TabsTrigger value="biorecords">Historical BioRecords</TabsTrigger>
          <TabsTrigger value="validation">Create from Validated</TabsTrigger>
        </TabsList>

        <TabsContent value="biorecords" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Archive className="w-5 h-5" />
                BioRecord Archive ({filteredBiorecords.length})
              </CardTitle>
              <CardDescription>
                Historical snapshots of fully validated observations captured at specific validation dates
              </CardDescription>
              <div className="flex items-center space-x-2">
                <Search className="w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search biorecords..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>
            </CardHeader>
            <CardContent>
              {biorecordsLoading ? (
                <div className="text-center py-8">Loading biorecords...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Observation ID</TableHead>
                      <TableHead>Scientific Name</TableHead>
                      <TableHead>Observer</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Validated Date</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBiorecords.map((record: Biorecord) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-mono">{record.observationId}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{record.scientificName}</div>
                            {record.commonName && (
                              <div className="text-sm text-muted-foreground">{record.commonName}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{record.observer || record.collector || "Unknown"}</TableCell>
                        <TableCell>{record.state || "Unknown"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(record.validatedAt), "MMM d, yyyy")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">v{record.validationVersion}</Badge>
                        </TableCell>
                        <TableCell>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedObservationId(record.observationId)}
                              >
                                <History className="w-3 h-3 mr-1" />
                                History
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl">
                              <DialogHeader>
                                <DialogTitle>Biorecord History - {record.observationId}</DialogTitle>
                                <DialogDescription>
                                  All historical snapshots for this observation
                                </DialogDescription>
                              </DialogHeader>
                              <ScrollArea className="h-96">
                                <div className="space-y-4">
                                  {biorecordHistory.map((historyRecord: Biorecord, index: number) => (
                                    <Card key={historyRecord.id}>
                                      <CardHeader className="pb-2">
                                        <div className="flex justify-between items-start">
                                          <div>
                                            <CardTitle className="text-lg">
                                              Snapshot #{biorecordHistory.length - index}
                                            </CardTitle>
                                            <CardDescription>
                                              {format(new Date(historyRecord.validatedAt), "PPP 'at' p")}
                                            </CardDescription>
                                          </div>
                                          <Badge variant="outline">v{historyRecord.validationVersion}</Badge>
                                        </div>
                                      </CardHeader>
                                      <CardContent className="pt-0">
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                          <div>
                                            <div className="font-medium">Scientific Name</div>
                                            <div>{historyRecord.scientificName}</div>
                                          </div>
                                          <div>
                                            <div className="font-medium">Observer</div>
                                            <div>{historyRecord.observer || "Unknown"}</div>
                                          </div>
                                          {historyRecord.inatScientificName && (
                                            <div>
                                              <div className="font-medium">iNaturalist Name</div>
                                              <div>{historyRecord.inatScientificName}</div>
                                            </div>
                                          )}
                                          {historyRecord.moScientificName && (
                                            <div>
                                              <div className="font-medium">MO Name</div>
                                              <div>{historyRecord.moScientificName}</div>
                                            </div>
                                          )}
                                        </div>
                                      </CardContent>
                                    </Card>
                                  ))}
                                </div>
                              </ScrollArea>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Create BioRecords from Validated Observations
              </CardTitle>
              <CardDescription>
                Select fully validated observations to create historical snapshots
              </CardDescription>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search validated observations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
                <Button 
                  onClick={handleBatchCreate}
                  disabled={batchCreateMutation.isPending || filteredValidatedObservations.length === 0}
                >
                  Create All BioRecords ({filteredValidatedObservations.length})
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {validationLoading ? (
                <div className="text-center py-8">Loading validated observations...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Observation ID</TableHead>
                      <TableHead>Scientific Name</TableHead>
                      <TableHead>Observer</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Validation Status</TableHead>
                      <TableHead>Platforms</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredValidatedObservations.map((observation: ValidationObservation) => (
                      <TableRow key={observation.id}>
                        <TableCell className="font-mono">{observation.observationId}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{observation.scientificName}</div>
                            {observation.commonName && (
                              <div className="text-sm text-muted-foreground">{observation.commonName}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{observation.observer || "Unknown"}</TableCell>
                        <TableCell>{observation.state || "Unknown"}</TableCell>
                        <TableCell>{getValidationStatusBadge(observation)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {observation.hasInatData && (
                              <Badge variant="outline" className="text-xs">iNat</Badge>
                            )}
                            {observation.hasMoData && (
                              <Badge variant="outline" className="text-xs">MO</Badge>
                            )}
                            {observation.hasMycoportalData && (
                              <Badge variant="outline" className="text-xs">MC</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCreateBiorecord(observation.observationId)}
                            disabled={createBiorecordMutation.isPending}
                          >
                            Create BioRecord
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}