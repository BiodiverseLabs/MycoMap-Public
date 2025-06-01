import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function GenusDetail() {
  const { data: genusData = [], isLoading } = useQuery({
    queryKey: ["/api/genus-distribution"],
    queryFn: async () => {
      const response = await fetch('/api/genus-distribution');
      if (!response.ok) throw new Error('Failed to fetch genus distribution');
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
          <h1 className="text-2xl font-bold text-slate-900">Genus Distribution</h1>
          <p className="text-slate-600">Complete list of all genera in the dataset</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Genera ({genusData.length} total)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-slate-500">Loading...</div>
          ) : (
            <div className="space-y-3">
              {genusData.map((genus: any, index: number) => (
                <div key={genus.genus} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-500 min-w-[2rem]">#{index + 1}</span>
                    <span className="font-medium">{genus.genus}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{genus.count.toLocaleString()}</div>
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