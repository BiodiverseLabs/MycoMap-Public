import { PublicLayout } from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useState } from "react";
import { 
  BookOpen, FileCode, CheckCircle, AlertTriangle, ArrowRight, 
  ChevronDown, ChevronRight, MapPin, Hash, Quote, Lightbulb,
  HelpCircle, Target, Clock, Users, GitBranch, Globe, Sparkles
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function TempCodeGuidelinesPage() {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const keyConcepts = [
    {
      icon: Target,
      title: "Bridge the Gap",
      description: "Temporary codes connect biodiversity data while formal taxonomy catches up. They're placeholders, not permanent names.",
      color: "bg-blue-500"
    },
    {
      icon: GitBranch,
      title: "Polyphasic Approach",
      description: "Codes integrate DNA sequences with morphology, ecology, geography, and seasonality—not just genetic clustering.",
      color: "bg-purple-500"
    },
    {
      icon: Users,
      title: "Community Standard",
      description: "Used by North American mycologists for over a decade on iNaturalist, Mushroom Observer, and GenBank.",
      color: "bg-myco-green"
    },
    {
      icon: Clock,
      title: "Designed to Retire",
      description: "Temp codes are meant to be replaced by formal Latin binomials once proper taxonomic work is complete.",
      color: "bg-orange-500"
    }
  ];

  const namingFormats = [
    {
      format: "Geographic Format",
      pattern: "Genus sp. 'XX##'",
      example: "Russula sp. 'IN01'",
      description: "Most commonly used. Two-letter state/province code + sequential number. The geographic indicator represents where the first sequence was documented.",
      when: "Use for most new temp codes where the taxon is geographically distinct or when creating a standard new code."
    },
    {
      format: "Species Complex Format",
      pattern: "Genus sp. 'species-XX##'",
      example: "Hygrocybe sp. 'conica-NY01'",
      description: "For known cryptic species complexes or when there's uncertainty about which sequences represent the species sensu stricto.",
      when: "Use when the group is known to contain multiple cryptic species under one name (e.g., Hygrocybe conica complex)."
    }
  ];

  const flowchartSteps = [
    {
      question: "Does it match a type specimen?",
      yes: "You're probably safe to call it that species.",
      no: "Continue to next step",
      caution: "Be wary of groups where the same species was described under multiple names (e.g., Psathyrellaceae, Crepidotus)."
    },
    {
      question: "Is there good consensus on what sequences represent the species?",
      yes: "You're probably safe to call it that species.",
      no: "Continue to next step",
      caution: null
    },
    {
      question: "Are there published papers supporting the ITS represents this species?",
      yes: "Probably safe to call it that species. Keep competing papers in consideration.",
      no: "Continue to next step",
      caution: null
    },
    {
      question: "Are the sequences clustering geographically?",
      yes: "Check if your cluster matches sequences from the type region.",
      no: "Check if there's already a temp code or species name being applied.",
      caution: null
    },
    {
      question: "Does your cluster match sequences from the type region?",
      yes: "Check if there's only one possible species from that region. If yes, probably safe to use the species name. If multiple possibilities, apply a temp code.",
      no: "If no sequences from type region exist, a temp code is advised. If sequences exist but don't match, create a new temp code.",
      caution: null
    }
  ];

  const bestPractices = [
    {
      title: "Cross-Observation Consistency",
      description: "Never change a temp code on a single observation without updating all observations using that code across all platforms.",
      icon: CheckCircle,
      type: "success"
    },
    {
      title: "Check Before Creating",
      description: "Always verify the code number isn't already in use in older formats (e.g., if Inocybe \"sp-IN100\" exists, don't create Inocybe sp. 'IN100').",
      icon: AlertTriangle,
      type: "warning"
    },
    {
      title: "Wait for Confirmation",
      description: "For very novel sequences (5+% different from any match), or low RiC sequences, consider waiting for a second matching sequence before creating a temp code.",
      icon: Clock,
      type: "info"
    },
    {
      title: "Document Everything",
      description: "Include sequence data, collection metadata, and rationale in relevant databases (iNaturalist, Mushroom Observer, MycoMap).",
      icon: FileCode,
      type: "success"
    },
    {
      title: "Geographic Precedence",
      description: "The geographic indicator should reference the location of the earliest documented collection/sequence when it is initially created.",
      icon: MapPin,
      type: "info"
    },
    {
      title: "Nom. Prov. Takes Priority",
      description: "Nomen provisorium (nom. prov.) names—species in process of being formally published—take precedence over temp codes.",
      icon: Sparkles,
      type: "success"
    }
  ];

  const faqItems = [
    {
      question: "What are temporary code names, and why do we use them?",
      answer: "Temporary code names (Cryptonomen temporarium) are interim identifiers applied to fungal collections that have been DNA barcoded when taxonomy is unclear. They provide a way to organize and connect biodiversity data while avoiding premature assignment of formal species names. The goal is to create a working outline of biodiversity that can later be refined into permanent classifications."
    },
    {
      question: "Do temporary code names mean something is a new species?",
      answer: "No. A temporary code does not imply novelty. It simply means more work is needed to clarify what the taxon represents. The taxon may ultimately prove to be a new species, a subspecies, a variety, or a clarified understanding of an existing but historically misunderstood species."
    },
    {
      question: "Why not just use species names?",
      answer: "Most macrofungal species are undescribed. For described species, original type specimens rarely have DNA sequences. Many past descriptions conflate multiple species, and most GenBank identifications are unreliable. We need a fast, public method to link putative species-level units between datasets in real-time."
    },
    {
      question: "Are temporary codes the same as OTUs (Operational Taxonomic Units)?",
      answer: "Not exactly. Unlike purely sequence-based mOTUs, temp codes are polyphasic delimitations that consider DNA sequences alongside morphology, ecology, geography, and seasonality. They also undergo manual curation to correct for sequencing errors and contamination."
    },
    {
      question: "Why 'temporary' instead of 'provisional'?",
      answer: "'Provisional' suggests a formal diagnostic step toward naming. 'Temporary' emphasizes these codes are short-term placeholders, not stable or definitive. A provisional name (nom. prov.) like Amanita 'banningiana' is more similar to a final latinized epithet."
    },
    {
      question: "Are temporary code names stable?",
      answer: "No, and that's by design. They are iterative—as more data becomes available, codes may be split, merged, or abandoned. Their job is to connect datasets and flag uncertainty, not to provide lasting labels."
    },
    {
      question: "Should I learn temporary code names?",
      answer: "Generally, no. Their main purpose is organizing datasets for researchers, not providing field names for mushrooms. In most cases, use group names (e.g., 'Pluteus romellii group') in conversation. Leave the specific codes for database work."
    },
    {
      question: "How should I talk about these fungi with a general audience?",
      answer: "Don't use code names unless necessary—they aren't meaningful without special training. Instead, use accessible explanations like: 'We know the classic Christmas mushroom is usually red, but in our region the common form is orange, and there's also a less common sister species that is light yellow. Science hasn't named it yet.'"
    },
    {
      question: "Why use geographic indicators in the codes?",
      answer: "Geographic prefixes serve multiple purposes: (1) a useful clue about distribution, (2) a small honor to the state/province of first documentation, and (3) a disambiguator that makes codes like 'IN23' and 'MT32' more memorable and distinct than purely numeric codes."
    },
    {
      question: "What if different groups create different codes for the same taxon?",
      answer: "This can happen with a decentralized system. Researchers regularly sync codes as duplicates are encountered, and formal taxonomy ultimately resolves overlaps. When integrating datasets, cross-reference codes and make your own determinations."
    },
    {
      question: "When is it appropriate to move from a code to a formal description?",
      answer: "A taxon is ready for formal description when there are enough collections (typically 5-10 well-distributed specimens) to characterize its morphology, range, and ecology, and there's reason to believe it's distinct."
    },
    {
      question: "What happens when a species is formally described?",
      answer: "Users update databases (MycoBLAST.org, MycoMap, iNaturalist, Mushroom Observer) to the new binomial, and the temporary code is retired in favor of the formal name."
    }
  ];

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="relative min-h-[50vh] flex items-center justify-center overflow-hidden bg-gradient-to-br from-myco-brown to-myco-brown/90">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-60 h-60 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-80 h-80 bg-myco-green rounded-full blur-3xl" />
        </div>
        
        <div className="relative container mx-auto px-4 py-20 text-center z-10">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6 border border-white/20">
            <FileCode className="h-4 w-4 text-myco-green" />
            <span className="text-white/90 text-sm font-medium">Taxonomic Standards</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 drop-shadow-lg" data-testid="text-temp-code-title">
            Temporary Code Guidelines
          </h1>
          <p className="text-lg sm:text-xl text-white/90 max-w-3xl mx-auto mb-6" data-testid="text-temp-code-subtitle">
            <em>Cryptonomen temporarium</em> — A standardized system for documenting 
            undescribed or uncertain fungal taxa until formal names can be assigned.
          </p>
          <p className="text-base text-white/70 max-w-2xl mx-auto">
            Used by North American mycologists on iNaturalist, Mushroom Observer, and GenBank for over a decade.
          </p>
        </div>
      </section>

      {/* Philosophy Section */}
      <section className="py-16 bg-gradient-to-b from-amber-50/50 to-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start gap-4 mb-8">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-myco-green/10 flex items-center justify-center">
                <Lightbulb className="h-6 w-6 text-myco-green" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-myco-brown mb-2">The Challenge We Face</h2>
                <p className="text-gray-600 text-lg leading-relaxed">
                  Most macrofungal species remain undescribed. Even for described species, original type 
                  specimens rarely have DNA sequences. At the current rate of taxonomic progress, it would 
                  take hundreds or thousands of years before most species have formal names.
                </p>
              </div>
            </div>
            
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100">
              <div className="flex items-start gap-4">
                <Quote className="h-8 w-8 text-myco-green/40 flex-shrink-0" />
                <blockquote className="text-gray-700 text-lg italic leading-relaxed">
                  "Environmental impact assessments, conservation planning, and ecological models cannot 
                  wait centuries for formal names. Temporary codes let us capture what is known in real-time, 
                  connect observations across datasets, and flag unresolved taxa for future work."
                </blockquote>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Concepts */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1 bg-myco-green/10 text-myco-green rounded-full text-sm font-medium mb-4">
              <Target className="w-4 h-4" />
              Core Principles
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown mb-4">
              Key Concepts
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Understanding the purpose and philosophy behind temporary code names
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {keyConcepts.map((concept, index) => (
              <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
                <div className={`flex items-center justify-center w-12 h-12 rounded-full ${concept.color} mb-4`}>
                  <concept.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-myco-brown mb-2">{concept.title}</h3>
                <p className="text-gray-600 text-sm">{concept.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Naming Formats */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1 bg-myco-brown/10 text-myco-brown rounded-full text-sm font-medium mb-4">
              <Hash className="w-4 h-4" />
              Naming Conventions
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown mb-4">
              Two Standard Formats
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Choose the appropriate format based on your taxonomic situation
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {namingFormats.map((format, index) => (
              <div key={index} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
                <div className="bg-myco-brown p-6">
                  <h3 className="text-xl font-bold text-white mb-2">{format.format}</h3>
                  <code className="bg-white/20 px-3 py-1 rounded text-white/90 text-sm">
                    {format.pattern}
                  </code>
                </div>
                <div className="p-6">
                  <div className="mb-4 p-4 bg-myco-green/5 rounded-lg border border-myco-green/20">
                    <span className="text-sm text-gray-500 block mb-1">Example:</span>
                    <span className="text-lg font-mono font-semibold text-myco-green">
                      {format.example}
                    </span>
                  </div>
                  <p className="text-gray-700 mb-4">{format.description}</p>
                  <div className="flex items-start gap-2 text-sm">
                    <ArrowRight className="h-4 w-4 text-myco-green mt-0.5 flex-shrink-0" />
                    <span className="text-gray-600">{format.when}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Geographic Guidelines */}
          <div className="max-w-5xl mx-auto mt-12">
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100">
              <div className="flex items-start gap-4 mb-6">
                <Globe className="h-6 w-6 text-myco-green flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-bold text-myco-brown mb-2">Geographic Code Guidelines</h3>
                  <p className="text-gray-600">
                    The two-letter prefix indicates where the taxon was first documented.
                  </p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-myco-brown mb-2">Large Countries (US, Canada, Mexico, Australia)</h4>
                  <p className="text-sm text-gray-600 mb-2">Use state/province abbreviations to differentiate ecoregions:</p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li><code className="bg-gray-200 px-1 rounded">IN</code> — Indiana</li>
                    <li><code className="bg-gray-200 px-1 rounded">QC</code> — Quebec</li>
                    <li><code className="bg-gray-200 px-1 rounded">CA</code> — California</li>
                  </ul>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-myco-brown mb-2">Smaller Countries</h4>
                  <p className="text-sm text-gray-600 mb-2">For countries without significant ecoregion variance, use country codes:</p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li><code className="bg-gray-200 px-1 rounded">UK</code> — United Kingdom</li>
                    <li><code className="bg-gray-200 px-1 rounded">DE</code> — Germany</li>
                    <li><code className="bg-gray-200 px-1 rounded">NZ</code> — New Zealand</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Decision Flowchart */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium mb-4">
              <GitBranch className="w-4 h-4" />
              Decision Process
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown mb-4">
              When to Apply a Temp Code
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Follow this decision tree to determine if and how a temporary code should be applied
            </p>
          </div>

          <div className="max-w-4xl mx-auto space-y-4">
            {flowchartSteps.map((step, index) => (
              <div key={index} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <button
                  onClick={() => setExpandedSection(expandedSection === `step-${index}` ? null : `step-${index}`)}
                  className="w-full p-6 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                  data-testid={`button-flowchart-step-${index}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold">
                      {index + 1}
                    </div>
                    <span className="text-lg font-medium text-myco-brown">{step.question}</span>
                  </div>
                  {expandedSection === `step-${index}` ? (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  )}
                </button>
                
                {expandedSection === `step-${index}` && (
                  <div className="px-6 pb-6 pt-2 border-t border-gray-100">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          <span className="font-semibold text-green-800">Yes</span>
                        </div>
                        <p className="text-sm text-green-700">{step.yes}</p>
                      </div>
                      <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                        <div className="flex items-center gap-2 mb-2">
                          <ArrowRight className="h-5 w-5 text-red-600" />
                          <span className="font-semibold text-red-800">No</span>
                        </div>
                        <p className="text-sm text-red-700">{step.no}</p>
                      </div>
                    </div>
                    {step.caution && (
                      <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-amber-800">{step.caution}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="max-w-4xl mx-auto mt-8">
            <div className="p-6 bg-blue-50 rounded-xl border border-blue-200">
              <div className="flex items-start gap-3">
                <Lightbulb className="h-6 w-6 text-blue-600 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">Important Note</h4>
                  <p className="text-sm text-blue-800">
                    This flowchart illustrates the thought process, but nature is complex. Always consider 
                    preferred substrate, habitat, seasonality, phenology, and that some groups have more 
                    variable ITS than others. Use your best judgment.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Best Practices */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1 bg-myco-green/10 text-myco-green rounded-full text-sm font-medium mb-4">
              <CheckCircle className="w-4 h-4" />
              Guidelines
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown mb-4">
              Best Practices
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Key principles to follow when creating and managing temporary codes
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {bestPractices.map((practice, index) => (
              <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full mb-4 ${
                  practice.type === 'success' ? 'bg-green-100' : 
                  practice.type === 'warning' ? 'bg-amber-100' : 'bg-blue-100'
                }`}>
                  <practice.icon className={`h-5 w-5 ${
                    practice.type === 'success' ? 'text-green-600' : 
                    practice.type === 'warning' ? 'text-amber-600' : 'text-blue-600'
                  }`} />
                </div>
                <h3 className="text-lg font-bold text-myco-brown mb-2">{practice.title}</h3>
                <p className="text-gray-600 text-sm">{practice.description}</p>
              </div>
            ))}
          </div>

          {/* Existing Codes Note */}
          <div className="max-w-4xl mx-auto mt-12">
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100">
              <h3 className="text-xl font-bold text-myco-brown mb-4">About Existing Non-Standard Codes</h3>
              <p className="text-gray-700 mb-4">
                You may encounter older temp codes that don't follow current conventions, such as:
              </p>
              <div className="flex flex-wrap gap-3 mb-4">
                <code className="bg-gray-100 px-3 py-1 rounded text-sm">Amanita sp-21</code>
                <code className="bg-gray-100 px-3 py-1 rounded text-sm">Russula 'crenulata Woo 24'</code>
                <code className="bg-gray-100 px-3 py-1 rounded text-sm">Bolbitius 'titubans PNW02'</code>
              </div>
              <p className="text-gray-700">
                <strong>Do not change these.</strong> Stability is more important than format consistency. 
                These codes are already in use across multiple databases, and changing them would create confusion. 
                Only update formatting (e.g., double quotes to single quotes) if you have time to update 
                <em> all</em> public platforms (iNaturalist, MycoMap, Mushroom Observer) simultaneously.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1 bg-myco-brown/10 text-myco-brown rounded-full text-sm font-medium mb-4">
              <HelpCircle className="w-4 h-4" />
              Common Questions
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-myco-brown mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Everything you need to know about temporary code names
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="space-y-4">
              {faqItems.map((item, index) => (
                <AccordionItem 
                  key={index} 
                  value={`faq-${index}`}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm"
                >
                  <AccordionTrigger 
                    className="px-6 py-4 hover:bg-gray-50 text-left font-medium text-myco-brown"
                    data-testid={`accordion-faq-${index}`}
                  >
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="px-6 pb-4 text-gray-700">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-br from-myco-green to-myco-green/90">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Contribute?</h2>
          <p className="text-white/90 max-w-2xl mx-auto mb-8">
            Help us document North American fungal biodiversity. Register new temp codes, 
            submit specimens for DNA barcoding, or explore our research dashboard.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="bg-white text-myco-green hover:bg-white/90">
              <Link href="/join">
                Join MycoMap
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
              <Link href="/dashboard">
                Research Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
