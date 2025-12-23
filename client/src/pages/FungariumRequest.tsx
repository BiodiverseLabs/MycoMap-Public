import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Link, useLocation, useSearch } from "wouter";
import { 
  Send, 
  ChevronLeft,
  User,
  Building2,
  Mail,
  MapPin,
  FileText,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function FungariumRequest() {
  const { toast } = useToast();
  const [location] = useLocation();
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const prefilledSpecimen = searchParams.get('specimen') || '';

  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    requestType: "loan",
    specimenIds: prefilledSpecimen,
    name: "",
    institution: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "USA",
    purpose: "",
    projectDescription: "",
    expectedReturnDate: "",
    agreeToTerms: false,
  });

  useEffect(() => {
    if (prefilledSpecimen) {
      setForm(f => ({ ...f, specimenIds: prefilledSpecimen }));
    }
  }, [prefilledSpecimen]);

  const submitMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest('/api/public/fungarium/request', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    }),
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Request Submitted",
        description: "We'll review your request and get back to you soon.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Please try again later",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.agreeToTerms) {
      toast({
        title: "Terms Required",
        description: "Please agree to the loan terms to continue",
        variant: "destructive",
      });
      return;
    }
    if (!form.name || !form.email || !form.institution || !form.specimenIds || !form.purpose) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    submitMutation.mutate(form);
  };

  if (submitted) {
    return (
      <PublicLayout>
        <div className="min-h-screen bg-gradient-to-b from-[#8CBD45]/5 to-white flex items-center justify-center">
          <Card className="max-w-md mx-4 text-center border-[#8CBD45]/20">
            <CardContent className="pt-8 pb-6">
              <div className="w-16 h-16 bg-[#8CBD45]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-[#8CBD45]" />
              </div>
              <h2 className="text-2xl font-bold text-[#A87146] mb-2">Request Submitted</h2>
              <p className="text-slate-600 mb-6">
                Thank you for your specimen request. Our team will review your application and 
                contact you within 5-7 business days.
              </p>
              <div className="flex flex-col gap-2">
                <Link href="/fungarium/search">
                  <Button variant="outline" className="w-full">Browse More Specimens</Button>
                </Link>
                <Link href="/fungarium/about">
                  <Button variant="ghost" className="w-full">Return to Fungarium</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="min-h-screen bg-gradient-to-b from-[#8CBD45]/5 to-white">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
              <Link href="/fungarium/about">
                <Button variant="ghost" size="sm" data-testid="button-back">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Fungarium
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-[#A87146]" data-testid="text-page-title">
                  Request a Specimen
                </h1>
                <p className="text-slate-600">Submit a loan or tissue sample request</p>
              </div>
            </div>

            <Card className="border-[#8CBD45]/20 mb-6">
              <CardHeader className="bg-amber-50 border-b">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <CardTitle className="text-base text-amber-800">Important Information</CardTitle>
                    <CardDescription className="text-amber-700">
                      Specimen loans are available to researchers at recognized institutions. 
                      Destructive sampling requests require additional justification.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <form onSubmit={handleSubmit}>
              <Card className="border-[#8CBD45]/20 mb-6">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[#8CBD45]" /> Request Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Request Type *</Label>
                    <Select value={form.requestType} onValueChange={(v) => setForm({ ...form, requestType: v })}>
                      <SelectTrigger data-testid="select-request-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="loan">Specimen Loan (non-destructive)</SelectItem>
                        <SelectItem value="tissue">Tissue Sample (destructive)</SelectItem>
                        <SelectItem value="image">High-resolution Images Only</SelectItem>
                        <SelectItem value="data">Data/Sequence Information</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Specimen ID(s) *</Label>
                    <Input
                      value={form.specimenIds}
                      onChange={(e) => setForm({ ...form, specimenIds: e.target.value })}
                      placeholder="e.g., MYCO-2025-00123, MYCO-2025-00456"
                      data-testid="input-specimen-ids"
                    />
                    <p className="text-xs text-slate-500">Separate multiple specimen IDs with commas</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Purpose of Request *</Label>
                    <Select value={form.purpose} onValueChange={(v) => setForm({ ...form, purpose: v })}>
                      <SelectTrigger data-testid="select-purpose">
                        <SelectValue placeholder="Select purpose" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="taxonomic">Taxonomic Research</SelectItem>
                        <SelectItem value="molecular">Molecular/Phylogenetic Study</SelectItem>
                        <SelectItem value="ecological">Ecological Research</SelectItem>
                        <SelectItem value="educational">Educational Use</SelectItem>
                        <SelectItem value="verification">Species Verification</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Project Description *</Label>
                    <Textarea
                      value={form.projectDescription}
                      onChange={(e) => setForm({ ...form, projectDescription: e.target.value })}
                      placeholder="Briefly describe your research project and how these specimens will be used..."
                      rows={4}
                      data-testid="input-description"
                    />
                  </div>

                  {form.requestType === "loan" && (
                    <div className="space-y-2">
                      <Label>Expected Return Date</Label>
                      <Input
                        type="date"
                        value={form.expectedReturnDate}
                        onChange={(e) => setForm({ ...form, expectedReturnDate: e.target.value })}
                        data-testid="input-return-date"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-[#8CBD45]/20 mb-6">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="w-5 h-5 text-[#8CBD45]" /> Requestor Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Full Name *</Label>
                      <Input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Dr. Jane Smith"
                        data-testid="input-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Institution *</Label>
                      <Input
                        value={form.institution}
                        onChange={(e) => setForm({ ...form, institution: e.target.value })}
                        placeholder="University of..."
                        data-testid="input-institution"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email *</Label>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="email@institution.edu"
                        data-testid="input-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="+1 (555) 123-4567"
                        data-testid="input-phone"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#8CBD45]/20 mb-6">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-[#8CBD45]" /> Shipping Address
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Address Line 1</Label>
                    <Input
                      value={form.addressLine1}
                      onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                      placeholder="Department, Building"
                      data-testid="input-address1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Address Line 2</Label>
                    <Input
                      value={form.addressLine2}
                      onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
                      placeholder="Suite, Room number"
                      data-testid="input-address2"
                    />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2 col-span-2 md:col-span-1">
                      <Label>City</Label>
                      <Input
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                        data-testid="input-city"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Input
                        value={form.state}
                        onChange={(e) => setForm({ ...form, state: e.target.value })}
                        data-testid="input-state"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>ZIP</Label>
                      <Input
                        value={form.postalCode}
                        onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                        data-testid="input-zip"
                      />
                    </div>
                    <div className="space-y-2 col-span-2 md:col-span-1">
                      <Label>Country</Label>
                      <Input
                        value={form.country}
                        onChange={(e) => setForm({ ...form, country: e.target.value })}
                        data-testid="input-country"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#8CBD45]/20 mb-6">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="terms"
                      checked={form.agreeToTerms}
                      onCheckedChange={(checked) => setForm({ ...form, agreeToTerms: checked as boolean })}
                      data-testid="checkbox-terms"
                    />
                    <label htmlFor="terms" className="text-sm text-slate-600 cursor-pointer">
                      I agree to the MYCO Fungarium loan terms, including proper specimen handling, 
                      acknowledgment in publications, and timely return of loaned materials. I understand 
                      that tissue samples involve destructive sampling and specimens may not be available 
                      for all requests.
                    </label>
                  </div>
                </CardContent>
              </Card>

              <Button 
                type="submit" 
                size="lg" 
                className="w-full bg-[#8CBD45] hover:bg-[#7aaa3d]"
                disabled={submitMutation.isPending}
                data-testid="button-submit"
              >
                {submitMutation.isPending ? (
                  "Submitting..."
                ) : (
                  <>
                    <Send className="w-5 h-5 mr-2" /> Submit Request
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
