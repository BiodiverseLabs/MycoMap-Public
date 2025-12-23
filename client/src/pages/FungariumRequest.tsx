import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  AlertCircle,
  Loader2,
  X,
  Plus,
  Search
} from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

interface SpecimenEntry {
  id: string;
  platform: string;
  observationId: string;
  voucherNumber: string;
  mycoNumber: string;
  validated: boolean;
  validating: boolean;
  validationError: string | null;
  matchedSpecimen: { displayCode: string; scientificName: string } | null;
}

const createEmptyEntry = (): SpecimenEntry => ({
  id: crypto.randomUUID(),
  platform: "",
  observationId: "",
  voucherNumber: "",
  mycoNumber: "",
  validated: false,
  validating: false,
  validationError: null,
  matchedSpecimen: null,
});

export default function FungariumRequest() {
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const [location] = useLocation();
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const prefilledSpecimen = searchParams.get('specimen') || '';

  const [submitted, setSubmitted] = useState(false);
  const [specimenEntries, setSpecimenEntries] = useState<SpecimenEntry[]>([createEmptyEntry()]);
  const [form, setForm] = useState({
    requestType: "donation",
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

  // Pre-fill form with user profile data when logged in
  useEffect(() => {
    if (isAuthenticated && user) {
      setForm(prev => ({
        ...prev,
        name: prev.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || '',
        email: prev.email || user.email || '',
      }));
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (prefilledSpecimen) {
      // Parse prefilled specimen (format: MYCO-XXXX-XXXXX or MYCOXXXXXXX)
      const entry = createEmptyEntry();
      if (prefilledSpecimen.startsWith('MYCO')) {
        entry.mycoNumber = prefilledSpecimen.replace(/-/g, '');
      }
      setSpecimenEntries([entry]);
    }
  }, [prefilledSpecimen]);

  const parseObservationId = (value: string): string => {
    if (!value) return value;
    const inatMatch = value.match(/inaturalist\.org\/observations\/(\d+)/);
    if (inatMatch) return inatMatch[1];
    const moMatch = value.match(/mushroomobserver\.org\/(\d+)/);
    if (moMatch) return moMatch[1];
    const numericMatch = value.match(/\/(\d+)\/?$/);
    if (numericMatch) return numericMatch[1];
    return value;
  };

  const detectPlatform = (obsId: string): string => {
    if (!obsId) return "";
    const digits = obsId.replace(/\D/g, '');
    if (digits.length === 6) return 'MO';
    if (digits.length >= 8 && digits.length <= 9) return 'iNaturalist';
    return "";
  };

  const updateEntry = (id: string, field: keyof SpecimenEntry, value: string) => {
    setSpecimenEntries(prev => prev.map(entry => {
      if (entry.id !== id) return entry;
      
      const updates: Partial<SpecimenEntry> = { [field]: value, validated: false, validationError: null, matchedSpecimen: null };
      
      if (field === 'observationId') {
        const parsed = parseObservationId(value);
        updates.observationId = parsed;
        const detected = detectPlatform(parsed);
        if (detected && !entry.platform) {
          updates.platform = detected;
        }
      }
      
      return { ...entry, ...updates };
    }));
  };

  const addEntry = () => {
    setSpecimenEntries(prev => [...prev, createEmptyEntry()]);
  };

  const removeEntry = (id: string) => {
    if (specimenEntries.length <= 1) return;
    setSpecimenEntries(prev => prev.filter(e => e.id !== id));
  };

  const validateEntry = async (id: string) => {
    const entry = specimenEntries.find(e => e.id === id);
    if (!entry) return;
    
    // Must have at least one identifier
    if (!entry.observationId && !entry.voucherNumber && !entry.mycoNumber) {
      setSpecimenEntries(prev => prev.map(e => 
        e.id === id ? { ...e, validationError: "Enter at least one identifier" } : e
      ));
      return;
    }
    
    setSpecimenEntries(prev => prev.map(e => 
      e.id === id ? { ...e, validating: true, validationError: null } : e
    ));
    
    try {
      const params = new URLSearchParams();
      if (entry.mycoNumber) params.append('mycoNumber', entry.mycoNumber);
      if (entry.observationId && entry.platform) {
        params.append('observationId', entry.observationId);
        params.append('platform', entry.platform);
      }
      if (entry.voucherNumber) params.append('voucherNumber', entry.voucherNumber);
      
      const response = await fetch(`/api/public/fungarium/validate?${params}`);
      const result = await response.json();
      
      if (result.found) {
        setSpecimenEntries(prev => prev.map(e => 
          e.id === id ? { 
            ...e, 
            validating: false, 
            validated: true, 
            matchedSpecimen: { displayCode: result.displayCode, scientificName: result.scientificName }
          } : e
        ));
      } else {
        setSpecimenEntries(prev => prev.map(e => 
          e.id === id ? { ...e, validating: false, validationError: "Specimen not found in our system" } : e
        ));
      }
    } catch {
      setSpecimenEntries(prev => prev.map(e => 
        e.id === id ? { ...e, validating: false, validationError: "Validation failed" } : e
      ));
    }
  };

  const getSpecimenIdsForSubmission = (): string => {
    return specimenEntries
      .filter(e => e.validated || e.mycoNumber || e.observationId || e.voucherNumber)
      .map(e => {
        const parts = [];
        if (e.matchedSpecimen?.displayCode) parts.push(e.matchedSpecimen.displayCode);
        else if (e.mycoNumber) parts.push(e.mycoNumber);
        if (e.platform && e.observationId) parts.push(`${e.platform}:${e.observationId}`);
        if (e.voucherNumber) parts.push(`Voucher:${e.voucherNumber}`);
        return parts.join(' / ');
      })
      .join('; ');
  };

  const submitMutation = useMutation({
    mutationFn: (data: typeof form & { specimenIds: string }) => 
      apiRequest('POST', '/api/public/fungarium/request', data),
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
    const specimenIds = getSpecimenIdsForSubmission();
    if (!form.name || !form.email || !form.institution || !specimenIds || !form.purpose) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields including at least one specimen",
        variant: "destructive",
      });
      return;
    }
    submitMutation.mutate({ ...form, specimenIds });
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
            <div className="mb-8">
              <Link href="/fungarium/about">
                <Button variant="ghost" size="sm" className="mb-2 -ml-2" data-testid="button-back">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Fungarium
                </Button>
              </Link>
              <h1 className="text-3xl font-bold text-[#A87146]" data-testid="text-page-title">
                Request a Specimen
              </h1>
              <p className="text-slate-600">Submit a request for specimen donation or data</p>
            </div>

            <Card className="border-l-4 border-l-[#8CBD45] bg-gradient-to-r from-[#8CBD45]/5 to-white mb-6">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#8CBD45]/15 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-5 h-5 text-[#8CBD45]" />
                  </div>
                  <div className="space-y-3">
                    <h3 className="font-semibold text-[#A87146]">Important Information</h3>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#8CBD45] mt-0.5 shrink-0" />
                        <span>
                          We strongly prefer to provide <strong className="text-[#A87146]">donations of splits</strong> rather than loans. 
                          In many cases, we are willing to send the majority of a specimen if tissue is limited.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#8CBD45] mt-0.5 shrink-0" />
                        <span>
                          All shipments are tracked in a <strong className="text-[#A87146]">publicly available ledger</strong>. 
                          We do not make private loans or split donations.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#8CBD45] mt-0.5 shrink-0" />
                        <span>
                          We <strong className="text-[#A87146]">are willing</strong> to provide specimens to private researchers 
                          without an institutional affiliation.
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
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
                        <SelectItem value="donation">Specimen Donation (split)</SelectItem>
                        <SelectItem value="donation_majority">Specimen Donation (majority of tissue)</SelectItem>
                        <SelectItem value="loan">Specimen Loan (non-destructive, returned)</SelectItem>
                        <SelectItem value="image">High-resolution Images Only</SelectItem>
                        <SelectItem value="data">Data/Sequence Information</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label>Specimen(s) *</Label>
                    <p className="text-xs text-slate-500 mb-2">
                      Enter identifiers for each specimen you're requesting. Use the Validate button to verify the specimen exists in our system.
                    </p>
                    
                    {specimenEntries.map((entry, index) => (
                      <Card key={entry.id} className={`p-3 ${entry.validated ? 'border-[#8CBD45] bg-[#8CBD45]/5' : entry.validationError ? 'border-red-300 bg-red-50' : ''}`} data-testid={`specimen-entry-${index}`}>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-700">Specimen {index + 1}</span>
                            <div className="flex items-center gap-2">
                              {entry.validated && entry.matchedSpecimen && (
                                <Badge className="bg-[#8CBD45]">
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  {entry.matchedSpecimen.displayCode}
                                </Badge>
                              )}
                              {specimenEntries.length > 1 && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => removeEntry(entry.id)} data-testid={`button-remove-${index}`}>
                                  <X className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Platform</Label>
                              <Select value={entry.platform || "none"} onValueChange={(v) => updateEntry(entry.id, 'platform', v === "none" ? "" : v)}>
                                <SelectTrigger className="h-9" data-testid={`select-platform-${index}`}>
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  <SelectItem value="iNaturalist">iNaturalist</SelectItem>
                                  <SelectItem value="MO">Mushroom Observer</SelectItem>
                                  <SelectItem value="MyCoPortal">MyCoPortal</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Observation ID</Label>
                              <Input
                                className="h-9"
                                placeholder="e.g., 123456789"
                                value={entry.observationId}
                                onChange={(e) => updateEntry(entry.id, 'observationId', e.target.value)}
                                data-testid={`input-observation-${index}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Voucher Number</Label>
                              <Input
                                className="h-9"
                                placeholder="e.g., ABC-123"
                                value={entry.voucherNumber}
                                onChange={(e) => updateEntry(entry.id, 'voucherNumber', e.target.value)}
                                data-testid={`input-voucher-${index}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">MYCO Number</Label>
                              <Input
                                className="h-9"
                                placeholder="e.g., MYCO1000129"
                                value={entry.mycoNumber}
                                onChange={(e) => updateEntry(entry.id, 'mycoNumber', e.target.value)}
                                data-testid={`input-myco-${index}`}
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <div>
                              {entry.validationError && (
                                <p className="text-xs text-red-600 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" /> {entry.validationError}
                                </p>
                              )}
                              {entry.validated && entry.matchedSpecimen && (
                                <p className="text-xs text-[#8CBD45] italic">
                                  {entry.matchedSpecimen.scientificName || "Species name pending"}
                                </p>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => validateEntry(entry.id)}
                              disabled={entry.validating || entry.validated}
                              data-testid={`button-validate-${index}`}
                            >
                              {entry.validating ? (
                                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Validating...</>
                              ) : entry.validated ? (
                                <><CheckCircle2 className="w-4 h-4 mr-1" /> Validated</>
                              ) : (
                                <><Search className="w-4 h-4 mr-1" /> Validate</>
                              )}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}

                    <Button type="button" variant="outline" onClick={addEntry} className="w-full" data-testid="button-add-specimen">
                      <Plus className="w-4 h-4 mr-2" /> Add Another Specimen
                    </Button>
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
                      I agree to the MYCO Fungarium terms, including proper specimen handling and 
                      acknowledgment in publications. I understand that all specimen donations are 
                      tracked in the public ledger and that specimens may not be available for all requests.
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
