import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function OrderDetail() {
  const { data: orderData = [], isLoading } = useQuery({
    queryKey: ["/api/order-distribution"],
    queryFn: async () => {
      const response = await fetch('/api/order-distribution');
      if (!response.ok) throw new Error('Failed to fetch order distribution');
      return response.json();
    }
  });

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
          <h2 className="text-2xl font-semibold text-slate-900">Order Distribution</h2>
          <p className="text-slate-600 mt-1">Complete list of all orders in the dataset</p>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-y-auto">
        <Card>
          <CardHeader>
            <CardTitle>All Orders ({orderData.length} total)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-slate-500">Loading...</div>
            ) : (
              <div className="max-h-[600px] overflow-y-auto space-y-3">
              {orderData.map((order: any, index: number) => (
                <div key={order.order} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-500 min-w-[2rem]">#{index + 1}</span>
                    <span className="font-medium">{order.order}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{order.count.toLocaleString()}</div>
                    <div className="text-sm text-slate-500">observations</div>
                  </div>
                </div>
              ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}