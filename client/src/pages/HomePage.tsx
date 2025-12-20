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

  const statIcons = [Microscope, Leaf, Users, MapPin];
  const gradients = [
    'from-myco-green/20 to-myco-green/5',
    'from-amber-100/80 to-amber-50/40',
    'from-myco-brown/15 to-myco-brown/5',
    'from-emerald-100/80 to-emerald-50/40',
  ];

  return (
    <section className="py-24 relative overflow-hidden" data-testid="section-stats">
      <div className="absolute inset-0 bg-gradient-to-br from-stone-100 via-amber-50/30 to-stone-100" />
      <div className="absolute inset-0 opacity-30">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <pattern id="statsPattern" patternUnits="userSpaceOnUse" width="40" height="40">
              <circle cx="20" cy="20" r="1" fill="#A87146" opacity="0.3"/>
              <path d="M0,20 Q10,15 20,20 T40,20" fill="none" stroke="#8CBD45" strokeWidth="0.3" opacity="0.4"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#statsPattern)"/>
        </svg>
      </div>
      
      <div className="absolute top-10 left-10 w-32 h-32 bg-myco-green/10 rounded-full blur-3xl" />
      <div className="absolute bottom-10 right-10 w-48 h-48 bg-myco-brown/10 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/4 w-24 h-24 bg-amber-200/20 rounded-full blur-2xl" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-2 bg-white/80 backdrop-blur-sm text-myco-green rounded-full text-sm font-semibold mb-4 shadow-sm border border-myco-green/20">
            By The Numbers
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-myco-brown" data-testid="text-stats-title">
            {section.title}
          </h2>
        </div>
        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8 max-w-5xl mx-auto">
          {stats.map((stat, index) => {
            const Icon = iconMap[stat.icon || ''] || statIcons[index % statIcons.length];
            const gradient = gradients[index % gradients.length];
            return (
              <div 
                key={index} 
                className="relative group"
                data-testid={`stat-${index}`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${gradient} rounded-2xl transform group-hover:scale-[1.03] transition-all duration-300 shadow-lg group-hover:shadow-xl`} />
                <div className="relative bg-white/70 backdrop-blur-sm rounded-2xl p-5 sm:p-6 lg:p-8 text-center border border-white/50 group-hover:bg-white/90 transition-colors">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-myco-green to-myco-green/80 mb-4 shadow-md group-hover:shadow-lg transition-shadow">
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <div className="text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-myco-brown to-myco-brown/80 bg-clip-text text-transparent mb-2">
                    {stat.value}
                  </div>
                  <div className="text-myco-brown/70 text-sm sm:text-base font-medium">
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
    <section className="py-24 relative overflow-hidden" data-testid="section-how-it-works">
      <div className="absolute inset-0 bg-gradient-to-br from-myco-brown/5 via-myco-green/5 to-myco-brown/10" />
      <div className="absolute inset-0 opacity-20">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <pattern id="journeyPattern" patternUnits="userSpaceOnUse" width="50" height="50">
              <path d="M25,0 Q30,25 25,50" fill="none" stroke="#8CBD45" strokeWidth="0.3" opacity="0.5"/>
              <path d="M0,25 Q25,20 50,25" fill="none" stroke="#A87146" strokeWidth="0.2" opacity="0.4"/>
              <circle cx="25" cy="25" r="2" fill="#8CBD45" opacity="0.2"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#journeyPattern)"/>
        </svg>
      </div>
      
      <div className="absolute top-20 right-20 w-40 h-40 bg-myco-green/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 left-20 w-32 h-32 bg-myco-brown/10 rounded-full blur-3xl" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-2 bg-white/80 backdrop-blur-sm text-myco-brown rounded-full text-sm font-semibold mb-4 shadow-sm border border-myco-brown/20">
            How It Works
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-myco-brown">
            {section.title || "Your Journey to Discovery"}
          </h2>
          {section.subtitle && (
            <p className="mt-4 text-myco-brown/70 text-lg max-w-2xl mx-auto">{section.subtitle}</p>
          )}
        </div>
        
        <div className="relative max-w-5xl mx-auto">
          <div className="hidden md:block absolute top-[60px] left-[12%] right-[12%] h-1 bg-gradient-to-r from-transparent via-myco-green/40 to-transparent rounded-full" />
          
          <div className="grid md:grid-cols-4 gap-6 lg:gap-8">
            {steps.map((step, index) => {
              const Icon = iconMap[step.icon] || Dna;
              return (
                <div 
                  key={index} 
                  className="relative group cursor-pointer" 
                  data-testid={`step-${index}`}
                >
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 text-center border border-white/50 shadow-md group-hover:shadow-xl group-hover:bg-white group-hover:-translate-y-2 transition-all duration-300">
                    <div className="relative z-10 inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-myco-green to-myco-green/80 shadow-lg mb-5 group-hover:scale-110 group-hover:shadow-xl transition-all duration-300">
                      <Icon className="h-9 w-9 text-white group-hover:scale-110 transition-transform" />
                      <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-myco-brown text-white text-xs font-bold flex items-center justify-center shadow-md">
                        {step.number}
                      </div>
                    </div>
                    <h3 className="text-xl font-bold text-myco-brown mb-3 group-hover:text-myco-green transition-colors">{step.title}</h3>
                    <p className="text-myco-brown/60 text-sm leading-relaxed">{step.description}</p>
                    
                    <div className="mt-4 h-1 w-0 bg-gradient-to-r from-myco-green to-myco-green/50 rounded-full mx-auto group-hover:w-16 transition-all duration-500" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
