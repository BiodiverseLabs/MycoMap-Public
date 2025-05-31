import { useState, useEffect, useCallback } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Activity, MapPin, Calendar, User, Globe, Flag, Search, Filter, ExternalLink } from "lucide-react";

interface RecordItem {
  id: number;
  species: string;
  state: string;
  reportDate: string;
  source: string;
  referenceNumber: string;
  datasetRecordNumber: number;
  stateRecordNumber: number;
  isFirstGlobal: boolean;
  isFirstInState: boolean;
}

const RECORDS_PER_PAGE = 20;

export default function ActivityFeed() {
  const [filter, setFilter] = useState<'all' | 'global' | 'state'>('all');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [speciesFilter, setSpeciesFilter] = useState<string>('all');

  // Fetch states for filter dropdown
  const { data: statesData } = useQuery({
    queryKey: ['/api/observations/summary', 'states'],
    queryFn: async () => {
      const response = await fetch('/api/observations/summary?aggregate=states');
      if (!response.ok) throw new Error('Failed to fetch states');
      return response.json();
    },
  });



  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError
  } = useInfiniteQuery({
    queryKey: ["/api/activity-feed", filter, selectedState, startDate, endDate, speciesFilter],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      params.append('limit', RECORDS_PER_PAGE.toString());
      params.append('offset', (pageParam * RECORDS_PER_PAGE).toString());
      params.append('recent', 'true'); // Sort by newest first
      
      if (filter === 'global') {
        params.append('stateFirstsOnly', 'false');
        params.append('globalFirstsOnly', 'true');
      } else if (filter === 'state') {
        params.append('stateFirstsOnly', 'true');
        params.append('globalFirstsOnly', 'false');
      }

      if (selectedState && selectedState !== 'all') {
        params.append('state', selectedState);
      }

      if (startDate) {
        params.append('startDate', startDate);
      }

      if (endDate) {
        params.append('endDate', endDate);
      }

      if (speciesFilter && speciesFilter !== 'all') {
        params.append('species', speciesFilter);
      }
      
      const response = await fetch(`/api/record-index?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch activity feed');
      return response.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === RECORDS_PER_PAGE ? allPages.length : undefined;
    }
  });

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (
      window.innerHeight + document.documentElement.scrollTop >=
      document.documentElement.offsetHeight - 1000 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const allRecords = data?.pages.flat() || [];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  return (
    <div className="flex flex-col h-full">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
              <Activity className="w-6 h-6" />
              Activity Feed
            </h2>
            <p className="text-slate-600 mt-1">
              Real-time stream of recent observations and discoveries
            </p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            {/* State Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <Select value={selectedState} onValueChange={setSelectedState}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All States" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {statesData?.sort((a: any, b: any) => a.state.localeCompare(b.state)).map((state: any) => (
                    <SelectItem key={state.state} value={state.state}>
                      {state.state} ({state.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range Filters */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <Input
                type="date"
                placeholder="Start Date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-[140px]"
              />
              <span className="text-slate-500">to</span>
              <Input
                type="date"
                placeholder="End Date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[140px]"
              />
            </div>

            {/* Species Filter */}
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-500" />
              <Input
                type="text"
                placeholder="Search species..."
                value={speciesFilter === 'all' ? '' : speciesFilter}
                onChange={(e) => setSpeciesFilter(e.target.value || 'all')}
                className="w-[200px]"
              />
            </div>
          </div>

          {/* Record Type Filters */}
          <div className="flex gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              All Records
            </Button>
            <Button
              variant={filter === 'global' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('global')}
            >
              <Globe className="w-4 h-4 mr-1" />
              Global Firsts
            </Button>
            <Button
              variant={filter === 'state' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('state')}
            >
              <Flag className="w-4 h-4 mr-1" />
              State Firsts
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {isLoading && (
            <div className="space-y-4">
              {[...Array(10)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {isError && (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-slate-500">Failed to load activity feed. Please try again.</p>
              </CardContent>
            </Card>
          )}

          {allRecords.map((record: RecordItem) => (
            <Card key={`${record.id}-${record.datasetRecordNumber}`} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-medium text-slate-900 italic">
                        {record.species}
                      </h3>
                      <div className="flex gap-1">
                        {record.isFirstGlobal && (
                          <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600">
                            <Globe className="w-3 h-3 mr-1" />
                            Global First
                          </Badge>
                        )}
                        {record.isFirstInState && (
                          <Badge variant="secondary">
                            <Flag className="w-3 h-3 mr-1" />
                            State First
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-slate-600">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {record.state}
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDate(record.reportDate)}
                      </div>
                      <div className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        {record.source}
                      </div>
                    </div>
                    
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-xs text-slate-500">
                        Record #{record.datasetRecordNumber}
                        {record.stateRecordNumber && ` • State Record #${record.stateRecordNumber}`}
                        {record.referenceNumber && ` • Ref: ${record.referenceNumber}`}
                      </div>
                      {record.referenceNumber && record.referenceNumber !== 'N/A' && (
                        <a 
                          href={record.source === 'iNaturalist' 
                            ? `https://www.inaturalist.org/observations/${record.referenceNumber}`
                            : `https://mushroomobserver.org/observations/show_observation/${record.referenceNumber}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          View on {record.source}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {isFetchingNextPage && (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Card key={`loading-${i}`} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!hasNextPage && allRecords.length > 0 && (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-slate-500">You've reached the end of the activity feed.</p>
              </CardContent>
            </Card>
          )}

          {allRecords.length === 0 && !isLoading && !isError && (
            <Card>
              <CardContent className="p-6 text-center">
                <Activity className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No records found for the selected filter.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}