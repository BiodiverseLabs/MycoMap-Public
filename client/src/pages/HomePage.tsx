import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PublicLayout } from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { Dna, MapPin, Award, ArrowRight, Users, TreePine, FlaskConical } from "lucide-react";

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
  sections: PageSection[];
}

const iconMap: Record<string, typeof Dna> = {
  Dna,
  MapPin,
  Award,
  Users,
  TreePine,
  FlaskConical,
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
            return <HeroSection key={section.id} section={section} />;
          case "stats":
            return <StatsSection key={section.id} section={section} />;
          case "featured_projects":
            return <FeaturedProjectsSection key={section.id} section={section} />;
          case "cta":
            return <CTASection key={section.id} section={section} />;
          default:
            return null;
        }
      })}
    </PublicLayout>
  );
}

function HeroSection({ section }: { section: PageSection }) {
  return (
    <section 
      className="relative min-h-[80vh] flex items-center justify-center bg-gradient-to-b from-myco-green/10 to-white"
      data-testid="section-hero"
    >
      <div className="absolute inset-0 bg-[url('/api/placeholder/1920/1080')] bg-cover bg-center opacity-5" />
      <div className="relative container mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-myco-brown mb-6" data-testid="text-hero-title">
          {section.title}
        </h1>
        <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto mb-10" data-testid="text-hero-subtitle">
          {section.subtitle}
        </p>
        {section.buttonText && section.buttonLink && (
          <Button 
            asChild 
            size="lg" 
            className="bg-myco-green hover:bg-myco-green/90 text-white text-lg px-8 py-6 rounded-full"
            data-testid="button-hero-cta"
          >
            <Link href={section.buttonLink} className="flex items-center gap-2">
              {section.buttonText}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}

function StatsSection({ section }: { section: PageSection }) {
  let stats: { value: string; label: string }[] = [];
  try {
    const parsed = JSON.parse(section.content || "{}");
    stats = parsed.stats || [];
  } catch {
    stats = [];
  }

  return (
    <section className="py-16 bg-white" data-testid="section-stats">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center text-myco-brown mb-12" data-testid="text-stats-title">
          {section.title}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <div 
              key={index} 
              className="text-center p-6 rounded-xl bg-gradient-to-b from-myco-green/5 to-transparent"
              data-testid={`stat-${index}`}
            >
              <div className="text-3xl sm:text-4xl font-bold text-myco-green mb-2">
                {stat.value}
              </div>
              <div className="text-gray-600 text-sm sm:text-base">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturedProjectsSection({ section }: { section: PageSection }) {
  let projects: { title: string; description: string; link: string; icon: string }[] = [];
  try {
    const parsed = JSON.parse(section.content || "{}");
    projects = parsed.projects || [];
  } catch {
    projects = [];
  }

  return (
    <section className="py-20 bg-gray-50" data-testid="section-featured-projects">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-myco-brown mb-4" data-testid="text-projects-title">
            {section.title}
          </h2>
          {section.subtitle && (
            <p className="text-gray-600 text-lg">{section.subtitle}</p>
          )}
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {projects.map((project, index) => {
            const Icon = iconMap[project.icon] || Dna;
            return (
              <Link 
                key={index} 
                href={project.link}
                className="group"
                data-testid={`card-project-${index}`}
              >
                <div className="bg-white rounded-xl p-8 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 h-full border border-gray-100">
                  <div className="w-14 h-14 rounded-full bg-myco-green/10 flex items-center justify-center mb-6">
                    <Icon className="h-7 w-7 text-myco-green" />
                  </div>
                  <h3 className="text-xl font-semibold text-myco-brown mb-3 group-hover:text-myco-green transition-colors">
                    {project.title}
                  </h3>
                  <p className="text-gray-600 mb-4">
                    {project.description}
                  </p>
                  <span className="text-myco-green font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                    Learn more <ArrowRight className="h-4 w-4" />
                  </span>
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
      className="py-20 bg-myco-brown text-white"
      data-testid="section-cta"
    >
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl font-bold mb-4" data-testid="text-cta-title">
          {section.title}
        </h2>
        {section.subtitle && (
          <p className="text-white/80 text-lg mb-8 max-w-2xl mx-auto">
            {section.subtitle}
          </p>
        )}
        {section.buttonText && section.buttonLink && (
          <Button 
            asChild 
            size="lg" 
            className="bg-myco-green hover:bg-myco-green/90 text-white text-lg px-8 py-6 rounded-full"
            data-testid="button-cta"
          >
            <Link href={section.buttonLink} className="flex items-center gap-2">
              {section.buttonText}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}
