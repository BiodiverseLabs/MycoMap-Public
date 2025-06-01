import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface FamilyData {
  family: string;
  count: number;
}

export default function FamilyDetail() {
  const { data: families = [], isLoading } = useQuery({
    queryKey: ["/api/family-distribution"],
    queryFn: async () => {
      const response = await fetch('/api/family-distribution');
      if (!response.ok) throw new Error('Failed to fetch family distribution');
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
            <h2 className="text-2xl font-semibold text-slate-900">Family Distribution</h2>
            <p className="text-slate-600 mt-1">
              Complete list of all families in the dataset
            </p>
          </div>
        </header>
        <main className="flex-1 p-6">
          <div className="text-center py-8 text-slate-500">Loading family data...</div>
        </main>
      </div>
    );
  }

  const totalObservations = families.reduce((sum: number, family: FamilyData) => sum + family.count, 0);

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
          <h2 className="text-2xl font-semibold text-slate-900">Family Distribution</h2>
          <p className="text-slate-600 mt-1">
            Complete list of {families.length} families with {totalObservations.toLocaleString()} total observations
          </p>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-y-auto">
        <Card>
          <CardHeader>
            <CardTitle>All Families ({families.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 font-medium text-slate-900">Rank</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-900">Family</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-900">Observations</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-900">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {families.map((family: FamilyData, index: number) => {
                    const percentage = ((family.count / totalObservations) * 100).toFixed(1);
                    return (
                      <tr key={family.family} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4 text-slate-600 font-mono">
                          #{index + 1}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {family.family}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">
                          {family.count.toLocaleString()}
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