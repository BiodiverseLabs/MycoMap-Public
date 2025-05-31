import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { MapPin, User, Trophy } from "lucide-react";

interface StateGlobalRecord {
  state: string;
  globalFirstCount: number;
  percentage: number;
}

interface ContributorGlobalRecord {
  id: string;
  name: string;
  affiliation?: string;
  globalFirstCount: number;
  percentage: number;
}

interface MostRecordsProps {
  state?: string;
}

export function MostRecords({ state }: MostRecordsProps) {
  const [activeTab, setActiveTab] = useState("states");

  // Fetch states with most global first records
  const { data: stateRecords, isLoading: statesLoading } = useQuery<StateGlobalRecord[]>({
    queryKey: ["/api/states/global-firsts", state],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (state) params.append('state', state);
      
      const response = await fetch(`/api/states/global-firsts?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch state global records');
      return response.json();
    }
  });

  // Fetch contributors with most global first records
  const { data: contributorRecords, isLoading: contributorsLoading } = useQuery<ContributorGlobalRecord[]>({
    queryKey: ["/api/contributors/global-firsts", state],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (state) params.append('state', state);
      params.append('limit', '10');
      
      const response = await fetch(`/api/contributors/global-firsts?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch contributor global records');
      return response.json();
    }
  });

  const isLoading = statesLoading || contributorsLoading;

  if (isLoading) {
    return (
      <Card className="col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Trophy className="w-5 h-5 text-amber-600" />
            <span>Most Records</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-4 bg-slate-200 rounded w-24"></div>
                <div className="h-4 bg-slate-200 rounded w-8"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Trophy className="w-5 h-5 text-amber-600" />
          <span>Most Records</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="states" className="flex items-center space-x-1">
              <MapPin className="w-4 h-4" />
              <span>States</span>
            </TabsTrigger>
            <TabsTrigger value="contributors" className="flex items-center space-x-1">
              <User className="w-4 h-4" />
              <span>Contributors</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="states" className="mt-4">
            <div className="space-y-3">
              <p className="text-sm text-slate-600 mb-3">
                States with most 1st Global Records
              </p>
              {stateRecords && stateRecords.length > 0 ? (
                stateRecords.slice(0, 8).map((record, index) => (
                  <div key={record.state} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Badge variant={index < 3 ? "default" : "secondary"} className="text-xs">
                        #{index + 1}
                      </Badge>
                      <span className="text-sm font-medium text-slate-900">
                        {record.state}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-bold text-slate-900">
                        {record.globalFirstCount.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-500">
                        ({record.percentage.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No global first records found</p>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="contributors" className="mt-4">
            <div className="space-y-3">
              <p className="text-sm text-slate-600 mb-3">
                Contributors with most 1st Global Records
              </p>
              {contributorRecords && contributorRecords.length > 0 ? (
                contributorRecords.slice(0, 8).map((record, index) => (
                  <div key={record.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Badge variant={index < 3 ? "default" : "secondary"} className="text-xs">
                          #{index + 1}
                        </Badge>
                        <span className="text-sm font-medium text-slate-900">
                          {record.name}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-slate-900">
                          {record.globalFirstCount.toLocaleString()}
                        </span>
                        <span className="text-xs text-slate-500">
                          ({record.percentage.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    {record.affiliation && (
                      <p className="text-xs text-slate-500 ml-8">
                        {record.affiliation}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No global first records found</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}