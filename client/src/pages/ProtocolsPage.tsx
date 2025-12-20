import { PublicLayout } from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  BookOpen, Camera, Package, Thermometer, FileText, 
  CheckCircle, ArrowRight, Download, Leaf, AlertTriangle,
  Clock, Ruler, Droplets, Wind
} from "lucide-react";

export default function ProtocolsPage() {
  const photographyTips = [
    { icon: Camera, title: "Multiple Angles", description: "Capture side view (near ground level), top view, stem, and spore-bearing surface" },
    { icon: Ruler, title: "Scale Reference", description: "Include a ruler, coin, or known object for size reference" },
    { icon: FileText, title: "Data Slip", description: "Photograph your field data slip alongside the specimen" },
    { icon: CheckCircle, title: "High Quality", description: "Ensure images are in focus and well-lit for accurate identification" },
  ];

  const dryingSteps = [
    {
      step: 1,
      title: "Temperature Control",
      description: "Use a food dehydrator or fan at no more than 140°F (60°C)",
      icon: Thermometer,
      warning: "Higher temperatures can damage DNA"
    },
    {
      step: 2,
      title: "Duration",
      description: "Dry specimens for 12-24 hours until completely dry and crispy",
      icon: Clock,
      warning: "Thick specimens may need longer"
    },
    {
      step: 3,
      title: "Storage",
      description: "Place dried specimens in snack-size ziplock bags (6.5\" wide, no slider)",
      icon: Package,
      warning: "Avoid bags that are too tall or have zipper closures"
    },
    {
      step: 4,
      title: "Labeling",
      description: "Include field data slip in bag with writing visible from outside",
      icon: FileText,
      warning: "Write iNaturalist observation number on each slip"
    }
  ];

  const fieldDataFields = [
    { field: "Collection Number", description: "Your unique identifier (e.g., CA25-001)", required: true },
    { field: "Date", description: "Date of collection", required: true },
    { field: "Collector Name", description: "Your full name", required: true },
    { field: "Location", description: "GPS coordinates or detailed description", required: true },
    { field: "Habitat", description: "Forest type, substrate, associated trees", required: true },
    { field: "Smell", description: "Any distinctive odors", required: false },
    { field: "Taste", description: "If safely determined (tiny piece, spit out)", required: false },
    { field: "Color Notes", description: "Fresh colors that may change when dried", required: false },
  ];

  const shippingGuidelines = [
    "Pack dried specimens loosely to prevent crushing",
    "Use a padded envelope or small box",
    "Include a packing list with iNaturalist observation numbers",
    "Ship to Mycota Lab address (provided after joining a project)",
    "Standard mail is fine - specimens are dried and stable",
  ];

  return (
    <PublicLayout>
      <section className="relative min-h-[50vh] flex items-center justify-center overflow-hidden bg-gradient-to-br from-myco-brown to-myco-brown/90">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-60 h-60 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-80 h-80 bg-myco-green rounded-full blur-3xl" />
        </div>
        
        <div className="relative container mx-auto px-4 py-20 text-center z-10">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6 border border-white/20">
            <BookOpen className="h-4 w-4 text-myco-green" />
            <span className="text-white/90 text-sm font-medium">Collection Guidelines</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 drop-shadow-lg" data-testid="text-protocols-title">
            Protocols & Guidelines
          </h1>
          <p className="text-lg sm:text-xl text-white/90 max-w-3xl mx-auto mb-10" data-testid="text-protocols-description">
            Best practices for collecting, documenting, drying, and shipping mushroom specimens 
            to ensure high-quality DNA sequencing results.
          </p>
          
          <Button size="lg" className="bg-myco-green hover:bg-myco-green/90 text-white gap-2" data-testid="button-download-field-slips">
            <Download className="h-5 w-5" />
            Download Field Data Slips
          </Button>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1 bg-myco-green/10 text-myco-green rounded-full text-sm font-medium mb-4">
              <Camera className="w-4 h-4" />
              Documentation
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown mb-4">
              Photography Guidelines
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Good photos are essential for species identification and scientific documentation
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {photographyTips.map((tip, index) => (
              <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-myco-green to-myco-green/80 mb-4">
                  <tip.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-myco-brown mb-2">{tip.title}</h3>
                <p className="text-gray-600 text-sm">{tip.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-myco-brown">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1 bg-white/10 text-white/90 rounded-full text-sm font-medium mb-4 border border-white/20">
              <Wind className="w-4 h-4" />
              Preservation
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Drying Specimens
            </h2>
            <p className="text-white/80 max-w-2xl mx-auto">
              Proper drying preserves DNA and prevents mold growth during shipping
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {dryingSteps.map((step, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-myco-green text-white font-bold">
                    {step.step}
                  </div>
                  <step.icon className="w-6 h-6 text-myco-green" />
                </div>
                <h3 className="text-white font-semibold mb-2 text-lg">{step.title}</h3>
                <p className="text-white/80 text-sm mb-3">{step.description}</p>
                <div className="flex items-start gap-2 text-amber-300/80 text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{step.warning}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-b from-white to-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1 bg-myco-green/10 text-myco-green rounded-full text-sm font-medium mb-4">
              <FileText className="w-4 h-4" />
              Data Collection
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown mb-4">
              Field Data Slip
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Complete these fields for each specimen you collect
            </p>
          </div>
          
          <div className="max-w-3xl mx-auto">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="grid grid-cols-3 bg-myco-brown/5 px-6 py-3 font-semibold text-myco-brown text-sm">
                <div>Field</div>
                <div className="col-span-2">Description</div>
              </div>
              {fieldDataFields.map((item, index) => (
                <div 
                  key={index} 
                  className={`grid grid-cols-3 px-6 py-4 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-t border-gray-100`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-myco-brown">{item.field}</span>
                    {item.required && (
                      <span className="text-xs bg-myco-green/10 text-myco-green px-2 py-0.5 rounded-full">Required</span>
                    )}
                  </div>
                  <div className="col-span-2 text-gray-600">{item.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1 bg-myco-green/10 text-myco-green rounded-full text-sm font-medium mb-4">
              <Package className="w-4 h-4" />
              Shipping
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown mb-4">
              Mailing Your Specimens
            </h2>
          </div>
          
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <ul className="space-y-4">
                {shippingGuidelines.map((guideline, index) => (
                  <li key={index} className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-myco-green/10 flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-myco-green" />
                    </div>
                    <span className="text-gray-700 pt-1">{guideline}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-r from-myco-green to-myco-green/90">
        <div className="container mx-auto px-4 text-center">
          <Leaf className="w-12 h-12 text-white/80 mx-auto mb-6" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to Start Collecting?
          </h2>
          <p className="text-white/90 text-lg max-w-2xl mx-auto mb-8">
            Download the field data slips and join a MycoMap project to contribute 
            your specimens to fungal biodiversity research.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-white text-myco-green hover:bg-white/90 gap-2" data-testid="button-cta-download-slips">
              <Download className="h-5 w-5" />
              Download Field Slips
            </Button>
            <Link href="/network">
              <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10" data-testid="link-join-network">
                Join MycoMap Network
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
