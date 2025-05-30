import { SpeciesFrequency } from "@/components/dashboard/SpeciesFrequency";
import { RareSpecies } from "@/components/dashboard/RareSpecies";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Species() {
  return (
    <div className="flex flex-col h-full">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Species Analysis</h2>
          <p className="text-slate-600 mt-1">
            Frequency distribution and rare species identification
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <SpeciesFrequency />
          <RareSpecies />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribution Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Common (>100 obs.)</span>
                  <span className="font-medium">156</span>
                </div>
                <div className="flex justify-between">
                  <span>Uncommon (10-100)</span>
                  <span className="font-medium">423</span>
                </div>
                <div className="flex justify-between">
                  <span>Rare (1-10)</span>
                  <span className="font-medium">844</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">GenBank Records</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>With Sequences</span>
                  <span className="font-medium">1,234</span>
                </div>
                <div className="flex justify-between">
                  <span>Multiple Genotypes</span>
                  <span className="font-medium">234</span>
                </div>
                <div className="flex justify-between">
                  <span>New Sequences</span>
                  <span className="font-medium text-green-600">67</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ecological Groups</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Saprophytic</span>
                  <span className="font-medium">67%</span>
                </div>
                <div className="flex justify-between">
                  <span>Mycorrhizal</span>
                  <span className="font-medium">28%</span>
                </div>
                <div className="flex justify-between">
                  <span>Parasitic</span>
                  <span className="font-medium">5%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Discovery Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>New Species 2024</span>
                  <span className="font-medium text-green-600">23</span>
                </div>
                <div className="flex justify-between">
                  <span>Rediscovered</span>
                  <span className="font-medium">12</span>
                </div>
                <div className="flex justify-between">
                  <span>Range Extensions</span>
                  <span className="font-medium">156</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
