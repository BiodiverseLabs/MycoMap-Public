import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  Archive, 
  Dna, 
  Globe, 
  Users, 
  Search, 
  Send, 
  FlaskConical,
  MapPin,
  BookOpen,
  CheckCircle2
} from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";

export default function FungariumAbout() {
  return (
    <PublicLayout>
      <div className="min-h-screen bg-gradient-to-b from-[#8CBD45]/5 to-white">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-[#8CBD45]/10 rounded-full mb-6">
                <Archive className="w-10 h-10 text-[#8CBD45]" />
              </div>
              <h1 className="text-4xl font-bold text-[#A87146] mb-4" data-testid="text-page-title">
                MYCO Fungarium
              </h1>
              <p className="text-xl text-slate-600 max-w-2xl mx-auto">
                A permanent scientific repository preserving DNA-verified fungal specimens 
                for research, education, and biodiversity documentation.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <Card className="text-center border-[#8CBD45]/20 hover:shadow-lg transition-shadow" data-testid="card-stat-specimens">
                <CardContent className="pt-6">
                  <Dna className="w-10 h-10 text-[#8CBD45] mx-auto mb-3" />
                  <div className="text-3xl font-bold text-[#A87146]">5,000+</div>
                  <p className="text-slate-600">DNA-Verified Specimens</p>
                </CardContent>
              </Card>
              <Card className="text-center border-[#8CBD45]/20 hover:shadow-lg transition-shadow" data-testid="card-stat-species">
                <CardContent className="pt-6">
                  <FlaskConical className="w-10 h-10 text-[#8CBD45] mx-auto mb-3" />
                  <div className="text-3xl font-bold text-[#A87146]">800+</div>
                  <p className="text-slate-600">Unique Species</p>
                </CardContent>
              </Card>
              <Card className="text-center border-[#8CBD45]/20 hover:shadow-lg transition-shadow" data-testid="card-stat-contributors">
                <CardContent className="pt-6">
                  <Users className="w-10 h-10 text-[#8CBD45] mx-auto mb-3" />
                  <div className="text-3xl font-bold text-[#A87146]">200+</div>
                  <p className="text-slate-600">Contributors</p>
                </CardContent>
              </Card>
            </div>

            <Card className="mb-8 border-[#8CBD45]/20" data-testid="card-mission">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[#A87146]">
                  <BookOpen className="w-5 h-5" /> Our Mission
                </CardTitle>
              </CardHeader>
              <CardContent className="prose max-w-none text-slate-700">
                <p>
                  The MYCO Fungarium serves as a permanent repository for dried fungal specimens 
                  collected across North America. Each specimen undergoes rigorous DNA barcoding 
                  to verify taxonomic identification, creating a scientifically reliable reference 
                  collection.
                </p>
                <p>
                  Our collection supports mycological research by providing verified material for 
                  taxonomic studies, ecological research, and educational purposes. We maintain 
                  detailed metadata including collection location, habitat information, and 
                  associated DNA sequences deposited in GenBank.
                </p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
              <Card className="border-[#8CBD45]/20" data-testid="card-what-we-collect">
                <CardHeader>
                  <CardTitle className="text-lg text-[#A87146]">What We Collect</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {[
                      "Macrofungi (mushrooms, brackets, puffballs)",
                      "Ascomycetes and Basidiomycetes",
                      "Rare and understudied species",
                      "State and regional first records",
                      "Citizen science contributions"
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-5 h-5 text-[#8CBD45] mt-0.5 shrink-0" />
                        <span className="text-slate-700">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-[#8CBD45]/20" data-testid="card-services">
                <CardHeader>
                  <CardTitle className="text-lg text-[#A87146]">Services</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {[
                      "Specimen loans for research",
                      "DNA tissue samples for sequencing",
                      "Taxonomic verification services",
                      "Educational specimen sets",
                      "Collaboration with herbaria"
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-5 h-5 text-[#8CBD45] mt-0.5 shrink-0" />
                        <span className="text-slate-700">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            <Card className="mb-8 bg-[#8CBD45]/5 border-[#8CBD45]/20" data-testid="card-location">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <MapPin className="w-8 h-8 text-[#8CBD45] shrink-0" />
                  <div>
                    <h3 className="font-semibold text-[#A87146] mb-2">Physical Location</h3>
                    <p className="text-slate-700">
                      The MYCO Fungarium is housed at our research facility in Michigan, with 
                      climate-controlled storage maintaining optimal conditions for long-term 
                      specimen preservation. Our collection is registered with Index Herbariorum.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/fungarium/search">
                <Button size="lg" className="bg-[#8CBD45] hover:bg-[#7aaa3d] w-full sm:w-auto" data-testid="button-search">
                  <Search className="w-5 h-5 mr-2" /> Search Specimens
                </Button>
              </Link>
              <Link href="/fungarium/request">
                <Button size="lg" variant="outline" className="border-[#A87146] text-[#A87146] hover:bg-[#A87146]/5 w-full sm:w-auto" data-testid="button-request">
                  <Send className="w-5 h-5 mr-2" /> Request a Specimen
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
