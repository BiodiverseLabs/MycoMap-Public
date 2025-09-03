import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Search, ExternalLink, Database, Activity, MapPin, BarChart3, Users, TreePine } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface APIEndpoint {
  method: string;
  path: string;
  description: string;
  parameters?: {
    name: string;
    type: string;
    required: boolean;
    description: string;
  }[];
  responseExample?: any;
  category: string;
}

const apiEndpoints: APIEndpoint[] = [
  // Core Data Endpoints
  {
    method: "GET",
    path: "/api/observations",
    description: "Retrieve fungal observations with filtering options",
    category: "observations",
    parameters: [
      { name: "limit", type: "number", required: false, description: "Limit number of results" },
      { name: "state", type: "string", required: false, description: "Filter by state/region" },
      { name: "species", type: "string", required: false, description: "Filter by scientific name" },
      { name: "contributor", type: "string", required: false, description: "Filter by contributor name" },
      { name: "dateRange", type: "string", required: false, description: "Filter by date range" }
    ],
    responseExample: [
      {
        id: 310576,
        observationId: "304894299",
        scientificName: "Agaricus bisporus",
        commonName: "Button Mushroom",
        latitude: 37.7749,
        longitude: -122.4194,
        state: "California",
        observedOn: "2024-03-15",
        collector: "John Smith",
        source: "iNaturalist"
      }
    ]
  },
  {
    method: "GET", 
    path: "/api/species",
    description: "Get species list with observation counts and distribution data",
    category: "species",
    parameters: [
      { name: "limit", type: "number", required: false, description: "Limit number of results" },
      { name: "state", type: "string", required: false, description: "Filter by state" },
      { name: "genusOnly", type: "boolean", required: false, description: "Show only genus-level identifications" }
    ],
    responseExample: [
      {
        id: 1,
        scientificName: "Agaricus bisporus",
        commonName: "Button Mushroom",
        observationCount: 156,
        firstObserved: "2020-01-15",
        lastObserved: "2024-12-01", 
        stateCount: 12
      }
    ]
  },
  {
    method: "GET",
    path: "/api/metrics",
    description: "Get overview statistics for the database",
    category: "analytics",
    parameters: [
      { name: "dateRange", type: "string", required: false, description: "Filter by date range (last_30_days, last_6_months, last_year, all_time)" },
      { name: "state", type: "string", required: false, description: "Filter by state" }
    ],
    responseExample: {
      totalObservations: 86131,
      uniqueSpecies: 15127,
      activeContributors: 1247,
      statesCovered: 52,
      fullyValidated: 12456
    }
  },
  {
    method: "GET",
    path: "/api/contributors",
    description: "Get list of contributors with their observation statistics",
    category: "contributors",
    parameters: [
      { name: "limit", type: "number", required: false, description: "Limit number of results" },
      { name: "state", type: "string", required: false, description: "Filter by state" }
    ],
    responseExample: [
      {
        id: "1",
        name: "Stephen Russell",
        affiliation: "University Research Lab",
        observationCount: 2543,
        speciesCount: 892,
        stateCount: 15,
        firstObservation: "2018-05-12",
        lastObservation: "2024-11-28"
      }
    ]
  },
  {
    method: "GET",
    path: "/api/map-data", 
    description: "Get geographic coordinates for mapping observations",
    category: "geospatial",
    parameters: [
      { name: "limit", type: "number", required: false, description: "Limit number of coordinates (default: 75000)" },
      { name: "state", type: "string", required: false, description: "Filter by state" }
    ],
    responseExample: [
      {
        latitude: 39.892351,
        longitude: -105.7635,
        intensity: 0.8
      }
    ]
  },
  {
    method: "GET",
    path: "/api/temporal-trends",
    description: "Get temporal observation trends over time",
    category: "analytics", 
    parameters: [
      { name: "groupBy", type: "string", required: false, description: "Group by period (month, quarter, year)" },
      { name: "state", type: "string", required: false, description: "Filter by state" },
      { name: "goingBackYears", type: "string", required: false, description: "Years to look back" }
    ],
    responseExample: [
      {
        period: "2024-01",
        count: 1247
      }
    ]
  },
  {
    method: "GET",
    path: "/api/taxonomic-distribution",
    description: "Get distribution of observations by taxonomic groups",
    category: "taxonomy",
    responseExample: [
      {
        phylum: "Basidiomycota",
        count: 65432,
        percentage: 76.8
      }
    ]
  },
  {
    method: "GET",
    path: "/api/states",
    description: "Get list of all states/regions with observations",
    category: "geospatial",
    responseExample: [
      "Alabama", "Alaska", "Alberta", "Arizona", "Arkansas", "California"
    ]
  },
  {
    method: "GET",
    path: "/api/observation-sources",
    description: "Get count of observations by data source",
    category: "analytics",
    responseExample: [
      {
        source: "iNaturalist",
        count: "72456"
      },
      {
        source: "Mushroom Observer", 
        count: "13675"
      }
    ]
  },
  {
    method: "GET",
    path: "/api/species-accumulation",
    description: "Get species accumulation curve data",
    category: "analytics",
    responseExample: [
      {
        observationNumber: 1000,
        uniqueSpeciesCount: 234
      }
    ]
  },
  {
    method: "GET",
    path: "/api/species-discovery-rate",
    description: "Get species discovery rate analysis",
    category: "analytics",
    responseExample: [
      {
        observationChunk: 1000,
        newSpeciesCount: 45
      }
    ]
  },
  {
    method: "GET",
    path: "/api/genera-accumulation",
    description: "Get genera accumulation curve data",
    category: "analytics",
    responseExample: [
      {
        observationNumber: 500,
        uniqueGeneraCount: 89
      }
    ]
  },
  {
    method: "GET",
    path: "/api/family-distribution",
    description: "Get distribution of observations by family",
    category: "taxonomy",
    responseExample: [
      {
        family: "Agaricaceae",
        count: 3452,
        percentage: 15.2
      }
    ]
  },
  {
    method: "GET",
    path: "/api/states/global-firsts",
    description: "Get states with global first records",
    category: "records",
    responseExample: [
      {
        state: "California",
        globalFirstCount: 234,
        totalSpecies: 1567
      }
    ]
  },
  {
    method: "GET",
    path: "/api/contributors/global-firsts",
    description: "Get contributors with global first records",
    category: "records",
    parameters: [
      { name: "limit", type: "number", required: false, description: "Limit number of results" }
    ],
    responseExample: [
      {
        contributorName: "Dr. Jane Smith",
        globalFirstCount: 12,
        totalObservations: 456
      }
    ]
  },
  {
    method: "GET",
    path: "/api/species/:scientificName/records",
    description: "Get all records for a specific species",
    category: "species",
    parameters: [
      { name: "scientificName", type: "string", required: true, description: "Scientific name of the species (URL encoded)" }
    ],
    responseExample: [
      {
        observationId: "12345678",
        latitude: 37.7749,
        longitude: -122.4194,
        observedOn: "2024-03-15",
        collector: "John Smith",
        state: "California"
      }
    ]
  },
  {
    method: "GET",
    path: "/api/seasonal-patterns",
    description: "Get seasonal observation patterns",
    category: "analytics",
    parameters: [
      { name: "state", type: "string", required: false, description: "Filter by state" },
      { name: "species", type: "string", required: false, description: "Filter by species" }
    ],
    responseExample: [
      {
        month: 3,
        averageCount: 234,
        peakYear: 2023
      }
    ]
  },
  {
    method: "GET",
    path: "/api/field-guides",
    description: "Get list of available field guides",
    category: "guides",
    responseExample: [
      {
        id: 1,
        name: "Macrofungi of Northwest Indiana",
        description: "Comprehensive guide to fungi in Northwest Indiana",
        boundingBoxNorth: 41.7643,
        boundingBoxSouth: 40.8819,
        boundingBoxEast: -86.8562,
        boundingBoxWest: -87.5286,
        speciesCount: 342
      }
    ]
  },
  {
    method: "GET",
    path: "/api/field-guides/:id/species",
    description: "Get species list for a specific field guide",
    category: "guides",
    parameters: [
      { name: "id", type: "number", required: true, description: "Field guide ID" },
      { name: "limit", type: "number", required: false, description: "Limit number of results" }
    ],
    responseExample: [
      {
        scientificName: "Agaricus bisporus",
        commonName: "Button Mushroom",
        observationCount: 23,
        imageCount: 45
      }
    ]
  }
];

const categories = {
  observations: { name: "Observations", icon: Database, color: "bg-blue-100 text-blue-800" },
  species: { name: "Species", icon: TreePine, color: "bg-green-100 text-green-800" },
  contributors: { name: "Contributors", icon: Users, color: "bg-purple-100 text-purple-800" },
  geospatial: { name: "Geospatial", icon: MapPin, color: "bg-orange-100 text-orange-800" },
  analytics: { name: "Analytics", icon: BarChart3, color: "bg-indigo-100 text-indigo-800" },
  taxonomy: { name: "Taxonomy", icon: Activity, color: "bg-emerald-100 text-emerald-800" },
  records: { name: "Records", icon: ExternalLink, color: "bg-pink-100 text-pink-800" },
  guides: { name: "Field Guides", icon: ExternalLink, color: "bg-teal-100 text-teal-800" }
};

export default function ApiDocumentation() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const { toast } = useToast();

  const filteredEndpoints = apiEndpoints.filter(endpoint => {
    const matchesSearch = endpoint.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         endpoint.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || endpoint.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: "URL has been copied to your clipboard",
    });
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case "GET": return "bg-green-100 text-green-800";
      case "POST": return "bg-blue-100 text-blue-800";
      case "PUT": return "bg-yellow-100 text-yellow-800";
      case "DELETE": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const baseUrl = window.location.origin;

  return (
    <div className="flex flex-col h-full">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">MacroFungi API</h1>
            <p className="text-slate-600 mt-2">
              Access comprehensive mycological observation data through our RESTful API
            </p>
          </div>
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            v1.0
          </Badge>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* API Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                API Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold mb-2">Base URL</h3>
                  <div className="flex items-center gap-2">
                    <code className="bg-slate-100 px-3 py-1 rounded text-sm flex-1">
                      {baseUrl}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(baseUrl)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Response Format</h3>
                  <Badge variant="outline">JSON</Badge>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Features</h3>
                <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                  <li>RESTful API design with consistent JSON responses</li>
                  <li>Comprehensive filtering and query parameters</li>
                  <li>Real-time access to 86,000+ fungal observations</li>
                  <li>Geographic and temporal data analysis</li>
                  <li>Cross-platform data integration (iNaturalist, Mushroom Observer, etc.)</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search endpoints..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
              <TabsList className="grid grid-cols-9 w-full sm:w-auto">
                <TabsTrigger value="all">All</TabsTrigger>
                {Object.entries(categories).map(([key, cat]) => (
                  <TabsTrigger key={key} value={key} className="text-xs">
                    {cat.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Endpoints */}
          <div className="space-y-4">
            {filteredEndpoints.map((endpoint, index) => {
              const categoryInfo = categories[endpoint.category as keyof typeof categories];
              const Icon = categoryInfo?.icon || Database;
              
              return (
                <Card key={index} className="overflow-hidden">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Badge className={getMethodColor(endpoint.method)}>
                          {endpoint.method}
                        </Badge>
                        <div>
                          <code className="text-lg font-mono">{endpoint.path}</code>
                          <div className="flex items-center gap-2 mt-1">
                            <Icon className="w-4 h-4" />
                            <Badge variant="outline" className={categoryInfo?.color}>
                              {categoryInfo?.name}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(`${baseUrl}${endpoint.path}`)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-slate-600 mt-2">{endpoint.description}</p>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="parameters">
                      <TabsList>
                        <TabsTrigger value="parameters">Parameters</TabsTrigger>
                        <TabsTrigger value="response">Response</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="parameters" className="mt-4">
                        {endpoint.parameters && endpoint.parameters.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-2 font-medium">Parameter</th>
                                  <th className="text-left py-2 font-medium">Type</th>
                                  <th className="text-left py-2 font-medium">Required</th>
                                  <th className="text-left py-2 font-medium">Description</th>
                                </tr>
                              </thead>
                              <tbody>
                                {endpoint.parameters.map((param, i) => (
                                  <tr key={i} className="border-b">
                                    <td className="py-2">
                                      <code className="bg-slate-100 px-2 py-1 rounded text-xs">
                                        {param.name}
                                      </code>
                                    </td>
                                    <td className="py-2">
                                      <Badge variant="outline" className="text-xs">
                                        {param.type}
                                      </Badge>
                                    </td>
                                    <td className="py-2">
                                      <Badge 
                                        variant={param.required ? "destructive" : "secondary"}
                                        className="text-xs"
                                      >
                                        {param.required ? "Required" : "Optional"}
                                      </Badge>
                                    </td>
                                    <td className="py-2 text-slate-600">{param.description}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-slate-500 italic">No parameters required</p>
                        )}
                      </TabsContent>
                      
                      <TabsContent value="response" className="mt-4">
                        <div className="bg-slate-50 p-4 rounded-lg">
                          <h4 className="font-medium mb-2">Example Response</h4>
                          <pre className="text-xs overflow-x-auto">
                            <code>{JSON.stringify(endpoint.responseExample, null, 2)}</code>
                          </pre>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredEndpoints.length === 0 && (
            <Card>
              <CardContent className="text-center py-12">
                <Search className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">No endpoints found</h3>
                <p className="text-slate-500">Try adjusting your search or filter criteria</p>
              </CardContent>
            </Card>
          )}

          {/* Getting Started */}
          <Card>
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Example Usage</h3>
                <div className="bg-slate-900 text-slate-100 p-4 rounded-lg text-sm">
                  <pre>{`# Get all observations in California
curl "${baseUrl}/api/observations?state=California&limit=10"

# Get species accumulation data  
curl "${baseUrl}/api/species-accumulation"

# Get contributor statistics
curl "${baseUrl}/api/contributors?limit=5"`}</pre>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Rate Limiting</h3>
                <p className="text-sm text-slate-600">
                  Currently, there are no rate limits imposed on API usage. Please use the API responsibly.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Support</h3>
                <p className="text-sm text-slate-600">
                  For questions about the API or to report issues, please contact the development team.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}