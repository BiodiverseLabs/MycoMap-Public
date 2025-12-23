import { useQuery } from "@tanstack/react-query";
import { PublicLayout } from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Sparkles } from "lucide-react";

interface PageSection {
  id: number;
  sectionType: string;
  title: string;
  subtitle: string | null;
  content: string | null;
  buttonText: string | null;
  buttonLink: string | null;
  imageUrl: string | null;
  data: string | null;
}

interface Page {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  heroImageUrl: string | null;
  sections: PageSection[];
}

interface CMSPageProps {
  slug: string;
}

export default function CMSPage({ slug }: CMSPageProps) {

  const { data: page, isLoading, error } = useQuery<Page>({
    queryKey: ["/api/cms/pages", slug],
    enabled: !!slug,
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

  if (error || !page) {
    return (
      <PublicLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-700 mb-2">Page Not Found</h1>
            <p className="text-gray-500">The requested page could not be found.</p>
          </div>
        </div>
      </PublicLayout>
    );
  }

  const sections = page.sections || [];
  const heroSection = sections.find(s => s.sectionType === 'hero');
  const otherSections = sections.filter(s => s.sectionType !== 'hero');

  return (
    <PublicLayout>
      {heroSection ? (
        <HeroSection section={heroSection} heroImageUrl={page.heroImageUrl} />
      ) : (
        <div className="py-12 bg-gradient-to-br from-myco-brown to-myco-brown/90">
          <div className="container mx-auto px-4">
            <header className="text-center">
              <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4" data-testid="text-page-title">
                {page.title}
              </h1>
              {page.description && (
                <p className="text-lg text-white/80 max-w-3xl mx-auto" data-testid="text-page-description">
                  {page.description}
                </p>
              )}
            </header>
          </div>
        </div>
      )}

      <div className="py-12">
        <div className="container mx-auto px-4">
          {otherSections.map((section, index) => (
            <Section key={section.id} section={section} index={index} />
          ))}

          {sections.length === 0 && (
            <div className="bg-myco-green/5 rounded-xl p-12 text-center">
              <p className="text-gray-600">
                This page is under construction. Check back soon!
              </p>
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}

function HeroSection({ section, heroImageUrl }: { section: PageSection; heroImageUrl: string | null }) {
  const imageUrl = section.imageUrl || heroImageUrl;
  
  return (
    <section className="relative min-h-[50vh] flex items-center justify-center overflow-hidden">
      {imageUrl && (
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${imageUrl})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-myco-brown/80 via-myco-brown/70 to-myco-brown/90" />
        </div>
      )}
      {!imageUrl && (
        <div className="absolute inset-0 bg-gradient-to-br from-myco-brown to-myco-brown/90" />
      )}
      
      <div className="relative container mx-auto px-4 py-20 text-center z-10">
        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6 border border-white/20">
          <Sparkles className="h-4 w-4 text-myco-green" />
          <span className="text-white/90 text-sm font-medium">About Us</span>
        </div>
        
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 drop-shadow-lg" data-testid="text-hero-title">
          {section.title}
        </h1>
        {section.subtitle && (
          <p className="text-lg sm:text-xl text-white/90 max-w-3xl mx-auto" data-testid="text-hero-subtitle">
            {section.subtitle}
          </p>
        )}
      </div>
    </section>
  );
}

function Section({ section, index }: { section: PageSection; index: number }) {
  if (section.sectionType === "text_with_image") {
    const isReversed = index % 2 === 1;
    return (
      <div 
        className={`flex flex-col ${isReversed ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-8 lg:gap-12 items-center max-w-6xl mx-auto mb-16`}
        data-testid={`section-${section.id}`}
      >
        <div className="flex-1">
          {section.title && (
            <h2 className="text-3xl font-bold text-myco-brown mb-3">{section.title}</h2>
          )}
          {section.subtitle && (
            <p className="text-myco-green font-medium mb-4">{section.subtitle}</p>
          )}
          {section.content && (
            <p className="text-gray-700 text-lg leading-relaxed">{section.content}</p>
          )}
        </div>
        {section.imageUrl && (
          <div className="flex-1 max-w-md lg:max-w-lg">
            <img 
              src={section.imageUrl} 
              alt={section.title || "Section image"}
              className="w-full h-auto rounded-xl shadow-lg"
            />
          </div>
        )}
      </div>
    );
  }

  if (section.sectionType === "content") {
    return (
      <div className="max-w-4xl mx-auto mb-16" data-testid={`section-${section.id}`}>
        <div className="bg-gradient-to-br from-myco-green/5 to-transparent rounded-2xl p-8 lg:p-12 border border-myco-green/10">
          {section.title && (
            <h2 className="text-2xl lg:text-3xl font-bold text-myco-brown mb-4">{section.title}</h2>
          )}
          {section.content && (
            <p className="text-gray-700 text-lg leading-relaxed">{section.content}</p>
          )}
        </div>
      </div>
    );
  }

  if (section.sectionType === "gallery") {
    let images: { url: string; caption?: string }[] = [];
    try {
      if (section.data) {
        images = JSON.parse(section.data);
      }
    } catch (e) {
      console.error("Failed to parse gallery data:", e);
    }

    return (
      <div className="max-w-6xl mx-auto mb-16" data-testid={`section-${section.id}`}>
        {section.title && (
          <div className="text-center mb-8">
            <h2 className="text-2xl lg:text-3xl font-bold text-myco-brown mb-2">{section.title}</h2>
            {section.subtitle && (
              <p className="text-gray-600">{section.subtitle}</p>
            )}
          </div>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {images.map((img, idx) => (
            <div key={idx} className="group overflow-hidden rounded-xl shadow-md hover:shadow-xl transition-shadow">
              <img 
                src={img.url} 
                alt={img.caption || `Gallery image ${idx + 1}`}
                className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
              />
              {img.caption && (
                <div className="p-3 bg-white">
                  <p className="text-sm text-gray-600 font-medium">{img.caption}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section.sectionType === "cta") {
    return (
      <div className="max-w-4xl mx-auto mb-16" data-testid={`section-${section.id}`}>
        <div className="bg-gradient-to-br from-myco-green to-myco-green/90 rounded-2xl p-8 lg:p-12 text-center">
          {section.title && (
            <h2 className="text-2xl lg:text-3xl font-bold text-white mb-3">{section.title}</h2>
          )}
          {section.subtitle && (
            <p className="text-white/90 mb-6">{section.subtitle}</p>
          )}
          {section.buttonText && section.buttonLink && (
            <Button asChild size="lg" className="bg-white text-myco-green hover:bg-white/90 gap-2">
              <Link href={section.buttonLink}>
                {section.buttonText}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (section.sectionType === "text") {
    return (
      <div className="max-w-4xl mx-auto mb-12 prose prose-lg" data-testid={`section-${section.id}`}>
        {section.title && <h2 className="text-2xl font-bold text-myco-brown">{section.title}</h2>}
        {section.content && <div dangerouslySetInnerHTML={{ __html: section.content }} />}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto mb-12 bg-white rounded-xl p-8 shadow-sm border border-gray-100" data-testid={`section-${section.id}`}>
      {section.title && <h2 className="text-2xl font-bold text-myco-brown mb-4">{section.title}</h2>}
      {section.subtitle && <p className="text-gray-600 mb-4">{section.subtitle}</p>}
      {section.content && <p className="text-gray-700">{section.content}</p>}
    </div>
  );
}
