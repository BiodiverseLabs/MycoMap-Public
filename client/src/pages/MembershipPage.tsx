import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PublicLayout } from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Link } from "wouter";
import { 
  Check, Dna, Users, BookOpen, Video, Star, Heart,
  CreditCard, ArrowRight, Sparkles, Award, FlaskConical, Loader2, LogIn
} from "lucide-react";
import { SiPaypal, SiStripe } from "react-icons/si";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface SubscriptionPlan {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  priceMinCents: number;
  priceMaxCents: number;
  priceDefaultCents: number;
  billingPeriod: string;
  features: string[] | null;
  specimensPerYear: string | null;
  sortOrder: number | null;
}

export default function MembershipPage() {
  const [selectedAmounts, setSelectedAmounts] = useState<Record<string, number>>({});
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const { data: plans, isLoading } = useQuery<SubscriptionPlan[]>({
    queryKey: ["/api/subscriptions/plans"],
  });

  const checkoutMutation = useMutation({
    mutationFn: async ({ planSlug, amountCents, provider }: { planSlug: string; amountCents: number; provider: string }) => {
      const endpoint = provider === 'stripe' 
        ? '/api/subscriptions/checkout/stripe'
        : '/api/subscriptions/checkout/paypal';
      
      const response = await apiRequest('POST', endpoint, { planSlug, amountCents });
      return response;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Checkout Error",
        description: error.message || "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCheckout = (plan: SubscriptionPlan, provider: string) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to subscribe to a membership plan.",
      });
      return;
    }
    
    const amountCents = getSelectedAmount(plan);
    checkoutMutation.mutate({ planSlug: plan.slug, amountCents, provider });
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(0)}`;
  };

  const getSelectedAmount = (plan: SubscriptionPlan) => {
    return selectedAmounts[plan.slug] || plan.priceDefaultCents;
  };

  const handleAmountChange = (slug: string, value: number[]) => {
    setSelectedAmounts(prev => ({ ...prev, [slug]: value[0] }));
  };

  const universalBenefits = [
    { icon: Dna, text: "Specimen submission for DNA barcoding" },
    { icon: BookOpen, text: "Full access to Research Notes on Substack" },
    { icon: Video, text: 'Monthly live "Open Lab Session" + Q&A' },
    { icon: Star, text: "Optional recognition on Supporters page" },
  ];

  const advancedFeatures = [
    { title: "Advanced Discovery Tools", description: "Rich filtering across geography, taxonomy, substrate, seasonality, and clade" },
    { title: "Live Research Stream", description: "Real-time updates on validated observations, first records, and range extensions" },
    { title: "Customizable Monitoring", description: "Highlight taxa or regions of personal or professional interest" },
  ];

  const tierIcons = {
    "community-supporter": Heart,
    "network-supporter": Users,
    "sustaining-supporter": Award,
  };

  const tierColors = {
    "community-supporter": "from-myco-green/20 to-myco-green/5",
    "network-supporter": "from-myco-brown/20 to-myco-brown/5",
    "sustaining-supporter": "from-amber-500/20 to-amber-500/5",
  };

  return (
    <PublicLayout>
      <section className="relative py-20 bg-gradient-to-br from-myco-brown via-myco-brown/95 to-myco-brown overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-64 h-64 bg-myco-green rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-20 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6 border border-white/20">
              <Sparkles className="h-4 w-4 text-myco-green" />
              <span className="text-white/90 text-sm font-medium">Support Open Science</span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-6" data-testid="text-membership-title">
              Support the MycoMap Network
            </h1>
            <p className="text-xl text-white/80 mb-4">
              Open data. Deeper insight. Shared infrastructure.
            </p>
            <p className="text-white/70 max-w-2xl mx-auto">
              MycoMap is committed to open fungal biodiversity data. Membership support makes it possible 
              to go further: validating records, synthesizing datasets, and sharing expert interpretation.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 bg-white border-b">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-myco-brown text-center mb-8">
              Universal Benefits (All Support Levels)
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {universalBenefits.map((benefit, index) => (
                <div key={index} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-myco-green/10 flex items-center justify-center">
                    <benefit.icon className="h-6 w-6 text-myco-green" />
                  </div>
                  <p className="text-gray-700 font-medium">{benefit.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-myco-brown mb-4">
              Support Levels
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Choose the level that works for you. All tiers support the same mission.
            </p>
          </div>
          
          {isLoading ? (
            <div className="flex justify-center">
              <div className="animate-spin w-8 h-8 border-4 border-myco-green border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {plans?.map((plan) => {
                const TierIcon = tierIcons[plan.slug as keyof typeof tierIcons] || Heart;
                const gradientClass = tierColors[plan.slug as keyof typeof tierColors] || tierColors["community-supporter"];
                const selectedAmount = getSelectedAmount(plan);
                const isHighlighted = plan.slug === "network-supporter";
                
                return (
                  <div 
                    key={plan.id} 
                    className={`relative rounded-2xl overflow-hidden ${isHighlighted ? 'ring-2 ring-myco-green shadow-xl scale-105' : 'shadow-lg'}`}
                    data-testid={`card-plan-${plan.slug}`}
                  >
                    {isHighlighted && (
                      <div className="absolute top-0 left-0 right-0 bg-myco-green text-white text-center py-1 text-sm font-medium">
                        Most Popular
                      </div>
                    )}
                    
                    <div className={`bg-gradient-to-br ${gradientClass} p-6 ${isHighlighted ? 'pt-10' : ''}`}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center">
                          <TierIcon className="h-6 w-6 text-myco-brown" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-myco-brown">{plan.name}</h3>
                          <p className="text-gray-600 text-sm">{plan.specimensPerYear} specimens/year</p>
                        </div>
                      </div>
                      
                      <div className="mb-4">
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold text-myco-brown">{formatPrice(selectedAmount)}</span>
                          <span className="text-gray-500">/month</span>
                        </div>
                        {plan.priceMinCents !== plan.priceMaxCents && (
                          <div className="mt-3">
                            <Slider
                              value={[selectedAmount]}
                              min={plan.priceMinCents}
                              max={plan.priceMaxCents}
                              step={100}
                              onValueChange={(value) => handleAmountChange(plan.slug, value)}
                              className="w-full"
                              data-testid={`slider-price-${plan.slug}`}
                            />
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                              <span>{formatPrice(plan.priceMinCents)}</span>
                              <span>{formatPrice(plan.priceMaxCents)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <p className="text-gray-600 text-sm mb-4">{plan.description}</p>
                    </div>
                    
                    <div className="bg-white p-6">
                      <ul className="space-y-3 mb-6">
                        {plan.features?.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-3">
                            <Check className="h-5 w-5 text-myco-green flex-shrink-0 mt-0.5" />
                            <span className="text-gray-700 text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>
                      
                      <div className="space-y-2">
                        {!user ? (
                          <a href="/api/login">
                            <Button 
                              className="w-full bg-myco-brown hover:bg-myco-brown/90 text-white gap-2"
                              data-testid={`button-login-${plan.slug}`}
                            >
                              <LogIn className="h-4 w-4" />
                              Support the Network
                            </Button>
                          </a>
                        ) : (
                          <>
                            <Button 
                              className="w-full bg-myco-green hover:bg-myco-green/90 text-white gap-2"
                              onClick={() => handleCheckout(plan, 'stripe')}
                              disabled={checkoutMutation.isPending}
                              data-testid={`button-subscribe-${plan.slug}`}
                            >
                              {checkoutMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CreditCard className="h-4 w-4" />
                              )}
                              Subscribe with Card
                            </Button>
                            <div className="grid grid-cols-2 gap-2">
                              <Button 
                                variant="outline" 
                                className="gap-2"
                                onClick={() => handleCheckout(plan, 'paypal')}
                                disabled={checkoutMutation.isPending}
                                data-testid={`button-paypal-${plan.slug}`}
                              >
                                <SiPaypal className="h-4 w-4 text-[#003087]" />
                                PayPal
                              </Button>
                              <Button 
                                variant="outline" 
                                className="gap-2"
                                onClick={() => handleCheckout(plan, 'venmo')}
                                disabled={checkoutMutation.isPending}
                                data-testid={`button-venmo-${plan.slug}`}
                              >
                                <span className="text-[#3D95CE] font-bold text-sm">V</span>
                                Venmo
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="py-16 bg-myco-green">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Advanced Tools & Member Features
            </h2>
            <p className="text-white/80 max-w-2xl mx-auto">
              All underlying data remain open. Membership enables access to higher-order synthesis tools.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {advancedFeatures.map((feature, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                <h3 className="text-white font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-white/70 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <FlaskConical className="h-12 w-12 text-myco-brown/30 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-myco-brown mb-4">
              A Note on Open Access
            </h2>
            <p className="text-gray-600 mb-6">
              MycoMap exists to expand knowledge, not to restrict it. All raw observations, sequences, 
              and baseline maps remain open access. Membership support funds expert validation, synthesis, 
              interpretation, and the computational infrastructure that makes those insights possible.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/research">
                <Button size="lg" variant="outline" className="gap-2" data-testid="button-explore-free">
                  <Dna className="h-5 w-5" />
                  Explore Free Data
                </Button>
              </Link>
              <Link href="/network">
                <Button size="lg" className="bg-myco-brown hover:bg-myco-brown/90 text-white gap-2" data-testid="button-join-network">
                  <Users className="h-5 w-5" />
                  Join the Network
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-500 text-sm">
            Thank you for supporting open science. Questions? Contact us at{" "}
            <a href="mailto:support@mycomap.com" className="text-myco-green hover:underline">
              support@mycomap.com
            </a>
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}
