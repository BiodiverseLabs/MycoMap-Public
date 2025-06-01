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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/taxonomic">
          <ArrowLeft className="h-5 w-5 text-slate-600 hover:text-slate-800 cursor-pointer" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Order Distribution</h1>
          <p className="text-slate-600">Complete list of all orders in the dataset</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Orders ({orderData.length} total)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-slate-500">Loading...</div>
          ) : (
            <div className="space-y-3">
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
    </div>
  );
}