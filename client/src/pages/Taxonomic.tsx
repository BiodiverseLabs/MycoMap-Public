import { TaxonomicChart } from "@/components/dashboard/TaxonomicChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ExternalLink } from "lucide-react";

export default function Taxonomic() {
  // Fetch family distribution data
  const { data: familyData = [], isLoading: familyLoading } = useQuery({
    queryKey: ["/api/family-distribution"],
    queryFn: async () => {
      const response = await fetch('/api/family-distribution');
      if (!response.ok) throw new Error('Failed to fetch family distribution');
      return response.json();
    }
  });

  // Fetch phylum distribution data
  const { data: phylumData = [], isLoading: phylumLoading } = useQuery({
    queryKey: ["/api/taxonomic-distribution"],
    queryFn: async () => {
      const response = await fetch('/api/taxonomic-distribution');
      if (!response.ok) throw new Error('Failed to fetch phylum distribution');
      return response.json();
    }
  });

  // Fetch class distribution data
  const { data: classData = [], isLoading: classLoading } = useQuery({
    queryKey: ["/api/class-distribution"],
    queryFn: async () => {
      const response = await fetch('/api/class-distribution');
      if (!response.ok) throw new Error('Failed to fetch class distribution');
      return response.json();
    }
  });

  // Fetch order distribution data
  const { data: orderData = [], isLoading: orderLoading } = useQuery({
    queryKey: ["/api/order-distribution"],
    queryFn: async () => {
      const response = await fetch('/api/order-distribution');
      if (!response.ok) throw new Error('Failed to fetch order distribution');
      return response.json();
    }
  });

  // Fetch genus distribution data
  const { data: genusData = [], isLoading: genusLoading } = useQuery({
    queryKey: ["/api/genus-distribution"],
    queryFn: async () => {
      const response = await fetch('/api/genus-distribution');
      if (!response.ok) throw new Error('Failed to fetch genus distribution');
      return response.json();
    }
  });

  const getProgressWidth = (count: number, maxCount: number) => {
    return Math.round((count / maxCount) * 100);
  };

  const maxFamilyCount = familyData.length > 0 ? familyData[0].count : 1;

  return (
    <div className="flex flex-col h-full">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Taxonomic Analysis</h2>
          <p className="text-slate-600 mt-1">
            Distribution across taxonomic hierarchies
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <TaxonomicChart />
          
          <Card>
            <CardHeader>
              <CardTitle>Family Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {familyLoading ? (
                <div className="text-slate-500">Loading family data...</div>
              ) : (
                <div className="space-y-3">
                  {familyData.slice(0, 5).map((family: any, index: number) => (
                    <div key={family.family} className="flex items-center justify-between">
                      <span className="text-sm text-slate-600 truncate flex-1">{family.family}</span>
                      <div className="flex items-center space-x-2 ml-2">
                        <div className="w-16 bg-slate-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${
                              index === 0 ? 'bg-primary' : 
                              index === 1 ? 'bg-green-500' : 
                              index === 2 ? 'bg-yellow-500' : 
                              index === 3 ? 'bg-purple-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${getProgressWidth(family.count, maxFamilyCount)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-12 text-right">{family.count.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Phylum Stats</CardTitle>
            </CardHeader>
            <CardContent>
              {phylumLoading ? (
                <div className="text-slate-500 text-sm">Loading...</div>
              ) : (
                <div className="space-y-2 text-sm">
                  {phylumData.slice(0, 3).map((phylum: any) => (
                    <div key={phylum.phylum} className="flex justify-between">
                      <span className="truncate">{phylum.phylum}</span>
                      <span className="font-medium">{phylum.count.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t">
                    <Link href="/taxonomic/phylum">
                      <div className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 cursor-pointer">
                        <span>See all records</span>
                        <ExternalLink className="h-3 w-3" />
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Class Diversity</CardTitle>
            </CardHeader>
            <CardContent>
              {classLoading ? (
                <div className="text-slate-500 text-sm">Loading...</div>
              ) : (
                <div className="space-y-2 text-sm">
                  {classData.slice(0, 3).map((classItem: any) => (
                    <div key={classItem.class} className="flex justify-between">
                      <span className="truncate">{classItem.class}</span>
                      <span className="font-medium">{classItem.count.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t">
                    <Link href="/taxonomic/class">
                      <div className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 cursor-pointer">
                        <span>See all records</span>
                        <ExternalLink className="h-3 w-3" />
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              {orderLoading ? (
                <div className="text-slate-500 text-sm">Loading...</div>
              ) : (
                <div className="space-y-2 text-sm">
                  {orderData.slice(0, 3).map((order: any) => (
                    <div key={order.order} className="flex justify-between">
                      <span className="truncate">{order.order}</span>
                      <span className="font-medium">{order.count.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t">
                    <Link href="/taxonomic/order">
                      <div className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 cursor-pointer">
                        <span>See all records</span>
                        <ExternalLink className="h-3 w-3" />
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Genus Stats</CardTitle>
            </CardHeader>
            <CardContent>
              {genusLoading ? (
                <div className="text-slate-500 text-sm">Loading...</div>
              ) : (
                <div className="space-y-2 text-sm">
                  {genusData.slice(0, 3).map((genus: any) => (
                    <div key={genus.genus} className="flex justify-between">
                      <span className="truncate">{genus.genus}</span>
                      <span className="font-medium">{genus.count.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t">
                    <Link href="/taxonomic/genus">
                      <div className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 cursor-pointer">
                        <span>See all records</span>
                        <ExternalLink className="h-3 w-3" />
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
