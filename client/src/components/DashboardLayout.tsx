import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Lock, LogIn, Sparkles, Dna, Users } from "lucide-react";
import { Link } from "wouter";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  subscription: any | null;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, isLoading: authLoading } = useAuth();
  
  const { data: subscriptionStatus, isLoading: subLoading } = useQuery<SubscriptionStatus>({
    queryKey: ["/api/subscriptions/status"],
    enabled: !!user,
    retry: false,
  });

  const isLoading = authLoading || (user && subLoading);

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex flex-col lg:flex-row h-screen bg-slate-50">
        <Sidebar />
        <main className="flex-1 overflow-y-auto relative flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-[#8CBD45] border-t-transparent rounded-full" />
        </main>
      </div>
    );
  }

  // Check if user needs to login
  if (!user) {
    return (
      <div className="flex flex-col lg:flex-row h-screen bg-slate-50">
        <Sidebar />
        <main className="flex-1 overflow-y-auto relative flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-[#A87146]/10 flex items-center justify-center mx-auto mb-6">
              <LogIn className="h-8 w-8 text-[#A87146]" />
            </div>
            <h2 className="text-2xl font-bold text-[#A87146] mb-4">Sign In Required</h2>
            <p className="text-gray-600 mb-6">
              Please sign in to access the Research Dashboard and advanced analytical tools.
            </p>
            <a href="/api/login">
              <Button className="w-full bg-[#8CBD45] hover:bg-[#8CBD45]/90 text-white gap-2" data-testid="button-dashboard-login">
                <LogIn className="h-4 w-4" />
                Sign In
              </Button>
            </a>
          </div>
        </main>
      </div>
    );
  }

  // Check if user has active subscription
  if (!subscriptionStatus?.hasActiveSubscription) {
    return (
      <div className="flex flex-col lg:flex-row h-screen bg-slate-50">
        <Sidebar />
        <main className="flex-1 overflow-y-auto relative flex items-center justify-center p-8">
          <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-[#8CBD45]/10 flex items-center justify-center mx-auto mb-6">
              <Lock className="h-8 w-8 text-[#8CBD45]" />
            </div>
            <h2 className="text-2xl font-bold text-[#A87146] mb-4">Membership Required</h2>
            <p className="text-gray-600 mb-6">
              The Research Dashboard provides advanced analytical tools, live discovery monitoring, 
              and expert interpretation that require an active membership.
            </p>
            
            <div className="grid grid-cols-3 gap-4 mb-8 text-left">
              <div className="p-3 bg-gray-50 rounded-lg">
                <Dna className="h-5 w-5 text-[#8CBD45] mb-2" />
                <p className="text-xs text-gray-600">Advanced Discovery Tools</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <Sparkles className="h-5 w-5 text-[#8CBD45] mb-2" />
                <p className="text-xs text-gray-600">Live Research Stream</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <Users className="h-5 w-5 text-[#8CBD45] mb-2" />
                <p className="text-xs text-gray-600">Expert Interpretation</p>
              </div>
            </div>

            <Link href="/membership">
              <Button className="w-full bg-[#8CBD45] hover:bg-[#8CBD45]/90 text-white gap-2" data-testid="button-become-member">
                <Sparkles className="h-4 w-4" />
                Become a Member
              </Button>
            </Link>
            <p className="text-xs text-gray-500 mt-4">
              Starting at $5/month. All underlying data remains open access.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // User is authenticated and has subscription
  return (
    <div className="flex flex-col lg:flex-row h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative">
        {children}
      </main>
    </div>
  );
}
