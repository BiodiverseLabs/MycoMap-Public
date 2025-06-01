import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function PhylumDetail() {
  const { data: phylumData = [], isLoading } = useQuery({
    queryKey: ["/api/taxonomic-distribution"],
    queryFn: async () => {
      const response = await fetch('/api/taxonomic-distribution');
      if (!response.ok) throw new Error('Failed to fetch phylum distribution');
      return response.json();
    }
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/taxonomic">
          <ArrowLeft className="h-5 w-5 text-slate-600 hover:text-slate-800 cursor-pointer" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Phylum Distribution</h1>
          <p className="text-slate-600">Complete list of all phyla in the dataset</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Phyla ({phylumData.length} total)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-slate-500">Loading...</div>
          ) : (
            <div className="space-y-3">
              {phylumData.map((phylum: any, index: number) => (
                <div key={phylum.phylum} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-500 min-w-[2rem]">#{index + 1}</span>
                    <span className="font-medium">{phylum.phylum}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{phylum.count.toLocaleString()}</div>
                    <div className="text-sm text-slate-500">observations</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}