import { useQuery } from "@tanstack/react-query";
import { PublicLayout } from "@/components/PublicLayout";

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
  slug: string;
  title: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
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

  return (
    <PublicLayout>
      <div className="py-12">
        <div className="container mx-auto px-4">
          <header className="text-center mb-12">
            <h1 className="text-4xl font-bold text-myco-brown mb-4" data-testid="text-page-title">
              {page.title}
            </h1>
            {page.description && (
              <p className="text-lg text-gray-600 max-w-3xl mx-auto" data-testid="text-page-description">
                {page.description}
              </p>
            )}
          </header>

          {page.sections.map((section) => (
            <Section key={section.id} section={section} />
          ))}

          {page.sections.length === 0 && (
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

function Section({ section }: { section: PageSection }) {
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
