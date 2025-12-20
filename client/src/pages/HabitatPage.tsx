import { PublicLayout } from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  TreePine, Leaf, Award, CheckCircle, ArrowRight, 
  Download, Camera, ClipboardCheck, Home, Shield,
  Sprout, Cloud, Globe, FileText
} from "lucide-react";

export default function HabitatPage() {
  const steps = [
    {
      icon: Download,
      title: "Download the Scorecard",
      description: "Walk your property and check off existing features like mature trees, leaf litter, and untreated soil",
      detail: "Calculate your baseline score toward the 15-point certification threshold"
    },
    {
      icon: Sprout,
      title: "Build Your Refuge",
      description: "Implement simple habitat improvements to reach 15 points",
      detail: "Create log piles, leave leaves as mulch, document fungi with iNaturalist"
    },
    {
      icon: ClipboardCheck,
      title: "Submit Your Scorecard",
      description: "Once you hit 15 points, submit online to join the certified network",
      detail: "Receive your certificate and optional yard sign"
    }
  ];

  const scoringExamples = [
    { points: 3, action: "Create a log pile in a shady corner" },
    { points: 2, action: "Leave the leaves under trees as natural mulch" },
    { points: 3, action: "Upload 5 fungal observations to iNaturalist" },
    { points: 2, action: "Plant native host trees or shrubs" },
    { points: 2, action: "Avoid fungicides and broad-spectrum herbicides" },
    { points: 3, action: "Maintain mature trees on property" },
  ];

  const benefits = [
    {
      icon: Award,
      title: "Official Certification",
      description: "Receive a Certified Fungal Habitat certificate for your property"
    },
    {
      icon: Home,
      title: "Yard Sign Available",
      description: "Purchase an official yard sign to display your commitment"
    },
    {
      icon: Globe,
      title: "Contribute to Science",
      description: "Your observations help track fungal biodiversity in residential areas"
    },
    {
      icon: Cloud,
      title: "Climate Impact",
      description: "Fungal networks store billions of tons of carbon in soil annually"
    }
  ];

  const guidelines = [
    {
      title: "Avoid Routine Fungicides",
      description: "Routine fungicide and broad-spectrum herbicide applications harm underground fungal networks"
    },
    {
      title: "Leave the Leaves",
      description: "Move leaves from lawn areas to under trees and garden beds, creating forest-floor conditions"
    },
    {
      title: "Monitor Invasives",
      description: "Resources provided on regional fungal invasives to watch for and report"
    }
  ];

  return (
    <PublicLayout>
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(https://mycota.com/wp-content/uploads/2025/11/conserve3.jpg)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
        
        <div className="relative container mx-auto px-4 py-20 text-center z-10">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6 border border-white/20">
            <TreePine className="h-4 w-4 text-myco-green" />
            <span className="text-white/90 text-sm font-medium">Residential Program</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 drop-shadow-lg" data-testid="text-habitat-title">
            Certified Fungal Habitat
          </h1>
          <p className="text-lg sm:text-xl text-white/90 max-w-3xl mx-auto mb-10">
            Transform your yard into a fungi-friendly habitat through simple, actionable gardening 
            practices. Join the citizen science initiative protecting fungal biodiversity.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-myco-green hover:bg-myco-green/90 text-white gap-2" data-testid="button-download-scorecard">
              <Download className="h-5 w-5" />
              Download Scorecard
            </Button>
            <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10" data-testid="button-learn-more">
              Learn More
            </Button>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-2 px-4 py-1 bg-myco-green/10 text-myco-green rounded-full text-sm font-medium mb-4">
              <CheckCircle className="w-4 h-4" />
              Simple 3-Step Process
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown mb-4">
              How to Get Certified
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Achieve 15 points on the Fungal Habitat Scorecard to earn your certification
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {steps.map((step, index) => (
              <div key={index} className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-myco-green/10 to-myco-brown/10 rounded-2xl transform group-hover:scale-[1.02] transition-transform" />
                <div className="relative bg-white rounded-2xl p-8 border border-gray-100 shadow-sm h-full">
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-myco-green to-myco-green/80 mb-6">
                    <step.icon className="h-8 w-8 text-white" />
                  </div>
                  <div className="text-myco-green font-bold text-sm mb-2">Step {index + 1}</div>
                  <h3 className="text-xl font-bold text-myco-brown mb-3">{step.title}</h3>
                  <p className="text-gray-600 mb-3">{step.description}</p>
                  <p className="text-sm text-gray-500 italic">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-myco-brown">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1 bg-white/10 text-white/90 rounded-full text-sm font-medium mb-4 border border-white/20">
              <FileText className="w-4 h-4" />
              Scoring Examples
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ways to Earn Points
            </h2>
            <p className="text-white/80 max-w-2xl mx-auto">
              Reach 15 points through simple habitat improvements
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {scoringExamples.map((example, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20 hover:bg-white/15 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-myco-green flex items-center justify-center text-white font-bold text-lg">
                    +{example.points}
                  </div>
                  <p className="text-white/90">{example.action}</p>
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
              <Award className="w-4 h-4" />
              Why Participate
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown mb-4">
              Benefits of Certification
            </h2>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {benefits.map((benefit, index) => (
              <div key={index} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow text-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-myco-green to-myco-green/80 mx-auto mb-4">
                  <benefit.icon className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-lg font-bold text-myco-brown mb-2">{benefit.title}</h3>
                <p className="text-gray-600 text-sm">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1 bg-myco-green/10 text-myco-green rounded-full text-sm font-medium mb-4">
              <Shield className="w-4 h-4" />
              Best Practices
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown mb-4">
              Program Guidelines
            </h2>
          </div>
          
          <div className="max-w-4xl mx-auto">
            <div className="space-y-4">
              {guidelines.map((guideline, index) => (
                <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-myco-green/10 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-myco-green" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-myco-brown mb-1">{guideline.title}</h3>
                      <p className="text-gray-600">{guideline.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-gradient-to-b from-white to-gray-50">
        <div className="container mx-auto px-4">
          <div className="bg-gradient-to-br from-myco-green/5 via-transparent to-myco-brown/5 rounded-2xl p-8 md:p-12 max-w-4xl mx-auto border border-gray-100">
            <div className="text-center">
              <Cloud className="w-12 h-12 text-myco-green mx-auto mb-4" />
              <h2 className="text-2xl sm:text-3xl font-bold text-myco-brown mb-4">
                Climate Impact
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto mb-6">
                Fungal habitats support carbon storage. Mycorrhizal networks channel billions of tons 
                of carbon per year from plants into soil globally. By protecting soil and planting 
                native host trees, your yard becomes a carbon sink.
              </p>
              <p className="text-myco-green font-semibold">
                Every certified habitat makes a difference.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-r from-myco-green to-myco-green/90">
        <div className="container mx-auto px-4 text-center">
          <Leaf className="w-12 h-12 text-white/80 mx-auto mb-6" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to Certify Your Habitat?
          </h2>
          <p className="text-white/90 text-lg max-w-2xl mx-auto mb-8">
            Download the scorecard today and start transforming your yard into a 
            fungi-friendly haven. No scientific expertise required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-white text-myco-green hover:bg-white/90 gap-2" data-testid="button-cta-get-scorecard">
              <Download className="h-5 w-5" />
              Get the Scorecard
            </Button>
            <Link href="/network">
              <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10" data-testid="link-explore-network">
                Explore MycoMap Network
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
