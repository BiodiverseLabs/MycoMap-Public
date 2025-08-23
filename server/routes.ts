import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertObservationSchema, insertUploadSchema, species, observations, inaturalistData, fieldGuides, fieldGuideSpecies, insertFieldGuideSchema, insertFieldGuideSpeciesSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
// XLSX will be imported dynamically
import path from "path";
import fs from "fs";
import csv from "csv-parser";
import { db, pool } from "./db";
import { sql, eq } from "drizzle-orm";
import { blastDownloader } from "./blastDownloader";
import { ipfsService } from "./ipfsService";

const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

const uploadMemory = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for CSV files
});

// Sync iNaturalist API data for newly uploaded records
async function syncUploadedInaturalistData(uploadId: number, progressTracker: Map<number, any>) {
  console.log(`Starting iNaturalist API sync for upload ${uploadId}...`);
  
  try {
    // Get the upload timestamp to filter observations from this upload only
    const upload = await storage.getUploads().then(uploads => uploads.find(u => u.id === uploadId));
    if (!upload || !upload.uploadedAt) {
      console.log(`No upload found with ID ${uploadId} or missing timestamp`);
      return;
    }
    
    const oneHourBefore = new Date(upload.uploadedAt.getTime() - 60 * 60 * 1000);
    const oneHourAfter = new Date(upload.uploadedAt.getTime() + 60 * 60 * 1000);
    
    // Get only iNaturalist observations from THIS upload that don't have API data
    const missingApiData = await db.execute(sql`
      SELECT o.observation_id, o.scientific_name
      FROM observations o
      LEFT JOIN inaturalist_data inat ON o.observation_id = inat.observation_id
      WHERE o.source = 'iNaturalist' 
        AND inat.observation_id IS NULL
        AND o.updated_at >= ${oneHourBefore}
        AND o.updated_at <= ${oneHourAfter}
      ORDER BY o.id DESC
    `);

    const recordsToSync = missingApiData.rows as Array<{ observation_id: string; scientific_name: string }>;
    console.log(`Found ${recordsToSync.length} iNaturalist records from upload ${uploadId} missing API data`);

    if (recordsToSync.length === 0) {
      console.log(`No iNaturalist records from upload ${uploadId} need API sync`);
      return;
    }

    let syncedCount = 0;
    let errorCount = 0;
    const batchSize = 50; // Process in smaller batches to respect API limits
    
    for (let i = 0; i < recordsToSync.length; i += batchSize) {
      const batch = recordsToSync.slice(i, i + batchSize);
      
      console.log(`Processing iNaturalist API sync batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(recordsToSync.length/batchSize)}`);
      
      for (const record of batch) {
        try {
          // Use the same API sync logic as validation
          const apiUrl = `https://api.inaturalist.org/v1/observations/${record.observation_id}`;
          const response = await fetch(apiUrl);
          
          if (response.ok) {
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
              const obs = data.results[0];
              const photos = obs.photos ? obs.photos.map((p: any) => p.url.replace('square', 'medium')) : [];
              
              // Insert the same data structure used in validation
              await db.insert(inaturalistData).values({
                observationId: record.observation_id,
                inatId: obs.id.toString(),
                photos: photos,
                quality: obs.quality_grade,
                captive: obs.captive || false,
                geoprivacy: obs.geoprivacy,
                licenseCode: obs.license_code,
                observedOnString: obs.observed_on_string,
                timeObservedAt: obs.time_observed_at ? new Date(obs.time_observed_at) : null,
                timeZone: obs.time_zone,
                description: obs.description,
                tags: obs.tags || [],
                species_guess: obs.species_guess,
                identificationCount: obs.num_identification_agreements || 0,
                numIdentificationAgreements: obs.num_identification_agreements || 0,
                numIdentificationDisagreements: obs.num_identification_disagreements || 0,
                commentsCount: obs.comments_count || 0,
                created_at: obs.created_at ? new Date(obs.created_at) : null,
                updated_at: obs.updated_at ? new Date(obs.updated_at) : null,
                taxon: obs.taxon ? JSON.stringify(obs.taxon) : null,
                user: obs.user ? JSON.stringify(obs.user) : null,
                placeIds: obs.place_ids || [],
                projectIds: obs.project_ids || [],
                application: obs.application ? JSON.stringify(obs.application) : null,
                syncStatus: 'synced'
              }).onConflictDoNothing();
              
              syncedCount++;
              console.log(`✓ Synced ${record.observation_id} (${record.scientific_name}) - ${photos.length} photos`);
            }
          } else {
            errorCount++;
            console.log(`✗ API error for ${record.observation_id}: ${response.status}`);
          }
          
          // Rate limiting: 1 second between API calls
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error: any) {
          errorCount++;
          console.log(`✗ Error syncing ${record.observation_id}: ${error.message}`);
        }
      }
      
      // Update progress after each batch
      const progressPercent = Math.round((syncedCount / recordsToSync.length) * 100);
      progressTracker.set(uploadId, {
        progress: 85 + Math.round(progressPercent * 0.15), // 85-100% range for iNat sync
        phase: 'inat-sync',
        message: `Syncing iNaturalist API data: ${syncedCount}/${recordsToSync.length} (${progressPercent}%)`
      });
    }
    
    console.log(`✓ iNaturalist API sync completed: ${syncedCount} synced, ${errorCount} errors`);
    
  } catch (error) {
    console.error('Error during iNaturalist API sync:', error);
    throw error;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Helper function to check and auto-upload observations to IPFS
  async function checkAndAutoUploadToIPFS(observationId: string, context: string) {
    try {
      const obs = await db.select()
        .from(observations)
        .where(eq(observations.observationId, observationId))
        .limit(1);
      
      if (obs.length === 0) return;
      
      const observation = obs[0];
      const isFullyValidated = observation.scientificName && 
        observation.scientificName.trim().split(' ').length >= 2 &&
        observation.inatApiSaved &&
        (!observation.mycoMapBlastUrl || observation.blastFilesDownloaded) &&
        (!observation.mycoMapTraceUrl || observation.traceFilesDownloaded);

      if (isFullyValidated && !observation.ipfsUploaded) {
        console.log(`[IPFS] Auto-uploading validated observation ${observationId} after ${context}`);
        
        const files = {
          observationId,
          ncbiBlastFile: observation.ncbiBlastFile,
          localBlastFile: observation.localBlastFile,
          fastqFile: observation.fastqFile,
          inatApiFile: observation.inatApiFile
        };
        
        const uploadResult = await ipfsService.uploadObservationFiles(files);
        
        if (uploadResult.success) {
          await db.update(observations)
            .set({
              ipfsUploaded: true,
              ipfsUploadDate: new Date(),
              ipfsFolderCid: uploadResult.ipfsLinks?.folder?.split('/').pop(),
              ipfsFolderUrl: uploadResult.ipfsLinks?.folder,
              ipfsNcbiBlastUrl: uploadResult.ipfsLinks?.ncbiBlast,
              ipfsLocalBlastUrl: uploadResult.ipfsLinks?.localBlast,
              ipfsFastqUrl: uploadResult.ipfsLinks?.fastq,
              ipfsInatApiUrl: uploadResult.ipfsLinks?.inatApi
            })
            .where(eq(observations.observationId, observationId));
          
          console.log(`[IPFS] Successfully auto-uploaded observation ${observationId} to IPFS`);
        }
      }
    } catch (error) {
      console.error(`[IPFS] Failed to auto-upload observation ${observationId}:`, error);
    }
  }
  // Analytics endpoints
  app.get("/api/observations", async (req, res) => {
    try {
      const { startDate, endDate, state, contributor, species, dateRange, limit } = req.query;
      
      console.log(`[API] GET /api/observations - dateRange: "${dateRange}", limit: "${limit}", contributor: "${contributor}", state: "${state}"`);
      
      // Convert dateRange to actual dates (same logic as metrics endpoint)
      let actualStartDate = startDate as string;
      let actualEndDate = endDate as string;
      
      if (dateRange === 'last_30_days') {
        actualStartDate = '2025-01-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'last_6_months') {
        actualStartDate = '2024-10-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'last_year') {
        actualStartDate = '2024-01-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'all_time') {
        // Don't set date filters for all time
        actualStartDate = undefined as any;
        actualEndDate = undefined as any;
      }
      
      let observations;
      if (actualStartDate && actualEndDate) {
        observations = await storage.getObservationsByDateRange(
          actualStartDate, 
          actualEndDate
        );
      } else if (state) {
        observations = await storage.getObservationsByState(state as string);
      } else {
        observations = await storage.getAllObservations();
      }
      
      // Filter by contributor if specified
      if (contributor) {
        observations = observations.filter(obs => 
          obs.collector === contributor
        );
      }
      
      // Filter by species if specified
      if (species) {
        observations = observations.filter(obs => 
          obs.species === species || obs.scientificName === species
        );
      }
      
      // Apply limit if specified (important for production performance)
      if (limit) {
        const limitNum = parseInt(limit as string, 10);
        if (!isNaN(limitNum) && limitNum > 0) {
          observations = observations.slice(0, limitNum);
        }
      }
      
      console.log(`[API] Returning ${observations.length} observations`);
      res.json(observations);
    } catch (error) {
      console.error("Error fetching observations:", error);
      res.status(500).json({ error: "Failed to fetch observations" });
    }
  });

  // Get observations with character encoding issues
  app.get("/api/observations/encoding-issues", async (req, res) => {
    try {
      const observations = await storage.getObservationsWithEncodingIssues();
      res.json(observations);
    } catch (error) {
      console.error("Error fetching observations with encoding issues:", error);
      res.status(500).json({ error: "Failed to fetch observations with encoding issues" });
    }
  });

  // Get observations without GPS coordinates
  app.get("/api/observations/missing-gps", async (req, res) => {
    try {
      const observations = await storage.getObservationsWithoutGPS();
      res.json(observations);
    } catch (error) {
      console.error("Error fetching observations without GPS:", error);
      res.status(500).json({ error: "Failed to fetch observations without GPS" });
    }
  });

  app.get("/api/observations/summary", async (req, res) => {
    try {
      const { dateRange, aggregate } = req.query;
      
      console.log(`[API] GET /api/observations/summary - dateRange: "${dateRange}", aggregate: "${aggregate}"`);
      
      if (aggregate === 'states') {
        // Use optimized database query for state aggregation
        const stateArray = await storage.getStateSummary(dateRange as string);
        res.json(stateArray);
      } else {
        res.json([]);
      }
    } catch (error) {
      console.error("Error fetching observation summary:", error);
      res.status(500).json({ error: "Failed to fetch observation summary" });
    }
  });

  app.get("/api/metrics", async (req, res) => {
    try {
      const { startDate, endDate, dateRange, state } = req.query;
      
      // Set cache headers for better performance
      res.set('Cache-Control', 'public, max-age=300'); // 5 minute cache
      
      // Convert dateRange to actual dates
      let actualStartDate: string | undefined;
      let actualEndDate: string | undefined;
      
      if (dateRange === 'last_30_days') {
        actualStartDate = '2025-01-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'last_6_months') {
        actualStartDate = '2024-10-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'last_year') {
        actualStartDate = '2024-01-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'all_time') {
        actualStartDate = undefined;
        actualEndDate = undefined;
      } else if (startDate && endDate) {
        actualStartDate = startDate as string;
        actualEndDate = endDate as string;
      }
      
      const metrics = await storage.getObservationMetrics(actualStartDate, actualEndDate, state as string);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching metrics:", error);
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  });

  app.get("/api/temporal-trends", async (req, res) => {
    try {
      // Set cache headers for performance
      res.set('Cache-Control', 'public, max-age=300'); // 5 minute cache
      
      const { groupBy = 'month', state, startDate, endDate, goingBackYears, collector } = req.query;
      const trends = await storage.getTemporalTrends(
        groupBy as 'month' | 'quarter' | 'year', 
        state as string,
        startDate as string,
        endDate as string,
        goingBackYears as string,
        collector as string
      );
      res.json(trends);
    } catch (error) {
      console.error("Error fetching temporal trends:", error);
      res.status(500).json({ error: "Failed to fetch temporal trends" });
    }
  });

  app.get("/api/seasonal-patterns", async (req, res) => {
    try {
      const { state, startDate, endDate, goingBackYears, collector } = req.query;
      const patterns = await storage.getSeasonalPatterns(
        state as string,
        startDate as string,
        endDate as string,
        goingBackYears as string,
        collector as string
      );
      res.json(patterns);
    } catch (error) {
      console.error("Error fetching seasonal patterns:", error);
      res.status(500).json({ error: "Failed to fetch seasonal patterns" });
    }
  });

  app.get("/api/monthly-statistics", async (req, res) => {
    try {
      const { state, startDate, endDate, goingBackYears, collector } = req.query;
      const stats = await storage.getMonthlyStatistics(
        state as string,
        startDate as string,
        endDate as string,
        goingBackYears as string,
        collector as string
      );
      res.json(stats);
    } catch (error) {
      console.error("Error fetching monthly statistics:", error);
      res.status(500).json({ error: "Failed to fetch monthly statistics" });
    }
  });

  // Optimized map data endpoint using GPS index
  app.get("/api/map-data", async (req, res) => {
    try {
      // Enhanced cache headers for aggressive caching
      res.set({
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600', // 5 min cache, 10 min stale
        'ETag': `"map-data-${Date.now() - (Date.now() % 300000)}"`, // ETag updates every 5 minutes
        'Vary': 'Accept-Encoding'
      });
      
      const { limit = "75000", state } = req.query;
      console.log(`[API] GET /api/map-data - limit: "${limit}", state: "${state}"`);

      const limitNum = Math.min(parseInt(limit as string) || 75000, 75000);
      const mapData = await storage.getMapDataOptimized(limitNum, state as string);

      console.log(`[API] Returning ${mapData.length} map coordinates`);
      res.json(mapData);
    } catch (error) {
      console.error("Error fetching map data:", error);
      res.status(500).json({ error: "Failed to fetch map data" });
    }
  });

  // Build GPS index endpoint for optimization
  app.post("/api/build-gps-index", async (req, res) => {
    try {
      console.log('[API] Building GPS index...');
      await storage.buildGpsIndex();
      console.log('[API] GPS index built successfully');
      res.json({ success: true, message: "GPS index built successfully" });
    } catch (error) {
      console.error("Error building GPS index:", error);
      res.status(500).json({ error: "Failed to build GPS index" });
    }
  });

  app.get("/api/taxonomic-distribution", async (req, res) => {
    try {
      // Set cache headers for performance
      res.set('Cache-Control', 'public, max-age=300'); // 5 minute cache
      
      const { state, startDate, endDate, goingBackYears, collector } = req.query;
      const distribution = await storage.getTaxonomicDistribution(
        state as string,
        startDate as string,
        endDate as string,
        goingBackYears as string,
        collector as string
      );
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching taxonomic distribution:", error);
      res.status(500).json({ error: "Failed to fetch taxonomic distribution" });
    }
  });

  app.get("/api/family-distribution", async (req, res) => {
    try {
      const { state, startDate, endDate, goingBackYears, collector } = req.query;
      const distribution = await storage.getFamilyDistribution(
        state as string,
        startDate as string,
        endDate as string,
        goingBackYears as string,
        collector as string
      );
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching family distribution:", error);
      res.status(500).json({ error: "Failed to fetch family distribution" });
    }
  });

  app.get("/api/class-distribution", async (req, res) => {
    try {
      const { state, startDate, endDate, goingBackYears, collector } = req.query;
      const distribution = await storage.getClassDistribution(
        state as string,
        startDate as string,
        endDate as string,
        goingBackYears as string,
        collector as string
      );
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching class distribution:", error);
      res.status(500).json({ error: "Failed to fetch class distribution" });
    }
  });

  app.get("/api/order-distribution", async (req, res) => {
    try {
      const { state, startDate, endDate, goingBackYears, collector } = req.query;
      const distribution = await storage.getOrderDistribution(
        state as string,
        startDate as string,
        endDate as string,
        goingBackYears as string,
        collector as string
      );
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching order distribution:", error);
      res.status(500).json({ error: "Failed to fetch order distribution" });
    }
  });

  app.get("/api/genus-distribution", async (req, res) => {
    try {
      const { state, startDate, endDate, goingBackYears, collector } = req.query;
      const distribution = await storage.getGenusDistribution(
        state as string,
        startDate as string,
        endDate as string,
        goingBackYears as string,
        collector as string
      );
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching genus distribution:", error);
      res.status(500).json({ error: "Failed to fetch genus distribution" });
    }
  });

  app.get("/api/contributors", async (req, res) => {
    try {
      const { limit, dateRange, state } = req.query;
      
      // Convert dateRange to actual dates (same logic as metrics)
      let actualStartDate: string | undefined;
      let actualEndDate: string | undefined;
      
      if (dateRange === 'last_30_days') {
        actualStartDate = '2025-01-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'last_6_months') {
        actualStartDate = '2024-10-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'last_year') {
        actualStartDate = '2024-01-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'all_time') {
        actualStartDate = undefined;
        actualEndDate = undefined;
      }
      
      // Use a very high limit if no specific limit is provided to get all contributors
      const contributorLimit = limit ? parseInt(limit as string) : 10000;
      const contributors = await storage.getTopContributors(contributorLimit, actualStartDate, actualEndDate, state as string);
      res.json(contributors);
    } catch (error) {
      console.error("Error fetching contributors:", error);
      res.status(500).json({ error: "Failed to fetch contributors" });
    }
  });

  app.get("/api/species", async (req, res) => {
    try {
      // Add cache headers for performance optimization
      res.set({
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600', // 5 min cache, 10 min stale
        'ETag': `"species-${Date.now() - (Date.now() % 300000)}"` // ETag updates every 5 minutes
      });
      
      const { limit, type = 'top', state, name } = req.query;
      
      // If searching for a specific species by name
      if (name) {
        const allSpecies = await storage.getTopSpecies(50000);
        const matchedSpecies = allSpecies.filter(s => s.scientificName === name);
        res.json(matchedSpecies);
        return;
      }
      
      // Use a very high limit if no specific limit is provided to get all species
      const speciesLimit = limit ? parseInt(limit as string) : 50000;
      
      let species;
      if (type === 'rare') {
        species = await storage.getRareSpecies(speciesLimit, state as string);
      } else {
        species = await storage.getTopSpecies(speciesLimit, state as string);
      }
      
      res.json(species);
    } catch (error) {
      console.error("Error fetching species:", error);
      res.status(500).json({ error: "Failed to fetch species" });
    }
  });

  app.get("/api/state-records", async (req, res) => {
    try {
      const { limit = '10' } = req.query;
      const records = await storage.getRecentStateRecords(parseInt(limit as string));
      res.json(records);
    } catch (error) {
      console.error("Error fetching state records:", error);
      res.status(500).json({ error: "Failed to fetch state records" });
    }
  });

  app.get("/api/record-index", async (req, res) => {
    try {
      const { 
        limit = '50', 
        offset = '0', 
        stateFirstsOnly = 'false', 
        globalFirstsOnly = 'false', 
        recent = 'false', 
        state,
        startDate,
        endDate,
        species,
        collector
      } = req.query;
      
      const index = await storage.getRecordIndex(
        parseInt(limit as string), 
        parseInt(offset as string),
        stateFirstsOnly === 'true',
        recent === 'true',
        state as string,
        globalFirstsOnly === 'true',
        startDate as string,
        endDate as string,
        species as string,
        collector as string
      );
      
      console.log(`[DEBUG] Record index query - limit: ${limit}, offset: ${offset}, stateFirstsOnly: ${stateFirstsOnly}, state: ${state}, species: ${species}, collector: ${collector}, returned: ${index.length} records`);
      
      res.json(index);
    } catch (error) {
      console.error("Error fetching record index:", error);
      res.status(500).json({ error: "Failed to fetch record index" });
    }
  });

  // Get thumbnail from iNaturalist API for missing images
  app.get("/api/thumbnail/:observationId", async (req, res) => {
    try {
      const { observationId } = req.params;
      
      // First check if we already have thumbnail data
      const existingRecord = await storage.getObservationByObservationId(observationId);
      if (!existingRecord) {
        return res.status(404).json({ error: "Observation not found" });
      }

      // Try to get from iNaturalist API
      const apiUrl = `https://api.inaturalist.org/v1/observations/${observationId}`;
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        return res.status(404).json({ error: "Observation not found on iNaturalist" });
      }

      const data = await response.json();
      const observation = data.results?.[0];
      
      if (!observation?.photos?.length) {
        return res.status(404).json({ error: "No photos found for this observation" });
      }

      // Get the best available thumbnail URL
      const photo = observation.photos[0];
      const thumbnailUrl = photo.url_square || photo.url_small || photo.url_medium || photo.url;
      
      // Update the observation with the thumbnail URL
      if (thumbnailUrl) {
        await storage.updateObservationImageLink(observationId, thumbnailUrl);
      }

      res.json({ thumbnailUrl });
    } catch (error) {
      console.error("Error fetching thumbnail:", error);
      res.status(500).json({ error: "Failed to fetch thumbnail" });
    }
  });

  app.get("/api/observation-sources", async (req, res) => {
    try {
      const { dateRange } = req.query;
      const sources = await storage.getObservationSources(dateRange as string);
      res.json(sources);
    } catch (error) {
      console.error("Error fetching observation sources:", error);
      res.status(500).json({ error: "Failed to fetch observation sources" });
    }
  });

  // Get species accumulation curve data
  app.get("/api/species-accumulation", async (req, res) => {
    try {
      // Add cache headers for chart data
      res.set({
        'Cache-Control': 'public, max-age=180, stale-while-revalidate=360', // 3 min cache, 6 min stale
        'ETag': `"species-acc-${Date.now() - (Date.now() % 180000)}"` // ETag updates every 3 minutes
      });
      
      const { state, search } = req.query;
      const data = await storage.getSpeciesAccumulation(state as string, search as string);
      res.json(data);
    } catch (error) {
      console.error("Error fetching species accumulation data:", error);
      res.status(500).json({ error: "Failed to fetch species accumulation data" });
    }
  });

  // Get genera accumulation curve data
  app.get("/api/genera-accumulation", async (req, res) => {
    try {
      // Add cache headers for chart data
      res.set({
        'Cache-Control': 'public, max-age=180, stale-while-revalidate=360', // 3 min cache, 6 min stale
        'ETag': `"genera-acc-${Date.now() - (Date.now() % 180000)}"` // ETag updates every 3 minutes
      });
      
      const { state, search } = req.query;
      const data = await storage.getGeneraAccumulation(state as string, search as string);
      res.json(data);
    } catch (error) {
      console.error("Error fetching genera accumulation data:", error);
      res.status(500).json({ error: "Failed to fetch genera accumulation data" });
    }
  });

  // Get unique states for filtering
  app.get("/api/states", async (req, res) => {
    try {
      const states = await storage.getUniqueStates();
      res.json(states);
    } catch (error) {
      console.error("Error fetching states:", error);
      res.status(500).json({ error: "Failed to fetch states" });
    }
  });

  // Top Prospects - Species occurring in adjacent regions
  app.get("/api/geospatial/top-prospects/:state", async (req, res) => {
    try {
      const targetState = req.params.state;
      console.log(`[API] GET /api/geospatial/top-prospects/${targetState}`);

      // Get the approximate center coordinates of the target state
      const stateInfo = await db.execute(sql`
        SELECT 
          AVG(latitude) as center_latitude,
          AVG(longitude) as center_longitude
        FROM observations 
        WHERE state = ${targetState}
          AND latitude IS NOT NULL 
          AND longitude IS NOT NULL
      `);

      if (!stateInfo.rows.length || !stateInfo.rows[0].center_latitude) {
        return res.status(404).json({ error: "State not found or no coordinates available" });
      }

      const centerLat = parseFloat(stateInfo.rows[0].center_latitude);
      const centerLon = parseFloat(stateInfo.rows[0].center_longitude);

      // Find species that occur in surrounding regions but not in the target state
      // Using expanded range for directional analysis, but requiring at least one close record
      const proximityRange = 60; // degrees (expanded search for directional analysis)
      const nearbyRange = 10; // degrees (at least one record must be within this range)

      // Define neighboring states mapping
      const neighboringStates: { [key: string]: string[] } = {
        'Alabama': ['Florida', 'Georgia', 'Mississippi', 'Tennessee'],
        'Alaska': [], // No bordering states
        'Arizona': ['California', 'Colorado', 'Nevada', 'New Mexico', 'Utah'],
        'Arkansas': ['Louisiana', 'Mississippi', 'Missouri', 'Oklahoma', 'Tennessee', 'Texas'],
        'California': ['Arizona', 'Nevada', 'Oregon'],
        'Colorado': ['Arizona', 'Kansas', 'Nebraska', 'New Mexico', 'Oklahoma', 'Utah', 'Wyoming'],
        'Connecticut': ['Massachusetts', 'New York', 'Rhode Island'],
        'Delaware': ['Maryland', 'New Jersey', 'Pennsylvania'],
        'Florida': ['Alabama', 'Georgia'],
        'Georgia': ['Alabama', 'Florida', 'North Carolina', 'South Carolina', 'Tennessee'],
        'Idaho': ['Montana', 'Nevada', 'Oregon', 'Utah', 'Washington', 'Wyoming'],
        'Illinois': ['Indiana', 'Iowa', 'Kentucky', 'Michigan', 'Missouri', 'Wisconsin'],
        'Indiana': ['Illinois', 'Kentucky', 'Michigan', 'Ohio'],
        'Iowa': ['Illinois', 'Minnesota', 'Missouri', 'Nebraska', 'South Dakota', 'Wisconsin'],
        'Kansas': ['Colorado', 'Missouri', 'Nebraska', 'Oklahoma'],
        'Kentucky': ['Illinois', 'Indiana', 'Missouri', 'Ohio', 'Tennessee', 'Virginia', 'West Virginia'],
        'Louisiana': ['Arkansas', 'Mississippi', 'Texas'],
        'Maine': ['New Hampshire'],
        'Maryland': ['Delaware', 'Pennsylvania', 'Virginia', 'West Virginia'],
        'Massachusetts': ['Connecticut', 'New Hampshire', 'New York', 'Rhode Island', 'Vermont'],
        'Michigan': ['Indiana', 'Ohio', 'Wisconsin'],
        'Minnesota': ['Iowa', 'North Dakota', 'South Dakota', 'Wisconsin'],
        'Mississippi': ['Alabama', 'Arkansas', 'Louisiana', 'Tennessee'],
        'Missouri': ['Arkansas', 'Illinois', 'Iowa', 'Kansas', 'Kentucky', 'Nebraska', 'Oklahoma', 'Tennessee'],
        'Montana': ['Idaho', 'North Dakota', 'South Dakota', 'Wyoming'],
        'Nebraska': ['Colorado', 'Iowa', 'Kansas', 'Missouri', 'South Dakota', 'Wyoming'],
        'Nevada': ['Arizona', 'California', 'Idaho', 'Oregon', 'Utah'],
        'New Hampshire': ['Maine', 'Massachusetts', 'Vermont'],
        'New Jersey': ['Delaware', 'New York', 'Pennsylvania'],
        'New Mexico': ['Arizona', 'Colorado', 'Oklahoma', 'Texas', 'Utah'],
        'New York': ['Connecticut', 'Massachusetts', 'New Jersey', 'Pennsylvania', 'Vermont'],
        'North Carolina': ['Georgia', 'South Carolina', 'Tennessee', 'Virginia'],
        'North Dakota': ['Minnesota', 'Montana', 'South Dakota'],
        'Ohio': ['Indiana', 'Kentucky', 'Michigan', 'Pennsylvania', 'West Virginia'],
        'Oklahoma': ['Arkansas', 'Colorado', 'Kansas', 'Missouri', 'New Mexico', 'Texas'],
        'Oregon': ['California', 'Idaho', 'Nevada', 'Washington'],
        'Pennsylvania': ['Delaware', 'Maryland', 'New Jersey', 'New York', 'Ohio', 'West Virginia'],
        'Rhode Island': ['Connecticut', 'Massachusetts'],
        'South Carolina': ['Georgia', 'North Carolina'],
        'South Dakota': ['Iowa', 'Minnesota', 'Montana', 'Nebraska', 'North Dakota', 'Wyoming'],
        'Tennessee': ['Alabama', 'Arkansas', 'Georgia', 'Kentucky', 'Mississippi', 'Missouri', 'North Carolina', 'Virginia'],
        'Texas': ['Arkansas', 'Louisiana', 'New Mexico', 'Oklahoma'],
        'Utah': ['Arizona', 'Colorado', 'Idaho', 'Nevada', 'New Mexico', 'Wyoming'],
        'Vermont': ['Massachusetts', 'New Hampshire', 'New York'],
        'Virginia': ['Kentucky', 'Maryland', 'North Carolina', 'Tennessee', 'West Virginia'],
        'Washington': ['Idaho', 'Oregon'],
        'West Virginia': ['Kentucky', 'Maryland', 'Ohio', 'Pennsylvania', 'Virginia'],
        'Wisconsin': ['Illinois', 'Iowa', 'Michigan', 'Minnesota'],
        'Wyoming': ['Colorado', 'Idaho', 'Montana', 'Nebraska', 'South Dakota', 'Utah']
      };

      const neighbors = neighboringStates[targetState] || [];

      const prospectsQuery = sql`
        WITH target_species AS (
          SELECT DISTINCT scientific_name
          FROM observations 
          WHERE state = ${targetState}
            AND scientific_name IS NOT NULL
            AND scientific_name != ''
        )
        SELECT 
          o.scientific_name,
          o.common_name,
          SUM(CASE WHEN o.latitude > ${centerLat} THEN 1 ELSE 0 END) as north_count,
          SUM(CASE WHEN o.latitude < ${centerLat} THEN 1 ELSE 0 END) as south_count,
          SUM(CASE WHEN o.longitude > ${centerLon} THEN 1 ELSE 0 END) as east_count,
          SUM(CASE WHEN o.longitude < ${centerLon} THEN 1 ELSE 0 END) as west_count,
          SUM(CASE 
            WHEN o.latitude > ${centerLat} 
            AND o.latitude BETWEEN ${centerLat - nearbyRange} AND ${centerLat + nearbyRange}
            AND o.longitude BETWEEN ${centerLon - nearbyRange} AND ${centerLon + nearbyRange}
            THEN 1 ELSE 0 
          END) as north_nearby_count,
          SUM(CASE 
            WHEN o.latitude < ${centerLat}
            AND o.latitude BETWEEN ${centerLat - nearbyRange} AND ${centerLat + nearbyRange}
            AND o.longitude BETWEEN ${centerLon - nearbyRange} AND ${centerLon + nearbyRange}
            THEN 1 ELSE 0 
          END) as south_nearby_count,
          SUM(CASE 
            WHEN o.longitude > ${centerLon}
            AND o.latitude BETWEEN ${centerLat - nearbyRange} AND ${centerLat + nearbyRange}
            AND o.longitude BETWEEN ${centerLon - nearbyRange} AND ${centerLon + nearbyRange}
            THEN 1 ELSE 0 
          END) as east_nearby_count,
          SUM(CASE 
            WHEN o.longitude < ${centerLon}
            AND o.latitude BETWEEN ${centerLat - nearbyRange} AND ${centerLat + nearbyRange}
            AND o.longitude BETWEEN ${centerLon - nearbyRange} AND ${centerLon + nearbyRange}
            THEN 1 ELSE 0 
          END) as west_nearby_count,
          COUNT(*) as total_records,
          SUM(CASE 
            WHEN o.latitude BETWEEN ${centerLat - nearbyRange} AND ${centerLat + nearbyRange}
            AND o.longitude BETWEEN ${centerLon - nearbyRange} AND ${centerLon + nearbyRange}
            THEN 1 ELSE 0 
          END) as nearby_total
        FROM observations o
        WHERE o.state != ${targetState}
          AND o.latitude IS NOT NULL 
          AND o.longitude IS NOT NULL
          AND o.latitude BETWEEN ${centerLat - proximityRange} AND ${centerLat + proximityRange}
          AND o.longitude BETWEEN ${centerLon - proximityRange} AND ${centerLon + proximityRange}
          AND o.scientific_name IS NOT NULL
          AND o.scientific_name != ''
          AND o.scientific_name NOT IN (SELECT scientific_name FROM target_species)
        GROUP BY o.scientific_name, o.common_name
        HAVING (
          SUM(CASE 
            WHEN o.latitude BETWEEN ${centerLat - nearbyRange} AND ${centerLat + nearbyRange}
            AND o.longitude BETWEEN ${centerLon - nearbyRange} AND ${centerLon + nearbyRange}
            THEN 1 ELSE 0 
          END) > 0
          AND (
            (SUM(CASE WHEN o.latitude > ${centerLat} THEN 1 ELSE 0 END) > 0 AND SUM(CASE WHEN o.latitude < ${centerLat} THEN 1 ELSE 0 END) > 0)
            OR
            (SUM(CASE WHEN o.longitude > ${centerLon} THEN 1 ELSE 0 END) > 0 AND SUM(CASE WHEN o.longitude < ${centerLon} THEN 1 ELSE 0 END) > 0)
          )
        )
        ORDER BY SUM(CASE 
          WHEN o.latitude BETWEEN ${centerLat - nearbyRange} AND ${centerLat + nearbyRange}
          AND o.longitude BETWEEN ${centerLon - nearbyRange} AND ${centerLon + nearbyRange}
          THEN 1 ELSE 0 
        END) DESC, COUNT(*) DESC, o.scientific_name
        LIMIT 100
      `;

      // Separate query for neighboring states count
      const neighboringQuery = neighbors.length > 0 ? sql`
        SELECT 
          o.scientific_name,
          COUNT(*) as neighboring_count
        FROM observations o
        WHERE o.scientific_name IS NOT NULL
          AND o.scientific_name != ''
          AND o.state IN (${sql.join(neighbors.map(state => sql`${state}`), sql`, `)})
        GROUP BY o.scientific_name
      ` : null;

      const prospects = await db.execute(prospectsQuery);
      
      // Get neighboring states counts if applicable
      let neighboringCounts: { [key: string]: number } = {};
      if (neighboringQuery) {
        const neighboringResults = await db.execute(neighboringQuery);
        neighboringCounts = neighboringResults.rows.reduce((acc: any, row: any) => {
          acc[row.scientific_name] = parseInt(row.neighboring_count) || 0;
          return acc;
        }, {});
      }
      
      const speciesData = prospects.rows.map((row: any) => {
        const neighboringCount = neighboringCounts[row.scientific_name] || 0;
        const nearbyTotal = parseInt(row.nearby_total) || 0;
        return {
          scientificName: row.scientific_name,
          commonName: row.common_name || null,
          northCount: parseInt(row.north_count) || 0,
          southCount: parseInt(row.south_count) || 0,
          eastCount: parseInt(row.east_count) || 0,
          westCount: parseInt(row.west_count) || 0,
          northNearbyCount: parseInt(row.north_nearby_count) || 0,
          southNearbyCount: parseInt(row.south_nearby_count) || 0,
          eastNearbyCount: parseInt(row.east_nearby_count) || 0,
          westNearbyCount: parseInt(row.west_nearby_count) || 0,
          totalRecords: parseInt(row.total_records) || 0,
          nearbyTotal: nearbyTotal,
          neighboringStatesCount: neighboringCount,
          weightedTotal: nearbyTotal + neighboringCount
        };
      }).sort((a, b) => b.weightedTotal - a.weightedTotal);

      const response = {
        species: speciesData,
        stateInfo: {
          name: targetState,
          centerLatitude: centerLat,
          centerLongitude: centerLon
        }
      };

      console.log(`[API] Returning ${speciesData.length} prospect species for ${targetState}`);
      res.json(response);

    } catch (error) {
      console.error("Error fetching top prospects:", error);
      res.status(500).json({ error: "Failed to fetch top prospects data" });
    }
  });

  // Get species records for map display
  app.get("/api/species/:scientificName/records", async (req, res) => {
    try {
      const scientificName = req.params.scientificName;
      console.log(`[API] GET /api/species/${scientificName}/records`);

      const records = await db.execute(sql`
        SELECT 
          o.id,
          o.latitude,
          o.longitude,
          o.state,
          o.place_guess,
          o.location_name,
          o.observed_on,
          o.collector
        FROM observations o
        WHERE o.scientific_name = ${scientificName}
          AND o.latitude IS NOT NULL 
          AND o.longitude IS NOT NULL
        ORDER BY o.observed_on DESC
        LIMIT 1000
      `);

      const recordsData = records.rows.map((row: any) => ({
        id: row.id,
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        state: row.state || 'Unknown',
        locality: row.place_guess || row.location_name || 'Unknown location',
        dateCollected: row.observed_on || 'Unknown date',
        collector: row.collector || 'Unknown collector'
      }));

      console.log(`[API] Returning ${recordsData.length} records for ${scientificName}`);
      res.json(recordsData);

    } catch (error) {
      console.error("Error fetching species records:", error);
      res.status(500).json({ error: "Failed to fetch species records" });
    }
  });

  // Cache for collector names to improve performance
  let collectorCache: string[] | null = null;
  let collectorCacheTime = 0;
  const COLLECTOR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  app.get("/api/collectors", async (req, res) => {
    try {
      const { search } = req.query;
      
      // Check if cache is valid
      const now = Date.now();
      if (!collectorCache || (now - collectorCacheTime) > COLLECTOR_CACHE_TTL) {
        collectorCache = await storage.getUniqueCollectors();
        collectorCacheTime = now;
      }
      
      // Filter cached results for search
      let collectors = collectorCache;
      if (search && typeof search === 'string') {
        const searchLower = search.toLowerCase();
        collectors = collectorCache.filter(name => 
          name.toLowerCase().includes(searchLower)
        );
      }
      
      res.json(collectors.slice(0, 50)); // Limit to 50 results for performance
    } catch (error) {
      console.error("Error fetching collectors:", error);
      res.status(500).json({ error: "Failed to fetch collectors" });
    }
  });

  // Global first records endpoints
  app.get("/api/states/global-firsts", async (req, res) => {
    try {
      const { state } = req.query;
      
      // Use optimized database method instead of fetching 50k+ records
      const data = await storage.getStatesWithMostGlobalFirsts(state as string);
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching states with global firsts:", error);
      res.status(500).json({ error: "Failed to fetch states with global firsts" });
    }
  });

  app.get("/api/contributors/global-firsts", async (req, res) => {
    try {
      const { state, limit } = req.query;
      const limitNum = limit ? parseInt(limit as string) : 1000; // Default to high limit for "all records"
      
      // Use optimized database method instead of fetching 50k+ records
      const data = await storage.getContributorsWithMostGlobalFirsts(limitNum, state as string);
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching contributors with global firsts:", error);
      res.status(500).json({ error: "Failed to fetch contributors with global firsts" });
    }
  });

  app.get("/api/contributors/state-firsts", async (req, res) => {
    try {
      const { state, limit } = req.query;
      const limitNum = limit ? parseInt(limit as string) : 1000; // Default to high limit for "all records"
      
      const contributors = await storage.getContributorsWithMostStateFirsts(limitNum, state as string);
      res.json(contributors);
    } catch (error) {
      console.error("Error fetching contributors with most state firsts:", error);
      res.status(500).json({ error: "Failed to fetch contributors with most state firsts" });
    }
  });

  // Global first records by year endpoint
  app.get("/api/global-firsts-by-year", async (req, res) => {
    try {
      const { state, collector } = req.query;
      
      // Get all global first records from the record index
      const globalFirstRecords = await storage.getRecordIndex(50000, 0, false, false, state as string, true, undefined, undefined, undefined, collector as string);
      
      // Group by year based on report date
      const globalFirstsByYear = globalFirstRecords.reduce((acc: { [key: number]: number }, record) => {
        if (record.reportDate) {
          const year = new Date(record.reportDate).getFullYear();
          acc[year] = (acc[year] || 0) + 1;
        }
        return acc;
      }, {});

      // Convert to array format for chart
      const yearData = Object.entries(globalFirstsByYear)
        .map(([year, count]) => ({ 
          year: parseInt(year), 
          count: count as number 
        }))
        .sort((a, b) => a.year - b.year);

      res.json(yearData);
    } catch (error) {
      console.error("Error fetching global firsts by year:", error);
      res.status(500).json({ error: "Failed to fetch global firsts by year" });
    }
  });

  // Species seasonal distribution endpoint
  app.get("/api/species/:name/seasonal", async (req, res) => {
    try {
      const speciesName = decodeURIComponent(req.params.name);
      const observations = await storage.getAllObservations();
      

      
      // Filter observations for the specific species
      // Use the same logic as the observations endpoint
      const speciesObservations = observations.filter(obs => {
        if (!obs.observedOn) return false;
        return obs.species === speciesName || obs.scientificName === speciesName;
      });
      
      // Initialize month counts
      const monthCounts = Array.from({ length: 12 }, (_, i) => ({
        month: new Date(0, i).toLocaleString('default', { month: 'short' }),
        monthNumber: i + 1,
        count: 0
      }));
      
      // Count observations by month
      speciesObservations.forEach(obs => {
        if (obs.observedOn) {
          const month = new Date(obs.observedOn).getMonth();
          monthCounts[month].count++;
        }
      });
      
      res.json(monthCounts);
    } catch (error) {
      console.error("Error fetching species seasonal distribution:", error);
      res.status(500).json({ error: "Failed to fetch species seasonal distribution" });
    }
  });

  // Contributors species endpoint
  app.get("/api/contributors/species", async (req, res) => {
    try {
      const { state, limit } = req.query;
      const limitNum = limit ? parseInt(limit as string) : 10000;
      
      // Get all observations to access collector and species data
      const observations = await storage.getAllObservations();
      
      // Filter by state if specified
      const filteredObs = state 
        ? observations.filter(obs => obs.state === state)
        : observations;
      
      // Group by collector and count unique species
      const contributorSpecies = filteredObs.reduce((acc, obs) => {
        if (!obs.collector || !obs.scientificName) return acc;
        
        if (!acc[obs.collector]) {
          acc[obs.collector] = new Set();
        }
        acc[obs.collector].add(obs.scientificName);
        return acc;
      }, {} as Record<string, Set<string>>);
      
      const data = Object.entries(contributorSpecies)
        .map(([name, speciesSet]) => ({
          id: name.replace(/\s+/g, '_').toLowerCase(),
          name: name,
          affiliation: undefined,
          speciesCount: speciesSet.size
        }))
        .sort((a, b) => b.speciesCount - a.speciesCount)
        .slice(0, limitNum);
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching contributors species:", error);
      res.status(500).json({ error: "Failed to fetch contributors species" });
    }
  });

  // Update flags endpoints
  app.get("/api/observations/name-updates", async (req, res) => {
    try {
      const observations = await storage.getObservationsWithNameUpdates();
      res.json(observations);
    } catch (error) {
      console.error("Error fetching observations with name updates:", error);
      res.status(500).json({ error: "Failed to fetch observations with name updates" });
    }
  });

  app.get("/api/observations/classification-updates", async (req, res) => {
    try {
      const observations = await storage.getObservationsWithClassificationUpdates();
      console.log(`Classification updates API: returning ${observations.length} records`);
      res.json(observations);
    } catch (error) {
      console.error("Error fetching observations with classification updates:", error);
      res.status(500).json({ error: "Failed to fetch observations with classification updates" });
    }
  });

  // Upload endpoints
  app.get("/api/uploads", async (req, res) => {
    try {
      const uploads = await storage.getUploads();
      res.json(uploads);
    } catch (error) {
      console.error("Error fetching uploads:", error);
      res.status(500).json({ error: "Failed to fetch uploads" });
    }
  });

  app.post("/api/reprocess-validation-flags", async (req, res) => {
    try {
      // Create a temporary upload record for the existing file
      const upload = await storage.createUpload({
        filename: 'validated_observations.xlsx',
        originalName: 'Validated Observations05.30.25.xlsx',
        recordCount: 0,
        status: 'processing'
      });

      const filePath = path.join(__dirname, '../uploads/validated_observations.xlsx');
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Excel file not found. Please upload the file first." });
      }

      // Process with new validation flags
      processExcelFile(upload.id, filePath, upload.originalName)
        .then(() => {
          console.log("Reprocessing with validation flags completed successfully");
        })
        .catch(error => {
          console.error("Error reprocessing file:", error);
          storage.updateUploadStatus(upload.id, 'failed', error.message);
        });

      res.json({ 
        message: "Reprocessing started with validation flags",
        uploadId: upload.id 
      });
    } catch (error) {
      console.error("Error starting reprocessing:", error);
      res.status(500).json({ error: "Failed to start reprocessing" });
    }
  });

  app.post("/api/reprocess-upload/:id", async (req, res) => {
    try {
      const uploadId = parseInt(req.params.id);
      const uploads = await storage.getUploads();
      const upload = uploads.find(u => u.id === uploadId);
      
      if (!upload) {
        return res.status(404).json({ error: "Upload not found" });
      }

      const filePath = path.join(__dirname, '../uploads', upload.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
      }

      // Clear existing data first
      await storage.clearAllData();

      // Reprocess with updated field mapping
      processExcelFile(uploadId, filePath, upload.originalName)
        .catch(error => {
          console.error("Error reprocessing file:", error);
          storage.updateUploadStatus(uploadId, 'failed', error.message);
        });

      res.json({ message: "Reprocessing started with updated field mapping" });
    } catch (error) {
      console.error("Error reprocessing upload:", error);
      res.status(500).json({ error: "Failed to reprocess upload" });
    }
  });

  app.post("/api/auto-populate-classification-updates", async (req, res) => {
    try {
      console.log('Manual trigger: Starting automated classification updates...');
      await autoPopulateClassificationUpdates();
      res.json({ message: "Automated classification updates completed successfully" });
    } catch (error) {
      console.error("Error in automated classification updates:", error);
      res.status(500).json({ error: "Failed to run automated classification updates" });
    }
  });

  // Get iNaturalist classification cache statistics
  app.get("/api/inaturalist-cache-stats", async (req, res) => {
    try {
      const cacheStats = await storage.getClassificationCacheStats();
      const uploadStats = storage.getUploadApiCallStats();
      
      res.json({
        cache: cacheStats,
        currentUpload: uploadStats
      });
    } catch (error) {
      console.error("Error fetching cache statistics:", error);
      res.status(500).json({ error: "Failed to fetch cache statistics" });
    }
  });

  // Progress tracking for uploads
  const activeUploads = new Map<number, { progress: number; phase: string; message: string; batchInfo?: any }>();
  
  // Cancellation tracking for uploads
  const cancelledUploads = new Set<number>();
  
  // SSE endpoint for real-time progress updates
  app.get("/api/upload/progress/:uploadId", (req, res) => {
    const uploadId = parseInt(req.params.uploadId);
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial state
    const currentProgress = activeUploads.get(uploadId) || { 
      progress: 0, 
      phase: 'waiting', 
      message: 'Waiting to start processing...' 
    };
    res.write(`data: ${JSON.stringify(currentProgress)}\n\n`);

    // Set up interval to send progress updates
    const interval = setInterval(() => {
      const progress = activeUploads.get(uploadId);
      if (progress) {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
        
        // Clean up completed uploads
        if (progress.progress >= 100 && progress.phase === 'completed') {
          clearInterval(interval);
          res.end();
          setTimeout(() => activeUploads.delete(uploadId), 10000);
        }
      }
    }, 500);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(interval);
    });
  });

  // Stop processing endpoint
  app.post("/api/upload/stop/:uploadId", async (req, res) => {
    try {
      const uploadId = parseInt(req.params.uploadId);
      
      if (isNaN(uploadId)) {
        return res.status(400).json({ error: "Invalid upload ID" });
      }

      // Add to cancelled uploads set
      cancelledUploads.add(uploadId);
      
      // Update progress to indicate cancellation
      activeUploads.set(uploadId, {
        progress: 0,
        phase: 'cancelled',
        message: 'Processing cancelled by user'
      });

      // Update upload status in database
      await storage.updateUploadStatus(uploadId, 'cancelled', 'Processing cancelled by user');

      console.log(`Upload ${uploadId} cancelled by user`);

      res.json({ 
        success: true,
        message: "Processing cancellation initiated" 
      });

    } catch (error) {
      console.error("Error stopping upload processing:", error);
      res.status(500).json({ error: "Failed to stop processing" });
    }
  });

  app.post("/api/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { originalname, filename, path: filePath } = req.file;

      // Create upload record
      const uploadRecord = await storage.createUpload({
        filename,
        originalName: originalname,
        recordCount: 0,
        status: 'processing'
      });

      // Process Excel file asynchronously with progress tracking
      processExcelFile(uploadRecord.id, filePath, originalname, activeUploads)
        .catch(error => {
          console.error("Error processing file:", error);
          storage.updateUploadStatus(uploadRecord.id, 'failed', error.message);
          activeUploads.set(uploadRecord.id, {
            progress: 0,
            phase: 'failed',
            message: `Processing failed: ${error.message}`
          });
        });

      res.json({ 
        message: "File uploaded successfully and is being processed",
        uploadId: uploadRecord.id 
      });

    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  // Optimized contributor statistics - processes only contributors affected by upload
  async function updateContributorStatisticsScoped(uploadId: number, progressTracker?: Map<number, any>) {
    console.log(`Updating contributor statistics for upload ${uploadId}...`);
    
    try {
      const startTime = Date.now();
      
      // Get contributors from the current upload who need their stats updated
      const uploadObservations = await storage.getObservationsFromUpload(uploadId);
      const affectedContributors = new Set<string>();
      
      uploadObservations.forEach(obs => {
        const contributorName = obs.collector || obs.observer;
        if (contributorName && contributorName.trim()) {
          affectedContributors.add(contributorName.trim());
        }
      });
      
      const contributorsToUpdate = Array.from(affectedContributors);
      console.log(`Found ${contributorsToUpdate.length} contributors affected by upload ${uploadId}`);
      
      if (contributorsToUpdate.length === 0) {
        console.log('No contributors affected by upload need statistics updates');
        return;
      }
      
      let processed = 0;
      let newContributors = 0;
      let updatedContributors = 0;
      let unchangedContributors = 0;
      
      // Get all contributors once to avoid repeated queries
      const allContributors = await storage.getAllContributors();
      const contributorLookup = new Map(allContributors.map(c => [c.name, c]));
      
      // Process contributors in smaller batches with connection recovery
      const batchSize = 25; // Reduced batch size for better stability
      
      for (let i = 0; i < contributorsToUpdate.length; i += batchSize) {
        // Check for cancellation
        if (cancelledUploads.has(uploadId)) {
          console.log(`Upload ${uploadId} cancelled during contributor statistics`);
          return;
        }

        const batch = contributorsToUpdate.slice(i, i + batchSize);
        console.log(`Processing contributor batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(contributorsToUpdate.length / batchSize)} (${batch.length} contributors)`);
        
        // Process each contributor in the batch
        for (const contributorName of batch) {
          try {
            // Get observation count with retry logic and timeout
            let currentTotalCount;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount < maxRetries) {
              try {
                // Add timeout to prevent hanging
                const countPromise = storage.getContributorObservationCount(contributorName);
                const timeoutPromise = new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Database query timeout')), 30000)
                );
                
                currentTotalCount = await Promise.race([countPromise, timeoutPromise]);
                break;
              } catch (error) {
                retryCount++;
                console.log(`Retry ${retryCount}/${maxRetries} for contributor ${contributorName}: ${error.message}`);
                
                if (retryCount >= maxRetries) {
                  console.error(`Failed to get count for contributor ${contributorName} after ${maxRetries} retries`);
                  // Skip this contributor instead of failing entire upload
                  unchangedContributors++;
                  currentTotalCount = null;
                  break;
                }
                
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
              }
            }

            // Skip if we couldn't get the count
            if (currentTotalCount === null) continue;
            
            // Check existing contributor record
            const existingContributor = contributorLookup.get(contributorName);
            
            const isNew = !existingContributor;
            const storedCount = isNew ? 0 : (existingContributor.observationCount || 0);
            const needsUpdate = isNew || storedCount !== currentTotalCount;
            
            if (needsUpdate) {
              // Upsert with retry logic
              let upsertRetries = 0;
              const maxUpsertRetries = 2;
              
              while (upsertRetries < maxUpsertRetries) {
                try {
                  await storage.upsertContributor({
                    name: contributorName,
                    affiliation: null,
                    observationCount: currentTotalCount
                  });
                  
                  if (isNew) {
                    newContributors++;
                  } else {
                    updatedContributors++;
                  }
                  processed++;
                  break;
                } catch (upsertError) {
                  upsertRetries++;
                  if (upsertRetries >= maxUpsertRetries) {
                    console.error(`Failed to upsert contributor ${contributorName}:`, upsertError);
                    unchangedContributors++;
                  } else {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                  }
                }
              }
            } else {
              unchangedContributors++;
            }
          } catch (error) {
            console.error(`Error processing contributor ${contributorName}:`, error);
            unchangedContributors++;
          }
        }
        
        // Send progress update after each batch
        const totalContributors = contributorsToUpdate.length;
        const progressIndex = newContributors + updatedContributors + unchangedContributors;
        
        if (progressTracker && progressTracker.has(uploadId)) {
          const progress = Math.min(100, Math.round((progressIndex / totalContributors) * 100));
          const phaseProgress = Math.min(60, 50 + (progress * 0.1)); // Phase 1: 50-60%
          
          progressTracker.set(uploadId, {
            progress: Math.round(phaseProgress),
            phase: 'post-processing',
            message: `Updating contributor statistics: ${progressIndex}/${totalContributors} affected contributors processed`,
            batchInfo: {
              recordsProcessed: progressIndex,
              totalRecords: totalContributors,
              currentPhase: 1,
              totalPhases: 5
            }
          });
        }
        
        // Brief pause between batches to prevent overwhelming the database
        if (i + batchSize < contributorsToUpdate.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`Contributor Statistics Summary for Upload ${uploadId}:`);
      console.log(`  Contributors affected by upload: ${contributorsToUpdate.length}`);
      console.log(`  New contributors: ${newContributors}`);
      console.log(`  Updated contributors: ${updatedContributors}`);
      console.log(`  Unchanged contributors: ${unchangedContributors}`);
      console.log(`  Total processed: ${processed}`);
      console.log(`✓ Contributor statistics completed in ${Date.now() - startTime}ms`);
      
    } catch (error) {
      console.error(`Error updating contributor statistics for upload ${uploadId}:`, error);
      throw error;
    }
  }

  // Upload-scoped species statistics - only processes species from current upload
async function updateSpeciesStatisticsScoped(uploadId: number, progressTracker?: Map<number, any>) {
    console.log(`Updating species statistics for upload ${uploadId}...`);
    
    try {
      const startTime = Date.now();
      
      // Get only the species from the current upload
      const uploadSpecies = await storage.getSpeciesFromUpload(uploadId);
      console.log(`Found ${uploadSpecies.length} unique species from upload ${uploadId} to update`);
      
      if (uploadSpecies.length === 0) {
        console.log('No species from upload need statistics updates');
        return;
      }
      
      // Process each species from the upload
      for (let i = 0; i < uploadSpecies.length; i++) {
        const speciesName = uploadSpecies[i];
        
        // Get updated count for this species across all observations
        const speciesData = await storage.getSpeciesStatistics(speciesName);
        
        if (speciesData) {
          await storage.upsertSpecies({
            scientificName: speciesData.scientificName,
            commonName: speciesData.commonName,
            phylum: speciesData.phylum,
            class: speciesData.class,
            order: speciesData.order,
            family: speciesData.family,
            observationCount: speciesData.observationCount
          });
        }
        
        // Send progress update to frontend
        if (uploadId && progressTracker && progressTracker.has(uploadId)) {
          const progress = Math.round(((i + 1) / uploadSpecies.length) * 100);
          const phaseProgress = 60 + (progress * 0.1); // Phase 2: 60-70%
          progressTracker.set(uploadId, {
            progress: Math.round(phaseProgress),
            phase: 'post-processing',
            message: `Updating species statistics: ${i + 1}/${uploadSpecies.length} species from upload processed`,
            batchInfo: {
              recordsProcessed: i + 1,
              totalRecords: uploadSpecies.length,
              currentPhase: 2,
              totalPhases: 5
            }
          });
        }
      }
      
      const duration = Date.now() - startTime;
      console.log(`✓ Species statistics completed in ${duration}ms - ${uploadSpecies.length} species from upload ${uploadId} processed`);
    } catch (error) {
      console.error('Error in upload-scoped species statistics update:', error);
      throw error;
    }
  }

// Legacy function - processes all species in database
async function updateSpeciesStatistics(uploadId?: number, progressTracker?: Map<number, any>) {
    console.log('Rebuilding species statistics...');
    
    // Use optimized approach: get aggregated data and bulk upsert
    try {
      const startTime = Date.now();
      
      // Get aggregated species data efficiently
      const speciesStats = await storage.getTopSpecies(50000);
      console.log(`Found ${speciesStats.length} unique species to update`);
      
      // Process in batches for better performance
      const batchSize = 1000;
      for (let i = 0; i < speciesStats.length; i += batchSize) {
        const batch = speciesStats.slice(i, i + batchSize);
        
        // Process batch concurrently
        await Promise.all(batch.map(async (speciesItem) => {
          await storage.upsertSpecies({
            scientificName: speciesItem.scientificName,
            commonName: speciesItem.commonName,
            phylum: speciesItem.phylum,
            class: speciesItem.class,
            order: speciesItem.order,
            family: speciesItem.family,
            observationCount: speciesItem.observationCount
          });
        }));
        
        // Progress indicator for large datasets
        if (speciesStats.length > 5000) {
          const progress = Math.round(((i + batchSize) / speciesStats.length) * 100);
          const processed = Math.min(i + batchSize, speciesStats.length);
          console.log(`Species statistics progress: ${Math.min(progress, 100)}% (${processed}/${speciesStats.length})`);
          
          // Send progress update to frontend if uploadId is provided
          if (uploadId && progressTracker && progressTracker.has(uploadId)) {
            const phaseProgress = 60 + (progress * 0.1); // Phase 2: 60-70%
            progressTracker.set(uploadId, {
              progress: Math.round(phaseProgress),
              phase: 'post-processing',
              message: `Updating species statistics: ${processed.toLocaleString()}/${speciesStats.length.toLocaleString()} species processed`,
              batchInfo: {
                currentBatch: Math.floor(i / batchSize) + 1,
                totalBatches: Math.ceil(speciesStats.length / batchSize),
                recordsProcessed: processed,
                totalRecords: speciesStats.length,
                currentPhase: 2,
                totalPhases: 5
              }
            });
          }
        }
      }
      
      const duration = Date.now() - startTime;
      console.log(`✓ Species statistics completed in ${duration}ms - ${speciesStats.length} species processed`);
    } catch (error) {
      console.error('Error in species statistics update:', error);
      console.log('Species statistics update failed');
    }
  }

  async function processExcelFile(uploadId: number, filePath: string, originalName: string, progressTracker: Map<number, any>) {
    try {
      console.log('=== STARTING EXCEL PROCESSING ===');
      console.log('Upload ID:', uploadId);
      console.log('File path:', filePath);
      console.log('Original name:', originalName);
      console.log('File exists:', fs.existsSync(filePath));
      
      // Check if cancelled before starting
      if (cancelledUploads.has(uploadId)) {
        console.log(`Upload ${uploadId} was cancelled before processing started`);
        return;
      }
      
      // Initialize progress tracking and reset API call statistics for this upload
      storage.resetUploadApiCallStats();
      progressTracker.set(uploadId, {
        progress: 0,
        phase: 'initializing',
        message: 'Starting data processing...'
      });
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found at path: ${filePath}`);
      }
      
      // Skip data clearing - preserve existing records for incremental uploads
      console.log('Preserving existing data - incremental upload mode');
      progressTracker.set(uploadId, {
        progress: 5,
        phase: 'initializing',
        message: 'Preparing incremental data upload...'
      });
      
      // Check for cancellation
      if (cancelledUploads.has(uploadId)) {
        console.log(`Upload ${uploadId} cancelled during initialization`);
        return;
      }
      
      console.log('✓ Ready for incremental data processing');
      
      // Dynamically import XLSX with proper CommonJS handling
      console.log('Importing XLSX library...');
      progressTracker.set(uploadId, {
        progress: 2,
        phase: 'reading',
        message: 'Loading Excel processing library...'
      });
      const XLSX = await import('xlsx');
      const { readFile, utils } = XLSX.default;
      console.log('✓ XLSX library imported');
      
      // Read Excel file with streaming to handle large files
      console.log('Reading Excel file...');
      progressTracker.set(uploadId, {
        progress: 5,
        phase: 'reading',
        message: 'Reading and parsing Excel file...'
      });
      
      // Check for cancellation
      if (cancelledUploads.has(uploadId)) {
        console.log(`Upload ${uploadId} cancelled during file reading`);
        return;
      }
      
      const workbook = readFile(filePath, { cellDates: true });
      console.log('✓ Workbook loaded, sheet names:', workbook.SheetNames);
      const sheetName = workbook.SheetNames.find((name: string) => 
        name.toLowerCase().includes('validated') || 
        name.toLowerCase().includes('observation')
      ) || workbook.SheetNames[0];
      
      const worksheet = workbook.Sheets[sheetName];
      console.log('Converting sheet to JSON (this may take a moment for large files)...');
      const rawData = utils.sheet_to_json(worksheet);

      console.log('✓ Raw data length:', rawData.length);
      if (rawData.length > 0) {
        const allColumns = Object.keys(rawData[0] as any);
        console.log('Available columns:', allColumns);
        
        // Currently mapped fields - ALL 47 FIELDS NOW MAPPED
        const mapped = [
          'Source Database', 'Reference Number', 'Collection Number', 'Report Date', 'Creation Date',
          'Collector', 'Verified', 'Kingdom', 'Phylum', 'Class', 'Order', 'Family', 'Genus', 'Species',
          'Variety', 'Authority', 'Abbreviated Authority', 'Mycobank #', 'Fungarium Specimen', 'Images',
          'GenBank Accession #', 'MyCoPortal #', 'DNA Sequence', 'Sequence', 'Flags', 'Forward Primer',
          'Reverse Primer', 'Sequence Owner', 'Run Name', 'Sequence #2', 'Forward Primer #2',
          'Reverse Primer #2', 'Sequence Owner #2', 'Run Name #2', 'Location Name', 'Country', 'City',
          'State', 'Latitude', 'Longitude', 'Notes', 'MO Notes', 'Report Link', 'Image Link',
          'First State Record', 'First GenBank Record', 'Multiple Genotypes Under Name'
        ];
        
        const unmapped = allColumns.filter(col => !mapped.includes(col));
        console.log('UNMAPPED FIELDS:', unmapped);
        console.log(`Total: ${allColumns.length}, Mapped: ${mapped.filter(f => allColumns.includes(f)).length}, Unmapped: ${unmapped.length}`);
      }

      // Character encoding fix function
      function fixEncoding(text: string | null | undefined): string | null {
        if (!text || typeof text !== 'string') return text || null;
        
        // Fix common UTF-8 encoding corruption patterns
        return text
          // Smart quotes and apostrophes
          .replace(/â€œ/g, '"')     // Opening smart quote
          .replace(/â€/g, '"')      // Closing smart quote  
          .replace(/â€™/g, "'")     // Smart apostrophe/closing single quote
          .replace(/â€˜/g, "'")     // Opening smart apostrophe
          // Other common encoding issues
          .replace(/â€"/g, '–')     // En dash
          .replace(/â€"/g, '—')     // Em dash
          .replace(/â€¦/g, '…')     // Ellipsis
          // Accented characters - comprehensive coverage
          .replace(/Ã¡/g, 'á')     // á with acute accent
          .replace(/Ã©/g, 'é')     // é with acute accent
          .replace(/Ã­/g, 'í')     // í with acute accent
          .replace(/Ã³/g, 'ó')     // ó with acute accent
          .replace(/Ãº/g, 'ú')     // ú with acute accent
          .replace(/Ã±/g, 'ñ')     // ñ with tilde
          .replace(/Ã§/g, 'ç')     // ç with cedilla
          .replace(/Ã¼/g, 'ü')     // ü with diaeresis
          .replace(/Ã¨/g, 'è')     // è with grave accent
          .replace(/Ã /g, 'à')     // à with grave accent
          .replace(/Ã¬/g, 'ì')     // ì with grave accent
          .replace(/Ã²/g, 'ò')     // ò with grave accent
          .replace(/Ã¹/g, 'ù')     // ù with grave accent
          .replace(/Ã¢/g, 'â')     // â with circumflex
          .replace(/Ãª/g, 'ê')     // ê with circumflex
          .replace(/Ã®/g, 'î')     // î with circumflex
          .replace(/Ã´/g, 'ô')     // ô with circumflex
          .replace(/Ã»/g, 'û')     // û with circumflex
          .replace(/Ã¤/g, 'ä')     // ä with diaeresis
          .replace(/Ã«/g, 'ë')     // ë with diaeresis
          .replace(/Ã¯/g, 'ï')     // ï with diaeresis
          .replace(/Ã¶/g, 'ö')     // ö with diaeresis
          .replace(/Ã/g, 'Á')      // Á with acute accent
          .replace(/Ã‰/g, 'É')     // É with acute accent
          .replace(/Ã/g, 'Í')      // Í with acute accent
          .replace(/Ã"/g, 'Ó')     // Ó with acute accent
          .replace(/Ãš/g, 'Ú')     // Ú with acute accent
          .replace(/Ã'/g, 'Ñ')     // Ñ with tilde
          .replace(/Ã‡/g, 'Ç')     // Ç with cedilla
          .replace(/Ãœ/g, 'Ü')     // Ü with diaeresis
          .replace(/Ãˆ/g, 'È')     // È with grave accent
          .replace(/Ã€/g, 'À')     // À with grave accent
          .replace(/ÃŒ/g, 'Ì')     // Ì with grave accent
          .replace(/Ã'/g, 'Ò')     // Ò with grave accent
          .replace(/Ã™/g, 'Ù')     // Ù with grave accent
          // Additional patterns found in the data
          .replace(/â€˜/g, "'")     // Additional single quote variant
          .replace(/â€™/g, "'")     // Additional apostrophe variant
          .trim();
      }

      // Transform and validate data using actual column names from your file
      const observations = rawData.map((row: any) => {
        // Construct scientific name following taxonomic hierarchy
        // Priority: Variety -> Species -> Genus -> Family -> Order -> Class -> Phylum -> Kingdom
        let scientificName = '';
        if (row['Variety']) {
          scientificName = fixEncoding(row['Variety']) || '';
        } else if (row['Species']) {
          scientificName = fixEncoding(row['Species']) || '';
        } else if (row['Genus']) {
          scientificName = fixEncoding(row['Genus']) || '';
        } else if (row['Family']) {
          scientificName = fixEncoding(row['Family']) || '';
        } else if (row['Order']) {
          scientificName = fixEncoding(row['Order']) || '';
        } else if (row['Class']) {
          scientificName = fixEncoding(row['Class']) || '';
        } else if (row['Phylum']) {
          scientificName = fixEncoding(row['Phylum']) || '';
        } else if (row['Kingdom']) {
          scientificName = fixEncoding(row['Kingdom']) || '';
        } else {
          scientificName = 'Unknown';
        }
        
        // Check for name_update flag: Species or Variety is missing
        const nameUpdate = !row['Species'] && !row['Variety'];
        
        // Check for classification_update flag: more conservative approach
        // Only flag records that are missing MOST essential taxonomy AND don't have obvious genus info
        const hasSpeciesOrVariety = row['Species'] || row['Variety'];
        const missingCriticalTaxonomy = hasSpeciesOrVariety && (
          (!row['Phylum'] || !row['Class'] || !row['Order'] || !row['Family']) &&
          !row['Genus'] // If genus is missing, harder to auto-classify
        );
        const classificationUpdate = missingCriticalTaxonomy;

        return {
          observationId: fixEncoding(row['Reference Number']) || `${Date.now()}-${Math.random()}`,
          scientificName: scientificName,
          commonName: null, // Not present in your data
          phylum: fixEncoding(row['Phylum']),
          class: fixEncoding(row['Class']),
          order: fixEncoding(row['Order']),
          family: fixEncoding(row['Family']),
          genus: fixEncoding(row['Genus']),
          species: fixEncoding(row['Species']),
          infraspecies: fixEncoding(row['Variety']),
          observer: fixEncoding(row['Sequence Owner']),
          collector: fixEncoding(row['Collector']),
          observedOn: (() => {
            try {
              if (!row['Report Date']) return null;
              const dateValue = row['Report Date'];
              if (typeof dateValue === 'number') {
                // Excel serial date
                const date = new Date((dateValue - 25569) * 86400 * 1000);
                return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
              } else if (dateValue instanceof Date) {
                return isNaN(dateValue.getTime()) ? null : dateValue.toISOString().split('T')[0];
              } else if (typeof dateValue === 'string') {
                const date = new Date(dateValue);
                return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
              }
              return null;
            } catch (e) {
              return null;
            }
          })(),
          latitude: row['Latitude'] ? String(row['Latitude']) : null,
          longitude: row['Longitude'] ? String(row['Longitude']) : null,
          placeGuess: fixEncoding(row['City']),
          state: fixEncoding(row['State']),
          country: fixEncoding(row['Country']),
          genbankAccession: fixEncoding(row['GenBank Accession #']),
          mycoportalNumber: fixEncoding(row['MyCoPortal #']),
          dnaSequence: fixEncoding(row['DNA Sequence']),
          sequence: fixEncoding(row['Sequence']),
          
          // Additional mapped fields
          collectionNumber: fixEncoding(row['Collection Number']),
          creationDate: (() => {
            try {
              if (!row['Creation Date']) return null;
              const dateValue = row['Creation Date'];
              if (typeof dateValue === 'number') {
                // Excel serial date
                const date = new Date((dateValue - 25569) * 86400 * 1000);
                return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
              } else if (dateValue instanceof Date) {
                return isNaN(dateValue.getTime()) ? null : dateValue.toISOString().split('T')[0];
              } else if (typeof dateValue === 'string') {
                const date = new Date(dateValue);
                return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
              }
              return null;
            } catch (e) {
              return null;
            }
          })(),
          verified: fixEncoding(row['Verified']),
          kingdom: fixEncoding(row['Kingdom']),
          authority: fixEncoding(row['Authority']),
          abbreviatedAuthority: fixEncoding(row['Abbreviated Authority']),
          mycobankNumber: fixEncoding(row['Mycobank #']),
          fungariumSpecimen: fixEncoding(row['Fungarium Specimen']),
          images: fixEncoding(row['Images']),
          flags: fixEncoding(row['Flags']),
          forwardPrimer: fixEncoding(row['Forward Primer']),
          reversePrimer: fixEncoding(row['Reverse Primer']),
          runName: fixEncoding(row['Run Name']),
          sequence2: fixEncoding(row['Sequence #2']),
          forwardPrimer2: fixEncoding(row['Forward Primer #2']),
          reversePrimer2: fixEncoding(row['Reverse Primer #2']),
          sequenceOwner2: fixEncoding(row['Sequence Owner #2']),
          runName2: fixEncoding(row['Run Name #2']),
          locationName: fixEncoding(row['Location Name']),
          notes: fixEncoding(row['Notes']),
          moNotes: fixEncoding(row['MO Notes']),
          reportLink: fixEncoding(row['Report Link']),
          imageLink: fixEncoding(row['Image Link']),
          firstGenbankRecord: row['First GenBank Record'] === 'yes',
          
          isFirstStateRecord: row['First State Record'] === 'yes',
          hasMultipleGenotypes: row['Multiple Genotypes Under Name'] === 'yes',
          source: row['Source Database'] || row['Source'] || row['source'] || 'Unknown',
          sourceUrl: row['Source URL'] || row['source_url'] || null,
          nameUpdate: nameUpdate,
          classificationUpdate: classificationUpdate,
        };
      }).filter(obs => obs.scientificName); // Filter out rows without scientific name

      // Count validation flags
      let nameUpdateCount = 0;
      let classificationUpdateCount = 0;
      
      observations.forEach(obs => {
        if (obs.nameUpdate) nameUpdateCount++;
        if (obs.classificationUpdate) classificationUpdateCount++;
      });

      console.log(`Processed ${observations.length} valid observations`);
      console.log(`Validation flags: ${nameUpdateCount} name updates, ${classificationUpdateCount} classification updates`);

      // Update progress for data transformation phase
      progressTracker.set(uploadId, {
        progress: 10,
        phase: 'processing',
        message: `Processed ${observations.length.toLocaleString()} observations, preparing for database insertion...`
      });

      // Insert observations in batches with enhanced monitoring
      const batchSize = 500; // Reduced batch size for better stability
      let insertedCount = 0;
      const totalBatches = Math.ceil(observations.length / batchSize);
      
      console.log(`Starting batch insert with enhanced monitoring...`);
      console.log(`Total records: ${observations.length}, Batch size: ${batchSize}, Total batches: ${totalBatches}`);
      
      for (let i = 0; i < observations.length; i += batchSize) {
        const batchNum = Math.floor(i/batchSize) + 1;
        const batch = observations.slice(i, i + batchSize);
        const recordRange = `${i + 1}-${Math.min(i + batchSize, observations.length)}`;
        
        console.log(`[${new Date().toISOString()}] Starting batch ${batchNum}/${totalBatches} (records ${recordRange})`);
        
        // Check for cancellation before each batch
        if (cancelledUploads.has(uploadId)) {
          console.log(`Upload ${uploadId} cancelled during batch processing at batch ${batchNum}/${totalBatches}`);
          return;
        }
        
        try {
          const startTime = Date.now();
          await storage.createObservations(batch);
          const endTime = Date.now();
          insertedCount += batch.length;
          
          const batchDuration = endTime - startTime;
          const avgTimePerRecord = batchDuration / batch.length;
          const progressPercent = ((insertedCount / observations.length) * 100).toFixed(1);
          
          // Update progress tracker with real-time batch completion (0-50% for insertion phase)
          const insertionProgress = Math.round((insertedCount / observations.length) * 50);
          progressTracker.set(uploadId, {
            progress: insertionProgress,
            phase: 'inserting',
            message: `Processing records: ${insertedCount.toLocaleString()}/${observations.length.toLocaleString()} (${progressPercent}% complete)`,
            batchInfo: {
              currentBatch: batchNum,
              totalBatches: totalBatches,
              insertedCount: insertedCount,
              totalRecords: observations.length,
              avgTimePerRecord: avgTimePerRecord.toFixed(1)
            }
          });
          
          console.log(`✓ Batch ${batchNum}/${totalBatches} completed in ${batchDuration}ms (${avgTimePerRecord.toFixed(1)}ms/record)`);
          console.log(`  Total inserted: ${insertedCount}/${observations.length} (${progressPercent}%)`);
          
          // Memory usage monitoring
          const memUsage = process.memoryUsage();
          const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);
          console.log(`  Memory usage: ${memMB}MB heap, ${Math.round(memUsage.rss / 1024 / 1024)}MB RSS`);
          
        } catch (batchError) {
          console.error(`✗ BATCH ERROR - Batch ${batchNum}/${totalBatches} failed:`, {
            error: batchError.message,
            batchSize: batch.length,
            recordRange,
            insertedSoFar: insertedCount,
            memoryUsage: process.memoryUsage()
          });
          throw batchError;
        }
        
        // Progress milestones
        if (insertedCount % 2500 === 0) {
          console.log(`=== PROGRESS MILESTONE: ${insertedCount} observations inserted ===`);
        }
        
        // Small delay to prevent overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      console.log(`✓ Successfully inserted ${insertedCount} observations total`);

      // Update all index tables and statistics with monitoring
      console.log(`[${new Date().toISOString()}] Starting post-insertion processing...`);
      const totalPostProcessingPhases = 5;
      let completedPhases = 0;
      
      const updatePostProcessingProgress = (phaseDescription: string, phaseProgress: number = 0, completed: boolean = false) => {
        const baseProgress = 50; // Post-processing starts at 50%
        const progressPerPhase = 10; // Each phase gets 10% (50-100%)
        
        // Calculate current progress within the current phase
        const currentPhaseProgress = phaseProgress * progressPerPhase / 100;
        const actualProgress = baseProgress + (completedPhases * progressPerPhase) + currentPhaseProgress;
        
        // Ensure progress doesn't exceed 100%
        const cappedProgress = Math.min(100, Math.round(actualProgress));
        
        const progressData = {
          progress: cappedProgress,
          phase: 'post-processing',
          message: completed ? `✓ ${phaseDescription} completed` : `${phaseDescription}`,
          batchInfo: {
            currentPhase: completedPhases + 1,
            totalPhases: totalPostProcessingPhases,
            phaseProgress: phaseProgress
          }
        };
        progressTracker.set(uploadId, progressData);
        
        // Send explicit completion signal if phase is done
        if (completed) {
          const completedProgress = Math.min(100, Math.round(baseProgress + ((completedPhases + 1) * progressPerPhase)));
          // Add "✓" prefix and "completed" suffix to clean phase description
          const completionMessage = `✓ ${phaseDescription} completed`;
          
          console.log('[SERVER PHASE DEBUG] Sending completion signal:', {
            uploadId,
            phaseDescription,
            completedPhases: completedPhases + 1,
            completionMessage,
            progress: completedProgress
          });
          
          setTimeout(() => {
            const progressUpdate = {
              ...progressData,
              progress: completedProgress,
              message: completionMessage,
              phase: 'post-processing',
              batchInfo: {
                currentPhase: completedPhases + 1,
                totalPhases: 5,
                phaseProgress: 100,
                phaseCompletedAt: new Date().toISOString()
              }
            };
            
            console.log('[SERVER PHASE DEBUG] Setting progress tracker:', progressUpdate);
            progressTracker.set(uploadId, progressUpdate);
          }, 100);
        }
      };
      
      try {
        // Phase 1: Classification updates FIRST (before statistics)
        console.log('Phase 1: Starting automated classification updates...');
        
        // Check for cancellation before classification updates
        if (cancelledUploads.has(uploadId)) {
          console.log(`Upload ${uploadId} cancelled before classification updates`);
          return;
        }
        
        updatePostProcessingProgress('Running automated classification updates', 0);
        const classificationStart = Date.now();
        await autoPopulateClassificationUpdates(uploadId, progressTracker);
        console.log(`✓ Automated classification updates completed in ${Date.now() - classificationStart}ms`);
        updatePostProcessingProgress('Automated classification updates', 100, true);
        completedPhases++;

        // Phase 2: Contributor statistics (after classification)
        console.log('Phase 2: Updating contributor statistics...');
        
        // Check for cancellation before contributor stats
        if (cancelledUploads.has(uploadId)) {
          console.log(`Upload ${uploadId} cancelled before contributor statistics`);
          return;
        }
        
        updatePostProcessingProgress('Updating contributor statistics', 0);
        const contribStart = Date.now();
        await updateContributorStatisticsScoped(uploadId, progressTracker);
        console.log(`✓ Contributor statistics completed in ${Date.now() - contribStart}ms`);
        updatePostProcessingProgress('Contributor statistics', 100, true);
        completedPhases++;
        
        // Phase 3: Species statistics (after classification)
        console.log('Phase 3: Updating species statistics...');
        
        // Check for cancellation before species stats
        if (cancelledUploads.has(uploadId)) {
          console.log(`Upload ${uploadId} cancelled before species statistics`);
          return;
        }
        
        updatePostProcessingProgress('Updating species statistics', 0);
        const speciesStart = Date.now();
        await updateSpeciesStatisticsScoped(uploadId, progressTracker);
        console.log(`✓ Species statistics completed in ${Date.now() - speciesStart}ms`);
        updatePostProcessingProgress('Species statistics', 100, true);
        completedPhases++;
        
        // Phase 4: GPS index building
        console.log('Phase 4: Building GPS index for map performance...');
        
        // Check for cancellation before GPS index
        if (cancelledUploads.has(uploadId)) {
          console.log(`Upload ${uploadId} cancelled before GPS index`);
          return;
        }
        
        updatePostProcessingProgress('Building GPS index for map performance', 0);
        const gpsStart = Date.now();
        await storage.buildGpsIndex();
        console.log(`✓ GPS index completed in ${Date.now() - gpsStart}ms`);
        updatePostProcessingProgress('GPS index', 100, true);
        completedPhases++;
        
        console.log('✓ All index tables updated successfully');

        // Phase 5: iNaturalist API sync
        console.log('Phase 5: Syncing iNaturalist API data for thumbnail and validation support...');
        
        // Check for cancellation before iNat sync
        if (cancelledUploads.has(uploadId)) {
          console.log(`Upload ${uploadId} cancelled before iNaturalist API sync`);
          return;
        }
        
        updatePostProcessingProgress('Syncing iNaturalist API data', 0);
        const inatSyncStart = Date.now();
        await syncUploadedInaturalistData(uploadId, progressTracker);
        console.log(`✓ iNaturalist API sync completed in ${Date.now() - inatSyncStart}ms`);
        updatePostProcessingProgress('iNaturalist API sync', 100, true);
        completedPhases++;

        // Get API call statistics for this upload
        const apiStats = storage.getUploadApiCallStats();
        
        // Update upload status
        console.log(`[${new Date().toISOString()}] Upload processing completed successfully`);
        console.log(`API Call Statistics: ${apiStats.totalCalls} total calls (${apiStats.cacheHits} cache hits, ${apiStats.cacheMisses} API calls, ${apiStats.newCacheEntries} new entries cached)`);
        
        const completionMessage = apiStats.totalCalls > 0 
          ? `✓ Successfully processed ${insertedCount.toLocaleString()} observations! iNaturalist API: ${apiStats.totalCalls} lookups (${apiStats.cacheHits} cached, ${apiStats.cacheMisses} new)`
          : `✓ Successfully processed ${insertedCount.toLocaleString()} observations!`;
        
        progressTracker.set(uploadId, {
          progress: 100,
          phase: 'completed',
          message: completionMessage,
          batchInfo: {
            totalRecords: insertedCount,
            processedRecords: insertedCount,
            apiCalls: apiStats.totalCalls,
            cacheHits: apiStats.cacheHits,
            newApiCalls: apiStats.cacheMisses,
            completedPhases: 5,
            totalPhases: 5
          }
        });
        await storage.updateUploadStatus(uploadId, 'completed');
        
      } catch (postError) {
        console.error(`✗ POST-INSERTION ERROR during processing:`, {
          error: postError.message,
          stack: postError.stack,
          uploadId,
          insertedRecords: insertedCount
        });
        await storage.updateUploadStatus(uploadId, 'failed', `Post-insertion error: ${postError.message}`);
        throw postError;
      }

      // Clean up uploaded file
      fs.unlinkSync(filePath);

    } catch (error) {
      console.error("Error processing Excel file:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await storage.updateUploadStatus(uploadId, 'failed', errorMessage);
      
      // Clean up uploaded file
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkError) {
        console.error("Error deleting file:", unlinkError);
      }
    } finally {
      // Clean up cancellation tracking regardless of success/failure
      if (cancelledUploads.has(uploadId)) {
        cancelledUploads.delete(uploadId);
        console.log(`Cleaned up cancellation tracking for upload ${uploadId}`);
      }
    }
  }



  // Serve original Excel file for download
  app.get("/api/export/original", (req, res) => {
    try {
      const filePath = path.join(__dirname, '../attached_assets/Validated Observations05.30.25.xlsx');
      const fileName = 'Validated_Observations_05.30.25.xlsx';
      
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      
      res.sendFile(path.resolve(filePath), (err) => {
        if (err) {
          console.error('Error sending file:', err);
          res.status(404).json({ error: 'Original dataset file not found' });
        }
      });
    } catch (error) {
      console.error('Error serving original Excel file:', error);
      res.status(500).json({ error: 'Failed to serve original dataset file' });
    }
  });

  // Use the cached iNaturalist API genus lookup function from storage
  async function lookupGenusFromInat(genusName: string) {
    return await storage.lookupGenusClassificationWithCache(genusName);
  }

  // Helper function to validate genus names and skip invalid ones
  function isInvalidGenusName(genusCandidate: string): boolean {
    // Skip empty or too short names
    if (!genusCandidate || genusCandidate.length < 2) return true;
    
    // Skip URLs and paths
    if (genusCandidate.includes('http') || genusCandidate.includes('www.') || 
        genusCandidate.includes('.com') || genusCandidate.includes('/') ||
        genusCandidate.includes('mycomap.com') || genusCandidate.includes('blast-search')) return true;
    
    // Skip taxonomic ranks that shouldn't be genus names
    const invalidRanks = [
      'fungi', 'basidiomycota', 'ascomycota', 'agaricales', 'boletales', 
      'polyporales', 'russulales', 'cantharellales', 'helotiales', 'xylariales',
      'agaricaceae', 'boletaceae', 'polyporaceae', 'russulaceae', 'tricholomataceae',
      'agaricineae', 'hygrophorineae', 'phalloideae', 'ingratae', 'lyophyllaceae'
    ];
    
    if (invalidRanks.includes(genusCandidate)) return true;
    
    // Skip names with numbers at the end (indicates duplicates/variants)
    if (/\d+$/.test(genusCandidate)) return true;
    
    // Skip names that are clearly not genus names
    if (genusCandidate.includes('sp.') || genusCandidate.includes('spp.') || 
        genusCandidate === 'unknown' || genusCandidate === 'unidentified') return true;
    
    return false;
  }

  async function autoPopulateClassificationUpdates(uploadId: number, progressTracker: Map<number, any>) {
    console.log('Starting automated classification updates by genus matching...');
    
    try {
      // Get only observations from this upload that need classification updates
      const uploadObservations = await storage.getObservationsFromUpload(uploadId);
      const classificationUpdates = uploadObservations.filter(obs => obs.classificationUpdate === true);
      console.log(`Found ${classificationUpdates.length} records from upload ${uploadId} needing classification updates (out of ${uploadObservations.length} total uploaded records)`);
      
      if (classificationUpdates.length === 0) {
        console.log('No classification updates needed');
        return;
      }
      
      // Get all observations that have complete taxonomy (to use as reference)
      const allObservations = await storage.getAllObservations();
      
      // Create a genus lookup map from complete taxonomy records
      const genusLookup = new Map();
      
      allObservations.forEach(obs => {
        if (obs.genus && obs.kingdom && obs.phylum && obs.class && 
            obs.order && obs.family) {
          // Only use records with complete taxonomy as reference
          const genusKey = obs.genus.toLowerCase().trim();
          if (!genusLookup.has(genusKey)) {
            genusLookup.set(genusKey, {
              kingdom: obs.kingdom,
              phylum: obs.phylum,
              class: obs.class,
              order: obs.order,
              family: obs.family,
              genus: obs.genus
            });
          }
        }
      });
      
      console.log(`Built genus lookup table with ${genusLookup.size} complete taxonomy references`);
      
      let updatedCount = 0;
      let inatLookupCount = 0;
      const batchSize = 100;
      const totalBatches = Math.ceil(classificationUpdates.length / batchSize);
      let processedRecords = 0;
      
      // Process classification updates in batches with progress tracking
      for (let i = 0; i < classificationUpdates.length; i += batchSize) {
        const batch = classificationUpdates.slice(i, i + batchSize);
        const currentBatch = Math.floor(i/batchSize) + 1;
        const batchStartTime = Date.now();
        
        console.log(`Processing batch ${currentBatch} of ${totalBatches}`);
        
        // Update progress tracker for classification phase (now Phase 1: 50-60%)
        const progressPercent = Math.round(50 + ((processedRecords / classificationUpdates.length) * 10)); // 50-60% for classification
        progressTracker.set(uploadId, {
          progress: progressPercent,
          phase: 'classification-updates',
          message: `Running classification updates: batch ${currentBatch}/${totalBatches} (${updatedCount} updated)`,
          batchInfo: {
            currentBatch: currentBatch,
            totalBatches: totalBatches,
            processedRecords: processedRecords,
            totalRecords: classificationUpdates.length,
            updatedCount: updatedCount,
            inatLookups: inatLookupCount
          }
        });
        
        for (const record of batch) {
          try {
            // Extract first word from Species, Variety, or Scientific Name
            let genusCandidate = null;
            
            if (record.species) {
              genusCandidate = record.species.split(' ')[0].toLowerCase().trim();
            } else if (record.infraspecies) { // Variety field
              genusCandidate = record.infraspecies.split(' ')[0].toLowerCase().trim();
            } else if (record.scientificName) {
              genusCandidate = record.scientificName.split(' ')[0].toLowerCase().trim();
            }
            
            console.log(`Record ${record.id}: species="${record.species}", variety="${record.infraspecies}", scientificName="${record.scientificName}" → genus candidate: "${genusCandidate}"`);
            
            if (!genusCandidate) {
              continue; // Skip if no genus candidate found
            }
            
            // Data validation - skip invalid genus names
            if (isInvalidGenusName(genusCandidate)) {
              console.log(`⚠ Skipping invalid genus name: "${genusCandidate}" in record ${record.id}`);
              continue;
            }
            
            let taxonomyRef = null;
            let source = '';
            
            // First try local genus lookup - but only if it has complete taxonomy
            if (genusLookup.has(genusCandidate)) {
              const localMatch = genusLookup.get(genusCandidate);
              // Verify the local match has complete taxonomy
              if (localMatch.kingdom && localMatch.phylum && localMatch.class && 
                  localMatch.order && localMatch.family) {
                taxonomyRef = localMatch;
                source = 'local database';
              } else {
                console.log(`Local match for "${genusCandidate}" has incomplete taxonomy, trying iNaturalist API...`);
                taxonomyRef = await lookupGenusFromInat(genusCandidate);
                if (taxonomyRef) {
                  source = 'iNaturalist API';
                  inatLookupCount++;
                  
                  // Cache the iNaturalist result for future use
                  genusLookup.set(genusCandidate, taxonomyRef);
                }
              }
            } else {
              // Fallback to iNaturalist API lookup
              console.log(`No local match for "${genusCandidate}", trying iNaturalist API...`);
              taxonomyRef = await lookupGenusFromInat(genusCandidate);
              if (taxonomyRef) {
                source = 'iNaturalist API';
                inatLookupCount++;
                
                // Cache the iNaturalist result for future use
                genusLookup.set(genusCandidate, taxonomyRef);
              }
            }
            
            if (taxonomyRef) {
              // Update the record with missing taxonomy
              const updateData = {
                kingdom: record.kingdom || taxonomyRef.kingdom,
                phylum: record.phylum || taxonomyRef.phylum,
                class: record.class || taxonomyRef.class,
                order: record.order || taxonomyRef.order,
                family: record.family || taxonomyRef.family,
                genus: record.genus || taxonomyRef.genus,
                classificationUpdate: false // Remove the flag
              };
              
              // Use storage method to update the observation
              await storage.updateObservationTaxonomy(record.id, updateData);
              updatedCount++;
              
              console.log(`✓ Updated record ${record.id}: "${genusCandidate}" matched to ${taxonomyRef.genus} family (${source})`);
            } else {
              console.log(`⚠ No taxonomy found for genus "${genusCandidate}" in record ${record.id}`);
            }
          } catch (recordError) {
            console.error(`Error updating record ${record.id}:`, recordError);
          }
          
          processedRecords++;
        }
        
        // Update progress after each batch completion
        const batchDuration = Date.now() - batchStartTime;
        const avgTimePerRecord = batchDuration / batch.length;
        const remainingBatches = totalBatches - currentBatch;
        const estimatedTimeRemaining = remainingBatches * (batchDuration / 1000);
        
        console.log(`✓ Batch ${currentBatch}/${totalBatches} completed in ${batchDuration}ms (${avgTimePerRecord.toFixed(1)}ms/record)`);
        console.log(`  Records processed: ${processedRecords}/${classificationUpdates.length}, Updated: ${updatedCount}, iNat lookups: ${inatLookupCount}`);
        console.log(`  Estimated time remaining: ${estimatedTimeRemaining.toFixed(1)} seconds`);
        
        // Final progress update for this batch
        const finalProgressPercent = Math.round(50 + ((processedRecords / classificationUpdates.length) * 10));
        progressTracker.set(uploadId, {
          progress: finalProgressPercent,
          phase: 'classification-updates',
          message: `Classification updates: batch ${currentBatch}/${totalBatches} complete (${updatedCount} updated)`,
          batchInfo: {
            currentBatch: currentBatch,
            totalBatches: totalBatches,
            processedRecords: processedRecords,
            totalRecords: classificationUpdates.length,
            updatedCount: updatedCount,
            inatLookups: inatLookupCount,
            estimatedTimeRemaining: estimatedTimeRemaining.toFixed(1)
          }
        });
      }
      
      // Mark classification phase as completed
      progressTracker.set(uploadId, {
        progress: 60,
        phase: 'classification-updates', 
        message: `✓ Classification updates completed: ${updatedCount} records updated`,
        batchInfo: {
          currentBatch: totalBatches,
          totalBatches: totalBatches,
          processedRecords: processedRecords,
          totalRecords: classificationUpdates.length,
          updatedCount: updatedCount,
          inatLookups: inatLookupCount
        }
      });
      
      console.log(`✓ Automated classification updates completed:`);
      console.log(`  - Total records updated: ${updatedCount}`);
      console.log(`  - iNaturalist API lookups: ${inatLookupCount}`);
      console.log(`  - Local database matches: ${updatedCount - inatLookupCount}`);
      
    } catch (error) {
      console.error('Error in automated classification updates:', error);
    }
  }

  // Red List assessments routes
  app.get("/api/redlist-assessments", async (req, res) => {
    try {
      const assessments = await storage.getRedlistAssessments();
      res.json(assessments);
    } catch (error) {
      console.error('Error fetching Red List assessments:', error);
      res.status(500).json({ error: 'Failed to fetch Red List assessments' });
    }
  });

  // Upload and process Red List CSV
  app.post("/api/redlist-upload", uploadMemory.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log(`Processing Red List CSV upload: ${req.file.originalname}`);
      
      // Process the CSV file using csv-parser for proper handling of quoted values
      const assessments: any[] = [];
      let processedCount = 0;
      let errorCount = 0;
      
      // Convert buffer to string and create a readable stream
      const csvString = req.file.buffer.toString('utf-8');
      const { Readable } = await import('stream');
      
      await new Promise<void>((resolve, reject) => {
        Readable.from([csvString])
          .pipe(csv())
          .on('data', (row: any) => {
            try {
              // Get scientific name from various possible column headers
              const scientificName = row.scientificName || row['Scientific Name'] || row['scientific_name'] || row.taxonname || row['Taxon Name'];
              if (!scientificName?.trim()) return;
              
              const assessment = {
                assessmentId: row.assessmentId || row['Assessment ID'] || `auto-${Date.now()}-${processedCount}`,
                internalTaxonId: row.internalTaxonId || row['Internal Taxon ID'] || null,
                scientificName: scientificName.trim(),
                redlistCategory: row.redlistCategory || row['Redlist Category'] || row.category || null,
                redlistCriteria: row.redlistCriteria || row['Redlist Criteria'] || row.criteria || null,
                yearPublished: row.yearPublished || row['Year Published'] ? parseInt(row.yearPublished || row['Year Published']) : null,
                assessmentDate: row.assessmentDate || row['Assessment Date'] ? new Date(row.assessmentDate || row['Assessment Date']) : null,
                criteriaVersion: row.criteriaVersion || row['Criteria Version'] || null,
                language: row.language || row.Language || null,
                rationale: row.rationale || row.Rationale || null,
                habitat: row.habitat || row.Habitat || null,
                threats: row.threats || row.Threats || null,
                population: row.population || row.Population || null,
                populationTrend: row.populationTrend || row['Population Trend'] || null,
                range: row.range || row.Range || null,
                useTrade: row.useTrade || row['Use Trade'] || null,
                systems: row.systems || row.Systems || null,
                conservationActions: row.conservationActions || row['Conservation Actions'] || null,
                realm: row.realm || row.Realm || null,
                yearLastSeen: row.yearLastSeen || row['Year Last Seen'] ? parseInt(row.yearLastSeen || row['Year Last Seen']) : null,
                possiblyExtinct: (row.possiblyExtinct || row['Possibly Extinct']) === 'true',
                possiblyExtinctInTheWild: (row.possiblyExtinctInTheWild || row['Possibly Extinct in the Wild']) === 'true',
                scopes: row.scopes || row.Scopes || null
              };
              
              assessments.push(assessment);
              processedCount++;
            } catch (rowError) {
              console.error(`Error processing row:`, rowError);
              errorCount++;
            }
          })
          .on('end', resolve)
          .on('error', reject);
      });
      
      console.log(`Parsed ${assessments.length} Red List assessments from CSV`);
      
      // Save to database with conflict handling
      const savedAssessments = await storage.createRedlistAssessments(assessments);
      const savedCount = savedAssessments.length;
      
      console.log(`✓ Red List upload completed: ${savedCount} assessments saved`);
      
      res.json({
        success: true,
        message: `Successfully processed ${savedCount} Red List assessments`,
        stats: {
          totalProcessed: processedCount,
          saved: savedCount,
          errors: errorCount
        }
      });
      
    } catch (error) {
      console.error('Error processing Red List upload:', error);
      res.status(500).json({ 
        error: 'Failed to process Red List upload',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Clear Red List assessments
  app.delete("/api/redlist-assessments", async (req, res) => {
    try {
      await storage.clearRedlistAssessments();
      res.json({ success: true, message: 'All Red List assessments cleared' });
    } catch (error) {
      console.error('Error clearing Red List assessments:', error);
      res.status(500).json({ error: 'Failed to clear Red List assessments' });
    }
  });

  // iNaturalist data endpoints
  app.get("/api/inaturalist", async (req, res) => {
    try {
      const { observationId } = req.query;
      const data = await storage.getInaturalistData(observationId as string);
      res.json(data);
    } catch (error) {
      console.error("Error fetching iNaturalist data:", error);
      res.status(500).json({ error: "Failed to fetch iNaturalist data" });
    }
  });

  // Global sync state tracking
  let syncProgress = {
    isRunning: false,
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    errors: [] as Array<{observationId: string, error: string}>,
    startTime: null as Date | null,
    endTime: null as Date | null
  };

  // Rate limiter for iNaturalist API (60 requests per minute for unauthenticated)
  let lastRequestTime = 0;
  const RATE_LIMIT_DELAY = 1100; // 1.1 seconds between requests (safe margin)

  async function rateLimitedDelay() {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
      const delayNeeded = RATE_LIMIT_DELAY - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delayNeeded));
    }
    lastRequestTime = Date.now();
  }

  app.post("/api/inaturalist/sync/:observationId", async (req, res) => {
    try {
      const { observationId } = req.params;
      console.log(`[iNaturalist] Syncing observation ${observationId}`);
      
      await rateLimitedDelay();
      const result = await storage.syncObservationWithInaturalist(observationId);
      if (result) {
        // Auto-upload to IPFS if observation is now fully validated
        await checkAndAutoUploadToIPFS(observationId, 'iNaturalist sync');
        res.json({ success: true, data: result });
      } else {
        res.status(404).json({ error: "Failed to sync observation" });
      }
    } catch (error) {
      console.error("Error syncing iNaturalist data:", error);
      res.status(500).json({ error: "Failed to sync iNaturalist data" });
    }
  });

  // Bulk sync endpoint
  app.post("/api/inaturalist/sync-bulk", async (req, res) => {
    if (syncProgress.isRunning) {
      return res.status(409).json({ error: "Sync already in progress" });
    }

    try {
      const { limit = 50, source = 'all' } = req.body;
      
      // Get observations with same filtering as validation page
      const observations = await storage.getAllObservations();
      
      // Filter by source if specified
      let filteredObs = observations;
      if (source === 'inaturalist') {
        filteredObs = observations.filter(obs => obs.source?.toLowerCase() === 'inaturalist');
      } else if (source === 'mo') {
        filteredObs = observations.filter(obs => obs.source?.toLowerCase() === 'mushroom observer');
      }
      
      // Apply limit and filter to only unsynced iNaturalist observations
      const limitedObs = filteredObs.slice(0, parseInt(limit));
      const unsynced = limitedObs.filter(obs => 
        obs.source?.toLowerCase() === 'inaturalist' && obs.inatSyncStatus !== 'success'
      );

      syncProgress = {
        isRunning: true,
        total: unsynced.length,
        processed: 0,
        successful: 0,
        failed: 0,
        errors: [],
        startTime: new Date(),
        endTime: null
      };

      res.json({ success: true, message: `Starting sync of ${unsynced.length} observations` });

      // Process observations in background
      (async () => {
        for (const obs of unsynced) {
          try {
            await rateLimitedDelay();
            console.log(`[Bulk Sync] Processing ${obs.observationId} (${syncProgress.processed + 1}/${syncProgress.total})`);
            
            const result = await storage.syncObservationWithInaturalist(obs.observationId);
            if (result) {
              syncProgress.successful++;
            } else {
              syncProgress.failed++;
              syncProgress.errors.push({
                observationId: obs.observationId,
                error: "Sync returned null result"
              });
            }
          } catch (error) {
            syncProgress.failed++;
            syncProgress.errors.push({
              observationId: obs.observationId,
              error: error instanceof Error ? error.message : String(error)
            });
            console.error(`[Bulk Sync] Failed to sync ${obs.observationId}:`, error);
          }
          syncProgress.processed++;
        }
        
        syncProgress.isRunning = false;
        syncProgress.endTime = new Date();
        console.log(`[Bulk Sync] Completed: ${syncProgress.successful} successful, ${syncProgress.failed} failed`);
      })();

    } catch (error) {
      syncProgress.isRunning = false;
      console.error("Error starting bulk sync:", error);
      res.status(500).json({ error: "Failed to start bulk sync" });
    }
  });

  // Sync progress endpoint
  app.get("/api/inaturalist/sync-progress", (req, res) => {
    res.json(syncProgress);
  });

  // Reset sync progress
  app.post("/api/inaturalist/sync-reset", (req, res) => {
    syncProgress = {
      isRunning: false,
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [],
      startTime: null,
      endTime: null
    };
    res.json({ success: true, message: "Sync progress reset" });
  });

  // Individual observation sync endpoint - unified for both iNaturalist and MO
  app.post("/api/inaturalist/sync/:id", async (req, res) => {
    try {
      const observationId = req.params.id;
      console.log(`[Individual Sync] Starting sync for observation ${observationId}`);
      
      // Get the observation to determine its source
      const allObservations = await storage.getAllObservations();
      const observation = allObservations.find(obs => obs.observationId === observationId);
      
      if (!observation) {
        return res.status(404).json({ error: "Observation not found" });
      }

      let result;
      let source = 'external';
      
      if (observation.source?.toLowerCase() === 'mo observations') {
        console.log(`[Individual Sync] Syncing with Mushroom Observer for ${observationId}`);
        result = await storage.syncObservationWithMushroomObserver(observationId);
        source = 'mo';
      } else if (observation.source?.toLowerCase() === 'inaturalist') {
        console.log(`[Individual Sync] Syncing with iNaturalist for ${observationId}`);
        result = await storage.syncObservationWithInaturalist(observationId);
        source = 'inaturalist';
      } else {
        return res.status(400).json({ error: "Only iNaturalist and Mushroom Observer observations can be synced" });
      }
      
      if (!result) {
        return res.status(404).json({ error: "Failed to sync observation" });
      }

      // Auto-upload to IPFS if observation is now fully validated
      await checkAndAutoUploadToIPFS(observationId, `${source} sync`);

      res.json({
        success: true,
        data: result,
        source: source
      });
    } catch (error) {
      console.error(`[Individual Sync] Error syncing observation:`, error);
      res.status(500).json({ error: "Failed to sync observation" });
    }
  });

  // Mushroom Observer sync endpoint - alias to the unified sync endpoint
  app.post("/api/mushroom-observer/sync/:id", async (req, res) => {
    try {
      const observationId = req.params.id;
      console.log(`[MO Sync] Starting sync for observation ${observationId}`);
      
      // Get the observation to verify it's from MO
      const allObservations = await storage.getAllObservations();
      const observation = allObservations.find(obs => obs.observationId === observationId);
      
      if (!observation) {
        return res.status(404).json({ error: "Observation not found" });
      }

      if (observation.source?.toLowerCase() !== 'mo observations') {
        return res.status(400).json({ error: "Only Mushroom Observer observations can be synced via this endpoint" });
      }
      
      console.log(`[MO Sync] Syncing with Mushroom Observer for ${observationId}`);
      const result = await storage.syncObservationWithMushroomObserver(observationId);
      
      if (!result) {
        return res.status(404).json({ error: "Failed to sync observation" });
      }

      // Auto-upload to IPFS if observation is now fully validated
      await checkAndAutoUploadToIPFS(observationId, 'MO sync');

      res.json({
        success: true,
        data: result,
        source: 'mo'
      });
    } catch (error) {
      console.error(`[MO Sync] Error syncing observation:`, error);
      res.status(500).json({ error: "Failed to sync observation" });
    }
  });

  // Get observations with missing photos
  app.get("/api/inaturalist/missing-photos", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const missingPhotos = await storage.getObservationsWithMissingPhotos(limit);
      res.json(missingPhotos);
    } catch (error) {
      console.error("Error fetching observations with missing photos:", error);
      res.status(500).json({ error: "Failed to fetch observations with missing photos" });
    }
  });

  // Bulk sync missing photos
  app.post("/api/inaturalist/sync-missing-photos", async (req, res) => {
    try {
      if (syncProgress.isRunning) {
        return res.status(409).json({ error: "Sync already in progress" });
      }

      const { limit = 50 } = req.body;
      
      // Get observations with missing photos
      const missingPhotos = await storage.getObservationsWithMissingPhotos(limit);
      
      if (missingPhotos.length === 0) {
        return res.json({ message: "No observations with missing photos found" });
      }

      // Start sync process
      syncProgress = {
        isRunning: true,
        total: missingPhotos.length,
        processed: 0,
        successful: 0,
        failed: 0,
        errors: [],
        startTime: new Date(),
        endTime: null
      };

      // Process in background
      (async () => {
        for (const obs of missingPhotos) {
          try {
            await rateLimitedDelay();
            const result = await storage.syncObservationWithInaturalist(obs.observationId);
            if (result) {
              syncProgress.successful++;
            } else {
              syncProgress.failed++;
              syncProgress.errors.push({
                observationId: obs.observationId,
                error: "Sync returned null"
              });
            }
          } catch (error) {
            syncProgress.failed++;
            syncProgress.errors.push({
              observationId: obs.observationId,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
          syncProgress.processed++;
        }
        syncProgress.isRunning = false;
        syncProgress.endTime = new Date();
      })();

      res.json({ 
        message: `Started syncing photos for ${missingPhotos.length} observations`,
        total: missingPhotos.length
      });

    } catch (error) {
      console.error("Error starting photo sync:", error);
      res.status(500).json({ error: "Failed to start photo sync" });
    }
  });

  app.get("/api/observations/validation", async (req, res) => {
    try {
      const { limit = 50, source = 'all', syncStatus = 'all', validationStatus = 'all', search, fullyValidated } = req.query;
      
      console.log(`[API] Validation query - source: ${source}, syncStatus: ${syncStatus}, validationStatus: ${validationStatus}, search: ${search}, fullyValidated: ${fullyValidated}, limit: ${limit}`);
      const startTime = Date.now();
      
      // Use the optimized validation query that leverages database indexes
      const validationData = await (storage as any).getValidationData({
        limit: parseInt(limit as string),
        source: source as string,
        syncStatus: syncStatus as string,
        validationStatus: validationStatus as string,
        search: search as string,
        fullyValidated: fullyValidated === 'true'
      });
      
      const queryTime = Date.now() - startTime;
      console.log(`[API] Validation query completed in ${queryTime}ms, returned ${validationData.length} records`);
      
      res.json(validationData);
    } catch (error) {
      console.error("Error fetching validation data:", error);
      res.status(500).json({ error: "Failed to fetch validation data" });
    }
  });

  // BLAST file download endpoints
  app.post("/api/observations/:id/download-blast", async (req, res) => {
    try {
      const observationId = req.params.id;
      const { blastUrl } = req.body;

      if (!blastUrl) {
        return res.status(400).json({ error: "BLAST URL is required" });
      }

      console.log(`[BLAST] Starting download for observation ${observationId}`);
      
      // Download BLAST files
      const result = await blastDownloader.downloadBlastFiles(observationId, blastUrl);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      // Update observation record with BLAST file information
      await db.update(observations)
        .set({
          mycoMapBlastUrl: blastUrl,
          ncbiBlastFile: result.ncbiPath ? path.basename(result.ncbiPath) : null,
          localBlastFile: result.localPath ? path.basename(result.localPath) : null,
          blastFilesDownloaded: true,
          blastDownloadDate: new Date()
        })
        .where(eq(observations.observationId, observationId));

      // Auto-upload to IPFS if observation is now fully validated
      await checkAndAutoUploadToIPFS(observationId, 'BLAST download');

      res.json({
        success: true,
        ncbiFile: result.ncbiPath ? path.basename(result.ncbiPath) : null,
        localFile: result.localPath ? path.basename(result.localPath) : null
      });

    } catch (error) {
      console.error(`[BLAST] Error downloading files:`, error);
      res.status(500).json({ error: "Failed to download BLAST files" });
    }
  });

  // Check BLAST file status
  app.get("/api/observations/:id/blast-status", async (req, res) => {
    try {
      const observationId = req.params.id;
      const { ncbiExists, localExists } = await blastDownloader.checkExistingFiles(observationId);
      
      res.json({
        ncbiExists,
        localExists,
        bothExist: ncbiExists && localExists
      });
    } catch (error) {
      console.error(`[BLAST] Error checking file status:`, error);
      res.status(500).json({ error: "Failed to check BLAST file status" });
    }
  });

  // Serve downloaded BLAST files
  app.get("/api/blast-files/:filename", (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(process.cwd(), 'downloads', 'blast', filename);
      
      console.log(`[BLAST] Serving file: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
        console.log(`[BLAST] File not found: ${filePath}`);
        return res.status(404).json({ error: "File not found" });
      }

      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.sendFile(path.resolve(filePath));
    } catch (error) {
      console.error(`[BLAST] Error serving file:`, error);
      res.status(500).json({ error: "Failed to serve file" });
    }
  });

  // Trace file download endpoints
  app.post("/api/observations/:id/download-trace", async (req, res) => {
    try {
      const observationId = req.params.id;
      const { traceUrl } = req.body;

      if (!traceUrl) {
        return res.status(400).json({ error: "Trace URL is required" });
      }

      console.log(`[TRACE] Starting download for observation ${observationId}`);
      
      // Download trace files
      const result = await blastDownloader.downloadTraceFiles(observationId, traceUrl);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      // Update observation record with trace file information
      await db.update(observations)
        .set({
          mycoMapTraceUrl: traceUrl,
          fastqFile: result.fastqPath ? path.basename(result.fastqPath) : null,
          traceFilesDownloaded: true,
          traceDownloadDate: new Date()
        })
        .where(eq(observations.observationId, observationId));

      // Auto-upload to IPFS if observation is now fully validated
      await checkAndAutoUploadToIPFS(observationId, 'trace download');

      res.json({
        success: true,
        fastqFile: result.fastqPath ? path.basename(result.fastqPath) : null
      });

    } catch (error) {
      console.error(`[TRACE] Error downloading files:`, error);
      res.status(500).json({ error: "Failed to download trace files" });
    }
  });

  // Check trace file status
  app.get("/api/observations/:id/trace-status", async (req, res) => {
    try {
      const observationId = req.params.id;
      const { fastqExists } = await blastDownloader.checkExistingTraceFiles(observationId);
      
      res.json({
        fastqExists
      });
    } catch (error) {
      console.error(`[TRACE] Error checking file status:`, error);
      res.status(500).json({ error: "Failed to check trace file status" });
    }
  });

  // Serve downloaded trace files
  app.get("/api/trace-files/:filename", (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(process.cwd(), 'downloads', 'trace', filename);
      
      console.log(`[TRACE] Working directory: ${process.cwd()}`);
      console.log(`[TRACE] Serving file: ${filePath}`);
      console.log(`[TRACE] File exists: ${fs.existsSync(filePath)}`);
      
      if (!fs.existsSync(filePath)) {
        console.log(`[TRACE] File not found: ${filePath}`);
        return res.status(404).json({ error: "File not found" });
      }

      const absolutePath = path.resolve(filePath);
      console.log(`[TRACE] Absolute path: ${absolutePath}`);
      
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.sendFile(absolutePath);
    } catch (error) {
      console.error(`[TRACE] Error serving file:`, error);
      res.status(500).json({ error: "Failed to serve file" });
    }
  });

  // Fetch missing iNaturalist observation photos
  app.post('/api/observations/:id/fetch-photos', async (req, res) => {
    try {
      const observationId = req.params.id;
      
      // Check if we already have photo data for this observation
      const existingData = await storage.getInaturalistData(observationId);
      if (existingData.length > 0 && existingData[0].photos && existingData[0].photos.length > 0) {
        return res.json({ 
          success: true, 
          message: 'Photos already exist',
          photoCount: existingData[0].photos.length 
        });
      }

      // Fetch from iNaturalist API
      const inatApiUrl = `https://api.inaturalist.org/v1/observations/${observationId}`;
      const response = await fetch(inatApiUrl);
      
      if (!response.ok) {
        throw new Error(`iNaturalist API responded with status: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.results || data.results.length === 0) {
        return res.status(404).json({ error: 'Observation not found on iNaturalist' });
      }

      const observation = data.results[0];
      const photos = observation.photos || [];
      const photoUrls = photos.map((photo: any) => photo.url || photo.url_original || photo.url_medium);

      // Update or create iNaturalist data record
      if (existingData.length > 0) {
        await storage.updateInaturalistData(observationId, {
          photos: photoUrls,
          lastSyncedAt: new Date(),
          syncStatus: 'success'
        });
      } else {
        await storage.createInaturalistData({
          observationId: observationId,
          inatId: observation.id.toString(),
          photos: photoUrls,
          quality: observation.quality_grade,
          captive: observation.captive,
          geoprivacy: observation.geoprivacy,
          licenseCode: observation.license_code,
          lastSyncedAt: new Date(),
          syncStatus: 'success'
        });
      }

      res.json({
        success: true,
        photoCount: photoUrls.length,
        photos: photoUrls
      });

    } catch (error) {
      console.error(`Error fetching photos for observation ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to fetch observation photos' });
    }
  });

  // Batch fetch missing photos for multiple observations
  app.post('/api/observations/batch-fetch-photos', async (req, res) => {
    try {
      const { observationIds, limit = 10 } = req.body;
      
      if (!observationIds || !Array.isArray(observationIds)) {
        return res.status(400).json({ error: 'observationIds array is required' });
      }

      const results = [];
      const limitedIds = observationIds.slice(0, Math.min(limit, 50)); // Limit to prevent API abuse

      for (const observationId of limitedIds) {
        try {
          // Check if we already have photo data
          const existingData = await storage.getInaturalistData(observationId);
          if (existingData.length > 0 && existingData[0].photos && existingData[0].photos.length > 0) {
            results.push({ observationId, status: 'already_exists', photoCount: existingData[0].photos.length });
            continue;
          }

          // Fetch from iNaturalist API with rate limiting
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between requests
          
          const inatApiUrl = `https://api.inaturalist.org/v1/observations/${observationId}`;
          const response = await fetch(inatApiUrl);
          
          if (!response.ok) {
            results.push({ observationId, status: 'error', error: `API status: ${response.status}` });
            continue;
          }

          const data = await response.json();
          
          if (!data.results || data.results.length === 0) {
            results.push({ observationId, status: 'not_found' });
            continue;
          }

          const observation = data.results[0];
          const photos = observation.photos || [];
          const photoUrls = photos.map((photo: any) => photo.url || photo.url_original || photo.url_medium);

          // Update or create iNaturalist data record
          if (existingData.length > 0) {
            await storage.updateInaturalistData(observationId, {
              photos: photoUrls,
              lastSyncedAt: new Date(),
              syncStatus: 'success'
            });
          } else {
            await storage.createInaturalistData({
              observationId: observationId,
              inatId: observation.id.toString(),
              photos: photoUrls,
              quality: observation.quality_grade,
              captive: observation.captive,
              geoprivacy: observation.geoprivacy,
              licenseCode: observation.license_code,
              lastSyncedAt: new Date(),
              syncStatus: 'success'
            });
          }

          results.push({ observationId, status: 'success', photoCount: photoUrls.length });

        } catch (error) {
          results.push({ observationId, status: 'error', error: error.message });
        }
      }

      res.json({
        success: true,
        processed: results.length,
        results: results
      });

    } catch (error) {
      console.error(`Error in batch photo fetch:`, error);
      res.status(500).json({ error: 'Failed to batch fetch photos' });
    }
  });

  // Download iNaturalist API file endpoint
  app.get('/api/download/inat-api/:filename', (req: Request, res: Response) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(process.cwd(), 'downloads', 'inat_api', filename);
      
      console.log(`[iNat API] Working directory: ${process.cwd()}`);
      console.log(`[iNat API] Serving file: ${filePath}`);
      console.log(`[iNat API] File exists: ${fs.existsSync(filePath)}`);
      
      if (!fs.existsSync(filePath)) {
        console.log(`[iNat API] File not found: ${filePath}`);
        return res.status(404).json({ error: "File not found" });
      }

      const absolutePath = path.resolve(filePath);
      console.log(`[iNat API] Absolute path: ${absolutePath}`);
      
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.sendFile(absolutePath);
    } catch (error) {
      console.error(`[iNat API] Error serving file:`, error);
      res.status(500).json({ error: "Failed to serve file" });
    }
  });

  // Download Mushroom Observer API file endpoint
  app.get('/api/download/mo-api/:filename', (req: Request, res: Response) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(process.cwd(), 'downloads', 'mo_api', filename);
      
      console.log(`[MO API] Working directory: ${process.cwd()}`);
      console.log(`[MO API] Serving file: ${filePath}`);
      console.log(`[MO API] File exists: ${fs.existsSync(filePath)}`);
      
      if (!fs.existsSync(filePath)) {
        console.log(`[MO API] File not found: ${filePath}`);
        return res.status(404).json({ error: "File not found" });
      }

      const absolutePath = path.resolve(filePath);
      console.log(`[MO API] Absolute path: ${absolutePath}`);
      
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.sendFile(absolutePath);
    } catch (error) {
      console.error(`[MO API] Error serving file:`, error);
      res.status(500).json({ error: "Failed to serve file" });
    }
  });

  // MyCoPortal API sync endpoint
  app.post('/api/sync/mycoportal/:observationId', async (req: Request, res: Response) => {
    try {
      const observationId = (req as any).params.observationId;
      console.log(`[MyCoPortal API] Syncing observation: ${observationId}`);

      const result = await storage.syncObservationWithMycoportal(observationId);
      
      if (result) {
        res.json({
          success: true,
          data: result,
          message: 'MyCoPortal sync completed successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Failed to sync with MyCoPortal API'
        });
      }
    } catch (error) {
      console.error(`[MyCoPortal API] Sync error:`, error);
      res.status(500).json({
        success: false,
        error: 'MyCoPortal sync failed'
      });
    }
  });

  // Download MyCoPortal API file endpoint
  app.get('/api/download/mycoportal-api/:filename', (req: Request, res: Response) => {
    try {
      const filename = (req as any).params.filename;
      const filePath = path.join(process.cwd(), 'downloads', 'mycoportal_api', filename);
      
      console.log(`[MyCoPortal API] Working directory: ${process.cwd()}`);
      console.log(`[MyCoPortal API] Serving file: ${filePath}`);
      console.log(`[MyCoPortal API] File exists: ${fs.existsSync(filePath)}`);
      
      if (!fs.existsSync(filePath)) {
        console.log(`[MyCoPortal API] File not found: ${filePath}`);
        return (res as any).status(404).json({ error: "File not found" });
      }

      const absolutePath = path.resolve(filePath);
      console.log(`[MyCoPortal API] Resolved path: ${absolutePath}`);

      (res as any).setHeader('Content-Type', 'text/plain');
      (res as any).setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      (res as any).sendFile(absolutePath);
    } catch (error) {
      console.error(`[MyCoPortal API] Download error:`, error);
      return (res as any).status(500).json({ error: "Failed to download file" });
    }
  });

  // Mushroom Observer API lookup endpoint for BioRecord Image Generator
  app.get('/api/mo-lookup/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // First check if we have this observation in our database
      const existingMoData = await db.getMoDataByMoId(id);
      
      if (existingMoData) {
        // Return data from our database
        const responseData = {
          scientific_name: existingMoData.scientificName,
          common_name: existingMoData.commonName,
          observer: existingMoData.observer,
          location: existingMoData.location,
          state: existingMoData.state,
          country: existingMoData.country || 'United States',
          observed_on: existingMoData.observedOn,
          image_url: null // Would need to fetch from MO API if needed
        };
        res.json(responseData);
      } else {
        // Return error - we don't have mock data, need real API integration
        res.status(404).json({ 
          error: 'Mushroom Observer record not found in database. Please provide valid MO observation ID from synced data.' 
        });
      }
    } catch (error) {
      console.error('Error in MO lookup:', error);
      res.status(500).json({ error: 'Failed to fetch Mushroom Observer data' });
    }
  });

  // MyCoPortal API lookup endpoint for BioRecord Image Generator
  app.get('/api/mycoportal-lookup/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // First check if we have this observation in our database
      const existingMcData = await db.getMycoportalDataByCatalogNumber(id);
      
      if (existingMcData) {
        // Return data from our database
        const responseData = {
          scientific_name: existingMcData.scientificName,
          common_name: existingMcData.commonName,
          recorded_by: existingMcData.recordedBy,
          locality: existingMcData.locality,
          state_province: existingMcData.stateProvince,
          country: existingMcData.country || 'United States',
          event_date: existingMcData.eventDate,
          image_url: null // Would need to fetch from MyCoPortal API if needed
        };
        res.json(responseData);
      } else {
        // Return error - we don't have mock data, need real API integration
        res.status(404).json({ 
          error: 'MyCoPortal record not found in database. Please provide valid catalog number from synced data.' 
        });
      }
    } catch (error) {
      console.error('Error in MyCoPortal lookup:', error);
      res.status(500).json({ error: 'Failed to fetch MyCoPortal data' });
    }
  });

  // File download endpoints
  app.get("/api/download/trace/:observationId", async (req, res) => {
    try {
      const { observationId } = req.params;
      const filePath = path.join(process.cwd(), 'downloads', 'trace', `iNat${observationId}.fastq`);
      
      if (fs.existsSync(filePath)) {
        res.download(filePath, `iNat${observationId}.fastq`);
      } else {
        res.status(404).json({ error: "Trace file not found" });
      }
    } catch (error) {
      console.error("Error downloading trace file:", error);
      res.status(500).json({ error: "Failed to download trace file" });
    }
  });

  app.get("/api/download/blast/:observationId", async (req, res) => {
    try {
      const { observationId } = req.params;
      const { type = 'ncbi' } = req.query;
      const fileName = type === 'local' ? 
        `iNat${observationId}-Local-BLAST.xml` : 
        `iNat${observationId}-NCBI-BLAST.xml`;
      const filePath = path.join(process.cwd(), 'downloads', 'blast', fileName);
      
      if (fs.existsSync(filePath)) {
        res.download(filePath, fileName);
      } else {
        res.status(404).json({ error: "BLAST file not found" });
      }
    } catch (error) {
      console.error("Error downloading BLAST file:", error);
      res.status(500).json({ error: "Failed to download BLAST file" });
    }
  });

  app.get("/api/download/inat-api/:observationId", async (req, res) => {
    try {
      const { observationId } = req.params;
      const downloadDir = path.join(process.cwd(), 'downloads', 'inat_api');
      
      // Find file with pattern iNat{observationId}.{date}.txt
      const files = fs.readdirSync(downloadDir).filter(file => 
        file.startsWith(`iNat${observationId}.`) && file.endsWith('.txt')
      );
      
      if (files.length > 0) {
        const latestFile = files.sort().pop()!; // Get most recent file
        const filePath = path.join(downloadDir, latestFile);
        res.download(filePath, latestFile);
      } else {
        res.status(404).json({ error: "iNaturalist API file not found" });
      }
    } catch (error) {
      console.error("Error downloading iNaturalist API file:", error);
      res.status(500).json({ error: "Failed to download iNaturalist API file" });
    }
  });

  // IPFS Upload endpoints
  app.post("/api/observations/:id/upload-to-ipfs", async (req, res) => {
    try {
      const observationId = req.params.id;
      console.log(`[IPFS] Starting upload for observation ${observationId}`);
      
      // Get observation data to find file paths
      const observation = await db.select()
        .from(observations)
        .where(eq(observations.observationId, observationId))
        .limit(1);
      
      if (observation.length === 0) {
        return res.status(404).json({ error: "Observation not found" });
      }
      
      const obs = observation[0];
      
      // Check if already uploaded to IPFS
      if (obs.ipfsUploaded) {
        return res.json({
          success: true,
          alreadyUploaded: true,
          ipfsLinks: {
            folder: obs.ipfsFolderUrl,
            ncbiBlast: obs.ipfsNcbiBlastUrl,
            localBlast: obs.ipfsLocalBlastUrl,
            fastq: obs.ipfsFastqUrl,
            inatApi: obs.ipfsInatApiUrl
          }
        });
      }
      
      // Prepare file information for IPFS upload
      const files = {
        observationId,
        ncbiBlastFile: obs.ncbiBlastFile,
        localBlastFile: obs.localBlastFile,
        fastqFile: obs.fastqFile,
        inatApiFile: obs.inatApiFile
      };
      
      // Upload to IPFS
      const uploadResult = await ipfsService.uploadObservationFiles(files);
      
      if (!uploadResult.success) {
        return res.status(500).json({ 
          error: "Failed to upload to IPFS",
          details: uploadResult.error 
        });
      }
      
      // Update database with IPFS information
      await db.update(observations)
        .set({
          ipfsUploaded: true,
          ipfsUploadDate: new Date(),
          ipfsFolderCid: uploadResult.ipfsLinks?.folder?.split('/').pop(),
          ipfsFolderUrl: uploadResult.ipfsLinks?.folder,
          ipfsNcbiBlastUrl: uploadResult.ipfsLinks?.ncbiBlast,
          ipfsLocalBlastUrl: uploadResult.ipfsLinks?.localBlast,
          ipfsFastqUrl: uploadResult.ipfsLinks?.fastq,
          ipfsInatApiUrl: uploadResult.ipfsLinks?.inatApi
        })
        .where(eq(observations.observationId, observationId));
      
      console.log(`[IPFS] Successfully uploaded observation ${observationId} to IPFS`);
      
      res.json({
        success: true,
        ipfsLinks: uploadResult.ipfsLinks
      });
      
    } catch (error) {
      console.error(`[IPFS] Error uploading observation ${req.params.id}:`, error);
      res.status(500).json({ error: "Failed to upload to IPFS" });
    }
  });

  // Check IPFS upload status
  app.get("/api/observations/:id/ipfs-status", async (req, res) => {
    try {
      const observationId = req.params.id;
      
      const observation = await db.select({
        ipfsUploaded: observations.ipfsUploaded,
        ipfsUploadDate: observations.ipfsUploadDate,
        ipfsFolderUrl: observations.ipfsFolderUrl,
        ipfsNcbiBlastUrl: observations.ipfsNcbiBlastUrl,
        ipfsLocalBlastUrl: observations.ipfsLocalBlastUrl,
        ipfsFastqUrl: observations.ipfsFastqUrl,
        ipfsInatApiUrl: observations.ipfsInatApiUrl
      })
        .from(observations)
        .where(eq(observations.observationId, observationId))
        .limit(1);
      
      if (observation.length === 0) {
        return res.status(404).json({ error: "Observation not found" });
      }
      
      res.json(observation[0]);
      
    } catch (error) {
      console.error(`[IPFS] Error checking IPFS status:`, error);
      res.status(500).json({ error: "Failed to check IPFS status" });
    }
  });

  // Bulk IPFS upload for all validated observations
  app.post("/api/observations/bulk-upload-to-ipfs", async (req, res) => {
    try {
      console.log(`[IPFS] Starting bulk upload for validated observations`);
      
      // Get all fully validated observations that haven't been uploaded to IPFS yet
      const validatedObservations = await db.select()
        .from(observations)
        .where(sql`
          array_length(string_to_array(trim(scientific_name), ' '), 1) >= 2
          AND inat_api_saved = true
          AND (mycomap_blast_url IS NULL OR blast_files_downloaded = true)
          AND (mycomap_trace_url IS NULL OR trace_files_downloaded = true)
          AND ipfs_uploaded = false
        `)
        .limit(10); // Process in small batches
      
      const uploadResults = [];
      
      for (const obs of validatedObservations) {
        try {
          const files = {
            observationId: obs.observationId,
            ncbiBlastFile: obs.ncbiBlastFile,
            localBlastFile: obs.localBlastFile,
            fastqFile: obs.fastqFile,
            inatApiFile: obs.inatApiFile
          };
          
          const uploadResult = await ipfsService.uploadObservationFiles(files);
          
          if (uploadResult.success) {
            // Update database
            await db.update(observations)
              .set({
                ipfsUploaded: true,
                ipfsUploadDate: new Date(),
                ipfsFolderCid: uploadResult.ipfsLinks?.folder?.split('/').pop(),
                ipfsFolderUrl: uploadResult.ipfsLinks?.folder,
                ipfsNcbiBlastUrl: uploadResult.ipfsLinks?.ncbiBlast,
                ipfsLocalBlastUrl: uploadResult.ipfsLinks?.localBlast,
                ipfsFastqUrl: uploadResult.ipfsLinks?.fastq,
                ipfsInatApiUrl: uploadResult.ipfsLinks?.inatApi
              })
              .where(eq(observations.observationId, obs.observationId));
            
            uploadResults.push({
              observationId: obs.observationId,
              success: true,
              ipfsLinks: uploadResult.ipfsLinks
            });
          } else {
            uploadResults.push({
              observationId: obs.observationId,
              success: false,
              error: uploadResult.error
            });
          }
        } catch (error) {
          uploadResults.push({
            observationId: obs.observationId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      res.json({
        success: true,
        totalProcessed: uploadResults.length,
        successful: uploadResults.filter(r => r.success).length,
        failed: uploadResults.filter(r => !r.success).length,
        results: uploadResults
      });
      
    } catch (error) {
      console.error(`[IPFS] Error in bulk upload:`, error);
      res.status(500).json({ error: "Failed to perform bulk IPFS upload" });
    }
  });

  const httpServer = createServer(app);
  // Biorecords Management API endpoints
  app.get("/api/biorecords", async (req, res) => {
    try {
      const { limit = '50', offset = '0' } = req.query;
      const biorecords = await storage.getBiorecords(
        parseInt(limit as string), 
        parseInt(offset as string)
      );
      res.json(biorecords);
    } catch (error) {
      console.error("Error fetching biorecords:", error);
      res.status(500).json({ error: "Failed to fetch biorecords" });
    }
  });

  app.get("/api/biorecords/:observationId", async (req, res) => {
    try {
      const { observationId } = req.params;
      const biorecord = await storage.getBiorecordByObservationId(observationId);
      if (!biorecord) {
        return res.status(404).json({ error: "Biorecord not found" });
      }
      res.json(biorecord);
    } catch (error) {
      console.error("Error fetching biorecord:", error);
      res.status(500).json({ error: "Failed to fetch biorecord" });
    }
  });

  app.get("/api/biorecords/:observationId/history", async (req, res) => {
    try {
      const { observationId } = req.params;
      const history = await storage.getBiorecordHistory(observationId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching biorecord history:", error);
      res.status(500).json({ error: "Failed to fetch biorecord history" });
    }
  });

  app.post("/api/biorecords/create/:observationId", async (req, res) => {
    try {
      const { observationId } = req.params;
      const biorecord = await storage.createBiorecordFromValidatedObservation(observationId);
      
      if (!biorecord) {
        return res.status(400).json({ 
          error: "Observation is not fully validated or does not meet validation criteria" 
        });
      }

      res.json({
        message: "Biorecord created successfully",
        biorecord: biorecord
      });
    } catch (error) {
      console.error("Error creating biorecord:", error);
      res.status(500).json({ error: "Failed to create biorecord" });
    }
  });

  app.post("/api/biorecords/batch-create", async (req, res) => {
    try {
      const { observationIds } = req.body;
      
      if (!Array.isArray(observationIds)) {
        return res.status(400).json({ error: "observationIds must be an array" });
      }

      const results = [];
      for (const observationId of observationIds) {
        try {
          const biorecord = await storage.createBiorecordFromValidatedObservation(observationId);
          results.push({
            observationId,
            success: !!biorecord,
            biorecord: biorecord
          });
        } catch (error) {
          results.push({
            observationId,
            success: false,
            error: (error as Error).message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      res.json({
        message: `Created ${successCount} biorecords from ${observationIds.length} observations`,
        results: results
      });
    } catch (error) {
      console.error("Error creating batch biorecords:", error);
      res.status(500).json({ error: "Failed to create batch biorecords" });
    }
  });

  // NFT minting API endpoints
  app.post("/api/biorecords/:biorecordId/mint-nft", async (req, res) => {
    try {
      const { biorecordId } = req.params;
      const { tokenId, contractAddress, blockchainNetwork, metadataUri, imageUri, mintedBy } = req.body;
      
      if (!tokenId || !contractAddress || !blockchainNetwork) {
        return res.status(400).json({ 
          error: "tokenId, contractAddress, and blockchainNetwork are required" 
        });
      }

      const biorecord = await storage.mintBiorecordNFT(parseInt(biorecordId), {
        tokenId,
        contractAddress,
        blockchainNetwork,
        metadataUri,
        imageUri,
        mintedBy
      });

      res.json({
        message: "NFT minted successfully",
        biorecord: biorecord
      });
    } catch (error) {
      console.error("Error minting NFT:", error);
      res.status(500).json({ error: "Failed to mint NFT" });
    }
  });

  app.get("/api/biorecords/eligible-for-minting", async (req, res) => {
    try {
      const biorecords = await storage.getBiorecordsEligibleForMinting();
      res.json(biorecords);
    } catch (error) {
      console.error("Error fetching biorecords eligible for minting:", error);
      res.status(500).json({ error: "Failed to fetch eligible biorecords" });
    }
  });

  // Mock NFT minting endpoint for demo purposes
  app.post("/api/biorecords/:biorecordId/mock-mint", async (req, res) => {
    try {
      const { biorecordId } = req.params;
      
      // Generate mock NFT data for demonstration
      const mockNftData = {
        tokenId: `NFT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        contractAddress: "0x" + Math.random().toString(16).substr(2, 40),
        blockchainNetwork: "solana",
        metadataUri: `https://ipfs.io/metadata/${Date.now()}`,
        imageUri: `https://ipfs.io/image/${Date.now()}`,
        mintedBy: "demo-system"
      };

      const biorecord = await storage.mintBiorecordNFT(parseInt(biorecordId), mockNftData);

      res.json({
        message: "Mock NFT minted successfully (demo)",
        biorecord: biorecord,
        nftData: mockNftData
      });
    } catch (error) {
      console.error("Error mock minting NFT:", error);
      res.status(500).json({ error: "Failed to mock mint NFT" });
    }
  });

  // Field Guide API routes
  // Get all field guides
  app.get("/api/field-guides", async (req, res) => {
    try {
      const guides = await db.select().from(fieldGuides).orderBy(sql`created_at DESC`);
      res.json(guides);
    } catch (error) {
      console.error("Error fetching field guides:", error);
      res.status(500).json({ error: "Failed to fetch field guides" });
    }
  });

  // Get field guide by ID
  app.get("/api/field-guides/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const guide = await db.select().from(fieldGuides).where(eq(fieldGuides.id, parseInt(id))).limit(1);
      
      if (guide.length === 0) {
        return res.status(404).json({ error: "Field guide not found" });
      }

      res.json(guide[0]);
    } catch (error) {
      console.error("Error fetching field guide:", error);
      res.status(500).json({ error: "Failed to fetch field guide" });
    }
  });

  // Get species for a field guide
  app.get("/api/field-guides/:id/species", async (req, res) => {
    try {
      const { id } = req.params;
      const { expansion, monthStart, monthEnd, includeInat } = req.query;
      const fieldGuideId = parseInt(id);
      const expansionMiles = expansion ? parseFloat(expansion as string) : 0;
      
      console.log(`[Species API] Query params:`, { expansion, monthStart, monthEnd, includeInat });
      console.log(`[Species API] Parsed values:`, { fieldGuideId, expansionMiles, includeInatBool: includeInat === 'true' });
      
      if (expansionMiles > 0) {
        // Get the field guide to get bounding box coordinates
        const guide = await db.select().from(fieldGuides).where(eq(fieldGuides.id, fieldGuideId)).limit(1);
        
        if (guide.length === 0) {
          return res.status(404).json({ error: "Field guide not found" });
        }
        
        const { boundingBoxNorth, boundingBoxSouth, boundingBoxEast, boundingBoxWest } = guide[0];
        
        // Convert miles to degrees (approximate conversion for mid-latitudes like Chicago)
        // 1 mile ≈ 0.014483 degrees latitude (constant)
        // 1 mile ≈ 0.014483 / cos(latitude) degrees longitude (varies by latitude)
        const latDelta = expansionMiles * 0.014483;
        const avgLat = (parseFloat(boundingBoxNorth) + parseFloat(boundingBoxSouth)) / 2;
        const lngDelta = expansionMiles * 0.014483 / Math.cos(avgLat * Math.PI / 180);
        
        // Expand the bounding box
        const expandedNorth = parseFloat(boundingBoxNorth) + latDelta;
        const expandedSouth = parseFloat(boundingBoxSouth) - latDelta;
        const expandedEast = parseFloat(boundingBoxEast) + lngDelta;
        const expandedWest = parseFloat(boundingBoxWest) - lngDelta;
        
        // Build month filter conditions
        let monthCondition = '';
        if (monthStart && monthEnd) {
          const startMonth = parseInt(monthStart as string);
          const endMonth = parseInt(monthEnd as string);
          if (startMonth <= endMonth) {
            monthCondition = `AND EXTRACT(MONTH FROM o.observed_on) BETWEEN ${startMonth} AND ${endMonth}`;
          } else {
            // Handle wrap-around case (e.g., Nov to Feb)
            monthCondition = `AND (EXTRACT(MONTH FROM o.observed_on) >= ${startMonth} OR EXTRACT(MONTH FROM o.observed_on) <= ${endMonth})`;
          }
        } else if (monthStart) {
          monthCondition = `AND EXTRACT(MONTH FROM o.observed_on) >= ${parseInt(monthStart as string)}`;
        } else if (monthEnd) {
          monthCondition = `AND EXTRACT(MONTH FROM o.observed_on) <= ${parseInt(monthEnd as string)}`;
        }

        // Generate species from expanded area
        const speciesInBoxResult = await db.execute(sql`
          SELECT 
            o.scientific_name,
            o.common_name,
            o.family,
            COUNT(*) as observation_count
          FROM observations o
          WHERE o.latitude IS NOT NULL 
            AND o.longitude IS NOT NULL
            AND CAST(o.latitude AS DECIMAL) <= ${expandedNorth}
            AND CAST(o.latitude AS DECIMAL) >= ${expandedSouth}
            AND CAST(o.longitude AS DECIMAL) <= ${expandedEast}
            AND CAST(o.longitude AS DECIMAL) >= ${expandedWest}
            AND o.scientific_name IS NOT NULL
            AND o.scientific_name != ''
            AND o.observed_on IS NOT NULL
            ${sql.raw(monthCondition)}
          GROUP BY o.scientific_name, o.common_name, o.family
          ORDER BY o.scientific_name
        `);
        
        // Convert to species format
        const expandedSpecies = speciesInBoxResult.rows.map((row: any) => ({
          id: null,
          fieldGuideId: fieldGuideId,
          scientificName: row.scientific_name,
          commonName: row.common_name,
          family: row.family,
          observationCount: parseInt(row.observation_count),
          selectedImageUrl: null,
          selectedImageSource: null,
          selectedObservationId: null,
          selectedImageId: null,
          source: 'Database'
        }));

        // Add iNaturalist API supplementation (only if includeInat is true)
        const includeInat = req.query.includeInat === 'true';
        if (includeInat) {
          try {
            // Use expanded box if expansion > 0, otherwise use original bounding box
            const queryNorth = expansionMiles > 0 ? expandedNorth : boundingBoxNorth;
            const querySouth = expansionMiles > 0 ? expandedSouth : boundingBoxSouth;
            const queryEast = expansionMiles > 0 ? expandedEast : boundingBoxEast;
            const queryWest = expansionMiles > 0 ? expandedWest : boundingBoxWest;
            
            const areaDescription = expansionMiles > 0 ? `expanded area (${expansionMiles} miles)` : 'original bounding box';
            console.log(`[iNat API] Fetching fungal observations for ${areaDescription}`);
            
            // Build iNaturalist API URL with appropriate bounding box
            const inatParams = new URLSearchParams({
              swlat: querySouth.toString(),
              swlng: queryWest.toString(), 
              nelat: queryNorth.toString(),
              nelng: queryEast.toString(),
              iconic_taxa: 'Fungi',
              quality_grade: 'research',
              per_page: '200',
              order_by: 'species_guess',
              order: 'asc'
            });
          
          // Add month filter if specified
          if (monthStart && monthEnd) {
            inatParams.set('month', `${monthStart},${monthEnd}`);
          } else if (monthStart) {
            inatParams.set('month', monthStart);
          } else if (monthEnd) {
            inatParams.set('month', monthEnd);
          }

          const inatUrl = `https://api.inaturalist.org/v1/observations?${inatParams.toString()}`;
          console.log(`[iNat API] Calling: ${inatUrl}`);
          console.log(`[iNat API] Bounding box: SW(${querySouth}, ${queryWest}) to NE(${queryNorth}, ${queryEast})`);
          
          // Fetch all pages of iNaturalist data
          const allInatObservations = [];
          let page = 1;
          let totalResults = 0;
          
          do {
            inatParams.set('page', page.toString());
            const pagedUrl = `https://api.inaturalist.org/v1/observations?${inatParams.toString()}`;
            
            const inatResponse = await fetch(pagedUrl, {
              headers: {
                'User-Agent': 'MycoMap Field Guide - Supplemental Species Discovery'
              }
            });

            console.log(`[iNat API] Page ${page} - Response status: ${inatResponse.status}`);
            if (inatResponse.ok) {
              const inatData = await inatResponse.json();
              totalResults = inatData.total_results || 0;
              
              console.log(`[iNat API] Page ${page}: Found ${inatData.results?.length || 0} observations (Total available: ${totalResults})`);
              
              if (inatData.results && inatData.results.length > 0) {
                allInatObservations.push(...inatData.results);
                page++;
                
                // Safety limit to prevent infinite loops (max 10,000 observations)
                if (allInatObservations.length >= 10000) {
                  console.log(`[iNat API] Reached safety limit of 10,000 observations, stopping pagination`);
                  break;
                }
              } else {
                break; // No more results
              }
            } else {
              console.log(`[iNat API] Page ${page} failed: ${inatResponse.status} ${inatResponse.statusText}`);
              break;
            }
          } while (allInatObservations.length < totalResults && page <= 50); // Max 50 pages for safety
          
          console.log(`[iNat API] Total fetched: ${allInatObservations.length} observations across ${page-1} pages`);
          
          if (allInatObservations.length > 0) {
              console.log(`[iNat API] Sample observation:`, {
                id: allInatObservations[0].id,
                taxon: allInatObservations[0].taxon?.name,
                location: `${allInatObservations[0].location}`,
                user: allInatObservations[0].user?.login
              });
            }
            
            if (allInatObservations.length > 0) {
              // Group observations by species
              const speciesMap = new Map();
              
              allInatObservations.forEach((obs: any) => {
                const scientificName = obs.taxon?.name;
                const commonName = obs.taxon?.preferred_common_name;
                
                if (scientificName) {
                  if (speciesMap.has(scientificName)) {
                    speciesMap.get(scientificName).observationCount++;
                  } else {
                    speciesMap.set(scientificName, {
                      id: null,
                      fieldGuideId: fieldGuideId,
                      scientificName: scientificName,
                      commonName: commonName || null,
                      family: obs.taxon?.ancestors?.find((a: any) => a.rank === 'family')?.name || null,
                      observationCount: 1,
                      selectedImageUrl: obs.photos?.[0]?.url || null,
                      selectedImageSource: 'iNaturalist (Live)',
                      selectedObservationId: obs.id?.toString(),
                      selectedImageId: obs.photos?.[0]?.id?.toString() || null,
                      source: 'iNaturalist (Live)'
                    });
                  }
                }
              });

              // Convert to array and merge with database species
              const inatSpecies = Array.from(speciesMap.values());
              console.log(`[iNat API] Processed ${inatSpecies.length} unique species`);
              
              // Merge and deduplicate by scientific name
              const allSpeciesMap = new Map();
              
              // Add database species first
              expandedSpecies.forEach(species => {
                allSpeciesMap.set(species.scientificName, species);
              });
              
              // Add iNaturalist species (only if not already in database)
              inatSpecies.forEach(species => {
                if (!allSpeciesMap.has(species.scientificName)) {
                  allSpeciesMap.set(species.scientificName, species);
                }
              });
              
              const mergedSpecies = Array.from(allSpeciesMap.values())
                .sort((a, b) => a.scientificName.localeCompare(b.scientificName));
              
              console.log(`[iNat API] Final merged list: ${mergedSpecies.length} species (${expandedSpecies.length} from DB, ${inatSpecies.length} from iNat)`);
              return res.json(mergedSpecies);
            }
          } else {
            console.log(`[iNat API] Pagination complete: No more data to fetch`);
          }
          } catch (error) {
            console.error(`[iNat API] Error supplementing species list:`, error);
          }
        } else {
          console.log(`[iNat API] includeInat checkbox not checked, skipping iNaturalist API call`);
        }
        
        // Return database species if iNaturalist API fails
        return res.json(expandedSpecies);
      } else {
        // Normal query without expansion
        if (monthStart || monthEnd) {
          // Apply date filter to existing species
          const guide = await db.select().from(fieldGuides).where(eq(fieldGuides.id, fieldGuideId)).limit(1);
          
          if (guide.length === 0) {
            return res.status(404).json({ error: "Field guide not found" });
          }
          
          const { boundingBoxNorth, boundingBoxSouth, boundingBoxEast, boundingBoxWest } = guide[0];
          
          // Build month filter conditions
          let monthCondition = '';
          if (monthStart && monthEnd) {
            const startMonth = parseInt(monthStart as string);
            const endMonth = parseInt(monthEnd as string);
            if (startMonth <= endMonth) {
              monthCondition = `AND EXTRACT(MONTH FROM o.observed_on) BETWEEN ${startMonth} AND ${endMonth}`;
            } else {
              // Handle wrap-around case (e.g., Nov to Feb)
              monthCondition = `AND (EXTRACT(MONTH FROM o.observed_on) >= ${startMonth} OR EXTRACT(MONTH FROM o.observed_on) <= ${endMonth})`;
            }
          } else if (monthStart) {
            monthCondition = `AND EXTRACT(MONTH FROM o.observed_on) >= ${parseInt(monthStart as string)}`;
          } else if (monthEnd) {
            monthCondition = `AND EXTRACT(MONTH FROM o.observed_on) <= ${parseInt(monthEnd as string)}`;
          }

          const speciesInBoxResult = await db.execute(sql`
            SELECT 
              o.scientific_name,
              o.common_name,
              o.family,
              COUNT(*) as observation_count
            FROM observations o
            WHERE o.latitude IS NOT NULL 
              AND o.longitude IS NOT NULL
              AND CAST(o.latitude AS DECIMAL) <= ${boundingBoxNorth}
              AND CAST(o.latitude AS DECIMAL) >= ${boundingBoxSouth}
              AND CAST(o.longitude AS DECIMAL) <= ${boundingBoxEast}
              AND CAST(o.longitude AS DECIMAL) >= ${boundingBoxWest}
              AND o.scientific_name IS NOT NULL
              AND o.scientific_name != ''
              AND o.observed_on IS NOT NULL
              ${sql.raw(monthCondition)}
            GROUP BY o.scientific_name, o.common_name, o.family
            ORDER BY o.scientific_name
          `);
          
          // Convert to species format
          const filteredSpecies = speciesInBoxResult.rows.map((row: any) => ({
            id: null,
            fieldGuideId: fieldGuideId,
            scientificName: row.scientific_name,
            commonName: row.common_name,
            family: row.family,
            observationCount: parseInt(row.observation_count),
            selectedImageUrl: null,
            selectedImageSource: null,
            selectedObservationId: null,
            selectedImageId: null
          }));
          
          // Add iNaturalist supplementation if requested
          if (includeInat === 'true') {
            const guide = await db.select().from(fieldGuides).where(eq(fieldGuides.id, fieldGuideId)).limit(1);
            if (guide.length > 0) {
              const { boundingBoxNorth, boundingBoxSouth, boundingBoxEast, boundingBoxWest } = guide[0];
              
              try {
                console.log(`[iNat API] Fetching fungal observations for original bounding box (with date filter)`);
                
                const inatParams = new URLSearchParams({
                  swlat: boundingBoxSouth,
                  swlng: boundingBoxWest, 
                  nelat: boundingBoxNorth,
                  nelng: boundingBoxEast,
                  iconic_taxa: 'Fungi',
                  quality_grade: 'research',
                  per_page: '200',
                  order_by: 'species_guess',
                  order: 'asc'
                });
                
                // Add month filter if specified
                if (monthStart && monthEnd) {
                  inatParams.set('month', `${monthStart},${monthEnd}`);
                } else if (monthStart) {
                  inatParams.set('month', monthStart as string);
                } else if (monthEnd) {
                  inatParams.set('month', monthEnd as string);
                }

                const inatUrl = `https://api.inaturalist.org/v1/observations?${inatParams.toString()}`;
                console.log(`[iNat API] Calling: ${inatUrl}`);
                
                const inatResponse = await fetch(inatUrl, {
                  headers: {
                    'User-Agent': 'MycoMap Field Guide - Supplemental Species Discovery'
                  }
                });

                if (inatResponse.ok) {
                  const inatData = await inatResponse.json();
                  console.log(`[iNat API] Found ${inatData.results?.length || 0} observations`);
                  
                  if (inatData.results && inatData.results.length > 0) {
                    // Process iNaturalist observations into species format
                    const inatSpeciesMap = new Map();
                    inatData.results.forEach((obs: any) => {
                      if (obs.taxon && obs.taxon.name && obs.taxon.rank === 'species') {
                        if (!inatSpeciesMap.has(obs.taxon.name)) {
                          inatSpeciesMap.set(obs.taxon.name, {
                            id: null,
                            fieldGuideId: fieldGuideId,
                            scientificName: obs.taxon.name,
                            commonName: obs.taxon.preferred_common_name || null,
                            family: obs.taxon.ancestors?.find((a: any) => a.rank === 'family')?.name || null,
                            observationCount: 0,
                            selectedImageUrl: null,
                            selectedImageSource: null,
                            selectedObservationId: null,
                            selectedImageId: null,
                            source: 'iNaturalist'
                          });
                        }
                        inatSpeciesMap.get(obs.taxon.name).observationCount++;
                      }
                    });
                    
                    const inatSpecies = Array.from(inatSpeciesMap.values());
                    
                    // Merge with database species
                    const allSpeciesMap = new Map();
                    filteredSpecies.forEach(species => allSpeciesMap.set(species.scientificName, species));
                    inatSpecies.forEach(species => {
                      if (!allSpeciesMap.has(species.scientificName)) {
                        allSpeciesMap.set(species.scientificName, species);
                      }
                    });
                    
                    const mergedSpecies = Array.from(allSpeciesMap.values())
                      .sort((a, b) => a.scientificName.localeCompare(b.scientificName));
                    
                    console.log(`[iNat API] Final merged list: ${mergedSpecies.length} species (${filteredSpecies.length} from DB, ${inatSpecies.length} from iNat)`);
                    return res.json(mergedSpecies);
                  }
                } else {
                  console.log(`[iNat API] Request failed: ${inatResponse.status} ${inatResponse.statusText}`);
                }
              } catch (error) {
                console.error(`[iNat API] Error supplementing species list:`, error);
              }
            }
          }
          
          return res.json(filteredSpecies);
        } else {
          const species = await db.select().from(fieldGuideSpecies)
            .where(eq(fieldGuideSpecies.fieldGuideId, fieldGuideId))
            .orderBy(fieldGuideSpecies.scientificName);
          
          // Add iNaturalist supplementation if requested (no date filter case)
          if (includeInat === 'true') {
            const guide = await db.select().from(fieldGuides).where(eq(fieldGuides.id, fieldGuideId)).limit(1);
            if (guide.length > 0) {
              const { boundingBoxNorth, boundingBoxSouth, boundingBoxEast, boundingBoxWest } = guide[0];
              
              try {
                console.log(`[iNat API] Fetching fungal observations for original bounding box (no date filter)`);
                
                const inatParams = new URLSearchParams({
                  swlat: boundingBoxSouth,
                  swlng: boundingBoxWest, 
                  nelat: boundingBoxNorth,
                  nelng: boundingBoxEast,
                  iconic_taxa: 'Fungi',
                  quality_grade: 'research',
                  per_page: '200',
                  order_by: 'species_guess',
                  order: 'asc'
                });

                const inatUrl = `https://api.inaturalist.org/v1/observations?${inatParams.toString()}`;
                console.log(`[iNat API] Calling: ${inatUrl}`);
                
                const inatResponse = await fetch(inatUrl, {
                  headers: {
                    'User-Agent': 'MycoMap Field Guide - Supplemental Species Discovery'
                  }
                });

                if (inatResponse.ok) {
                  const inatData = await inatResponse.json();
                  console.log(`[iNat API] Found ${inatData.results?.length || 0} observations`);
                  
                  if (inatData.results && inatData.results.length > 0) {
                    // Process iNaturalist observations into species format
                    const inatSpeciesMap = new Map();
                    inatData.results.forEach((obs: any) => {
                      if (obs.taxon && obs.taxon.name && obs.taxon.rank === 'species') {
                        if (!inatSpeciesMap.has(obs.taxon.name)) {
                          inatSpeciesMap.set(obs.taxon.name, {
                            id: null,
                            fieldGuideId: fieldGuideId,
                            scientificName: obs.taxon.name,
                            commonName: obs.taxon.preferred_common_name || null,
                            family: obs.taxon.ancestors?.find((a: any) => a.rank === 'family')?.name || null,
                            observationCount: 0,
                            selectedImageUrl: null,
                            selectedImageSource: null,
                            selectedObservationId: null,
                            selectedImageId: null,
                            source: 'iNaturalist'
                          });
                        }
                        inatSpeciesMap.get(obs.taxon.name).observationCount++;
                      }
                    });
                    
                    const inatSpecies = Array.from(inatSpeciesMap.values());
                    
                    // Merge with database species
                    const allSpeciesMap = new Map();
                    species.forEach(s => allSpeciesMap.set(s.scientificName, { ...s, source: 'Database' }));
                    inatSpecies.forEach(s => {
                      if (!allSpeciesMap.has(s.scientificName)) {
                        allSpeciesMap.set(s.scientificName, s);
                      }
                    });
                    
                    const mergedSpecies = Array.from(allSpeciesMap.values())
                      .sort((a, b) => a.scientificName.localeCompare(b.scientificName));
                    
                    console.log(`[iNat API] Final merged list: ${mergedSpecies.length} species (${species.length} from DB, ${inatSpecies.length} from iNat)`);
                    return res.json(mergedSpecies);
                  }
                } else {
                  console.log(`[iNat API] Request failed: ${inatResponse.status} ${inatResponse.statusText}`);
                }
              } catch (error) {
                console.error(`[iNat API] Error supplementing species list:`, error);
              }
            }
          }
          
          res.json(species);
        }
      }
    } catch (error) {
      console.error("Error fetching field guide species:", error);
      res.status(500).json({ error: "Failed to fetch field guide species" });
    }
  });

  // Create a new field guide
  app.post("/api/field-guides", async (req, res) => {
    try {
      const validatedData = insertFieldGuideSchema.parse(req.body);
      
      const [newGuide] = await db.insert(fieldGuides).values(validatedData).returning();
      
      res.status(201).json(newGuide);
    } catch (error) {
      console.error("Error creating field guide:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid field guide data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create field guide" });
    }
  });

  // Generate species list for a field guide based on bounding box
  app.post("/api/field-guides/:id/generate-species", async (req, res) => {
    try {
      const { id } = req.params;
      const fieldGuideId = parseInt(id);
      
      // Get the field guide to get bounding box coordinates
      const guide = await db.select().from(fieldGuides).where(eq(fieldGuides.id, fieldGuideId)).limit(1);
      
      if (guide.length === 0) {
        return res.status(404).json({ error: "Field guide not found" });
      }

      const { boundingBoxNorth, boundingBoxSouth, boundingBoxEast, boundingBoxWest } = guide[0];

      // Find all unique species within the bounding box
      const speciesInBox = await db.execute(sql`
        SELECT 
          o.scientific_name,
          o.common_name,
          o.family,
          COUNT(*) as observation_count
        FROM observations o
        WHERE o.latitude IS NOT NULL 
          AND o.longitude IS NOT NULL
          AND CAST(o.latitude AS DECIMAL) <= ${boundingBoxNorth}
          AND CAST(o.latitude AS DECIMAL) >= ${boundingBoxSouth}
          AND CAST(o.longitude AS DECIMAL) <= ${boundingBoxEast}
          AND CAST(o.longitude AS DECIMAL) >= ${boundingBoxWest}
          AND o.scientific_name IS NOT NULL
          AND o.scientific_name != ''
        GROUP BY o.scientific_name, o.common_name, o.family
        ORDER BY o.scientific_name
      `);

      const species = speciesInBox.rows as Array<{
        scientific_name: string;
        common_name: string | null;
        family: string | null;
        observation_count: number;
      }>;

      // Clear existing species for this field guide
      await db.delete(fieldGuideSpecies).where(eq(fieldGuideSpecies.fieldGuideId, fieldGuideId));

      // Insert new species with upsert to handle any duplicates
      if (species.length > 0) {
        for (const s of species) {
          await db.insert(fieldGuideSpecies)
            .values({
              fieldGuideId,
              scientificName: s.scientific_name,
              commonName: s.common_name,
              family: s.family,
              observationCount: parseInt(s.observation_count.toString())
            })
            .onConflictDoUpdate({
              target: [fieldGuideSpecies.fieldGuideId, fieldGuideSpecies.scientificName],
              set: {
                commonName: s.common_name,
                family: s.family,
                observationCount: parseInt(s.observation_count.toString()),
                updatedAt: new Date()
              }
            });
        }
      }

      // Update species count in the field guide
      await db.update(fieldGuides)
        .set({ 
          speciesCount: species.length,
          updatedAt: new Date()
        })
        .where(eq(fieldGuides.id, fieldGuideId));

      res.json({ 
        message: `Generated field guide with ${species.length} species`,
        speciesCount: species.length,
        species: species
      });
    } catch (error) {
      console.error("Error generating field guide species:", error);
      res.status(500).json({ error: "Failed to generate species list" });
    }
  });

  // Get contributors count for a field guide
  app.get("/api/field-guides/:id/contributors", async (req, res) => {
    try {
      const { id } = req.params;
      const { expansion } = req.query;
      const fieldGuideId = parseInt(id);
      const expansionMiles = parseInt(expansion as string) || 0;
      
      // Get the field guide to get bounding box coordinates
      const guide = await db.select().from(fieldGuides).where(eq(fieldGuides.id, fieldGuideId)).limit(1);
      
      if (guide.length === 0) {
        return res.status(404).json({ error: "Field guide not found" });
      }

      const { boundingBoxNorth, boundingBoxSouth, boundingBoxEast, boundingBoxWest } = guide[0];

      // Calculate expanded bounding box if expansion is specified
      const expansionDegrees = expansionMiles * 0.0144927536231884; // 1 mile ≈ 0.0144927536231884 degrees
      const expandedNorth = boundingBoxNorth + expansionDegrees;
      const expandedSouth = boundingBoxSouth - expansionDegrees;
      const expandedEast = boundingBoxEast + expansionDegrees;
      const expandedWest = boundingBoxWest - expansionDegrees;

      // Use expanded coordinates if expansion > 0, otherwise use original
      const queryNorth = expansionMiles > 0 ? expandedNorth : boundingBoxNorth;
      const querySouth = expansionMiles > 0 ? expandedSouth : boundingBoxSouth;
      const queryEast = expansionMiles > 0 ? expandedEast : boundingBoxEast;
      const queryWest = expansionMiles > 0 ? expandedWest : boundingBoxWest;

      // Count unique contributors within the bounding box
      const contributorsResult = await db.execute(sql`
        SELECT COUNT(DISTINCT collector) as unique_contributors
        FROM observations o
        WHERE o.latitude IS NOT NULL 
          AND o.longitude IS NOT NULL
          AND CAST(o.latitude AS DECIMAL) <= ${queryNorth}
          AND CAST(o.latitude AS DECIMAL) >= ${querySouth}
          AND CAST(o.longitude AS DECIMAL) <= ${queryEast}
          AND CAST(o.longitude AS DECIMAL) >= ${queryWest}
          AND o.collector IS NOT NULL
          AND o.collector != ''
      `);

      let dbContributorsCount = parseInt((contributorsResult.rows[0] as any)?.unique_contributors?.toString() || '0');

      // Add iNaturalist contributors if includeInat is true
      let inatContributorsCount = 0;
      const includeInatContributors = req.query.includeInat === 'true';
      if (includeInatContributors) {
        try {
          // Use expanded box if expansion > 0, otherwise use original bounding box
          const contribQueryNorth = expansionMiles > 0 ? expandedNorth : boundingBoxNorth;
          const contribQuerySouth = expansionMiles > 0 ? expandedSouth : boundingBoxSouth;
          const contribQueryEast = expansionMiles > 0 ? expandedEast : boundingBoxEast;
          const contribQueryWest = expansionMiles > 0 ? expandedWest : boundingBoxWest;
          
          const contribAreaDescription = expansionMiles > 0 ? `expanded area (${expansionMiles} miles)` : 'original bounding box';
          console.log(`[iNat API] Fetching contributors for ${contribAreaDescription}`);
          
          const inatParams = new URLSearchParams({
            swlat: contribQuerySouth.toString(),
            swlng: contribQueryWest.toString(), 
            nelat: contribQueryNorth.toString(),
            nelng: contribQueryEast.toString(),
            iconic_taxa: 'Fungi',
            quality_grade: 'research',
            per_page: '200'
          });

          const inatUrl = `https://api.inaturalist.org/v1/observations?${inatParams.toString()}`;
          const inatResponse = await fetch(inatUrl, {
            headers: {
              'User-Agent': 'MycoMap Field Guide - Contributor Count Supplementation'
            }
          });

          if (inatResponse.ok) {
            const inatData = await inatResponse.json();
            if (inatData.results && inatData.results.length > 0) {
              // Get unique observers from iNaturalist
              const inatObservers = new Set();
              inatData.results.forEach((obs: any) => {
                if (obs.user?.login) {
                  inatObservers.add(obs.user.login);
                }
              });
              inatContributorsCount = inatObservers.size;
              console.log(`[iNat API] Found ${inatContributorsCount} unique iNaturalist contributors`);
            }
          }
        } catch (error) {
          console.error(`[iNat API] Error fetching contributors:`, error);
        }
      } else {
        console.log(`[iNat API] includeInat not checked or expansion disabled, skipping contributor API call`);
      }

      const totalContributors = dbContributorsCount + inatContributorsCount;
      console.log(`[Contributors] DB: ${dbContributorsCount}, iNat: ${inatContributorsCount}, Total: ${totalContributors}`);

      res.json({ 
        contributorsCount: totalContributors,
        dbContributors: dbContributorsCount,
        inatContributors: inatContributorsCount
      });
    } catch (error) {
      console.error("Error fetching contributors count:", error);
      res.status(500).json({ error: "Failed to fetch contributors count" });
    }
  });

  // Get detailed contributors list for a field guide
  app.get("/api/field-guides/:id/contributors/detailed", async (req, res) => {
    try {
      const { id } = req.params;
      const fieldGuideId = parseInt(id);
      
      // Get the field guide to get bounding box coordinates
      const guide = await db.select().from(fieldGuides).where(eq(fieldGuides.id, fieldGuideId)).limit(1);
      
      if (guide.length === 0) {
        return res.status(404).json({ error: "Field guide not found" });
      }

      const { boundingBoxNorth, boundingBoxSouth, boundingBoxEast, boundingBoxWest } = guide[0];

      // Get contributors with their observation counts and species counts within the bounding box
      const contributorsResult = await db.execute(sql`
        SELECT 
          o.collector,
          COUNT(*) as observation_count,
          COUNT(DISTINCT o.scientific_name) as species_count
        FROM observations o
        WHERE o.latitude IS NOT NULL 
          AND o.longitude IS NOT NULL
          AND CAST(o.latitude AS DECIMAL) <= ${boundingBoxNorth}
          AND CAST(o.latitude AS DECIMAL) >= ${boundingBoxSouth}
          AND CAST(o.longitude AS DECIMAL) <= ${boundingBoxEast}
          AND CAST(o.longitude AS DECIMAL) >= ${boundingBoxWest}
          AND o.collector IS NOT NULL
          AND o.collector != ''
        GROUP BY o.collector
        ORDER BY observation_count DESC, o.collector ASC
      `);

      const contributors = contributorsResult.rows.map(row => ({
        name: (row as any).collector,
        observationCount: parseInt((row as any).observation_count.toString()),
        speciesCount: parseInt((row as any).species_count.toString())
      }));

      res.json({ 
        contributors
      });
    } catch (error) {
      console.error("Error fetching detailed contributors:", error);
      res.status(500).json({ error: "Failed to fetch detailed contributors" });
    }
  });

  // Get observation images for a species in a field guide
  app.get("/api/field-guides/:id/species/:scientificName/images", async (req, res) => {
    try {
      const { id, scientificName } = req.params;
      const fieldGuideId = parseInt(id);
      
      // Get the field guide to get bounding box coordinates
      const guide = await db.select().from(fieldGuides).where(eq(fieldGuides.id, fieldGuideId)).limit(1);
      
      if (guide.length === 0) {
        return res.status(404).json({ error: "Field guide not found" });
      }

      const { boundingBoxNorth, boundingBoxSouth, boundingBoxEast, boundingBoxWest } = guide[0];

      // Get currently selected image for this species
      const selectedSpecies = await db.select().from(fieldGuideSpecies)
        .where(sql`field_guide_id = ${fieldGuideId} AND scientific_name = ${scientificName}`)
        .limit(1);
      
      const selectedImageId = selectedSpecies[0]?.selectedImageId || null;

      // Find all observations for this species within the bounding box (both iNaturalist and Mushroom Observer)
      const observationsInBox = await db.execute(sql`
        SELECT DISTINCT 
          o.observation_id,
          o.scientific_name,
          o.observer,
          o.observed_on,
          o.state,
          o.place_guess,
          o.source,
          o.image_link
        FROM observations o
        WHERE o.latitude IS NOT NULL 
          AND o.longitude IS NOT NULL
          AND CAST(o.latitude AS DECIMAL) <= ${boundingBoxNorth}
          AND CAST(o.latitude AS DECIMAL) >= ${boundingBoxSouth}
          AND CAST(o.longitude AS DECIMAL) <= ${boundingBoxEast}
          AND CAST(o.longitude AS DECIMAL) >= ${boundingBoxWest}
          AND o.scientific_name = ${scientificName}
          AND o.source IN ('iNaturalist', 'MO Observations', 'MycoPortal')
        ORDER BY o.observed_on DESC
        LIMIT 50
      `);

      const observations = observationsInBox.rows as Array<{
        observation_id: string;
        scientific_name: string;
        observer: string | null;
        observed_on: string | null;
        state: string | null;
        place_guess: string | null;
        source: string;
        image_link: string | null;
      }>;

      // Process images based on source
      const imagePromises = observations.map(async (obs) => {
        try {
          // Handle Mushroom Observer records with API calls
          if (obs.source === 'MO Observations') {
            try {
              const apiKey = process.env.MUSHROOM_OBSERVER_API_KEY;
              if (!apiKey) {
                console.warn('[MO API] No API key available, using stored image');
                if (obs.image_link) {
                  return [{
                    observationId: obs.observation_id,
                    imageUrl: obs.image_link,
                    imageId: obs.observation_id,
                    observer: obs.observer,
                    observedOn: obs.observed_on,
                    state: obs.state,
                    placeGuess: obs.place_guess,
                    source: obs.source,
                    scientificName: obs.scientific_name,
                    isSelected: obs.observation_id === selectedImageId
                  }];
                }
                return null;
              }

              const apiUrl = `https://mushroomobserver.org/api2/observations/${obs.observation_id}?detail=high`;
              console.log(`[DEBUG] Fetching MO images from: ${apiUrl}`);
              
              const response = await fetch(apiUrl, {
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Accept': 'application/json',
                  'User-Agent': 'MycoMap Field Guide'
                }
              });

              if (!response.ok) {
                console.log(`[DEBUG] MO API call failed for ${obs.observation_id}: ${response.status}`);
                // Fallback to stored image
                if (obs.image_link) {
                  return [{
                    observationId: obs.observation_id,
                    imageUrl: obs.image_link,
                    imageId: obs.observation_id,
                    observer: obs.observer,
                    observedOn: obs.observed_on,
                    state: obs.state,
                    placeGuess: obs.place_guess,
                    source: obs.source,
                    scientificName: obs.scientific_name,
                    isSelected: obs.observation_id === selectedImageId
                  }];
                }
                return null;
              }

              const data = await response.json();
              const observation = data.results?.[0];

              console.log(`[DEBUG] MO API response for ${obs.observation_id}:`, {
                hasResults: !!data.results,
                hasObservation: !!observation,
                hasImages: !!observation?.images,
                imageCount: observation?.images?.length || 0
              });

              if (observation?.images && observation.images.length > 0) {
                // Use images from API response
                return observation.images.map((image: any) => ({
                  observationId: obs.observation_id,
                  imageUrl: image.original_url || image.medium_url || image.small_url,
                  imageId: image.id || obs.observation_id,
                  observer: obs.observer,
                  observedOn: obs.observed_on,
                  state: obs.state,
                  placeGuess: obs.place_guess,
                  source: obs.source,
                  scientificName: obs.scientific_name,
                  isSelected: obs.observation_id === selectedImageId
                }));
              } else {
                console.log(`[DEBUG] No images in MO API response for ${obs.observation_id}, using fallback`);
                // Fallback to stored image
                if (obs.image_link) {
                  return [{
                    observationId: obs.observation_id,
                    imageUrl: obs.image_link,
                    imageId: obs.observation_id,
                    observer: obs.observer,
                    observedOn: obs.observed_on,
                    state: obs.state,
                    placeGuess: obs.place_guess,
                    source: obs.source,
                    scientificName: obs.scientific_name,
                    isSelected: obs.observation_id === selectedImageId
                  }];
                }
                return null;
              }
            } catch (error) {
              console.error(`[MO API] Error fetching images for ${obs.observation_id}:`, error);
              // Fallback to stored image
              if (obs.image_link) {
                return [{
                  observationId: obs.observation_id,
                  imageUrl: obs.image_link,
                  imageId: obs.observation_id,
                  observer: obs.observer,
                  observedOn: obs.observed_on,
                  state: obs.state,
                  placeGuess: obs.place_guess,
                  source: obs.source,
                  scientificName: obs.scientific_name,
                  isSelected: obs.observation_id === selectedImageId
                }];
              }
              return null;
            }
          }
          
          // Handle MycoPortal records (no images expected)
          if (obs.source === 'MycoPortal') {
            return [{
              observationId: obs.observation_id,
              imageUrl: null, // MycoPortal records typically don't have images
              imageId: obs.observation_id,
              observer: obs.observer,
              observedOn: obs.observed_on,
              state: obs.state,
              placeGuess: obs.place_guess,
              source: obs.source,
              scientificName: obs.scientific_name,
              isSelected: obs.observation_id === selectedImageId
            }];
          }
          
          // Handle iNaturalist records with API calls
          if (obs.source === 'iNaturalist') {
            const apiUrl = `https://api.inaturalist.org/v1/observations/${obs.observation_id}`;
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
              console.log(`[DEBUG] API call failed for ${obs.observation_id}: ${response.status}`);
              return null;
            }
            
            const data = await response.json();
            const observation = data.results?.[0];
            
            console.log(`[DEBUG] ${obs.observation_id} - API Response:`, {
              hasResults: !!data.results,
              resultsLength: data.results?.length,
              hasObservation: !!observation,
              hasPhotos: !!observation?.photos,
              photosLength: observation?.photos?.length || 0
            });
            
            if (!observation || !observation.photos || observation.photos.length === 0) {
              console.log(`[DEBUG] No photos for ${obs.observation_id} - using fallback to stored image`);
              
              // Fallback to stored image if API has no photos
              if (obs.image_link) {
                return [{
                  observationId: obs.observation_id,
                  imageUrl: obs.image_link,
                  imageId: obs.observation_id,
                  observer: obs.observer,
                  observedOn: obs.observed_on,
                  state: obs.state,
                  placeGuess: obs.place_guess,
                  source: obs.source,
                  scientificName: obs.scientific_name,
                  isSelected: obs.observation_id === selectedImageId
                }];
              }
              
              return null;
            }

            // Get all photos for this observation
            return observation.photos.map((photo: any) => {
              const imageUrl = photo.url.replace('square', 'medium');
              return {
                observationId: obs.observation_id,
                imageUrl,
                imageId: photo.id,
                observer: obs.observer,
                observedOn: obs.observed_on,
                state: obs.state,
                placeGuess: obs.place_guess,
                source: obs.source,
                scientificName: obs.scientific_name,
                isSelected: photo.id.toString() === selectedImageId
              };
            });
          }
          
          return null;
        } catch (error) {
          console.error(`Error fetching images for observation ${obs.observation_id}:`, error);
          return null;
        }
      });

      const imageResults = await Promise.all(imagePromises);
      const allImages = imageResults.filter(result => result !== null).flat();

      res.json(allImages);
    } catch (error) {
      console.error("Error fetching species images:", error);
      res.status(500).json({ error: "Failed to fetch species images" });
    }
  });

  // Update selected image for a field guide species
  app.put("/api/field-guides/:id/species/:scientificName/select-image", async (req, res) => {
    try {
      const { id, scientificName } = req.params;
      const { imageUrl, observationId, source } = req.body;
      const fieldGuideId = parseInt(id);

      await db.update(fieldGuideSpecies)
        .set({
          selectedImageUrl: imageUrl,
          selectedImageSource: source,
          selectedObservationId: observationId,
          selectedImageId: req.body.imageId
        })
        .where(
          sql`field_guide_id = ${fieldGuideId} AND scientific_name = ${scientificName}`
        );

      res.json({ message: "Selected image updated successfully" });
    } catch (error) {
      console.error("Error updating selected image:", error);
      res.status(500).json({ error: "Failed to update selected image" });
    }
  });

  // Remove selected image for a field guide species
  app.delete("/api/field-guides/:id/species/:scientificName/remove-image", async (req, res) => {
    try {
      const { id, scientificName } = req.params;
      const fieldGuideId = parseInt(id);

      await db.update(fieldGuideSpecies)
        .set({
          selectedImageUrl: null,
          selectedImageSource: null,
          selectedObservationId: null,
          selectedImageId: null
        })
        .where(
          sql`field_guide_id = ${fieldGuideId} AND scientific_name = ${scientificName}`
        );

      res.json({ message: "Selected image removed successfully" });
    } catch (error) {
      console.error("Error removing selected image:", error);
      res.status(500).json({ error: "Failed to remove selected image" });
    }
  });

  // Delete field guide
  app.delete("/api/field-guides/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const fieldGuideId = parseInt(id);
      
      // Delete species first (cascade should handle this, but being explicit)
      await db.delete(fieldGuideSpecies).where(eq(fieldGuideSpecies.fieldGuideId, fieldGuideId));
      
      // Delete the field guide
      const deleted = await db.delete(fieldGuides).where(eq(fieldGuides.id, fieldGuideId)).returning();
      
      if (deleted.length === 0) {
        return res.status(404).json({ error: "Field guide not found" });
      }

      res.json({ message: "Field guide deleted successfully" });
    } catch (error) {
      console.error("Error deleting field guide:", error);
      res.status(500).json({ error: "Failed to delete field guide" });
    }
  });

  return httpServer;
}
