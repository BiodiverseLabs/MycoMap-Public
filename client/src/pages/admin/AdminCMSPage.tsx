import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  FileText, 
  Plus, 
  Edit, 
  Eye, 
  Trash2, 
  ChevronUp, 
  ChevronDown,
  ExternalLink,
  Save,
  X
} from "lucide-react";

interface PageSection {
  id: number;
  pageId: number;
  sectionType: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
  imageUrl: string | null;
  buttonText: string | null;
  buttonLink: string | null;
  data: string | null;
  sortOrder: number;
  isVisible: boolean;
}

interface Page {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  heroImageUrl: string | null;
  isPublished: boolean;
  pageType: string;
}

export default function AdminCMSPage() {
  const { toast } = useToast();
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);
  const [editingSection, setEditingSection] = useState<PageSection | null>(null);
  const [isAddingSectionOpen, setIsAddingSectionOpen] = useState(false);

  const { data: pages = [], isLoading } = useQuery<Page[]>({
    queryKey: ["/api/cms/pages", { includeUnpublished: true }],
  });

  const { data: sections = [], refetch: refetchSections, isLoading: sectionsLoading } = useQuery<PageSection[]>({
    queryKey: [`/api/cms/admin/pages/${selectedPage?.id}/sections`],
    enabled: !!selectedPage?.id,
  });

  const updateSectionMutation = useMutation({
    mutationFn: async (section: Partial<PageSection> & { id: number }) => {
      return apiRequest("PATCH", `/api/cms/admin/sections/${section.id}`, section);
    },
    onSuccess: () => {
      toast({ title: "Section updated" });
      refetchSections();
      setEditingSection(null);
    },
    onError: () => {
      toast({ title: "Failed to update section", variant: "destructive" });
    },
  });

  const addSectionMutation = useMutation({
    mutationFn: async (section: Partial<PageSection>) => {
      return apiRequest("POST", `/api/cms/admin/sections`, section);
    },
    onSuccess: () => {
      toast({ title: "Section added" });
      refetchSections();
      setIsAddingSectionOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to add section", variant: "destructive" });
    },
  });

  const deleteSectionMutation = useMutation({
    mutationFn: async (sectionId: number) => {
      return apiRequest("DELETE", `/api/cms/admin/sections/${sectionId}`);
    },
    onSuccess: () => {
      toast({ title: "Section deleted" });
      refetchSections();
    },
    onError: () => {
      toast({ title: "Failed to delete section", variant: "destructive" });
    },
  });

  const reorderSectionMutation = useMutation({
    mutationFn: async ({ sectionId, direction }: { sectionId: number; direction: 'up' | 'down' }) => {
      return apiRequest("POST", `/api/cms/admin/sections/${sectionId}/reorder`, { direction });
    },
    onSuccess: () => {
      refetchSections();
    },
  });

  const getSectionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      hero: "Hero Banner",
      content: "Content Block",
      text_with_image: "Text with Image",
      gallery: "Image Gallery",
      cta: "Call to Action",
      text: "Plain Text",
      stats: "Stats Section",
      testimonials: "Testimonials",
      featured_projects: "Featured Projects",
      how_it_works: "How It Works",
    };
    return labels[type] || type;
  };

  return (
    <>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-myco-brown" data-testid="text-cms-title">Website CMS</h1>
          <p className="text-gray-600">Manage website pages and content</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pages</CardTitle>
                <CardDescription>Select a page to edit its content</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-4 text-center text-gray-500">Loading...</div>
                ) : (
                  <div className="divide-y">
                    {pages.map((page) => (
                      <button
                        key={page.id}
                        onClick={() => setSelectedPage(page)}
                        className={`w-full p-4 text-left hover:bg-gray-50 transition-colors flex items-center justify-between ${
                          selectedPage?.id === page.id ? "bg-myco-green/10 border-l-4 border-myco-green" : ""
                        }`}
                        data-testid={`button-page-${page.slug}`}
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-gray-400" />
                          <div>
                            <p className="font-medium text-sm">{page.title}</p>
                            <p className="text-xs text-gray-500">/{page.slug}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {page.isPublished ? (
                            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Published</Badge>
                          ) : (
                            <Badge variant="outline" className="text-gray-500">Draft</Badge>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            {selectedPage ? (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>{selectedPage.title}</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <span>/{selectedPage.slug}</span>
                      <a 
                        href={`/${selectedPage.slug}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-myco-green hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" /> Preview
                      </a>
                    </CardDescription>
                  </div>
                  <Button 
                    onClick={() => setIsAddingSectionOpen(true)}
                    className="bg-myco-green hover:bg-myco-green/90"
                    data-testid="button-add-section"
                  >
                    <Plus className="h-4 w-4 mr-2" /> Add Section
                  </Button>
                </CardHeader>
                <CardContent>
                  {sectionsLoading ? (
                    <div className="text-center py-12 text-gray-500">
                      <div className="animate-spin h-8 w-8 border-2 border-myco-green border-t-transparent rounded-full mx-auto mb-3" />
                      <p>Loading sections...</p>
                    </div>
                  ) : sections.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p>No sections yet. Add a section to get started.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sections
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((section, idx) => (
                          <div 
                            key={section.id}
                            className={`border rounded-lg p-4 ${section.isVisible ? 'bg-white' : 'bg-gray-50 opacity-60'}`}
                            data-testid={`section-item-${section.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex flex-col gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    disabled={idx === 0}
                                    onClick={() => reorderSectionMutation.mutate({ sectionId: section.id, direction: 'up' })}
                                  >
                                    <ChevronUp className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    disabled={idx === sections.length - 1}
                                    onClick={() => reorderSectionMutation.mutate({ sectionId: section.id, direction: 'down' })}
                                  >
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div>
                                  <Badge variant="secondary" className="mb-1">
                                    {getSectionTypeLabel(section.sectionType)}
                                  </Badge>
                                  <p className="font-medium">{section.title || "(No title)"}</p>
                                  {section.content && (
                                    <p className="text-sm text-gray-500 line-clamp-2">{section.content.substring(0, 100)}...</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setEditingSection(section)}
                                  data-testid={`button-edit-section-${section.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    if (confirm("Are you sure you want to delete this section?")) {
                                      deleteSectionMutation.mutate(section.id);
                                    }
                                  }}
                                  data-testid={`button-delete-section-${section.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Select a page from the list to edit its content</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <SectionEditorDialog
        section={editingSection}
        onClose={() => setEditingSection(null)}
        onSave={(updates) => {
          if (editingSection) {
            updateSectionMutation.mutate({ id: editingSection.id, ...updates });
          }
        }}
        isPending={updateSectionMutation.isPending}
      />

      <AddSectionDialog
        pageId={selectedPage?.id || 0}
        isOpen={isAddingSectionOpen}
        onClose={() => setIsAddingSectionOpen(false)}
        onAdd={(section) => addSectionMutation.mutate(section)}
        isPending={addSectionMutation.isPending}
        nextSortOrder={sections.length}
      />
    </>
  );
}

function SectionEditorDialog({ 
  section, 
  onClose, 
  onSave, 
  isPending 
}: { 
  section: PageSection | null; 
  onClose: () => void;
  onSave: (updates: Partial<PageSection>) => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [buttonText, setButtonText] = useState("");
  const [buttonLink, setButtonLink] = useState("");
  const [isVisible, setIsVisible] = useState(true);
  const [dataJson, setDataJson] = useState("");

  useEffect(() => {
    if (section) {
      setTitle(section.title || "");
      setSubtitle(section.subtitle || "");
      setContent(section.content || "");
      setImageUrl(section.imageUrl || "");
      setButtonText(section.buttonText || "");
      setButtonLink(section.buttonLink || "");
      setIsVisible(section.isVisible);
      setDataJson(section.data || "");
    } else {
      setTitle("");
      setSubtitle("");
      setContent("");
      setImageUrl("");
      setButtonText("");
      setButtonLink("");
      setIsVisible(true);
      setDataJson("");
    }
  }, [section]);

  if (!section) return null;

  const isJsonSection = ["stats", "testimonials", "featured_projects", "how_it_works", "gallery"].includes(section.sectionType);

  return (
    <Dialog open={!!section} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Section</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <Label>Visible</Label>
            <Switch 
              checked={isVisible} 
              onCheckedChange={setIsVisible}
            />
          </div>
          <div>
            <Label>Title</Label>
            <Input 
              value={title} 
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Section title"
            />
          </div>
          <div>
            <Label>Subtitle</Label>
            <Input 
              value={subtitle} 
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Optional subtitle"
            />
          </div>
          <div>
            <Label>Content</Label>
            <Textarea 
              value={content} 
              onChange={(e) => setContent(e.target.value)}
              placeholder="Section content..."
              rows={6}
            />
          </div>
          <div>
            <Label>Image URL</Label>
            <Input 
              value={imageUrl} 
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="/attached_assets/image.png"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Button Text</Label>
              <Input 
                value={buttonText} 
                onChange={(e) => setButtonText(e.target.value)}
                placeholder="Learn More"
              />
            </div>
            <div>
              <Label>Button Link</Label>
              <Input 
                value={buttonLink} 
                onChange={(e) => setButtonLink(e.target.value)}
                placeholder="/page-slug"
              />
            </div>
          </div>
          {isJsonSection && (
            <div>
              <Label>Data (JSON)</Label>
              <p className="text-xs text-gray-500 mb-2">
                {section.sectionType === "stats" && 'Format: {"stats": [{"value": "100+", "label": "Species", "icon": "Leaf"}]}'}
                {section.sectionType === "testimonials" && 'Format: {"testimonials": [{"quote": "...", "name": "...", "affiliation": "..."}]}'}
                {section.sectionType === "featured_projects" && 'Format: {"projects": [{"title": "...", "description": "...", "link": "/...", "icon": "Dna"}]}'}
                {section.sectionType === "how_it_works" && 'Format: {"steps": [{"number": "01", "title": "...", "description": "...", "icon": "MapPin"}]}'}
                {section.sectionType === "gallery" && 'Format: [{"url": "/attached_assets/...", "caption": "..."}]'}
              </p>
              <Textarea 
                value={dataJson} 
                onChange={(e) => setDataJson(e.target.value)}
                placeholder='{"key": "value"}'
                rows={8}
                className="font-mono text-sm"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={() => onSave({ 
              title: title || null, 
              subtitle: subtitle || null, 
              content: isJsonSection ? dataJson || null : content || null, 
              imageUrl: imageUrl || null,
              buttonText: buttonText || null,
              buttonLink: buttonLink || null,
              data: isJsonSection ? dataJson || null : null,
              isVisible 
            })}
            disabled={isPending}
            className="bg-myco-green hover:bg-myco-green/90"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddSectionDialog({
  pageId,
  isOpen,
  onClose,
  onAdd,
  isPending,
  nextSortOrder
}: {
  pageId: number;
  isOpen: boolean;
  onClose: () => void;
  onAdd: (section: Partial<PageSection>) => void;
  isPending: boolean;
  nextSortOrder: number;
}) {
  const [sectionType, setSectionType] = useState("content");
  const [title, setTitle] = useState("");

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Section</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Section Type</Label>
            <Select value={sectionType} onValueChange={setSectionType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hero">Hero Banner</SelectItem>
                <SelectItem value="content">Content Block</SelectItem>
                <SelectItem value="text_with_image">Text with Image</SelectItem>
                <SelectItem value="gallery">Image Gallery</SelectItem>
                <SelectItem value="cta">Call to Action</SelectItem>
                <SelectItem value="text">Plain Text</SelectItem>
                <SelectItem value="stats">Stats Section</SelectItem>
                <SelectItem value="testimonials">Testimonials</SelectItem>
                <SelectItem value="featured_projects">Featured Projects</SelectItem>
                <SelectItem value="how_it_works">How It Works</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Title</Label>
            <Input 
              value={title} 
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Section title"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={() => {
              onAdd({ 
                pageId,
                sectionType,
                title: title || null,
                sortOrder: nextSortOrder,
                isVisible: true
              });
              setTitle("");
              setSectionType("content");
            }}
            disabled={isPending}
            className="bg-myco-green hover:bg-myco-green/90"
          >
            {isPending ? "Adding..." : "Add Section"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
