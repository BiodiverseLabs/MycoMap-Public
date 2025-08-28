import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Plus, Calendar, Trash2, Eye } from "lucide-react";
import { BoundingBoxMap } from "@/components/BoundingBoxMap";
import { format } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface FieldGuide {
  id: number;
  name: string;
  description: string | null;
  boundingBoxNorth: string;
  boundingBoxSouth: string;
  boundingBoxEast: string;
  boundingBoxWest: string;
  speciesCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function FieldGuides() {
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: fieldGuides = [], isLoading, error } = useQuery({
    queryKey: ['/api/field-guides'],
    queryFn: async () => {
      const response = await fetch('/api/field-guides');
      if (!response.ok) {
        throw new Error('Failed to fetch field guides');
      }
      return response.json() as Promise<FieldGuide[]>;
    }
  });

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const response = await fetch(`/api/field-guides/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete field guide');
      }

      toast({
        title: "Field guide deleted",
        description: "The field guide has been successfully deleted.",
      });

      // Invalidate and refetch field guides
      queryClient.invalidateQueries({ queryKey: ['/api/field-guides'] });
    } catch (error) {
      console.error('Error deleting field guide:', error);
      toast({
        title: "Error",
        description: "Failed to delete field guide. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 space-y-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading field guides...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load field guides. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Field Guides</h1>
          <p className="text-slate-600 mt-1">
            Create and manage regional species guides based on observation data
          </p>
        </div>
        <Link href="/field-guides/create">
          <Button className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create Field Guide
          </Button>
        </Link>
      </div>

      {/* Field Guides Grid */}
      {fieldGuides.length === 0 ? (
        <div className="text-center py-12">
          <MapPin className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 mb-2">No field guides yet</h3>
          <p className="text-slate-600 mb-6">
            Create your first field guide to organize species data by geographic region
          </p>
          <Link href="/field-guides/create">
            <Button className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create Your First Field Guide
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {fieldGuides.map((guide) => (
            <Card key={guide.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg font-semibold text-slate-900 line-clamp-2">
                      {guide.name}
                    </CardTitle>
                    {guide.description && (
                      <CardDescription className="mt-1 line-clamp-2">
                        {guide.description}
                      </CardDescription>
                    )}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        disabled={deletingId === guide.id}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Field Guide</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{guide.name}"? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(guide.id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {guide.speciesCount} species
                  </Badge>
                  <div className="flex items-center gap-1 text-sm text-slate-500">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(guide.createdAt), 'MMM d, yyyy')}
                  </div>
                </div>

                <BoundingBoxMap
                  north={Number(guide.boundingBoxNorth)}
                  south={Number(guide.boundingBoxSouth)}
                  east={Number(guide.boundingBoxEast)}
                  west={Number(guide.boundingBoxWest)}
                />

                <Link href={`/field-guides/${guide.id}`}>
                  <Button variant="outline" className="w-full flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    View Species List
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}