import { PublicLayout } from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  Dna, MapPin, Users, ArrowRight, Leaf, Globe, 
  CheckCircle, Camera, Package, Mail, FlaskConical,
  Calendar, Clock, ExternalLink, Quote
} from "lucide-react";

export default function NetworkPage() {
  const regions = [
    { code: "MI", name: "Michigan", status: "active", specimens: "5,000+" },
    { code: "CA", name: "California", status: "active", specimens: "3,200+" },
    { code: "BC", name: "British Columbia", status: "active", specimens: "2,800+" },
    { code: "FL", name: "Florida", status: "active", specimens: "1,500+" },
    { code: "MO", name: "Missouri", status: "active", specimens: "1,200+" },
    { code: "IN", name: "Indiana", status: "active", specimens: "900+" },
    { code: "AZ", name: "Arizona", status: "active", specimens: "600+" },
    { code: "AC", name: "Atlantic Canada", status: "active", specimens: "800+" },
  ];

  const steps = [
    {
      icon: Users,
      title: "Join Your Regional Project",
      description: "Find and join your region's MycoMap iNaturalist project"
    },
    {
      icon: Camera,
      title: "Collect & Document",
      description: "Photograph mushrooms and fill out field data slips with unique IDs"
    },
    {
      icon: Package,
      title: "Dry & Ship",
      description: "Dry specimens at ≤140°F and mail to Mycota Lab in Michigan"
    },
    {
      icon: Dna,
      title: "Get Results",
      description: "DNA sequences available in 3-4 months on MycoMap.com"
    }
  ];

  const additionalOpportunities = [
    {
      title: "Species Lacking ITS Sequences",
      description: "North American species not yet represented in GenBank"
    },
    {
      title: "Global Lepiotoids",
      description: "Lepiota, Leucoagaricus, Leucocoprinus, Cystolepiota, Echinoderma from anywhere"
    },
    {
      title: "Cystoagaricus",
      description: "Any specimen from anywhere in the world"
    },
    {
      title: "Underserved Regions",
      description: "Specimens from globally underrepresented areas (if legally exportable)"
    }
  ];

  return (
    <PublicLayout>
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(https://mycota.com/wp-content/uploads/2024/04/g621b09ea0caac02f120cbaaa9d6ed3ad19acd99f208dff50326af6a13d1421e56960b49a7d4f7fc3fc2a69baee564520_1920.jpg)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
        
        <div className="relative container mx-auto px-4 py-20 text-center z-10">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6 border border-white/20">
            <Dna className="h-4 w-4 text-myco-green" />
            <span className="text-white/90 text-sm font-medium">Free DNA Sequencing</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 drop-shadow-lg" data-testid="text-network-title">
            The MycoMap Network
          </h1>
          <p className="text-lg sm:text-xl text-white/90 max-w-3xl mx-auto mb-10" data-testid="text-network-description">
            Join a local project for free ITS DNA barcoding of your mushroom specimens. 
            We sequence 20,000+ specimens annually to document North American macrofungal biodiversity.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-myco-green hover:bg-myco-green/90 text-white gap-2" data-testid="button-find-region">
              <MapPin className="h-5 w-5" />
              Find Your Region
            </Button>
            <Button size="lg" className="bg-white/20 backdrop-blur-sm border border-white/30 text-white hover:bg-white/30" data-testid="button-view-programs">
              View All Programs
            </Button>
          </div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="rounded-2xl overflow-hidden shadow-xl border border-gray-100">
              <img 
                src="https://mycota.com/wp-content/uploads/2025/11/MycoMapNetwork-2026.png" 
                alt="MycoMap Network Coverage Map"
                className="w-full h-auto"
                data-testid="img-network-map"
              />
            </div>
            <p className="text-center text-gray-600 mt-4 text-sm">
              Active MycoMap Network regions across North America
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1 bg-myco-green/10 text-myco-green rounded-full text-sm font-medium mb-4">
              <Globe className="w-4 h-4" />
              Active Programs
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown mb-4">
              Regional Networks
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Select your region to join a local MycoMap project and start contributing specimens
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
            {regions.map((region, index) => (
              <Link key={index} href={`/network/${region.code.toLowerCase()}`}>
                <div className="group bg-white rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-lg hover:border-myco-green/30 transition-all cursor-pointer h-full">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-myco-green to-myco-green/80 flex items-center justify-center text-white font-bold text-lg">
                      {region.code}
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      Active
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-myco-brown mb-1 group-hover:text-myco-green transition-colors">
                    MycoMap {region.code}
                  </h3>
                  <p className="text-gray-600 text-sm mb-2">{region.name}</p>
                  <p className="text-myco-green font-medium text-sm">{region.specimens} specimens</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-myco-brown">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-2 px-4 py-1 bg-white/10 text-white/90 rounded-full text-sm font-medium mb-4 border border-white/20">
              <CheckCircle className="w-4 h-4" />
              Simple Process
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              How It Works
            </h2>
            <p className="text-white/80 max-w-2xl mx-auto">
              Four easy steps to get your specimens sequenced for free
            </p>
          </div>
          
          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {steps.map((step, index) => (
              <div key={index} className="relative group">
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 h-full hover:bg-white/15 transition-colors text-center">
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-myco-green mx-auto mb-4">
                    <step.icon className="h-8 w-8 text-white" />
                  </div>
                  <div className="text-myco-green font-bold text-sm mb-2">Step {index + 1}</div>
                  <h3 className="text-white font-semibold mb-2 text-lg">{step.title}</h3>
                  <p className="text-white/70 text-sm">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                    <ArrowRight className="w-5 h-5 text-white/40" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-gradient-to-br from-gray-50 to-myco-green/5">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <Quote className="w-10 h-10 text-myco-green/30 mx-auto mb-4" />
            <blockquote className="text-xl sm:text-2xl text-myco-brown italic leading-relaxed mb-4" data-testid="text-quote">
              "Scientific collections are key not only to understanding the past and the present but to unlocking discoveries in the future."
            </blockquote>
            <cite className="text-gray-500 text-sm font-medium">
              — American Museum of Natural History
            </cite>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-b from-white to-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1 bg-myco-green/10 text-myco-green rounded-full text-sm font-medium mb-4">
              <FlaskConical className="w-4 h-4" />
              Beyond Regional Networks
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown mb-4">
              Additional Free Sequencing Opportunities
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Even if you're outside a regional network, you may still qualify for free sequencing
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {additionalOpportunities.map((opp, index) => (
              <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-myco-green/10 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-myco-green" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-myco-brown mb-1">{opp.title}</h3>
                    <p className="text-gray-600 text-sm">{opp.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto px-4">
          <div className="bg-gradient-to-r from-myco-green/10 to-myco-brown/10 rounded-2xl p-8 md:p-12 max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-myco-brown mb-4">
                  Results & Data Access
                </h2>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-gray-700">
                    <Clock className="w-5 h-5 text-myco-green flex-shrink-0" />
                    <span>DNA sequences ready in 3-4 months</span>
                  </li>
                  <li className="flex items-center gap-3 text-gray-700">
                    <ExternalLink className="w-5 h-5 text-myco-green flex-shrink-0" />
                    <span>Results immediately available on MycoMap.com</span>
                  </li>
                  <li className="flex items-center gap-3 text-gray-700">
                    <Globe className="w-5 h-5 text-myco-green flex-shrink-0" />
                    <span>Novel sequences uploaded to GenBank (public database)</span>
                  </li>
                  <li className="flex items-center gap-3 text-gray-700">
                    <CheckCircle className="w-5 h-5 text-myco-green flex-shrink-0" />
                    <span>No data held back — all sequences made publicly available</span>
                  </li>
                </ul>
              </div>
              <div className="text-center md:text-right">
                <Mail className="w-16 h-16 text-myco-brown/30 mx-auto md:ml-auto md:mr-0 mb-4" />
                <p className="text-gray-600 mb-4">Questions? Contact us at</p>
                <a href="mailto:info@mycota.com" className="text-myco-green font-semibold text-lg hover:underline">
                  info@mycota.com
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-r from-myco-green to-myco-green/90">
        <div className="container mx-auto px-4 text-center">
          <Leaf className="w-12 h-12 text-white/80 mx-auto mb-6" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Start Contributing Today
          </h2>
          <p className="text-white/90 text-lg max-w-2xl mx-auto mb-8">
            Join thousands of citizen scientists documenting fungal biodiversity across North America
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-white text-myco-green hover:bg-white/90 gap-2" data-testid="button-cta-find-region">
              Find Your Region
              <ArrowRight className="h-5 w-5" />
            </Button>
            <Link href="/mycoblitz">
              <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10" data-testid="link-join-mycoblitz">
                Join Continental MycoBlitz
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
