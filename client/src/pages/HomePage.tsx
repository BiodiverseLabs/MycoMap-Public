import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PublicLayout } from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { Dna, MapPin, Award, ArrowRight, Users, TreePine, FlaskConical, Microscope, Leaf } from "lucide-react";

interface PageSection {
  id: number;
  sectionType: string;
  title: string;
  subtitle: string | null;
  content: string | null;
  buttonText: string | null;
  buttonLink: string | null;
  imageUrl: string | null;
}

interface Page {
  id: number;
  title: string;
  description: string | null;
  heroImageUrl: string | null;
  sections: PageSection[];
}

const iconMap: Record<string, typeof Dna> = {
  Dna,
  MapPin,
  Award,
  Users,
  TreePine,
  FlaskConical,
  Microscope,
  Leaf,
};

export default function HomePage() {
  const { data: page, isLoading } = useQuery<Page>({
    queryKey: ["/api/cms/pages/home"],
  });

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </PublicLayout>
    );
  }

  const sections = page?.sections || [];

  return (
    <PublicLayout>
      {sections.map((section) => {
        switch (section.sectionType) {
          case "hero":
            return <HeroSection key={section.id} section={section} heroImageUrl={page?.heroImageUrl} />;
          case "stats":
            return <StatsSection key={section.id} section={section} />;
          case "featured_projects":
            return <FeaturedProjectsSection key={section.id} section={section} />;
          case "cta":
            return <CTASection key={section.id} section={section} />;
          case "how_it_works":
            return <HowItWorksSection key={section.id} section={section} />;
          default:
            return null;
        }
      })}
    </PublicLayout>
  );
}

function HeroSection({ section, heroImageUrl }: { section: PageSection; heroImageUrl?: string | null }) {
  const backgroundImage = section.imageUrl || heroImageUrl || "https://mycota.com/wp-content/uploads/2024/05/jesse-bauer-pzwH-a4aF3s-unsplash-scaled.jpg";
  
  return (
    <section 
      className="relative min-h-[85vh] flex items-center justify-center overflow-hidden"
      data-testid="section-hero"
    >
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${backgroundImage})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60" />
      <div className="absolute inset-0 bg-gradient-to-r from-myco-brown/30 to-transparent" />
      
      <div className="relative container mx-auto px-4 py-20 text-center z-10">
        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-8 border border-white/20">
          <Leaf className="h-4 w-4 text-myco-green" />
          <span className="text-white/90 text-sm font-medium">Community Science for Fungal Discovery</span>
        </div>
        
        <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold text-white mb-6 drop-shadow-lg" data-testid="text-hero-title">
          {section.title}
        </h1>
        <p className="text-lg sm:text-xl lg:text-2xl text-white/90 max-w-3xl mx-auto mb-10 drop-shadow-md" data-testid="text-hero-subtitle">
          {section.subtitle}
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          {section.buttonText && section.buttonLink && (
            <Button 
              asChild 
              size="lg" 
              className="bg-myco-green hover:bg-myco-green/90 text-white text-lg px-8 py-6 rounded-full shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5"
              data-testid="button-hero-cta"
            >
              <Link href={section.buttonLink} className="flex items-center gap-2">
                {section.buttonText}
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          )}
          <Button 
            asChild 
            variant="outline"
            size="lg" 
            className="bg-white/10 backdrop-blur-sm border-white/30 text-white hover:bg-white/20 text-lg px-8 py-6 rounded-full"
            data-testid="button-hero-secondary"
          >
            <Link href="/dashboard" className="flex items-center gap-2">
              View Research Data
              <Microscope className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />
    </section>
  );
}

function StatsSection({ section }: { section: PageSection }) {
  let stats: { value: string; label: string; icon?: string }[] = [];
  try {
    const parsed = JSON.parse(section.content || "{}");
    stats = parsed.stats || [];
  } catch {
    stats = [];
  }

  const statIcons = [Microscope, Leaf, Dna, MapPin];

  return (
    <section className="py-20 bg-white relative overflow-hidden" data-testid="section-stats">
      <div className="absolute top-0 left-0 w-64 h-64 bg-myco-green/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-myco-brown/5 rounded-full translate-x-1/2 translate-y-1/2" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1 bg-myco-green/10 text-myco-green rounded-full text-sm font-medium mb-4">
            By The Numbers
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown" data-testid="text-stats-title">
            {section.title}
          </h2>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 lg:gap-8">
          {stats.map((stat, index) => {
            const Icon = statIcons[index % statIcons.length];
            return (
              <div 
                key={index} 
                className="relative group"
                data-testid={`stat-${index}`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-myco-green/20 to-myco-brown/10 rounded-2xl transform group-hover:scale-105 transition-transform duration-300" />
                <div className="relative bg-white/80 backdrop-blur-sm rounded-2xl p-6 lg:p-8 text-center border border-gray-100 shadow-sm group-hover:shadow-lg transition-shadow">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-myco-green/10 mb-4">
                    <Icon className="h-6 w-6 text-myco-green" />
                  </div>
                  <div className="text-3xl sm:text-4xl lg:text-5xl font-bold text-myco-brown mb-2">
                    {stat.value}
                  </div>
                  <div className="text-gray-600 text-sm sm:text-base font-medium">
                    {stat.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeaturedProjectsSection({ section }: { section: PageSection }) {
  let projects: { title: string; description: string; link: string; icon: string; image?: string }[] = [];
  try {
    const parsed = JSON.parse(section.content || "{}");
    projects = parsed.projects || [];
  } catch {
    projects = [];
  }

  const projectImages = [
    "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1590779033100-9f60a05a013d?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1474113335916-23941c98aa09?w=400&h=300&fit=crop",
  ];

  return (
    <section className="py-24 bg-gradient-to-b from-gray-50 to-white relative" data-testid="section-featured-projects">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-16 bg-gradient-to-b from-myco-green/30 to-transparent" />
      
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1 bg-myco-green/10 text-myco-green rounded-full text-sm font-medium mb-4">
            Our Programs
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown mb-4" data-testid="text-projects-title">
            {section.title}
          </h2>
          {section.subtitle && (
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">{section.subtitle}</p>
          )}
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {projects.map((project, index) => {
            const Icon = iconMap[project.icon] || Dna;
            const image = project.image || projectImages[index % projectImages.length];
            return (
              <Link 
                key={index} 
                href={project.link}
                className="group"
                data-testid={`card-project-${index}`}
              >
                <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-2 h-full border border-gray-100">
                  <div className="relative h-48 overflow-hidden">
                    <img 
                      src={image} 
                      alt={project.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <div className="absolute bottom-4 left-4 w-12 h-12 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
                      <Icon className="h-6 w-6 text-myco-green" />
                    </div>
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-semibold text-myco-brown mb-3 group-hover:text-myco-green transition-colors">
                      {project.title}
                    </h3>
                    <p className="text-gray-600 mb-4 line-clamp-2">
                      {project.description}
                    </p>
                    <span className="text-myco-green font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                      Learn more <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CTASection({ section }: { section: PageSection }) {
  return (
    <section 
      className="relative py-24 overflow-hidden"
      data-testid="section-cta"
    >
      <div className="absolute inset-0 bg-myco-brown" />
      <div className="absolute inset-0 opacity-10">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <pattern id="mycelium" patternUnits="userSpaceOnUse" width="20" height="20">
              <path d="M0,10 Q5,5 10,10 T20,10" fill="none" stroke="white" strokeWidth="0.3"/>
              <path d="M10,0 Q5,5 10,10 T10,20" fill="none" stroke="white" strokeWidth="0.3"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#mycelium)"/>
        </svg>
      </div>
      
      <div className="relative container mx-auto px-4 text-center z-10">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6" data-testid="text-cta-title">
            {section.title}
          </h2>
          {section.subtitle && (
            <p className="text-white/80 text-lg sm:text-xl mb-10 max-w-2xl mx-auto">
              {section.subtitle}
            </p>
          )}
          {section.buttonText && section.buttonLink && (
            <Button 
              asChild 
              size="lg" 
              className="bg-myco-green hover:bg-myco-green/90 text-white text-lg px-10 py-7 rounded-full shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5"
              data-testid="button-cta"
            >
              <Link href={section.buttonLink} className="flex items-center gap-2">
                {section.buttonText}
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection({ section }: { section: PageSection }) {
  const steps = [
    { number: "01", title: "Observe", description: "Find and photograph fungi in the wild", icon: "MapPin" },
    { number: "02", title: "Document", description: "Submit observations with location data", icon: "Leaf" },
    { number: "03", title: "Sequence", description: "Get DNA sequencing for your specimens", icon: "Dna" },
    { number: "04", title: "Contribute", description: "Add to global mycological knowledge", icon: "Users" },
  ];

  try {
    const parsed = JSON.parse(section.content || "{}");
    if (parsed.steps) {
      steps.length = 0;
      steps.push(...parsed.steps);
    }
  } catch {
    // Use default steps
  }

  return (
    <section className="py-20 bg-gradient-to-b from-white to-gray-50" data-testid="section-how-it-works">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1 bg-myco-brown/10 text-myco-brown rounded-full text-sm font-medium mb-4">
            How It Works
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown">
            {section.title || "Your Journey to Discovery"}
          </h2>
        </div>
        
        <div className="relative max-w-5xl mx-auto">
          <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-myco-green/20 via-myco-green to-myco-green/20 -translate-y-1/2" />
          
          <div className="grid md:grid-cols-4 gap-8">
            {steps.map((step, index) => {
              const Icon = iconMap[step.icon] || Dna;
              return (
                <div key={index} className="relative text-center" data-testid={`step-${index}`}>
                  <div className="relative z-10 inline-flex items-center justify-center w-16 h-16 rounded-full bg-white border-4 border-myco-green shadow-lg mb-4">
                    <Icon className="h-7 w-7 text-myco-green" />
                  </div>
                  <div className="text-xs font-bold text-myco-green mb-2">{step.number}</div>
                  <h3 className="text-lg font-semibold text-myco-brown mb-2">{step.title}</h3>
                  <p className="text-gray-600 text-sm">{step.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
