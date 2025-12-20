import { PublicLayout } from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  Calendar, Camera, Package, Mail, Dna, Users, MapPin, 
  Download, Smartphone, CheckCircle, ArrowRight, Leaf,
  Clock, Award, Globe
} from "lucide-react";

export default function MycoBlitzPage() {
  const events = [
    {
      name: "Winter Online MycoBlitz",
      dates: "January 10 – 26, 2025",
      status: "completed",
      color: "from-blue-500 to-cyan-400"
    },
    {
      name: "Summer Continental MycoBlitz", 
      dates: "August 8 – 17, 2025",
      status: "upcoming",
      color: "from-myco-green to-emerald-400"
    },
    {
      name: "Fall Continental MycoBlitz",
      dates: "TBD (Later 2025)",
      status: "upcoming",
      color: "from-orange-500 to-amber-400"
    }
  ];

  const steps = [
    {
      icon: Download,
      title: "Download Collection Slips",
      description: "Print voucher/field data slips from MycoMap to organize your collections and record basic data."
    },
    {
      icon: Smartphone,
      title: "Get iNaturalist App",
      description: "Download for iOS or Android, or use the web interface at iNaturalist.org"
    },
    {
      icon: Users,
      title: "Join the Project",
      description: "Join the appropriate 2025 MycoBlitz project on iNaturalist"
    },
    {
      icon: Camera,
      title: "Collect & Photograph",
      description: "Take multiple photos: side view, top, stem, and spore-bearing surface (gills/pores)"
    },
    {
      icon: Package,
      title: "Dry & Mail Specimens",
      description: "Dry specimens at ≤140°F for 12-24 hours and mail to the collection center"
    }
  ];

  const benefits = [
    { icon: Dna, title: "Free DNA Sequencing", description: "Thousands of specimens selected for ITS barcoding" },
    { icon: Globe, title: "Discover New Species", description: "Multiple species new to science expected each year" },
    { icon: Award, title: "Contribute to Science", description: "Help document North American macrofungal biodiversity" },
    { icon: Users, title: "Join 1,000+ Participants", description: "Be part of the largest mycology citizen science event" }
  ];

  return (
    <PublicLayout>
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(https://mycota.com/wp-content/uploads/2022/12/mctg-amanita_muscaria-marshall_field-santa_cruz-11.jpg)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
        
        <div className="relative container mx-auto px-4 py-20 text-center z-10">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6 border border-white/20">
            <Calendar className="h-4 w-4 text-myco-green" />
            <span className="text-white/90 text-sm font-medium">Multi-Week Community Event</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 drop-shadow-lg" data-testid="text-mycoblitz-title">
            Continental MycoBlitz
          </h1>
          <p className="text-lg sm:text-xl text-white/90 max-w-3xl mx-auto mb-10" data-testid="text-mycoblitz-description">
            Join the largest continent-wide mushroom collecting event. Document North American 
            macrofungal biodiversity and get your specimens DNA sequenced for free.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-myco-green hover:bg-myco-green/90 text-white gap-2" data-testid="button-download-slips">
              <Download className="h-5 w-5" />
              Download Collection Slips
            </Button>
            <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10" data-testid="button-view-inaturalist">
              View iNaturalist Project
            </Button>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1 bg-myco-green/10 text-myco-green rounded-full text-sm font-medium mb-4">
              <Clock className="w-4 h-4" />
              2025 Schedule
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown mb-4">
              Upcoming Events
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Mark your calendar for these exciting opportunities to contribute to fungal biodiversity research
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {events.map((event, index) => (
              <div 
                key={index}
                className="relative group"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${event.color} rounded-2xl opacity-10 group-hover:opacity-20 transition-opacity`} />
                <div className="relative bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-lg transition-all h-full">
                  <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium mb-4 ${
                    event.status === 'completed' 
                      ? 'bg-gray-100 text-gray-600' 
                      : 'bg-myco-green/10 text-myco-green'
                  }`}>
                    {event.status === 'completed' ? 'Completed' : 'Upcoming'}
                  </div>
                  <h3 className="text-xl font-bold text-myco-brown mb-2">{event.name}</h3>
                  <p className="text-gray-600 font-medium">{event.dates}</p>
                </div>
              </div>
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
              How to Participate
            </h2>
            <p className="text-white/80 max-w-2xl mx-auto">
              Five easy steps to contribute to mycological research
            </p>
          </div>
          
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-5 gap-4">
              {steps.map((step, index) => (
                <div key={index} className="relative group">
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 h-full hover:bg-white/15 transition-colors">
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-myco-green mb-4">
                      <step.icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="text-myco-green font-bold text-sm mb-2">Step {index + 1}</div>
                    <h3 className="text-white font-semibold mb-2">{step.title}</h3>
                    <p className="text-white/70 text-sm">{step.description}</p>
                  </div>
                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute top-1/2 -right-2 transform -translate-y-1/2 z-10">
                      <ArrowRight className="w-4 h-4 text-white/40" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-b from-white to-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1 bg-myco-green/10 text-myco-green rounded-full text-sm font-medium mb-4">
              <Award className="w-4 h-4" />
              Why Participate
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown mb-4">
              Benefits of Joining
            </h2>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {benefits.map((benefit, index) => (
              <div key={index} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-myco-green to-myco-green/80 mb-4">
                  <benefit.icon className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-lg font-bold text-myco-brown mb-2">{benefit.title}</h3>
                <p className="text-gray-600 text-sm">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-r from-myco-green to-myco-green/90">
        <div className="container mx-auto px-4 text-center">
          <Leaf className="w-12 h-12 text-white/80 mx-auto mb-6" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to Discover Fungi?
          </h2>
          <p className="text-white/90 text-lg max-w-2xl mx-auto mb-8">
            No experience required. Even photo-only observations without specimens are valuable 
            for understanding species range and seasonality.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-white text-myco-green hover:bg-white/90 gap-2" data-testid="button-get-started">
              Get Started Today
              <ArrowRight className="h-5 w-5" />
            </Button>
            <Link href="/protocols">
              <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10" data-testid="link-view-protocols">
                View Protocols
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
