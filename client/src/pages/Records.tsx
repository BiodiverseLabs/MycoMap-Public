import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Users, Eye, Dna } from "lucide-react";
import { Link } from "wouter";

interface StateRecord {
  state: string;
  globalFirstCount: number;
  percentage: number;
}

interface ContributorRecord {
  id: string;
  name: string;
  affiliation?: string;
  globalFirstCount: number;
  percentage: number;
}

interface ContributorObservations {
  id: string;
  name: string;
  affiliation?: string;
  observationCount: number;
}

interface ContributorSpecies {
  id: string;
  name: string;
  affiliation?: string;
  speciesCount: number;
}

interface ContributorStateRecord {
  id: string;
  name: string;
  affiliation?: string;
  stateFirstCount: number;
  percentage: number;
}

function MostGlobalFirstsByState() {
  const { data: stateData = [], isLoading } = useQuery<StateRecord[]>({
    queryKey: ['/api/states/global-firsts'],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          States - Most 1st Global Records
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {stateData.slice(0, 10).map((state, index) => {
              const isTopThree = index < 3;
              const badgeColors = ['bg-blue-500', 'bg-blue-500', 'bg-blue-500'];
              
              return (
                <div key={state.state} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className={`flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold ${
                      isTopThree ? badgeColors[index] : 'bg-muted-foreground'
                    }`}>
                      {index + 1}
                    </span>
                    <span className={isTopThree ? "font-semibold" : "font-medium"}>{state.state}</span>
                  </div>
                  <div className="text-right">
                    <div className={isTopThree ? "font-bold text-lg" : "font-semibold"}>{state.globalFirstCount.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{state.percentage.toFixed(1)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 pt-4 border-t">
          <Link href="/records/states-global-firsts" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            See all records →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function MostGlobalFirstsByContributor() {
  const { data: contributorData = [], isLoading } = useQuery<ContributorRecord[]>({
    queryKey: ['/api/contributors/global-firsts'],
    queryFn: async () => {
      const response = await fetch('/api/contributors/global-firsts?limit=10');
      if (!response.ok) throw new Error('Failed to fetch contributor global firsts');
      return response.json();
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          Contributors - Most 1st Global Records
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {contributorData.slice(0, 10).map((contributor, index) => {
              const isTopThree = index < 3;
              const badgeColors = ['bg-blue-500', 'bg-blue-500', 'bg-blue-500'];
              
              return (
                <div key={contributor.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold ${
                      isTopThree ? badgeColors[index] : 'bg-muted-foreground'
                    }`}>
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className={`${isTopThree ? "font-semibold" : "font-medium"} truncate text-sm`}>{contributor.name}</div>
                      {contributor.affiliation && (
                        <div className="text-xs text-muted-foreground truncate">{contributor.affiliation}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={isTopThree ? "font-bold text-sm" : "font-semibold text-sm"}>{contributor.globalFirstCount.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{contributor.percentage.toFixed(1)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 pt-4 border-t">
          <Link href="/records/contributors-global-firsts" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            See all records →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function MostStateFirstsByContributor() {
  const { data: contributorData = [], isLoading } = useQuery<ContributorStateRecord[]>({
    queryKey: ['/api/contributors/state-firsts'],
    queryFn: async () => {
      const response = await fetch('/api/contributors/state-firsts?limit=10');
      if (!response.ok) throw new Error('Failed to fetch contributor state firsts');
      return response.json();
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-orange-500" />
          Most State First Records
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : contributorData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No state first records found
          </div>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {contributorData.slice(0, 10).map((contributor, index) => {
              const isTopThree = index < 3;
              const badgeColors = ['bg-blue-500', 'bg-blue-500', 'bg-blue-500'];
              
              return (
                <div key={contributor.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold ${
                      isTopThree ? badgeColors[index] : 'bg-muted-foreground'
                    }`}>
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className={`${isTopThree ? "font-semibold" : "font-medium"} truncate text-sm`}>{contributor.name}</div>
                      {contributor.affiliation && (
                        <div className="text-xs text-muted-foreground truncate">{contributor.affiliation}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={isTopThree ? "font-bold text-sm" : "font-semibold text-sm"}>{contributor.stateFirstCount.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{contributor.percentage.toFixed(1)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 pt-4 border-t">
          <Link href="/records/contributors-state-firsts" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            See all records →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function MostObservations() {
  const { data: contributorData = [], isLoading } = useQuery<ContributorObservations[]>({
    queryKey: ['/api/contributors'],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-blue-500" />
          Most Sequenced Specimens
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {contributorData.slice(0, 10).map((contributor, index) => {
              const isTopThree = index < 3;
              const badgeColors = ['bg-blue-500', 'bg-blue-500', 'bg-blue-500'];
              
              return (
                <div key={contributor.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold ${
                      isTopThree ? badgeColors[index] : 'bg-muted-foreground'
                    }`}>
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className={`${isTopThree ? "font-semibold" : "font-medium"} truncate text-sm`}>{contributor.name}</div>
                      {contributor.affiliation && (
                        <div className="text-xs text-muted-foreground truncate">{contributor.affiliation}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={isTopThree ? "font-bold text-sm" : "font-semibold text-sm"}>{contributor.observationCount.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">specimens</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 pt-4 border-t">
          <Link href="/records/most-observations" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            See all records →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function MostSpecies() {
  const { data: speciesData = [], isLoading } = useQuery<ContributorSpecies[]>({
    queryKey: ['/api/contributors/species'],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Dna className="h-5 w-5 text-green-500" />
          Most Species Documented
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : speciesData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No species discovery data found
          </div>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {speciesData.slice(0, 10).map((contributor, index) => {
              const isTopThree = index < 3;
              const badgeColors = ['bg-blue-500', 'bg-blue-500', 'bg-blue-500'];
              
              return (
                <div key={contributor.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold ${
                      isTopThree ? badgeColors[index] : 'bg-muted-foreground'
                    }`}>
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className={`${isTopThree ? "font-semibold" : "font-medium"} truncate text-sm`}>{contributor.name}</div>
                      {contributor.affiliation && (
                        <div className="text-xs text-muted-foreground truncate">{contributor.affiliation}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={isTopThree ? "font-bold text-sm" : "font-semibold text-sm"}>{contributor.speciesCount.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">species</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 pt-4 border-t">
          <Link href="/records/most-species" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            See all records →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Records() {
  return (
    <div className="flex h-screen bg-background">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold">Contributor Records</h1>
            <p className="text-muted-foreground mt-2">
              Rankings and achievements of researchers contributing to the macrofungi DNA sequence database
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-6">
            <MostGlobalFirstsByState />
            <MostGlobalFirstsByContributor />
            <MostStateFirstsByContributor />
            <MostObservations />
            <MostSpecies />
          </div>
        </div>
      </div>
    </div>
  );
}