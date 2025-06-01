import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface PhylumData {
  phylum: string;
  count: number;
}

export default function PhylumDetail() {
  const { data: phylums = [], isLoading } = useQuery({
    queryKey: ["/api/taxonomic-distribution"],
    queryFn: async () => {
      const response = await fetch('/api/taxonomic-distribution');
      if (!response.ok) throw new Error('Failed to fetch phylum distribution');
      return response.json();
    }
  });

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/taxonomic" className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" />
              Back to Taxonomic Analysis
            </Link>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Phylum Distribution</h2>
            <p className="text-slate-600 mt-1">
              Complete list of all phylums in the dataset
            </p>
          </div>
        </header>
        <main className="flex-1 p-6">
          <div className="text-center py-8 text-slate-500">Loading phylum data...</div>
        </main>
      </div>
    );
  }

  const totalObservations = phylums.reduce((sum: number, phylum: PhylumData) => sum + phylum.count, 0);

  return (
    <div className="flex flex-col h-full">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/taxonomic" className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Back to Taxonomic Analysis
          </Link>
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Phylum Distribution</h2>
          <p className="text-slate-600 mt-1">
            Complete list of {phylums.length} phylums with {totalObservations.toLocaleString()} total observations
          </p>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-y-auto">
        <Card>
          <CardHeader>
            <CardTitle>All Phylums ({phylums.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 font-medium text-slate-900">Rank</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-900">Phylum</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-900">Observations</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-900">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {phylums.map((phylum: PhylumData, index: number) => {
                    const percentage = ((phylum.count / totalObservations) * 100).toFixed(1);
                    return (
                      <tr key={phylum.phylum} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4 text-slate-600 font-mono">
                          #{index + 1}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {phylum.phylum}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">
                          {phylum.count.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">
                          {percentage}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}