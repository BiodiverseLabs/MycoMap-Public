import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, ExternalLink, MapPin, Calendar, User, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface ObservationImage {
  observationId: string;
  imageUrl: string;
  imageId: string;
  observer: string | null;
  observedOn: string | null;
  state: string | null;
  placeGuess: string | null;
  source: string;
  scientificName: string;
  isSelected?: boolean;
}

export default function SpeciesImageGallery() {
  const [, params] = useRoute('/field-guides/:id/species/:scientificName');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  const fieldGuideId = params?.id ? parseInt(params.id) : null;
  const scientificName = params?.scientificName ? decodeURIComponent(params.scientificName) : null;

  const { data: images = [], isLoading, error } = useQuery({
    queryKey: ['/api/field-guides', fieldGuideId, 'species', scientificName, 'images'],
    queryFn: async () => {
      if (!fieldGuideId || !scientificName) throw new Error('Missing parameters');
      const response = await fetch(`/api/field-guides/${fieldGuideId}/species/${encodeURIComponent(scientificName)}/images`);
      if (!response.ok) throw new Error('Failed to fetch images');
      return response.json() as Promise<ObservationImage[]>;
    },
    enabled: !!fieldGuideId && !!scientificName
  });

  const selectImageMutation = useMutation({
    mutationFn: async (image: ObservationImage) => {
      if (!fieldGuideId || !scientificName) throw new Error('Missing parameters');
      
      const response = await fetch(`/api/field-guides/${fieldGuideId}/species/${encodeURIComponent(scientificName)}/select-image`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: image.imageUrl,
          observationId: image.observationId,
          source: image.source,
          imageId: image.imageId
        })
      });
      
      if (!response.ok) throw new Error('Failed to select image');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Image selected!",
        description: "This image will now represent this species in the field guide.",
      });
      
      // Invalidate species list to update with new selected image
      queryClient.invalidateQueries({ queryKey: ['/api/field-guides', fieldGuideId, 'species'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to select image. Please try again.",
        variant: "destructive",
      });
    }
  });

  const removeSelectionMutation = useMutation({
    mutationFn: async () => {
      if (!fieldGuideId || !scientificName) throw new Error('Missing parameters');
      
      const response = await fetch(`/api/field-guides/${fieldGuideId}/species/${encodeURIComponent(scientificName)}/remove-image`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to remove selection');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Selection removed",
        description: "No image is now selected for this species.",
      });
      
      // Invalidate species list to update
      queryClient.invalidateQueries({ queryKey: ['/api/field-guides', fieldGuideId, 'species'] });
      // Invalidate images to refresh selection state
      queryClient.invalidateQueries({ queryKey: ['/api/field-guides', fieldGuideId, 'species', scientificName, 'images'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to remove selection. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleSelectImage = (image: ObservationImage) => {
    selectImageMutation.mutate(image);
  };

  const handleRemoveSelection = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the card click
    removeSelectionMutation.mutate();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Unknown date';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  if (!fieldGuideId || !scientificName) {
    return (
      <div className="container mx-auto p-4">
        <Alert variant="destructive">
          <AlertDescription>
            Invalid field guide or species parameters.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 space-y-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading species images...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load species images. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          onClick={() => setLocation(`/field-guides/${fieldGuideId}`)}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Field Guide
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            <em>{scientificName}</em>
          </h1>
          <p className="text-slate-600 mt-1">
            Select a representative image for this species
          </p>
        </div>
      </div>

      {/* Images Grid */}
      {images.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <MapPin className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No images found</h3>
              <p className="text-slate-600">
                No iNaturalist observations with images were found for <em>{scientificName}</em> in this field guide area.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-sm">
              {images.length} images from {new Set(images.map(img => img.observationId)).size} observations
            </Badge>
            <p className="text-sm text-slate-500">
              Click an image to select it as the representative photo
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {images.map((image) => (
              <Card 
                key={`${image.observationId}-${image.imageId}`}
                className={`cursor-pointer transition-all hover:shadow-lg ${
                  image.isSelected ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => handleSelectImage(image)}
              >
                <CardContent className="p-0">
                  <div className="relative">
                    <img
                      src={image.imageUrl}
                      alt={`${image.scientificName} observation`}
                      className="w-full h-48 object-cover rounded-t-lg"
                      loading="lazy"
                    />
                    {image.isSelected && (
                      <div className="absolute top-2 right-2 flex gap-1">
                        <div className="bg-primary text-primary-foreground rounded-full p-1">
                          <Check className="w-4 h-4" />
                        </div>
                        <button
                          onClick={handleRemoveSelection}
                          className="bg-red-600 text-white rounded-full p-1 hover:bg-red-700 transition-colors"
                          title="Remove selection"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-3 space-y-2">
                    {/* iNaturalist ID */}
                    <div className="flex items-center gap-2">
                      <ExternalLink className="w-3 h-3 text-slate-500" />
                      <a 
                        href={`https://www.inaturalist.org/observations/${image.observationId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        iNat #{image.observationId}
                      </a>
                    </div>

                    {/* Observer */}
                    {image.observer && (
                      <div className="flex items-center gap-2">
                        <User className="w-3 h-3 text-slate-500" />
                        <span className="text-xs text-slate-600">{image.observer}</span>
                      </div>
                    )}

                    {/* Location */}
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3 h-3 text-slate-500" />
                      <span className="text-xs text-slate-600">
                        {image.placeGuess || image.state || 'Unknown location'}
                      </span>
                    </div>

                    {/* Date */}
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      <span className="text-xs text-slate-600">
                        {formatDate(image.observedOn)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}