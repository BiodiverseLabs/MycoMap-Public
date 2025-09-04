// ARCHIVED: Original Species Detail Image Viewing Code 
// Date: September 04, 2025
// Reason: Being replaced with new clean implementation based on Field Guide approach

// This was the original image viewing code from SpeciesDetail.tsx lines 715-891
// It used infinite scroll and the /api/species/{name}/images endpoint

/*
Original Image Gallery Section (lines 715-891):

        {/* Observation Images Gallery */}
        {speciesImages.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="w-5 h-5" />
                Observation Images
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-6">
                <Badge variant="secondary" className="text-sm">
                  {totalImages} total images from {totalObservations} observations
                </Badge>
                <div className="text-sm text-slate-600">
                  Showing {speciesImages.length} of {totalImages} images
                </div>
              </div>

              {imagesLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-4 text-slate-600">Loading images...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {paginatedImages.map((image) => (
                    <Card 
                      key={`${image.observationId}-${image.imageId}`}
                      className="transition-all hover:shadow-lg"
                    >
                      <CardContent className="p-0">
                        <div className="relative">
                          <img
                            src={image.imageUrl}
                            alt={`${image.scientificName} observation`}
                            className="w-full h-48 object-cover rounded-t-lg"
                            loading="lazy"
                            onError={(e) => {
                              console.error('Failed to load image:', image.imageUrl);
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent && !parent.querySelector('.image-error')) {
                                const errorDiv = document.createElement('div');
                                errorDiv.className = 'image-error flex items-center justify-center h-48 bg-slate-100 rounded-t-lg';
                                errorDiv.innerHTML = `
                                  <div class="text-center text-slate-500">
                                    <div class="w-16 h-16 mx-auto mb-2 opacity-30">
                                      <svg fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
                                      </svg>
                                    </div>
                                    <p class="text-xs">Image unavailable</p>
                                  </div>
                                `;
                                parent.insertBefore(errorDiv, target);
                              }
                            }}
                          />
                          <div className="absolute top-2 right-2">
                            <div className="bg-slate-600 text-white rounded-full p-1 opacity-70">
                              <Camera className="w-3 h-3" />
                            </div>
                          </div>
                        </div>
                        
                        <div className="p-3 space-y-2">
                          {/* Platform and Link */}
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-xs">
                              {image.source}
                            </Badge>
                            {/* Platform-specific links */}
                            {image.source === 'iNaturalist' && (
                              <a 
                                href={`https://www.inaturalist.org/observations/${image.observationId}`}
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 transition-colors"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                            {image.source === 'Mushroom Observer' && (
                              <a 
                                href={`https://www.mushroomobserver.org/${image.observationId}`}
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 transition-colors"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                            {image.source === 'MyCoPortal' && (
                              <a 
                                href={`https://www.mycoportal.org/portal/collections/individual/index.php?occid=${image.observationId}`}
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 transition-colors"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          
                          {/* Observer */}
                          {image.observer && (
                            <div className="text-xs text-slate-600 truncate">
                              <strong>Observer:</strong> {image.observer}
                            </div>
                          )}
                          
                          {/* Date */}
                          <div className="text-xs text-slate-600">
                            <strong>Date:</strong> {formatDate(image.observedOn)}
                          </div>
                          
                          {/* Location */}
                          {(image.placeGuess || image.state) && (
                            <div className="text-xs text-slate-600 truncate">
                              <strong>Location:</strong> {
                                image.placeGuess && image.state && image.placeGuess !== image.state
                                  ? `${image.placeGuess}, ${image.state}`
                                  : image.placeGuess || image.state
                              }
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              
              {/* Show More button */}
              {hasNextPage && !isFetchingNextPage && (
                <div className="text-center py-8">
                  <Button 
                    onClick={() => fetchNextPage()}
                    size="lg"
                    variant="outline"
                    className="px-8"
                  >
                    Show More Images ({Math.max(0, totalImages - speciesImages.length)} remaining)
                  </Button>
                </div>
              )}
              
              {/* Loading more images indicator */}
              {isFetchingNextPage && (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-4 text-slate-600">Loading more images...</p>
                </div>
              )}
              
              {/* End of data indicator */}
              {!hasNextPage && speciesImages.length > 0 && (
                <div className="text-center py-8 text-slate-600">
                  <p>You've reached the end! Showing all {speciesImages.length} images.</p>
                </div>
              )}
              
              {!imagesLoading && speciesImages.length === 0 && (
                <div className="text-center py-8">
                  <Camera className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">No images found</h3>
                  <p className="text-slate-600">
                    No observations with images were found for <em>{speciesName}</em>{selectedState !== 'all' ? ` in ${selectedState}` : ''}.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
*/

// Associated logic that was also removed:

/*
Original Image-related queries and calculations (around lines 115-160):

  // Calculate images per page
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const imagesPerPage = isMobile ? 8 : 16;

  // Fetch species images with infinite scroll
  const {
    data: speciesImagesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: imagesLoading
  } = useInfiniteQuery({
    queryKey: ["/api/species", speciesName, "images", { 
      state: selectedState, 
      includeNonValidated
    }],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({
        page: pageParam.toString(),
        pageSize: imagesPerPage.toString(),
        includeNonValidated: includeNonValidated.toString()
      });
      
      if (selectedState && selectedState !== "all") {
        params.append('state', selectedState);
      }
      
      const url = `/api/species/${encodeURIComponent(speciesName)}/images?${params}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch species images');
      return response.json();
    },
    getNextPageParam: (lastPage: any) => {
      return lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined;
    },
    initialPageParam: 1,
    enabled: !!speciesName
  });

  // Flatten all loaded images from all pages
  const speciesImages = speciesImagesData?.pages?.flatMap((page: any) => page.images) || [];
  const totalImages = speciesImagesData?.pages?.[0]?.total || 0;
  
  // Use the existing observations query for count (it's already being fetched)
  const totalObservations = observations?.length || 0;
*/

// Additional calculations that may have been used:

/*
// Calculate images to display - may have been used for pagination
const imagesPerPage = 16;
const startIndex = (currentPage - 1) * imagesPerPage;
const paginatedImages = speciesImages.slice(0, Math.min(speciesImages.length, startIndex + imagesPerPage));

// Format date function (still used in other parts of app)
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return 'Unknown date';
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
};
*/