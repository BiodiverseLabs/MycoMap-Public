import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertObservationSchema, insertUploadSchema, species, observations, inaturalistData, fieldGuides, fieldGuideSpecies, insertFieldGuideSchema, insertFieldGuideSpeciesSchema, inatObservationsCache, inatCacheMetadata, moObservationsCache, moCacheMetadata, inaturalistApiCache, insertInaturalistApiCacheSchema, cmsPages, cmsPageSections, cmsNavigationLinks, cmsMediaAssets, insertCmsPageSchema, insertCmsPageSectionSchema, insertCmsNavigationLinkSchema, users, shipments, shipmentBags, shipmentSpecimens, insertShipmentSchema, insertShipmentBagSchema, insertShipmentSpecimenSchema, labRuns, labPlates, labWells, insertLabRunSchema, insertLabPlateSchema, insertLabWellSchema, indexSets, indexEntries, primerSets, primerItems, primerPools, labRunFiles } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
// XLSX will be imported dynamically
import path from "path";
import fs from "fs";
import csv from "csv-parser";
import { db, pool } from "./db";
import { sql, eq, desc, and, gte, lte, inArray } from "drizzle-orm";
import { blastDownloader } from "./blastDownloader";
import { ipfsService } from "./ipfsService";
import { extractLocationFromObservation, normalizeState, normalizeCountry } from "./locationService";
import { WebSocketServer } from "ws";
import { setupAuth, registerAuthRoutes, isAuthenticated, requireSubscription, setSubscriptionChecker, isAdmin, setAdminChecker } from "./replit_integrations/auth";

const upload = multer({ 
  dest: 'uploads/',
  limits: { 
    fileSize: 200 * 1024 * 1024, // 200MB limit (temporary test)
    fieldSize: 200 * 1024 * 1024,
    fields: 1000,
    files: 10
  }
});

const uploadMemory = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for CSV files
});

// iNaturalist Cache Management Functions
async function checkCacheForArea(fieldGuideId: number, expansionMiles: number, boundingBox: {north: number, south: number, east: number, west: number}) {
  console.log(`[iNat Cache] Checking cache for field guide ${fieldGuideId}, expansion: ${expansionMiles} miles`);
  
  // Check if we have cached data that covers this area
  const existingCache = await db.select().from(inatCacheMetadata)
    .where(sql`
      field_guide_id = ${fieldGuideId} 
      AND max_radius_miles >= ${expansionMiles}
      AND bounding_box_north >= ${boundingBox.north}
      AND bounding_box_south <= ${boundingBox.south} 
      AND bounding_box_east >= ${boundingBox.east}
      AND bounding_box_west <= ${boundingBox.west}
    `)
    .orderBy(sql`last_fetched_at DESC`)
    .limit(1);
    
  if (existingCache.length > 0) {
    const cache = existingCache[0];
    const cacheAge = Date.now() - new Date(cache.lastFetchedAt || new Date()).getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (cacheAge < maxAge) {
      console.log(`[iNat Cache] Found valid cache (${cache.observationsCount} observations, ${Math.round(cacheAge / (60 * 60 * 1000))}h old)`);
      return cache;
    }
  }
  
  console.log(`[iNat Cache] No valid cache found, will fetch from API`);
  return null;
}

async function getCachedObservations(boundingBox: {north: number, south: number, east: number, west: number}, monthStart?: string, monthEnd?: string) {
  console.log(`[iNat Cache] Retrieving cached observations for area`);
  
  let monthCondition = '';
  if (monthStart && monthEnd) {
    const startMonth = parseInt(monthStart);
    const endMonth = parseInt(monthEnd);
    if (startMonth <= endMonth) {
      monthCondition = `AND EXTRACT(MONTH FROM observed_on) BETWEEN ${startMonth} AND ${endMonth}`;
    } else {
      monthCondition = `AND (EXTRACT(MONTH FROM observed_on) >= ${startMonth} OR EXTRACT(MONTH FROM observed_on) <= ${endMonth})`;
    }
  } else if (monthStart) {
    monthCondition = `AND EXTRACT(MONTH FROM observed_on) >= ${parseInt(monthStart)}`;
  } else if (monthEnd) {
    monthCondition = `AND EXTRACT(MONTH FROM observed_on) <= ${parseInt(monthEnd)}`;
  }
  
  const cachedObs = await db.execute(sql`
    SELECT 
      inat_id,
      scientific_name,
      common_name, 
      family,
      rank,
      latitude,
      longitude,
      observed_on,
      place_guess,
      quality_grade,
      user_name,
      photos,
      taxon_data,
      user_data
    FROM inat_observations_cache
    WHERE latitude IS NOT NULL 
      AND longitude IS NOT NULL
      AND CAST(latitude AS DECIMAL) <= ${boundingBox.north}
      AND CAST(latitude AS DECIMAL) >= ${boundingBox.south}
      AND CAST(longitude AS DECIMAL) <= ${boundingBox.east}
      AND CAST(longitude AS DECIMAL) >= ${boundingBox.west}
      AND rank = 'species'
      ${sql.raw(monthCondition)}
    ORDER BY observed_on DESC
  `);
  
  console.log(`[iNat Cache] Retrieved ${cachedObs.rows.length} cached observations`);
  return cachedObs.rows;
}

// MO Cache Management Functions
async function checkMoCacheForArea(fieldGuideId: number, expansionMiles: number, boundingBox: {north: number, south: number, east: number, west: number}) {
  console.log(`[MO Cache] Checking cache for field guide ${fieldGuideId}, expansion: ${expansionMiles} miles`);
  
  // Check if we have cached data that covers this area
  const existingCache = await db.select().from(moCacheMetadata)
    .where(and(
      eq(moCacheMetadata.fieldGuideId, fieldGuideId),
      gte(moCacheMetadata.maxRadiusMiles, expansionMiles.toString()),
      gte(moCacheMetadata.boundingBoxNorth, boundingBox.north.toString()),
      lte(moCacheMetadata.boundingBoxSouth, boundingBox.south.toString()),
      gte(moCacheMetadata.boundingBoxEast, boundingBox.east.toString()),
      lte(moCacheMetadata.boundingBoxWest, boundingBox.west.toString())
    ))
    .orderBy(desc(moCacheMetadata.lastFetchedAt))
    .limit(1);

  if (existingCache.length > 0) {
    const cache = existingCache[0];
    const cacheAge = Date.now() - new Date(cache.lastFetchedAt!).getTime();
    const maxCacheAge = 4 * 60 * 60 * 1000; // 4 hours
    
    if (cacheAge < maxCacheAge) {
      console.log(`[MO Cache] Found valid cache (${cache.observationsCount} observations, ${Math.round(cacheAge / (60 * 60 * 1000))}h old)`);
      return cache;
    }
  }
  
  console.log(`[MO Cache] No valid cache found, will fetch from API`);
  return null;
}

async function getCachedMoObservations(boundingBox: {north: number, south: number, east: number, west: number}, monthStart?: string, monthEnd?: string) {
  console.log(`[MO Cache] Retrieving cached observations for area`);
  
  let monthCondition = '';
  if (monthStart && monthEnd) {
    monthCondition = `AND "observedOn" BETWEEN '${monthStart}' AND '${monthEnd}'`;
  } else if (monthStart) {
    monthCondition = `AND "observedOn" >= '${monthStart}'`;
  } else if (monthEnd) {
    monthCondition = `AND "observedOn" <= '${monthEnd}'`;
  }

  const cachedObs = await db.execute(sql`
    SELECT * FROM mo_observations_cache
    WHERE latitude >= ${boundingBox.south}
      AND latitude <= ${boundingBox.north}
      AND longitude >= ${boundingBox.west}
      AND longitude <= ${boundingBox.east}
      ${sql.raw(monthCondition)}
    ORDER BY "observedOn" DESC
  `);
  
  // Transform cached data to match API format expected by filtering logic
  const transformedObs = cachedObs.rows.map((row: any) => ({
    mo_id: row.moId,
    scientific_name: row.scientificName,
    common_name: row.commonName,
    family: row.family,
    rank: 'species',
    latitude: row.latitude ? parseFloat(row.latitude) : null,
    longitude: row.longitude ? parseFloat(row.longitude) : null,
    observed_on: row.observedOn ? new Date(row.observedOn) : null,
    location: null,
    place_guess: row.placeName,
    user_name: row.userName,
    user_login: row.userLogin,
    photos: [], // Will be parsed from API response if needed
    confidence: null,
    notes: row.notes,
    api_response: row.apiResponse
  }));
  
  // Parse photos from API response if available
  transformedObs.forEach(obs => {
    try {
      if (obs.api_response) {
        const apiData = JSON.parse(obs.api_response);
        obs.photos = apiData.images?.map((img: any) => img.url) || [];
      }
    } catch (e) {
      obs.photos = [];
    }
  });
  
  console.log(`[MO Cache] Retrieved ${transformedObs.length} cached observations`);
  return transformedObs;
}

// MO API Functions
async function fetchMoObservations(boundingBox: {north: number, south: number, east: number, west: number}, monthStart?: string, monthEnd?: string) {
  console.log(`[MO API] Fetching observations from Mushroom Observer API`);
  
  // Round coordinates to 0.1 degrees (MO precision limit)
  const roundToTenth = (num: number) => Math.round(num * 10) / 10;
  
  const moParams = new URLSearchParams({
    north: roundToTenth(boundingBox.north).toString(),
    south: roundToTenth(boundingBox.south).toString(),
    east: roundToTenth(boundingBox.east).toString(),
    west: roundToTenth(boundingBox.west).toString(),
    format: 'json',
    detail: 'high'
  });

  // Add month filters if specified (MO uses different month format)
  if (monthStart && monthEnd) {
    const start = parseInt(monthStart);
    const end = parseInt(monthEnd);
    if (start === end) {
      moParams.set('month', start.toString());
    } else {
      // MO doesn't support month ranges like iNat, so we'll skip month filtering for ranges
      console.log(`[MO API] Skipping month range filter (MO doesn't support ranges)`);
    }
  } else if (monthStart) {
    moParams.set('month', monthStart);
  } else if (monthEnd) {
    moParams.set('month', monthEnd);
  }

  const allMoObservations = [];
  let page = 1;
  const maxPages = 10; // Conservative limit due to MO's 20/min rate limit
  
  try {
    do {
      moParams.set('page', page.toString());
      const moUrl = `https://mushroomobserver.org/api2/observations?${moParams}`;
      
      console.log(`[MO API] Fetching page ${page} from: ${moUrl}`);
      
      const moResponse = await fetch(moUrl, {
        headers: {
          'User-Agent': 'MycoMap Field Guide - Species Discovery Tool',
          'Accept': 'application/json'
        }
      });

      if (moResponse.ok) {
        const moData = await moResponse.json();
        
        if (page === 1) {
          console.log(`[MO API] Page ${page}: Found ${moData.results?.length || 0} observations`);
        }

        if (moData.results && moData.results.length > 0) {
          
          // Transform MO data to our standard format
          const transformedObs = moData.results.map((obs: any) => ({
            mo_id: obs.id,
            scientific_name: obs.consensus?.name || obs.name?.text_name || obs.name || null,
            common_name: null, // MO doesn't typically provide common names in this endpoint
            family: null, // Would need separate taxonomy lookup
            rank: 'species', // Assume species for now
            latitude: obs.latitude ? parseFloat(obs.latitude) : null,
            longitude: obs.longitude ? parseFloat(obs.longitude) : null,
            observed_on: obs.when ? new Date(obs.when) : null,
            location: obs.location?.name || null,
            place_guess: obs.where || null,
            user_name: obs.user?.name || null,
            user_login: obs.user?.login || null,
            photos: obs.images?.map((img: any) => img.url) || [],
            confidence: obs.vote?.value || null,
            notes: obs.notes || null,
            api_response: JSON.stringify(obs)
          }));
          
          allMoObservations.push(...transformedObs);
          page++;
          
          // Conservative pagination due to rate limit
          if (allMoObservations.length >= 2000 || page > maxPages) {
            console.log(`[MO API] Reached limit of ${allMoObservations.length} observations, stopping`);
            break;
          }
          
          // Rate limiting: wait 3 seconds between requests (20/min = one every 3 seconds)
          if (page <= maxPages) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        } else {
          break; // No more results
        }
      } else {
        console.log(`[MO API] Page ${page} failed: ${moResponse.status} ${moResponse.statusText}`);
        break;
      }
    } while (allMoObservations.length < 2000 && page <= maxPages);

    console.log(`[MO API] Fetched ${allMoObservations.length} observations from MO API across ${page-1} pages`);
    return allMoObservations;
    
  } catch (error) {
    console.error(`[MO API] Error fetching observations:`, error);
    return [];
  }
}

async function storeMoObservationsInCache(fieldGuideId: number, expansionMiles: number, boundingBox: {north: number, south: number, east: number, west: number}, observations: any[]) {
  console.log(`[MO Cache] Storing ${observations.length} observations in cache`);
  
  try {
    // Store cache metadata
    const [metadata] = await db.insert(moCacheMetadata).values({
      fieldGuideId,
      centerLat: ((boundingBox.north + boundingBox.south) / 2).toString(),
      centerLng: ((boundingBox.east + boundingBox.west) / 2).toString(),
      maxRadiusMiles: expansionMiles.toString(),
      boundingBoxNorth: boundingBox.north.toString(),
      boundingBoxSouth: boundingBox.south.toString(),
      boundingBoxEast: boundingBox.east.toString(),
      boundingBoxWest: boundingBox.west.toString(),
      observationsCount: observations.length,
      lastFetchedAt: new Date()
    }).returning();

    // Store observations in batches to avoid memory issues
    const batchSize = 100;
    for (let i = 0; i < observations.length; i += batchSize) {
      const batch = observations.slice(i, i + batchSize);
      
      const cacheEntries = batch.map(obs => ({
        moId: parseInt(obs.mo_id),
        scientificName: obs.scientific_name,
        commonName: obs.common_name,
        family: obs.family,
        latitude: obs.latitude ? obs.latitude.toString() : null,
        longitude: obs.longitude ? obs.longitude.toString() : null,
        observedOn: obs.observed_on ? obs.observed_on.toISOString().split('T')[0] : null,
        userName: obs.user_name,
        userLogin: obs.user_login,
        placeName: obs.place_guess,
        notes: obs.notes,
        apiResponse: obs.api_response
      }));
      
      await db.insert(moObservationsCache).values(cacheEntries).onConflictDoNothing();
    }
    
    console.log(`[MO Cache] Successfully cached ${observations.length} observations`);
  } catch (error) {
    console.error(`[MO Cache] Error storing cache:`, error);
  }
}

async function fetchAndCacheInatData(fieldGuideId: number, expansionMiles: number, boundingBox: {north: number, south: number, east: number, west: number}, monthStart?: string, monthEnd?: string, progressCallback?: (data: any) => void) {
  console.log(`[iNat Cache] Fetching fresh data from API for ${expansionMiles} mile expansion`);
  
  const inatParams = new URLSearchParams({
    swlat: boundingBox.south.toString(),
    swlng: boundingBox.west.toString(), 
    nelat: boundingBox.north.toString(),
    nelng: boundingBox.east.toString(),
    iconic_taxa: 'Fungi',
    quality_grade: 'research',
    per_page: '200',
    page: '1'
  });

  // Add month filters if specified
  if (monthStart && monthEnd) {
    if (monthStart === monthEnd) {
      inatParams.set('month', monthStart);
    }
  } else if (monthStart) {
    inatParams.set('month', monthStart);
  } else if (monthEnd) {
    inatParams.set('month', monthEnd);
  }

  const allInatObservations = [];
  let page = 1;
  let totalResults = 0;

  do {
    inatParams.set('page', page.toString());
    const inatResponse = await fetch(`https://api.inaturalist.org/v1/observations?${inatParams}`);
    
    if (inatResponse.ok) {
      const inatData = await inatResponse.json();
      
      if (page === 1) {
        totalResults = inatData.total_results || 0;
        console.log(`[iNat Cache] API Page ${page}: Found ${inatData.results?.length || 0} observations (Total available: ${totalResults})`);
        
        // Broadcast initial progress
        if (progressCallback) {
          progressCallback({
            type: 'inat-caching-progress',
            stage: 'fetching',
            current: 0,
            total: Math.min(totalResults, 10000),
            message: `Starting to fetch ${totalResults} observations from iNaturalist...`
          });
        }
      } else {
        console.log(`[iNat Cache] API Page ${page}: Found ${inatData.results?.length || 0} observations`);
      }

      if (inatData.results && inatData.results.length > 0) {
        allInatObservations.push(...inatData.results);
        
        // Broadcast fetch progress
        if (progressCallback) {
          const fetchProgress = Math.min(allInatObservations.length, Math.min(totalResults, 10000));
          progressCallback({
            type: 'inat-caching-progress',
            stage: 'fetching',
            current: fetchProgress,
            total: Math.min(totalResults, 10000),
            message: `Fetched ${allInatObservations.length} of ${totalResults} observations (Page ${page})...`
          });
        }
        
        page++;
        
        if (allInatObservations.length >= 10000 || page > 50) {
          console.log(`[iNat Cache] Reached limit of ${allInatObservations.length} observations, stopping`);
          break;
        }
      } else {
        break;
      }
    } else {
      console.log(`[iNat Cache] API Page ${page} failed: ${inatResponse.status}`);
      break;
    }
  } while (allInatObservations.length < totalResults && page <= 50);

  console.log(`[iNat Cache] Fetched ${allInatObservations.length} observations from API across ${page-1} pages`);

  // Cache the observations in batches
  if (allInatObservations.length > 0) {
    console.log(`[iNat Cache] Caching ${allInatObservations.length} observations...`);
    
    // Broadcast caching start
    if (progressCallback) {
      progressCallback({
        type: 'inat-caching-progress',
        stage: 'caching',
        current: 0,
        total: allInatObservations.length,
        message: `Starting to cache ${allInatObservations.length} observations to database...`
      });
    }
    
    const batchSize = 100;
    for (let i = 0; i < allInatObservations.length; i += batchSize) {
      const batch = allInatObservations.slice(i, i + batchSize);
      const cacheData = batch.map(obs => ({
        inatId: obs.id,
        scientificName: obs.taxon?.name || null,
        commonName: obs.taxon?.preferred_common_name || null,
        family: obs.taxon?.ancestors?.find((a: any) => a.rank === 'family')?.name || null,
        rank: obs.taxon?.rank || null,
        latitude: obs.location ? obs.location.split(',')[0] : null,
        longitude: obs.location ? obs.location.split(',')[1] : null,
        observedOn: obs.observed_on || null,
        placeGuess: obs.place_guess || null,
        qualityGrade: obs.quality_grade || null,
        userName: obs.user?.name || null,
        userLogin: obs.user?.login || null,
        photos: obs.photos?.map((p: any) => p.url?.replace('square', 'medium')).filter(Boolean) || [],
        taxonData: obs.taxon ? JSON.stringify(obs.taxon) : null,
        userData: obs.user ? JSON.stringify(obs.user) : null,
      }));

      try {
        // Use Drizzle's proper insertion methods for better reliability
        await db.insert(inatObservationsCache).values(cacheData).onConflictDoUpdate({
          target: inatObservationsCache.inatId,
          set: {
            scientificName: sql`EXCLUDED.scientific_name`,
            commonName: sql`EXCLUDED.common_name`,
            family: sql`EXCLUDED.family`,
            rank: sql`EXCLUDED.rank`,
            latitude: sql`EXCLUDED.latitude`,
            longitude: sql`EXCLUDED.longitude`,
            observedOn: sql`EXCLUDED.observed_on`,
            placeGuess: sql`EXCLUDED.place_guess`,
            qualityGrade: sql`EXCLUDED.quality_grade`,
            userName: sql`EXCLUDED.user_name`,
            userLogin: sql`EXCLUDED.user_login`,
            photos: sql`EXCLUDED.photos`,
            taxonData: sql`EXCLUDED.taxon_data`,
            userData: sql`EXCLUDED.user_data`,
            updatedAt: sql`NOW()`,
          },
        });
        console.log(`[iNat Cache] Successfully cached batch of ${cacheData.length} observations`);
        
        // Broadcast caching progress
        if (progressCallback) {
          const currentCached = Math.min(i + batchSize, allInatObservations.length);
          progressCallback({
            type: 'inat-caching-progress',
            stage: 'caching',
            current: currentCached,
            total: allInatObservations.length,
            message: `Cached ${currentCached} of ${allInatObservations.length} observations...`
          });
        }
      } catch (error) {
        console.error(`[iNat Cache] Error caching batch:`, error);
      }
    }

    // Update metadata using proper Drizzle methods
    const centerLat = (boundingBox.north + boundingBox.south) / 2;
    const centerLng = (boundingBox.east + boundingBox.west) / 2;
    
    try {
      await db.insert(inatCacheMetadata).values({
        fieldGuideId: fieldGuideId,
        centerLat: centerLat.toString(),
        centerLng: centerLng.toString(),
        maxRadiusMiles: expansionMiles.toString(),
        boundingBoxNorth: boundingBox.north.toString(),
        boundingBoxSouth: boundingBox.south.toString(),
        boundingBoxEast: boundingBox.east.toString(),
        boundingBoxWest: boundingBox.west.toString(),
        observationsCount: allInatObservations.length,
        lastFetchedAt: new Date(),
      }).onConflictDoUpdate({
        target: inatCacheMetadata.fieldGuideId,
        set: {
          maxRadiusMiles: sql`GREATEST(inat_cache_metadata.max_radius_miles, ${expansionMiles})`,
          boundingBoxNorth: sql`GREATEST(inat_cache_metadata.bounding_box_north, ${boundingBox.north})`,
          boundingBoxSouth: sql`LEAST(inat_cache_metadata.bounding_box_south, ${boundingBox.south})`,
          boundingBoxEast: sql`GREATEST(inat_cache_metadata.bounding_box_east, ${boundingBox.east})`,
          boundingBoxWest: sql`LEAST(inat_cache_metadata.bounding_box_west, ${boundingBox.west})`,
          observationsCount: allInatObservations.length,
          lastFetchedAt: new Date(),
        },
      });
      console.log(`[iNat Cache] Metadata updated for field guide ${fieldGuideId}, ${expansionMiles} mile radius`);
    } catch (error) {
      console.error(`[iNat Cache] Error updating metadata:`, error);
    }

    console.log(`[iNat Cache] Successfully cached ${allInatObservations.length} observations`);
  }

  return allInatObservations;
}

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
                place_ids: obs.place_ids || [],
                project_ids: obs.project_ids || [],
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
  
  // Setup Replit Auth (must be before other routes)
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Initialize subscription checker with storage method
  setSubscriptionChecker((userId: string) => storage.getUserSubscription(userId));
  
  // Initialize admin checker
  setAdminChecker(async (userId: string) => {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user?.role === 'admin';
  });

  // =============================================
  // SUBSCRIPTION API ENDPOINTS  
  // =============================================

  // Initialize Stripe if key is available
  let stripe: any = null;
  if (process.env.STRIPE_SECRET_KEY) {
    const Stripe = require('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia'
    });
  }

  // Get all subscription plans (public)
  app.get("/api/subscriptions/plans", async (req, res) => {
    try {
      const plans = await storage.getSubscriptionPlans();
      res.json(plans);
    } catch (error) {
      console.error("Error fetching subscription plans:", error);
      res.status(500).json({ error: "Failed to fetch subscription plans" });
    }
  });

  // Get user's current subscription status (requires auth)
  app.get("/api/subscriptions/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const subscription = await storage.getUserSubscription(String(userId));
      
      // Check if subscription is active and within period
      let hasActiveSubscription = false;
      if (subscription && subscription.status === 'active') {
        const now = new Date();
        const periodEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
        hasActiveSubscription = !periodEnd || now < periodEnd;
      }
      
      res.json({ 
        hasActiveSubscription,
        subscription 
      });
    } catch (error) {
      console.error("Error fetching subscription status:", error);
      res.status(500).json({ error: "Failed to fetch subscription status" });
    }
  });

  // Create Stripe checkout session
  app.post("/api/subscriptions/checkout/stripe", isAuthenticated, async (req: any, res) => {
    try {
      if (!stripe) {
        return res.status(503).json({ error: "Stripe is not configured" });
      }

      const userId = req.user?.id || req.user?.claims?.sub;
      const userEmail = req.user?.email || req.user?.claims?.email;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { planSlug, amountCents } = req.body;
      
      const plan = await storage.getSubscriptionPlanBySlug(planSlug);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      // Validate amount is within plan range
      const amount = Math.max(plan.priceMinCents, Math.min(plan.priceMaxCents, amountCents || plan.priceDefaultCents));

      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer_email: userEmail,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `MycoMap ${plan.name}`,
              description: plan.description || `Monthly membership supporting fungal biodiversity research`,
            },
            unit_amount: amount,
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        }],
        metadata: {
          userId,
          planId: plan.id.toString(),
          planSlug: plan.slug,
        },
        success_url: `${req.headers.origin || 'https://mycomap.com'}/membership/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin || 'https://mycomap.com'}/membership`,
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error("Error creating Stripe checkout:", error);
      res.status(500).json({ error: error.message || "Failed to create checkout session" });
    }
  });

  // PayPal/Venmo checkout (placeholder - requires PayPal SDK setup)
  app.post("/api/subscriptions/checkout/paypal", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // PayPal integration requires additional setup with PayPal SDK
      // For now, return a message indicating setup is needed
      if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
        return res.status(503).json({ 
          error: "PayPal is not yet configured. Please use credit card payment or contact support." 
        });
      }

      const { planSlug, amountCents } = req.body;
      
      const plan = await storage.getSubscriptionPlanBySlug(planSlug);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      // TODO: Implement PayPal subscription creation
      // This would involve:
      // 1. Creating a PayPal billing agreement
      // 2. Getting approval URL
      // 3. Handling webhook for payment confirmation
      
      res.status(503).json({ error: "PayPal checkout coming soon" });
    } catch (error: any) {
      console.error("Error creating PayPal checkout:", error);
      res.status(500).json({ error: error.message || "Failed to create checkout session" });
    }
  });

  // Stripe webhook handler
  app.post("/api/webhooks/stripe", async (req, res) => {
    if (!stripe) {
      return res.status(503).json({ error: "Stripe is not configured" });
    }

    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      if (endpointSecret && sig) {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
      } else {
        event = req.body;
      }
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const { userId, planId, planSlug } = session.metadata || {};
          
          if (userId && planId) {
            // Create subscription record
            const subscription = await storage.createUserSubscription({
              userId,
              planId: parseInt(planId),
              status: 'active',
              provider: 'stripe',
              providerSubscriptionId: session.subscription,
              providerCustomerId: session.customer,
              amountCents: session.amount_total,
              currency: session.currency?.toUpperCase() || 'USD',
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            });

            // Log transaction
            await storage.createPaymentTransaction({
              userId,
              subscriptionId: subscription.id,
              provider: 'stripe',
              providerTransactionId: session.payment_intent,
              type: 'subscription_created',
              status: 'succeeded',
              amountCents: session.amount_total,
              currency: session.currency?.toUpperCase() || 'USD',
            });

            console.log(`Subscription created for user ${userId}: ${planSlug}`);
          }
          break;
        }

        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          // Handle subscription updates/cancellations here
          console.log(`Subscription ${event.type}:`, subscription.id);
          break;
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // =============================================
  // FORAGING MAP API ENDPOINTS
  // =============================================

  // Search iNaturalist for fungi observations by location and date range
  app.get("/api/foraging/search", async (req: any, res) => {
    try {
      const { lat, lng, radius, startDate, endDate, month } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({ error: "Latitude and longitude are required" });
      }

      const latitude = parseFloat(lat as string);
      const longitude = parseFloat(lng as string);
      const radiusKm = parseFloat(radius as string) * 1.60934 || 80; // Convert miles to km, default 50 miles

      // Build iNaturalist API parameters
      const inatParams = new URLSearchParams({
        taxon_id: '47170', // Fungi kingdom
        lat: latitude.toString(),
        lng: longitude.toString(),
        radius: radiusKm.toString(),
        per_page: '200',
        order: 'desc',
        order_by: 'observed_on',
        quality_grade: 'research,needs_id',
        photos: 'true',
        hrank: 'species', // Limit to species, subspecies, variety, or form
      });

      // Add date range if provided
      if (startDate) {
        // Format: YYYY-MM-DD, but we want to use day of year matching for historical data
        const start = new Date(startDate as string);
        const end = endDate ? new Date(endDate as string) : new Date();
        
        // For foraging, we want observations from any year but within the date window
        // Use month/day range instead of specific dates
        const startMonth = start.getMonth() + 1;
        const startDay = start.getDate();
        const endMonth = end.getMonth() + 1;
        const endDay = end.getDate();
        
        // iNaturalist supports month parameter for filtering
        if (startMonth === endMonth) {
          inatParams.set('month', startMonth.toString());
        } else {
          // For ranges spanning multiple months, include all months in range
          const months = [];
          let m = startMonth;
          while (true) {
            months.push(m);
            if (m === endMonth) break;
            m = m === 12 ? 1 : m + 1;
          }
          inatParams.set('month', months.join(','));
        }
      }

      // If specific month selected, use that instead
      if (month && month !== 'any') {
        inatParams.set('month', month as string);
      }

      console.log(`[Foraging Search] Searching iNaturalist: lat=${latitude}, lng=${longitude}, radius=${radiusKm}km`);

      const allObservations: any[] = [];
      let page = 1;
      const maxPages = 5; // Limit to 1000 observations max

      do {
        inatParams.set('page', page.toString());
        const response = await fetch(`https://api.inaturalist.org/v1/observations?${inatParams}`);
        
        if (!response.ok) {
          console.error(`[Foraging Search] iNaturalist API error: ${response.status}`);
          break;
        }

        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
          allObservations.push(...data.results);
        }

        if (!data.results || data.results.length < 200 || page >= maxPages) {
          break;
        }

        page++;
        // Small delay for rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (true);

      console.log(`[Foraging Search] Found ${allObservations.length} observations`);

      const currentYear = new Date().getFullYear();

      // First pass: identify species with current-year research grade observations
      const speciesWithCurrentYearResearchGrade = new Set<string>();
      allObservations.forEach(obs => {
        const scientificName = obs.taxon?.name || obs.species_guess || 'Unknown';
        const observedYear = obs.observed_on ? new Date(obs.observed_on).getFullYear() : null;
        if (obs.quality_grade === 'research' && observedYear === currentYear) {
          speciesWithCurrentYearResearchGrade.add(scientificName);
        }
      });

      // Transform observations for the frontend
      const observations = allObservations.map(obs => {
        const scientificName = obs.taxon?.name || obs.species_guess || 'Unknown';
        return {
          id: obs.id,
          latitude: obs.geojson?.coordinates?.[1]?.toString() || obs.location?.split(',')[0] || '',
          longitude: obs.geojson?.coordinates?.[0]?.toString() || obs.location?.split(',')[1] || '',
          scientificName,
          commonName: obs.taxon?.preferred_common_name || '',
          state: obs.place_guess || '',
          observedOn: obs.observed_on || '',
          photoUrl: obs.photos?.[0]?.url?.replace('square', 'medium') || null,
          userName: obs.user?.name || obs.user?.login || 'Anonymous',
          qualityGrade: obs.quality_grade,
          hasCurrentYearResearchGrade: speciesWithCurrentYearResearchGrade.has(scientificName),
        };
      });

      // Calculate top species
      const speciesCounts: Record<string, { name: string, commonName: string, count: number, hasCurrentYearResearchGrade: boolean }> = {};
      observations.forEach(obs => {
        const key = obs.scientificName;
        if (!speciesCounts[key]) {
          speciesCounts[key] = { 
            name: key, 
            commonName: obs.commonName, 
            count: 0,
            hasCurrentYearResearchGrade: obs.hasCurrentYearResearchGrade
          };
        }
        speciesCounts[key].count++;
      });

      const topSpecies = Object.values(speciesCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

      res.json({
        observations,
        topSpecies,
        totalCount: allObservations.length,
        searchParams: { lat: latitude, lng: longitude, radiusKm }
      });
    } catch (error: any) {
      console.error("[Foraging Search] Error:", error);
      res.status(500).json({ error: error.message || "Failed to search observations" });
    }
  });

  // =============================================
  // FITNESS TRACKER API ENDPOINTS
  // =============================================

  // Search iNaturalist for observations by username and date range
  app.get("/api/fitness/observations", async (req: any, res) => {
    try {
      const { username, startDate, endDate } = req.query;

      if (!username) {
        return res.status(400).json({ error: "Username is required" });
      }
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "Start date and end date are required" });
      }

      console.log(`[Fitness Tracker] Fetching observations for user: ${username}, dates: ${startDate} to ${endDate}`);

      // Build iNaturalist API parameters
      const inatParams = new URLSearchParams({
        user_login: username as string,
        d1: startDate as string,
        d2: endDate as string,
        per_page: '200',
        order: 'asc',
        order_by: 'observed_on_string',
        quality_grade: 'research,needs_id,casual',
        photos: 'true',
      });

      const allObservations: any[] = [];
      let page = 1;
      const maxPages = 10;

      do {
        inatParams.set('page', page.toString());
        const response = await fetch(`https://api.inaturalist.org/v1/observations?${inatParams}`);
        
        if (!response.ok) {
          console.error(`[Fitness Tracker] iNaturalist API error: ${response.status}`);
          break;
        }

        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
          allObservations.push(...data.results);
        }

        if (!data.results || data.results.length < 200 || page >= maxPages) {
          break;
        }

        page++;
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (true);

      console.log(`[Fitness Tracker] Found ${allObservations.length} observations for ${username}`);

      // Transform observations for the frontend
      const observations = allObservations
        .filter(obs => obs.geojson?.coordinates)
        .map(obs => {
          // Extract time from observed_on_string which preserves the observer's local time
          // Format can be "2024-03-14 1:14 PM" or "2024-03-14T13:14:00"
          let timeObserved = '00:00:00';
          if (obs.observed_on_string) {
            const str = obs.observed_on_string;
            // Try to extract time from formats like "2024-03-14 1:14 PM" or "Mar 14, 2024 1:14 PM"
            const timeMatch = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
            if (timeMatch) {
              let hours = parseInt(timeMatch[1]);
              const minutes = timeMatch[2];
              const seconds = timeMatch[3] || '00';
              const ampm = timeMatch[4];
              
              // Convert to 24-hour format if AM/PM present
              if (ampm) {
                if (ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
                if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
              }
              
              timeObserved = `${hours.toString().padStart(2, '0')}:${minutes}:${seconds}`;
            }
          }

          return {
            id: obs.id,
            latitude: obs.geojson.coordinates[1].toString(),
            longitude: obs.geojson.coordinates[0].toString(),
            scientificName: obs.taxon?.name || obs.species_guess || 'Unknown',
            commonName: obs.taxon?.preferred_common_name || '',
            observedOn: obs.observed_on || '',
            timeObserved,
            photoUrl: obs.photos?.[0]?.url?.replace('square', 'medium') || null,
          };
        });

      res.json({ observations });
    } catch (error: any) {
      console.error("[Fitness Tracker] Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch observations" });
    }
  });

  // Get cache status for a user
  app.get("/api/fitness/cache/status", async (req: any, res) => {
    try {
      const { username } = req.query;
      if (!username) {
        return res.status(400).json({ error: "Username is required" });
      }
      
      const metadata = await storage.getFitnessCacheMetadata(username as string);
      res.json(metadata || { 
        username: (username as string).toLowerCase(), 
        totalObservations: 0, 
        syncStatus: 'idle',
        syncProgress: 0 
      });
    } catch (error: any) {
      console.error("[Fitness Cache] Error getting status:", error);
      res.status(500).json({ error: error.message || "Failed to get cache status" });
    }
  });

  // Get unique observation dates for a user's cached observations
  app.get("/api/fitness/cache/dates", async (req: any, res) => {
    try {
      const { username } = req.query;
      if (!username) {
        return res.status(400).json({ error: "Username is required" });
      }
      
      const dates = await storage.getFitnessObservationDates(username as string);
      res.json({ dates });
    } catch (error: any) {
      console.error("[Fitness Cache] Error getting dates:", error);
      res.status(500).json({ error: error.message || "Failed to get observation dates" });
    }
  });

  // Get cached observations
  app.get("/api/fitness/cache", async (req: any, res) => {
    try {
      const { username, startDate, endDate, limit } = req.query;
      if (!username) {
        return res.status(400).json({ error: "Username is required" });
      }
      
      const limitNum = limit ? parseInt(limit as string, 10) : undefined;
      
      const observations = await storage.getFitnessObservations(
        username as string, 
        startDate as string, 
        endDate as string,
        limitNum
      );
      
      // Transform to match frontend format
      const transformed = observations.map(obs => ({
        id: obs.observationId,
        latitude: obs.latitude || '',
        longitude: obs.longitude || '',
        scientificName: obs.scientificName || 'Unknown',
        commonName: obs.commonName || '',
        observedOn: obs.observedOn || '',
        timeObserved: obs.timeObserved || '00:00:00',
        photoUrl: obs.photoUrl || null,
      }));
      
      res.json({ observations: transformed });
    } catch (error: any) {
      console.error("[Fitness Cache] Error getting observations:", error);
      res.status(500).json({ error: error.message || "Failed to get cached observations" });
    }
  });

  // Start full sync for a user (paginated with progress tracking)
  app.post("/api/fitness/cache/sync", async (req: any, res) => {
    try {
      const { username } = req.body;
      if (!username) {
        return res.status(400).json({ error: "Username is required" });
      }

      const usernameLower = (username as string).toLowerCase();
      
      // Check if already syncing
      const existingMeta = await storage.getFitnessCacheMetadata(usernameLower);
      if (existingMeta?.syncStatus === 'syncing') {
        // Check if sync is actually stuck (no progress in 2+ minutes = likely orphaned)
        const lastUpdate = existingMeta.updatedAt ? new Date(existingMeta.updatedAt).getTime() : 0;
        const now = Date.now();
        const minutesSinceUpdate = (now - lastUpdate) / (1000 * 60);
        
        if (minutesSinceUpdate > 2) {
          // Sync is orphaned (server restarted while syncing) - allow restart
          const actualCount = await storage.getFitnessObservationCount(usernameLower);
          console.log(`[Fitness Cache] Detected orphaned sync for ${usernameLower}, resetting (${actualCount} observations saved)`);
          await storage.upsertFitnessCacheMetadata({
            username: usernameLower,
            totalObservations: actualCount,
            syncStatus: 'interrupted',
            syncProgress: 0,
            syncMessage: `Previous sync was interrupted. ${actualCount} observations saved.`,
          });
          // Continue to start new sync below
        } else {
          return res.json({ 
            status: 'already_syncing', 
            progress: existingMeta.syncProgress,
            message: existingMeta.syncMessage 
          });
        }
      }

      // Initialize sync metadata
      await storage.upsertFitnessCacheMetadata({
        username: usernameLower,
        syncStatus: 'syncing',
        syncProgress: 0,
        syncMessage: 'Starting sync...',
        totalObservations: 0,
      });

      // iNaturalist API request headers
      const inatHeaders = {
        'User-Agent': 'MycoMap/1.0 (https://mycomap.org; contact@mycomap.org)',
        'Accept': 'application/json',
      };

      // Start async sync process
      (async () => {
        try {
          // Check actual cache count and last processed page from database
          const actualCachedCount = await storage.getFitnessObservationCount(usernameLower);
          const existingMetadata = await storage.getFitnessCacheMetadata(usernameLower);
          const PER_PAGE = 200;
          
          // Resume logic: prefer lastProcessedPage, but fall back to calculating from cache count
          const storedPage = existingMetadata?.lastProcessedPage || 0;
          let resumeFromPage: number;
          
          if (storedPage > 0) {
            // We have explicit page tracking - resume from next page
            resumeFromPage = storedPage + 1;
          } else if (actualCachedCount > 0) {
            // No page tracking but have cached data - calculate from cache count
            // Add 1 to skip pages we've already fetched
            resumeFromPage = Math.floor(actualCachedCount / PER_PAGE) + 1;
          } else {
            // Fresh start
            resumeFromPage = 1;
          }
          
          console.log(`[Fitness Cache] Starting sync for ${usernameLower} (resume from page ${resumeFromPage}, storedPage: ${storedPage}, cached: ${actualCachedCount})`);
          
          // First, get total count
          const countParams = new URLSearchParams({
            user_login: usernameLower,
            per_page: '1',
          });
          
          const countResponse = await fetch(`https://api.inaturalist.org/v1/observations?${countParams}`, {
            headers: inatHeaders,
          });
          
          if (!countResponse.ok) {
            throw new Error(`iNaturalist API error getting count: ${countResponse.status}`);
          }
          
          const countData = await countResponse.json();
          const totalCount = countData.total_results || 0;
          
          await storage.updateFitnessSyncProgress(usernameLower, 0, 'syncing', 
            resumeFromPage > 1 
              ? `Resuming sync: ${actualCachedCount} already cached, ${totalCount} total`
              : `Found ${totalCount} observations to sync`
          );
          
          if (totalCount === 0) {
            await storage.upsertFitnessCacheMetadata({
              username: usernameLower,
              totalObservations: 0,
              lastFullSyncAt: new Date(),
              syncStatus: 'completed',
              syncProgress: 100,
              syncMessage: 'No observations found',
            });
            return;
          }
          
          // Use cursor-based pagination with id_above to bypass 50-page limit
          let fetched = actualCachedCount;
          let maxUpdatedAt: Date | null = null;
          let consecutiveErrors = 0;
          let batchNumber = 0;
          
          // Get the last observation ID from cache as cursor for resume
          let lastObsId = 0;
          if (actualCachedCount > 0) {
            // Find the max observation ID we already have
            const maxIdResult = await storage.getMaxFitnessObservationId(usernameLower);
            lastObsId = maxIdResult || 0;
            console.log(`[Fitness Cache] Resuming with id_above=${lastObsId}`);
          }
          
          // Store total for progress tracking
          await storage.upsertFitnessCacheMetadata({
            username: usernameLower,
            totalObservations: actualCachedCount,
            totalExpectedObservations: totalCount,
            syncStatus: 'syncing',
            syncProgress: Math.round((fetched / totalCount) * 100),
            syncMessage: `Syncing using cursor pagination...`,
          });
          
          while (fetched < totalCount) {
            // Check if cancelled
            const currentStatus = await storage.getFitnessCacheMetadata(usernameLower);
            if (currentStatus?.syncStatus === 'cancelled') {
              console.log(`[Fitness Cache] Sync cancelled by user at ${fetched} observations`);
              return;
            }
            
            // Use id_above for cursor-based pagination (bypasses 50-page limit)
            const params = new URLSearchParams({
              user_login: usernameLower,
              per_page: PER_PAGE.toString(),
              order: 'asc',
              order_by: 'id', // Order by ID for cursor pagination
              photos: 'true',
            });
            
            if (lastObsId > 0) {
              params.set('id_above', lastObsId.toString());
            }
            
            const response = await fetch(`https://api.inaturalist.org/v1/observations?${params}`, {
              headers: inatHeaders,
            });
            
            if (!response.ok) {
              consecutiveErrors++;
              console.error(`[Fitness Cache] API error ${response.status} (attempt ${consecutiveErrors}), lastObsId=${lastObsId}`);
              
              if (response.status === 403 || response.status === 429) {
                // Rate limited - save progress for cursor-based resume
                const currentCacheCount = await storage.getFitnessObservationCount(usernameLower);
                await storage.upsertFitnessCacheMetadata({
                  username: usernameLower,
                  totalObservations: currentCacheCount,
                  totalExpectedObservations: totalCount,
                  syncStatus: 'rate_limited',
                  syncProgress: Math.round((currentCacheCount / totalCount) * 100),
                  syncMessage: `Rate limited at ${currentCacheCount}/${totalCount}. Wait 2 min and click Sync to resume.`,
                });
                console.log(`[Fitness Cache] Rate limited - saved progress at ${currentCacheCount} observations, lastObsId=${lastObsId}`);
                return;
              }
              
              if (consecutiveErrors >= 3) {
                throw new Error(`iNaturalist API error after 3 retries: ${response.status}`);
              }
              
              // Exponential backoff for other errors
              await new Promise(resolve => setTimeout(resolve, 2000 * consecutiveErrors));
              continue;
            }
            
            consecutiveErrors = 0; // Reset on success
            
            const data = await response.json();
            const results = data.results || [];
            
            if (results.length === 0) break;
            
            // Transform and upsert observations
            const obsToInsert = results
              .filter((obs: any) => obs.geojson?.coordinates)
              .map((obs: any) => {
                // Track max updated_at for incremental sync cursor
                if (obs.updated_at) {
                  const updatedAt = new Date(obs.updated_at);
                  if (!maxUpdatedAt || updatedAt > maxUpdatedAt) {
                    maxUpdatedAt = updatedAt;
                  }
                }
                
                // Extract time from observed_on_string
                let timeObserved = obs.time_observed_at || obs.observed_on_string || '';
                
                return {
                  username: usernameLower,
                  observationId: obs.id,
                  scientificName: obs.taxon?.name || obs.species_guess || 'Unknown',
                  commonName: obs.taxon?.preferred_common_name || '',
                  observedOn: obs.observed_on || '',
                  timeObserved,
                  latitude: obs.geojson.coordinates[1].toString(),
                  longitude: obs.geojson.coordinates[0].toString(),
                  photoUrl: obs.photos?.[0]?.url?.replace('square', 'medium') || null,
                  placeGuess: obs.place_guess || null,
                  inatUpdatedAt: obs.updated_at ? new Date(obs.updated_at) : null,
                };
              });
            
            await storage.upsertFitnessObservations(obsToInsert);
            
            // Update cursor to last observation ID in this batch
            if (results.length > 0) {
              lastObsId = results[results.length - 1].id;
            }
            
            // Update fetched count from actual DB (more accurate)
            const newCacheCount = await storage.getFitnessObservationCount(usernameLower);
            fetched = newCacheCount;
            batchNumber++;
            const progress = Math.round((fetched / totalCount) * 100);
            
            // Save progress after each successful batch
            await storage.upsertFitnessCacheMetadata({
              username: usernameLower,
              totalObservations: fetched,
              totalExpectedObservations: totalCount,
              syncStatus: 'syncing',
              syncProgress: progress,
              syncMessage: `Synced ${fetched} of ${totalCount} observations (batch ${batchNumber})`,
            });
            
            // Slower rate limiting to avoid 403 errors (1 second between requests)
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          // Update metadata on completion
          const finalCount = await storage.getFitnessObservationCount(usernameLower);
          await storage.upsertFitnessCacheMetadata({
            username: usernameLower,
            totalObservations: finalCount,
            totalExpectedObservations: totalCount,
            lastFullSyncAt: new Date(),
            lastSyncCursor: maxUpdatedAt,
            syncStatus: 'completed',
            syncProgress: 100,
            syncMessage: `Synced ${finalCount} observations`,
          });
          
          console.log(`[Fitness Cache] Completed full sync for ${usernameLower}: ${fetched} observations`);
          
        } catch (error: any) {
          console.error(`[Fitness Cache] Sync error for ${usernameLower}:`, error);
          await storage.updateFitnessSyncProgress(usernameLower, 0, 'error', error.message);
        }
      })();

      res.json({ 
        status: 'started', 
        message: 'Sync started in background' 
      });
    } catch (error: any) {
      console.error("[Fitness Cache] Error starting sync:", error);
      res.status(500).json({ error: error.message || "Failed to start sync" });
    }
  });

  // Incremental sync - only fetch updated observations since last sync
  app.post("/api/fitness/cache/sync/incremental", async (req: any, res) => {
    try {
      const { username } = req.body;
      if (!username) {
        return res.status(400).json({ error: "Username is required" });
      }

      const usernameLower = (username as string).toLowerCase();
      
      const metadata = await storage.getFitnessCacheMetadata(usernameLower);
      if (!metadata || !metadata.lastSyncCursor) {
        // No previous sync, do full sync instead
        return res.status(400).json({ 
          error: "No previous sync found", 
          needsFullSync: true 
        });
      }
      
      if (metadata.syncStatus === 'syncing') {
        return res.json({ 
          status: 'already_syncing', 
          progress: metadata.syncProgress 
        });
      }

      await storage.updateFitnessSyncProgress(usernameLower, 0, 'syncing', 'Starting incremental sync...');

      // iNaturalist API request headers
      const inatHeaders = {
        'User-Agent': 'MycoMap/1.0 (https://mycomap.org; contact@mycomap.org)',
        'Accept': 'application/json',
      };

      // Start async incremental sync
      (async () => {
        try {
          const cursorDate = metadata.lastSyncCursor!.toISOString();
          console.log(`[Fitness Cache] Starting incremental sync for ${usernameLower} since ${cursorDate}`);
          
          let page = 1;
          let syncedCount = 0;
          let maxUpdatedAt = metadata.lastSyncCursor;
          
          while (true) {
            const params = new URLSearchParams({
              user_login: usernameLower,
              updated_since: cursorDate,
              per_page: '200',
              page: page.toString(),
              order: 'asc',
              order_by: 'updated_at',
              photos: 'true',
            });
            
            const response = await fetch(`https://api.inaturalist.org/v1/observations?${params}`, {
              headers: inatHeaders,
            });
            if (!response.ok) break;
            
            const data = await response.json();
            const results = data.results || [];
            
            if (results.length === 0) break;
            
            const obsToInsert = results
              .filter((obs: any) => obs.geojson?.coordinates)
              .map((obs: any) => {
                if (obs.updated_at) {
                  const updatedAt = new Date(obs.updated_at);
                  if (!maxUpdatedAt || updatedAt > maxUpdatedAt) {
                    maxUpdatedAt = updatedAt;
                  }
                }
                
                return {
                  username: usernameLower,
                  observationId: obs.id,
                  scientificName: obs.taxon?.name || obs.species_guess || 'Unknown',
                  commonName: obs.taxon?.preferred_common_name || '',
                  observedOn: obs.observed_on || '',
                  timeObserved: obs.time_observed_at || obs.observed_on_string || '',
                  latitude: obs.geojson.coordinates[1].toString(),
                  longitude: obs.geojson.coordinates[0].toString(),
                  photoUrl: obs.photos?.[0]?.url?.replace('square', 'medium') || null,
                  placeGuess: obs.place_guess || null,
                  inatUpdatedAt: obs.updated_at ? new Date(obs.updated_at) : null,
                };
              });
            
            await storage.upsertFitnessObservations(obsToInsert);
            syncedCount += results.length;
            
            await storage.updateFitnessSyncProgress(
              usernameLower, 
              50, 
              'syncing', 
              `Found ${syncedCount} updated observations`
            );
            
            if (results.length < 200) break;
            page++;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // Get new total count from cache
          const allObs = await storage.getFitnessObservations(usernameLower);
          
          await storage.upsertFitnessCacheMetadata({
            username: usernameLower,
            totalObservations: allObs.length,
            lastIncrementalSyncAt: new Date(),
            lastSyncCursor: maxUpdatedAt,
            syncStatus: 'completed',
            syncProgress: 100,
            syncMessage: syncedCount > 0 ? `Updated ${syncedCount} observations` : 'No updates found',
          });
          
          console.log(`[Fitness Cache] Completed incremental sync for ${usernameLower}: ${syncedCount} updates`);
          
        } catch (error: any) {
          console.error(`[Fitness Cache] Incremental sync error:`, error);
          await storage.updateFitnessSyncProgress(usernameLower, 0, 'error', error.message);
        }
      })();

      res.json({ 
        status: 'started', 
        message: 'Incremental sync started' 
      });
    } catch (error: any) {
      console.error("[Fitness Cache] Error starting incremental sync:", error);
      res.status(500).json({ error: error.message || "Failed to start incremental sync" });
    }
  });

  // Cancel sync - sets status to cancelled so polling will stop
  app.post("/api/fitness/cache/sync/cancel", async (req: any, res) => {
    try {
      const { username } = req.body;
      if (!username) {
        return res.status(400).json({ error: "Username is required" });
      }

      const usernameLower = (username as string).toLowerCase();
      const metadata = await storage.getFitnessCacheMetadata(usernameLower);
      
      if (!metadata || metadata.syncStatus !== 'syncing') {
        return res.json({ status: 'not_syncing', message: 'No sync in progress' });
      }

      // Get current cached count
      const cachedCount = await storage.getFitnessObservationCount(usernameLower);
      
      await storage.upsertFitnessCacheMetadata({
        username: usernameLower,
        totalObservations: cachedCount,
        syncStatus: 'cancelled',
        syncProgress: metadata.syncProgress || 0,
        syncMessage: `Sync cancelled. ${cachedCount} observations saved.`,
      });
      
      console.log(`[Fitness Cache] Sync cancelled for ${usernameLower} at ${cachedCount} observations`);
      
      res.json({ 
        status: 'cancelled', 
        message: `Sync cancelled. ${cachedCount} observations saved.`,
        cachedCount 
      });
    } catch (error: any) {
      console.error("[Fitness Cache] Error cancelling sync:", error);
      res.status(500).json({ error: error.message || "Failed to cancel sync" });
    }
  });

  // =============================================
  // FORAGING LISTS ADMIN API ENDPOINTS
  // =============================================

  // Get all foraging lists (admin) - auth bypassed for development
  app.get("/api/admin/foraging-lists", async (req: any, res) => {
    try {
      const lists = await storage.getForagingLists();
      res.json(lists);
    } catch (error: any) {
      console.error("[Foraging Lists] Error fetching lists:", error);
      res.status(500).json({ error: error.message || "Failed to fetch foraging lists" });
    }
  });

  // Get foraging list by category (admin) - auth bypassed for development
  app.get("/api/admin/foraging-lists/:category", async (req: any, res) => {
    try {
      const { category } = req.params;
      const list = await storage.getForagingListByCategory(category);
      res.json(list);
    } catch (error: any) {
      console.error("[Foraging Lists] Error fetching list:", error);
      res.status(500).json({ error: error.message || "Failed to fetch foraging list" });
    }
  });

  // Upload CSV for a foraging category (admin) - auth bypassed for development
  app.post("/api/admin/foraging-lists/:category/upload", uploadMemory.single('file'), async (req: any, res) => {
    try {
      const { category } = req.params;
      const validCategories = ['choice-edibles', 'edibles', 'medicinals', 'dyers', 'psychoactive', 'poisonous', 'deadly'];
      
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const csvData = req.file.buffer.toString('utf-8');
      const lines = csvData.split('\n').filter((line: string) => line.trim());
      const speciesCount = Math.max(0, lines.length - 1); // Subtract header row

      const userId = req.user?.claims?.sub || 'unknown';

      const list = await storage.upsertForagingList({
        category,
        csvData,
        fileName: req.file.originalname,
        speciesCount,
        uploadedAt: new Date(),
        uploadedBy: userId,
      });

      res.json({ 
        success: true, 
        message: `Uploaded ${speciesCount} species to ${category}`,
        list 
      });
    } catch (error: any) {
      console.error("[Foraging Lists] Upload error:", error);
      res.status(500).json({ error: error.message || "Failed to upload foraging list" });
    }
  });

  // Download CSV for a foraging category (admin) - auth bypassed for development
  app.get("/api/admin/foraging-lists/:category/download", async (req: any, res) => {
    try {
      const { category } = req.params;
      const list = await storage.getForagingListByCategory(category);
      
      if (!list || !list.csvData) {
        return res.status(404).json({ error: "No CSV file found for this category" });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${list.fileName || category + '.csv'}"`);
      res.send(list.csvData);
    } catch (error: any) {
      console.error("[Foraging Lists] Download error:", error);
      res.status(500).json({ error: error.message || "Failed to download foraging list" });
    }
  });

  // Get all foraging species with category tags (public - for ForagingMap)
  app.get("/api/foraging/species-lookup", async (req, res) => {
    try {
      const lists = await storage.getForagingLists();
      
      // Parse CSV data and create a lookup table by scientific name
      const speciesLookup: Record<string, {
        categories: string[];
        metadata: Record<string, Record<string, string>>; // category -> column -> value
      }> = {};
      
      for (const list of lists) {
        if (!list.csvData) continue;
        
        const lines = list.csvData.split('\n').filter((line: string) => line.trim());
        if (lines.length < 2) continue;
        
        // Parse header
        const headers = lines[0].split(',').map((h: string) => h.trim().replace(/^"|"$/g, ''));
        const scientificNameIndex = headers.findIndex((h: string) => {
          const normalized = h.toLowerCase().replace(/[_\s]/g, '');
          return normalized === 'scientificname';
        });
        
        // If no header found, assume first column is scientific name (common for simple lists)
        const nameIndex = scientificNameIndex === -1 ? 0 : scientificNameIndex;
        
        // Parse rows
        for (let i = 1; i < lines.length; i++) {
          // Handle CSV parsing with potential quoted fields
          const row: string[] = [];
          let current = '';
          let inQuotes = false;
          
          for (const char of lines[i]) {
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              row.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          row.push(current.trim());
          
          const scientificName = row[nameIndex]?.replace(/^"|"$/g, '').trim();
          if (!scientificName) continue;
          
          // Initialize if not exists
          if (!speciesLookup[scientificName]) {
            speciesLookup[scientificName] = { categories: [], metadata: {} };
          }
          
          // Add category
          if (!speciesLookup[scientificName].categories.includes(list.category)) {
            speciesLookup[scientificName].categories.push(list.category);
          }
          
          // Store all metadata for this category
          const rowMetadata: Record<string, string> = {};
          headers.forEach((header: string, index: number) => {
            if (index !== nameIndex && row[index]) {
              rowMetadata[header] = row[index].replace(/^"|"$/g, '');
            }
          });
          speciesLookup[scientificName].metadata[list.category] = rowMetadata;
        }
      }
      
      res.json(speciesLookup);
    } catch (error: any) {
      console.error("[Foraging Species] Error fetching species lookup:", error);
      res.status(500).json({ error: error.message || "Failed to fetch species lookup" });
    }
  });

  // =============================================
  // CMS API ENDPOINTS
  // =============================================

  // Get all navigation links (public)
  app.get("/api/cms/navigation", async (req, res) => {
    try {
      const links = await db.select().from(cmsNavigationLinks)
        .where(eq(cmsNavigationLinks.isVisible, true))
        .orderBy(cmsNavigationLinks.sortOrder);
      res.json(links);
    } catch (error) {
      console.error("Error fetching navigation:", error);
      res.status(500).json({ error: "Failed to fetch navigation" });
    }
  });

  // Get page by slug (public)
  app.get("/api/cms/pages/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const [page] = await db.select().from(cmsPages).where(eq(cmsPages.slug, slug));
      
      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }

      const sections = await db.select().from(cmsPageSections)
        .where(and(
          eq(cmsPageSections.pageId, page.id),
          eq(cmsPageSections.isVisible, true)
        ))
        .orderBy(cmsPageSections.sortOrder);

      res.json({ ...page, sections });
    } catch (error) {
      console.error("Error fetching page:", error);
      res.status(500).json({ error: "Failed to fetch page" });
    }
  });

  // Get all pages (public - only published)
  app.get("/api/cms/pages", async (req, res) => {
    try {
      const includeUnpublished = req.query.includeUnpublished === 'true';
      let query = db.select().from(cmsPages);
      
      if (!includeUnpublished) {
        query = query.where(eq(cmsPages.isPublished, true)) as typeof query;
      }
      
      const pages = await query.orderBy(cmsPages.sortOrder);
      res.json(pages);
    } catch (error) {
      console.error("Error fetching pages:", error);
      res.status(500).json({ error: "Failed to fetch pages" });
    }
  });

  // Admin: Create page (requires admin role)
  app.post("/api/cms/admin/pages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const validated = insertCmsPageSchema.parse(req.body);
      const [page] = await db.insert(cmsPages).values({
        ...validated,
        authorId: userId,
      }).returning();
      
      res.json(page);
    } catch (error) {
      console.error("Error creating page:", error);
      res.status(500).json({ error: "Failed to create page" });
    }
  });

  // Admin: Update page
  app.patch("/api/cms/admin/pages/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const pageId = parseInt(req.params.id);
      const [page] = await db.update(cmsPages)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(cmsPages.id, pageId))
        .returning();
      
      res.json(page);
    } catch (error) {
      console.error("Error updating page:", error);
      res.status(500).json({ error: "Failed to update page" });
    }
  });

  // Admin: Delete page
  app.delete("/api/cms/admin/pages/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const pageId = parseInt(req.params.id);
      await db.delete(cmsPages).where(eq(cmsPages.id, pageId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting page:", error);
      res.status(500).json({ error: "Failed to delete page" });
    }
  });

  // Admin: Create page section
  app.post("/api/cms/admin/sections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const validated = insertCmsPageSectionSchema.parse(req.body);
      const [section] = await db.insert(cmsPageSections).values(validated).returning();
      
      res.json(section);
    } catch (error) {
      console.error("Error creating section:", error);
      res.status(500).json({ error: "Failed to create section" });
    }
  });

  // Admin: Update page section
  app.patch("/api/cms/admin/sections/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const sectionId = parseInt(req.params.id);
      const [section] = await db.update(cmsPageSections)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(cmsPageSections.id, sectionId))
        .returning();
      
      res.json(section);
    } catch (error) {
      console.error("Error updating section:", error);
      res.status(500).json({ error: "Failed to update section" });
    }
  });

  // Admin: Delete page section
  app.delete("/api/cms/admin/sections/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const sectionId = parseInt(req.params.id);
      await db.delete(cmsPageSections).where(eq(cmsPageSections.id, sectionId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting section:", error);
      res.status(500).json({ error: "Failed to delete section" });
    }
  });

  // Admin: Update navigation
  app.post("/api/cms/admin/navigation", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const validated = insertCmsNavigationLinkSchema.parse(req.body);
      const [link] = await db.insert(cmsNavigationLinks).values(validated).returning();
      
      res.json(link);
    } catch (error) {
      console.error("Error creating navigation link:", error);
      res.status(500).json({ error: "Failed to create navigation link" });
    }
  });

  // Admin: Get all pages including unpublished
  app.get("/api/cms/admin/pages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const pages = await db.select().from(cmsPages).orderBy(cmsPages.sortOrder);
      res.json(pages);
    } catch (error) {
      console.error("Error fetching admin pages:", error);
      res.status(500).json({ error: "Failed to fetch pages" });
    }
  });
  
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

  // In-memory photo URL cache (keyed by observation ID)
  const photoUrlCache = new Map<string, { url: string | null; fetchedAt: number }>();
  const PHOTO_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  const NEGATIVE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for failed lookups

  // Photo proxy endpoint - fetches fresh photo URLs from iNaturalist API
  app.get("/api/photo-url/:observationId", async (req, res) => {
    try {
      const { observationId } = req.params;
      
      // Check in-memory cache first
      const cached = photoUrlCache.get(observationId);
      if (cached) {
        const ttl = cached.url ? PHOTO_CACHE_TTL : NEGATIVE_CACHE_TTL;
        if (Date.now() - cached.fetchedAt < ttl) {
          if (cached.url) {
            return res.json({ url: cached.url, cached: true });
          } else {
            return res.status(404).json({ error: 'No photos found', cached: true });
          }
        }
      }
      
      // Fetch from iNaturalist API
      const response = await fetch(`https://api.inaturalist.org/v1/observations/${observationId}`);
      
      // Handle rate limiting
      if (response.status === 429) {
        console.warn(`[Photo Proxy] Rate limited by iNaturalist API`);
        return res.status(429).json({ error: 'Rate limited, try again later' });
      }
      
      if (!response.ok) {
        // Cache negative result briefly
        photoUrlCache.set(observationId, { url: null, fetchedAt: Date.now() });
        return res.status(404).json({ error: 'Observation not found' });
      }
      
      const data = await response.json();
      const photos = data?.results?.[0]?.photos;
      
      if (photos && photos.length > 0) {
        // Use medium size, convert from square
        const photoUrl = photos[0].url?.replace('square', 'medium');
        if (photoUrl) {
          // Cache the result
          photoUrlCache.set(observationId, { url: photoUrl, fetchedAt: Date.now() });
          return res.json({ url: photoUrl, cached: false });
        }
      }
      
      // Cache negative result
      photoUrlCache.set(observationId, { url: null, fetchedAt: Date.now() });
      return res.status(404).json({ error: 'No photos found' });
    } catch (error) {
      console.error(`[Photo Proxy] Error fetching photo for observation ${req.params.observationId}:`, error);
      return res.status(500).json({ error: 'Failed to fetch photo' });
    }
  });

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
      
      // Apply limit - set reasonable default for performance
      const defaultLimit = species ? 500 : 200; // Higher limit for species-specific requests
      const limitNum = limit ? parseInt(limit as string, 10) : defaultLimit;
      
      if (!isNaN(limitNum) && limitNum > 0) {
        observations = observations.slice(0, limitNum);
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
      const clientIP = (req as any).clientIP || 'unknown';
      
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
      const clientIP = (req as any).clientIP || 'unknown';
      console.error(`Error fetching metrics (IP: ${clientIP}):`, error);
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
      
      const { limit, type = 'top', state, name, genusOnly } = req.query;
      
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
      
      // Apply filtering based on genusOnly parameter
      let filteredSpecies = species;
      
      if (genusOnly === 'true') {
        // Apply genus-level filtering for species needing taxonomic work
        filteredSpecies = species.filter((s: any) => {
          // Filter out Fungi and Unknown entries
          if (s.scientificName === 'Fungi' || s.scientificName === 'Unknown') {
            return false;
          }
          
          // Filter for genus-level identifications only (no species epithets)
          const parts = s.scientificName.split(' ');
          // Include only: single genus names, or genus + "sp" variants, or genus + quoted sp codes
          return parts.length === 1 || 
                 (parts.length === 2 && (parts[1].startsWith('"') || parts[1].includes('sp')));
        });
      } else {
        // Just filter out basic invalid entries but include all species
        filteredSpecies = species.filter((s: any) => {
          return s.scientificName && 
                 s.scientificName !== 'Fungi' && 
                 s.scientificName !== 'Unknown' &&
                 s.scientificName.trim() !== '';
        });
      }
      
      res.json(filteredSpecies);
    } catch (error) {
      console.error("Error fetching species:", error);
      res.status(500).json({ error: "Failed to fetch species" });
    }
  });

  // Search species by observation ID
  app.get("/api/species/search-by-observation", async (req, res) => {
    try {
      const { observation_id } = req.query;
      
      if (!observation_id) {
        return res.status(400).json({ error: "observation_id parameter is required" });
      }
      
      console.log(`[API] Searching for observation ID: ${observation_id}`);
      
      // Search in main observations table and iNaturalist cache
      const [mainObs, cacheObs] = await Promise.all([
        db.select({
          scientificName: observations.scientificName,
          commonName: observations.commonName,
          observationId: observations.observationId,
          observer: observations.observer,
          observedOn: observations.observedOn,
          state: observations.state
        })
        .from(observations)
        .where(eq(observations.observationId, observation_id as string))
        .limit(1),
        
        db.select({
          scientificName: sql<string>`scientific_name`,
          commonName: sql<string>`common_name`,  
          observationId: sql<string>`inat_id::text`,
          observer: sql<string>`user_name`,
          observedOn: sql<string>`observed_on::text`,
          state: sql<string>`place_guess`
        })
        .from(inatObservationsCache)
        .where(eq(sql`inat_id::text`, observation_id as string))
        .limit(1)
      ]);
      
      const foundObservation = mainObs[0] || cacheObs[0];
      
      if (!foundObservation) {
        return res.json([]);
      }
      
      // Get species summary for the found species name
      const speciesSummary = await storage.getSpeciesSummary(foundObservation.scientificName);
      
      console.log(`[API] Found observation ${observation_id} for species: ${foundObservation.scientificName}`);
      res.json([speciesSummary]);
      
    } catch (error) {
      console.error("Error searching by observation ID:", error);
      res.status(500).json({ error: "Failed to search by observation ID" });
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
      
      const { state, search, rarity } = req.query;
      const data = await storage.getSpeciesAccumulation(state as string, search as string, rarity as string);
      res.json(data);
    } catch (error) {
      console.error("Error fetching species accumulation data:", error);
      res.status(500).json({ error: "Failed to fetch species accumulation data" });
    }
  });

  // Get species discovery rate data
  app.get("/api/species-discovery-rate", async (req, res) => {
    try {
      // Add cache headers for chart data
      res.set({
        'Cache-Control': 'public, max-age=180, stale-while-revalidate=360', // 3 min cache, 6 min stale
        'ETag': `"species-discovery-${Date.now() - (Date.now() % 180000)}"` // ETag updates every 3 minutes
      });
      
      const { state, search, rarity } = req.query;
      const data = await storage.getSpeciesDiscoveryRate(state as string, search as string, rarity as string);
      res.json(data);
    } catch (error) {
      console.error("Error fetching species discovery rate data:", error);
      res.status(500).json({ error: "Failed to fetch species discovery rate data" });
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
      
      const { state, search, rarity } = req.query;
      const data = await storage.getGeneraAccumulation(state as string, search as string, rarity as string);
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

  app.get("/api/states/rarity-index", async (req, res) => {
    try {
      const data = await storage.getStateRarityIndex();
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching states rarity index:", error);
      res.status(500).json({ error: "Failed to fetch states rarity index" });
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

  // Get global first species for a specific state
  app.get("/api/states/global-firsts/species/:state", async (req, res) => {
    try {
      const { state } = req.params;
      const species = await storage.getGlobalFirstSpeciesByState(state);
      res.json(species);
    } catch (error) {
      console.error(`Error fetching global first species for state ${req.params.state}:`, error);
      res.status(500).json({ error: "Failed to fetch global first species" });
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

  // Global first records by week endpoint
  app.get("/api/global-firsts-by-week", async (req, res) => {
    try {
      const { state, collector } = req.query;
      
      // Get all global first records from the record index
      const globalFirstRecords = await storage.getRecordIndex(50000, 0, false, false, state as string, true, undefined, undefined, undefined, collector as string);
      
      // Group by week number (1-52) based on report date
      const globalFirstsByWeek = globalFirstRecords.reduce((acc: { [key: number]: number }, record) => {
        if (record.reportDate) {
          const date = new Date(record.reportDate);
          // Calculate week number of the year (1-52)
          const startOfYear = new Date(date.getFullYear(), 0, 1);
          const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
          const weekNumber = Math.min(52, Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7));
          acc[weekNumber] = (acc[weekNumber] || 0) + 1;
        }
        return acc;
      }, {});

      // Convert to array format for chart, ensuring all weeks 1-52 are represented
      const weekData = [];
      for (let week = 1; week <= 52; week++) {
        weekData.push({
          week,
          count: globalFirstsByWeek[week] || 0
        });
      }

      res.json(weekData);
    } catch (error) {
      console.error("Error fetching global firsts by week:", error);
      res.status(500).json({ error: "Failed to fetch global firsts by week" });
    }
  });

  // Species seasonal distribution endpoint - OPTIMIZED
  app.get("/api/species/:name/seasonal", async (req, res) => {
    try {
      const speciesName = decodeURIComponent(req.params.name);
      console.log(`[API] Getting seasonal data for species: ${speciesName}`);
      
      // Use direct database query instead of loading all observations
      const seasonalData = await storage.getSpeciesSeasonalData(speciesName);
      
      // Initialize month counts with proper short names
      const monthCounts = Array.from({ length: 12 }, (_, i) => ({
        month: new Date(0, i).toLocaleString('default', { month: 'short' }),
        monthNumber: i + 1,
        count: 0
      }));
      
      // Fill in actual counts from database
      seasonalData.forEach((row: any) => {
        const monthIndex = parseInt(row.month) - 1;
        if (monthIndex >= 0 && monthIndex < 12) {
          monthCounts[monthIndex].count = parseInt(row.count);
        }
      });
      
      console.log(`[API] Returning seasonal data for ${speciesName}: ${seasonalData.length} months with data`);
      res.json(monthCounts);
    } catch (error) {
      console.error("Error fetching species seasonal distribution:", error);
      res.status(500).json({ error: "Failed to fetch species seasonal distribution" });
    }
  });

  // Species stats endpoint - OPTIMIZED (for quick loading of metrics)
  app.get("/api/species/:name/stats", async (req, res) => {
    try {
      const speciesName = decodeURIComponent(req.params.name);
      console.log(`[API] Getting species stats for: ${speciesName}`);
      
      // Get aggregated metrics from database (much faster than loading all observations)
      const stats = await storage.getSpeciesStats(speciesName);
      
      console.log(`[API] Returning stats for ${speciesName}:`, stats);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching species stats:", error);
      res.status(500).json({ error: "Failed to fetch species stats" });
    }
  });

  // Species images endpoint - comprehensive method (like field guide)
  app.get("/api/species/:name/images", async (req, res) => {
    try {
      const scientificName = decodeURIComponent(req.params.name);
      const { 
        state, 
        page: pageParam = '1', 
        pageSize: pageSizeParam = '16',
        includeNonValidated = 'false' 
      } = req.query;
      
      const page = parseInt(pageParam as string);
      const pageSize = parseInt(pageSizeParam as string);
      const offset = (page - 1) * pageSize;
      const shouldIncludeNonValidated = includeNonValidated === 'true';
      
      console.log(`[Species Images API] Fetching images for page ${page} of ${scientificName} (${pageSize} per page)`);

      // Step 0: Get total counts for pagination (all observations across all pages)
      const totalCountResult = await db.execute(sql`
        SELECT COUNT(*) as total_observations
        FROM observations o
        WHERE o.scientific_name = ${scientificName}
          ${state && state !== 'all' ? sql`AND o.state = ${state}` : sql``}
      `);
      const totalObservations = parseInt(totalCountResult.rows[0].total_observations.toString());

      // Get total image count across all pages by including iNaturalist cache
      const totalImageCountResult = await db.execute(sql`
        SELECT COUNT(*) as total_images
        FROM (
          SELECT o.observation_id
          FROM observations o
          WHERE o.scientific_name = ${scientificName}
            ${state && state !== 'all' ? sql`AND o.state = ${state}` : sql``}
          
          UNION ALL
          
          SELECT DISTINCT 'iNat-cache-' || inat_id || '-' || photo_index
          FROM (
            SELECT 
              inat_id,
              unnest(photos) as photo_url,
              generate_subscripts(photos, 1) as photo_index
            FROM inat_observations_cache
            WHERE LOWER(scientific_name) = LOWER(${scientificName})
              AND photos IS NOT NULL
              AND array_length(photos, 1) > 0
          ) t
          ${shouldIncludeNonValidated ? sql`` : sql`WHERE 1=0`}
        ) combined_images
      `);
      const totalImages = parseInt(totalImageCountResult.rows[0].total_images.toString());

      // Step 1: Get ALL observations (no pagination yet) to expand all images
      let allObservationsQuery = sql`
        SELECT 
          o.observation_id,
          o.scientific_name,
          o.common_name,
          o.collector as observer,
          o.observed_on,
          o.state,
          o.place_guess,
          o.source
        FROM observations o
        WHERE o.scientific_name = ${scientificName}
          ${state && state !== 'all' ? sql`AND o.state = ${state}` : sql``}
        ORDER BY o.observed_on DESC
      `;

      const allObservations = await db.execute(allObservationsQuery);
      console.log(`[Species Images API] Found ${allObservations.rows.length} observations for ${scientificName} - expanding to all images`);

      // Step 2: Format response and expand iNaturalist observations with multiple images
      const expandedImages = [];
      
      // Add retry logic with proper timeout and better error handling
      let successCount = 0;
      let errorCount = 0;
      
      // PROPER FIELD GUIDE PROTOCOL: Use batch API calls like Field Guide
      if (missingFromCache.length > 0) {
        console.log(`[Cache Miss] Fetching ${missingFromCache.length} observations from iNaturalist API using BATCH requests`);
        
        // Process in batches of 30 (conservative for rate limiting)
        const batchSize = 30;
        for (let i = 0; i < missingFromCache.length; i += batchSize) {
          const batch = missingFromCache.slice(i, i + batchSize).map(row => row.observation_id);
          
          try {
            // Make single batch API call with rate limit handling
            const batchUrl = `https://api.inaturalist.org/v1/observations?id=${batch.join(',')}`;
            let response = await fetch(batchUrl, {
              headers: { 'User-Agent': 'MacroFungi-Research-App/1.0' }
            });
            
            // Handle rate limiting (HTTP 429)
            if (response.status === 429) {
              console.log(`⏳ Rate limited for batch ${i/batchSize + 1}, waiting 2 seconds...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
              response = await fetch(batchUrl, {
                headers: { 'User-Agent': 'MacroFungi-Research-App/1.0' }
              });
            }
            
            if (response.ok) {
              const batchData = await response.json();
              
              // Process each observation in the batch
              for (const observation of batchData.results || []) {
                const photos = observation.photos?.map((p: any) => p.url.replace('square', 'medium')) || [];
                
                // Cache the API results in inaturalist_data table
                if (photos.length > 0) {
                  await pool.query(
                    `INSERT INTO inaturalist_data (inat_id, photos) 
                     VALUES ($1, $2) 
                     ON CONFLICT (inat_id) DO UPDATE SET photos = $2`,
                    [observation.id, photos]
                  );
                  console.log(`✅ Cached ${photos.length} photos for observation ${observation.id}`);
                  
                  // Add to expandedImages for immediate display
                  const originalRow = missingFromCache.find(row => row.observation_id == observation.id);
                  if (originalRow) {
                    photos.forEach((photoUrl: string, index: number) => {
                      if (photoUrl && photoUrl.trim()) {
                        expandedImages.push({
                          observationId: originalRow.observation_id,
                          imageUrl: photoUrl.trim(),
                          imageId: `${originalRow.observation_id}-${index}`,
                          observer: originalRow.observer,
                          observedOn: originalRow.observed_on,
                          state: originalRow.state,
                          placeGuess: originalRow.place_guess,
                          source: originalRow.source,
                          scientificName: originalRow.scientific_name,
                          isSelected: false
                        });
                      }
                    });
                    successCount++;
                  }
                }
              }
            } else {
              console.log(`❌ iNaturalist API HTTP ${response.status} for batch ${i/batchSize + 1}`);
              errorCount += batch.length;
            }
            
            // Rate limiting delay between batches
            if (i + batchSize < missingFromCache.length) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
          } catch (error) {
            console.log(`❌ Error fetching batch ${i/batchSize + 1}:`, error);
            errorCount += batch.length;
          }
        }
      }
      
      console.log(`[API Results] Success: ${successCount}/${allObservations.rows.length} (${Math.round(successCount/allObservations.rows.length*100)}%) - Errors: ${errorCount}`);
      
      const sortedImages = expandedImages
        .sort((a, b) => {
          // Sort order: iNaturalist first, Database/Sequences second, MO/MycoPortal last
          const getSourcePriority = (source: string) => {
            if (source === 'iNaturalist') return 1;
            if (source === 'Database' || source === 'Sequences') return 2;
            if (source === 'Mushroom Observer' || source === 'MyCoPortal') return 3;
            return 2;
          };
          return getSourcePriority(a.source) - getSourcePriority(b.source);
        });
      
      // Now paginate by individual images (exactly pageSize images per page)
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedImages = sortedImages.slice(startIndex, endIndex);
      
      console.log(`[Species Images API] Returning ${paginatedImages.length} images for ${scientificName} (page ${page}/${Math.ceil(sortedImages.length/pageSize)}) - Total expanded: ${sortedImages.length} images`);
      res.json({
        images: paginatedImages,
        total: sortedImages.length,
        totalObservations: totalObservations,
        page,
        pageSize,
        totalPages: Math.ceil(sortedImages.length / pageSize)
      });
    } catch (error) {
      console.error("Error fetching species images:", error);
      res.status(500).json({ error: "Failed to fetch species images" });
    }
  });

  // Species taxonomic classification endpoint
  app.get("/api/species/:name/classification", async (req, res) => {
    try {
      const speciesName = decodeURIComponent(req.params.name);
      console.log(`[API] Getting taxonomic classification for species: ${speciesName}`);
      
      // First try to get classification from the iNaturalist cache if available
      const inatClassification = await db.execute(sql`
        SELECT 
          kingdom,
          phylum,
          class,
          "order",
          family,
          genus,
          species,
          subspecies,
          taxon_rank,
          scientific_name,
          common_name
        FROM inaturalist_classification_cache 
        WHERE LOWER(scientific_name) = LOWER(${speciesName})
          OR LOWER(search_term) = LOWER(${speciesName})
        ORDER BY lookup_count DESC
        LIMIT 1
      `);
      
      if (inatClassification.rows.length > 0) {
        const classification = inatClassification.rows[0];
        console.log(`[API] Found iNaturalist classification for ${speciesName}`);
        res.json({
          scientificName: classification.scientific_name || speciesName,
          commonName: classification.common_name,
          kingdom: classification.kingdom,
          phylum: classification.phylum,
          class: classification.class,
          order: classification.order,
          family: classification.family,
          genus: classification.genus,
          species: classification.species,
          subspecies: classification.subspecies,
          rank: classification.taxon_rank,
          source: 'iNaturalist Cache'
        });
        return;
      }
      
      // Fallback to observations table data
      const obsClassification = await db.execute(sql`
        SELECT 
          scientific_name,
          common_name,
          kingdom,
          phylum,
          class,
          "order",
          family,
          genus,
          species,
          infraspecies
        FROM observations 
        WHERE LOWER(scientific_name) = LOWER(${speciesName})
          AND (kingdom IS NOT NULL OR phylum IS NOT NULL OR family IS NOT NULL)
        ORDER BY 
          CASE WHEN kingdom IS NOT NULL THEN 1 ELSE 2 END,
          CASE WHEN phylum IS NOT NULL THEN 1 ELSE 2 END,
          CASE WHEN family IS NOT NULL THEN 1 ELSE 2 END
        LIMIT 1
      `);
      
      if (obsClassification.rows.length > 0) {
        const classification = obsClassification.rows[0];
        console.log(`[API] Found observation classification for ${speciesName}`);
        res.json({
          scientificName: classification.scientific_name || speciesName,
          commonName: classification.common_name,
          kingdom: classification.kingdom,
          phylum: classification.phylum,
          class: classification.class,
          order: classification.order,
          family: classification.family,
          genus: classification.genus,
          species: classification.species,
          subspecies: classification.infraspecies,
          rank: null,
          source: 'Observations Data'
        });
        return;
      }
      
      // No classification data found
      console.log(`[API] No classification data found for ${speciesName}`);
      res.json({
        scientificName: speciesName,
        commonName: null,
        kingdom: null,
        phylum: null,
        class: null,
        order: null,
        family: null,
        genus: null,
        species: null,
        subspecies: null,
        rank: null,
        source: null
      });
      
    } catch (error) {
      console.error("Error fetching species classification:", error);
      res.status(500).json({ error: "Failed to fetch species classification" });
    }
  });

  // Contributors species endpoint
  app.get("/api/contributors/sequence-owners", async (req, res) => {
    try {
      const { state, limit } = req.query;
      const limitNum = limit ? parseInt(limit as string) : 10;
      
      const sequenceOwners = await storage.getSequenceOwners(limitNum, state as string);
      res.json(sequenceOwners);
    } catch (error) {
      console.error("Error fetching sequence owners:", error);
      res.status(500).json({ error: "Failed to fetch sequence owners" });
    }
  });

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
        if (!obs.collector || !obs.scientificName || obs.source === 'MycoPortal') return acc;
        
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

  // Cache helper functions for iNaturalist API
  async function getCachedApiData(observationId: string) {
    try {
      const [cached] = await db
        .select()
        .from(inaturalistApiCache)
        .where(eq(inaturalistApiCache.observationId, observationId));
      
      // Check if cache is fresh (24 hours)
      if (cached && cached.cacheExpiresAt && cached.cacheExpiresAt > new Date()) {
        console.log(`[iNat Cache] Using cached data for observation ${observationId}`);
        return {
          inatName: cached.inatName,
          provisionalName: cached.provisionalName,
          speciesNameOverride: cached.speciesNameOverride,
          qualityGrade: cached.qualityGrade,
          lastRefreshed: cached.lastRefreshed?.toISOString(),
          lastDbUpdate: cached.lastDbUpdate?.toISOString(),
          fromCache: true
        };
      }
      
      return null;
    } catch (error) {
      console.error(`[iNat Cache] Error checking cache for ${observationId}:`, error);
      return null;
    }
  }

  async function saveCacheData(observationId: string, data: any, apiResponseRaw: string) {
    try {
      const cacheExpiresAt = new Date();
      cacheExpiresAt.setHours(cacheExpiresAt.getHours() + 24); // 24 hour cache
      
      await db
        .insert(inaturalistApiCache)
        .values({
          observationId,
          inatName: data.inatName,
          provisionalName: data.provisionalName,
          speciesNameOverride: data.speciesNameOverride,
          qualityGrade: data.qualityGrade,
          apiResponseRaw,
          cacheExpiresAt
        })
        .onConflictDoUpdate({
          target: inaturalistApiCache.observationId,
          set: {
            inatName: data.inatName,
            provisionalName: data.provisionalName,
            speciesNameOverride: data.speciesNameOverride,
            qualityGrade: data.qualityGrade,
            apiResponseRaw,
            lastRefreshed: new Date(),
            cacheExpiresAt
          }
        });
      
      console.log(`[iNat Cache] Saved cache data for observation ${observationId}`);
    } catch (error) {
      console.error(`[iNat Cache] Error saving cache for ${observationId}:`, error);
    }
  }

  // iNaturalist API refresh endpoints
  app.post("/api/observations/refresh-inat-data", async (req, res) => {
    try {
      console.log(`[iNat Refresh] Starting refresh for request:`, req.body);
      const { observationId } = req.body;
      
      if (!observationId) {
        console.log(`[iNat Refresh] Error: No observation ID provided`);
        return res.status(400).json({ error: "Observation ID is required" });
      }

      // Force fresh API call for refresh (bypass cache)
      console.log(`[iNat Refresh] Forcing fresh API call for observation ${observationId}`);
      
      const inatUrl = `https://api.inaturalist.org/v1/observations/${observationId}`;
      console.log(`[iNat Refresh] Fetching from URL: ${inatUrl}`);
      const response = await fetch(inatUrl);
      
      if (!response.ok) {
        console.log(`[iNat Refresh] API response not OK: ${response.status} ${response.statusText}`);
        return res.status(404).json({ error: `Failed to fetch observation from iNaturalist: ${response.status}` });
      }

      const data = await response.json();
      console.log(`[iNat Refresh] API response received:`, { hasResults: !!data.results, resultCount: data.results?.length });
      
      if (!data.results || data.results.length === 0) {
        console.log(`[iNat Refresh] No results found for observation ${observationId}`);
        return res.status(404).json({ error: "Observation not found on iNaturalist" });
      }

      const obs = data.results[0];
      console.log(`[iNat Refresh] Observation data:`, { 
        taxonName: obs.taxon?.name, 
        speciesGuess: obs.species_guess,
        qualityGrade: obs.quality_grade,
        hasOfvs: !!obs.ofvs,
        ofvsCount: obs.ofvs?.length || 0
      });
      
      // Extract observation fields for Provisional Name (10675) and Species Name Override (20259)
      const observationFields = obs.ofvs || [];
      const provisionalName = observationFields.find((field: any) => field.field_id === 10675)?.value || null;
      const speciesNameOverride = observationFields.find((field: any) => field.field_id === 20259)?.value || null;

      const refreshedData = {
        inatName: obs.taxon?.name || obs.species_guess || null,
        provisionalName,
        speciesNameOverride,
        qualityGrade: obs.quality_grade,
        lastRefreshed: new Date().toISOString(),
        fromCache: false
      };

      // Save to cache
      await saveCacheData(observationId, refreshedData, JSON.stringify(data));

      console.log(`[iNat Refresh] Sending fresh API response:`, refreshedData);
      res.json(refreshedData);
    } catch (error) {
      console.error("Error refreshing iNaturalist data:", error);
      res.status(500).json({ error: "Failed to refresh iNaturalist data" });
    }
  });

  app.post("/api/observations/refresh-inat-data-bulk", async (req, res) => {
    try {
      const { observationIds } = req.body;
      
      if (!observationIds || !Array.isArray(observationIds)) {
        return res.status(400).json({ error: "Array of observation IDs is required" });
      }

      const results = [];
      const uncachedIds = [];
      
      // First, check cache for all observations
      for (const observationId of observationIds) {
        try {
          const cachedData = await getCachedApiData(observationId);
          
          if (cachedData) {
            console.log(`[iNat Bulk Cache] Using cached data for observation ${observationId}`);
            
            // Update the main species field in observations table when using cached data (same logic as individual button)
            if (cachedData.inatName) {
              try {
                await db.execute(sql`UPDATE observations SET scientific_name = ${cachedData.inatName} WHERE observation_id = ${observationId}`);
                
                // Also update the cache table with the database update timestamp  
                await db
                  .update(inaturalistApiCache)
                  .set({ lastDbUpdate: new Date() })
                  .where(eq(inaturalistApiCache.observationId, observationId));
                
                console.log(`[iNat Bulk Update] Database updated for observation ${observationId} with name: ${cachedData.inatName}`);
              } catch (updateError) {
                console.error(`[iNat Bulk Update] Failed to update database for observation ${observationId}:`, updateError);
              }
            } else {
              console.log(`[iNat Bulk Update] No inatName found for observation ${observationId}, skipping database update`);
            }
            
            results.push({
              observationId,
              success: true,
              data: cachedData
            });
          } else {
            uncachedIds.push(observationId);
          }
        } catch (error) {
          console.error(`[iNat Bulk] Error checking cache for ${observationId}:`, error);
          uncachedIds.push(observationId);
        }
      }

      // If there are uncached observations, fetch them in batch
      if (uncachedIds.length > 0) {
        const batchSize = 50; // iNaturalist API supports batches up to 50
        
        for (let i = 0; i < uncachedIds.length; i += batchSize) {
          const batch = uncachedIds.slice(i, i + batchSize);
          console.log(`[iNat Bulk] Fetching batch of ${batch.length} observations from API:`, batch);
          
          try {
            // Make single batch API call with rate limit handling
            const batchUrl = `https://api.inaturalist.org/v1/observations?id=${batch.join(',')}`;
            let response = await fetch(batchUrl);
            
            // Handle rate limiting (HTTP 429)
            let retryCount = 0;
            while (response.status === 429 && retryCount < 3) {
              const retryAfter = response.headers.get('Retry-After');
              const delayMs = retryAfter ? parseInt(retryAfter) * 1000 : 60000; // Default 1 minute
              console.log(`[iNat Rate Limit] Hit rate limit, waiting ${delayMs}ms before retry ${retryCount + 1}/3`);
              
              await new Promise(resolve => setTimeout(resolve, delayMs));
              response = await fetch(batchUrl);
              retryCount++;
            }
            
            if (response.ok) {
              const data = await response.json();
              const observations = data.results || [];
              
              console.log(`[iNat Batch] Received ${observations.length} observations from batch API call`);
              
              // Process each observation from the batch response
              for (const obs of observations) {
                const observationId = obs.id.toString();
                
                try {
                  const observationFields = obs.ofvs || [];
                  const provisionalName = observationFields.find((field: any) => field.field_id === 10675)?.value || null;
                  const speciesNameOverride = observationFields.find((field: any) => field.field_id === 20259)?.value || null;

                  const refreshedData = {
                    inatName: obs.taxon?.name || obs.species_guess || null,
                    provisionalName,
                    speciesNameOverride,
                    qualityGrade: obs.quality_grade,
                    lastRefreshed: new Date().toISOString(),
                    fromCache: false
                  };

                  // Save to cache
                  await saveCacheData(observationId, refreshedData, JSON.stringify({ results: [obs] }));

                  results.push({
                    observationId,
                    success: true,
                    data: refreshedData
                  });
                } catch (error) {
                  console.error(`[iNat Batch] Error processing observation ${obs.id}:`, error);
                  results.push({
                    observationId: obs.id.toString(),
                    success: false,
                    error: error instanceof Error ? error.message : 'Processing error'
                  });
                }
              }
              
              // Handle observations that weren't found in the batch response
              const foundIds = observations.map(obs => obs.id.toString());
              const missingIds = batch.filter(id => !foundIds.includes(id));
              
              for (const missingId of missingIds) {
                results.push({
                  observationId: missingId,
                  success: false,
                  error: "Observation not found"
                });
              }
              
            } else {
              console.error(`[iNat Batch] API error: ${response.status}`);
              // If batch fails, mark all observations in this batch as failed
              for (const observationId of batch) {
                results.push({
                  observationId,
                  success: false,
                  error: `API error: ${response.status}`
                });
              }
            }
            
            // Rate limit between batches: iNaturalist allows max 100 requests/minute
            // Using 1.2 second delay = 50 requests/minute for safety margin
            if (i + batchSize < uncachedIds.length) {
              await new Promise(resolve => setTimeout(resolve, 1200));
            }
            
          } catch (error) {
            console.error(`[iNat Batch] Error fetching batch:`, error);
            // If batch fails, mark all observations in this batch as failed
            for (const observationId of batch) {
              results.push({
                observationId,
                success: false,
                error: error instanceof Error ? error.message : 'Batch fetch error'
              });
            }
          }
        }
      }

      console.log(`[iNat Bulk] Completed bulk refresh: ${results.length} total results, ${results.filter(r => r.success).length} successful`);
      res.json({ results });
    } catch (error) {
      console.error("Error bulk refreshing iNaturalist data:", error);
      res.status(500).json({ error: "Failed to bulk refresh iNaturalist data" });
    }
  });

  // Get cached refresh data for specific observations
  app.post("/api/observations/get-cached-data", async (req, res) => {
    try {
      const { observationIds } = req.body;
      
      if (!Array.isArray(observationIds)) {
        return res.status(400).json({ error: 'observationIds must be an array' });
      }
      
      const cachedData: Record<string, any> = {};
      
      // Fetch cached records with individual queries (reliable approach)
      const cachedRecords: any[] = [];
      
      for (const observationId of observationIds) {
        try {
          const [existing] = await db
            .select()
            .from(inaturalistApiCache)
            .where(eq(inaturalistApiCache.observationId, observationId));
          
          if (existing) {
            cachedRecords.push(existing);
          }
        } catch (error) {
          console.error(`Error getting cached data for ${observationId}:`, error);
        }
      }
        
      console.log(`[Cache Query] Found ${cachedRecords.length} cached records for ${observationIds.length} requested IDs`);
      
      // Convert to lookup map
      for (const record of cachedRecords) {
        cachedData[record.observationId] = {
          inatName: record.inatName,
          provisionalName: record.provisionalName,
          speciesNameOverride: record.speciesNameOverride,
          qualityGrade: record.qualityGrade,
          lastRefreshed: record.lastRefreshed,
          lastDbUpdate: record.lastDbUpdate,
          fromCache: true
        };
      }
      
      res.json({ cachedData });
    } catch (error) {
      console.error('Error getting cached data:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post("/api/observations/update-inat-data", async (req, res) => {
    try {
      const { observationId, inatName, provisionalName, speciesNameOverride } = req.body;
      
      if (!observationId) {
        return res.status(400).json({ error: "Observation ID is required" });
      }

      // Update the database record with the selected name (priority: override > provisional > inat)
      if (inatName) {
        await db.execute(sql`UPDATE observations SET scientific_name = ${inatName} WHERE observation_id = ${observationId}`);
        
        // Also update the cache table with the database update timestamp
        await db
          .update(inaturalistApiCache)
          .set({ lastDbUpdate: new Date() })
          .where(eq(inaturalistApiCache.observationId, observationId));
        
        console.log(`[iNat Update] Database updated for observation ${observationId} with name: ${inatName}`);
      }

      res.json({ success: true, message: "Observation updated successfully" });
    } catch (error) {
      console.error("Error updating observation with iNaturalist data:", error);
      res.status(500).json({ error: "Failed to update observation" });
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

      const filePath = path.join(process.cwd(), 'uploads/validated_observations.xlsx');
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Excel file not found. Please upload the file first." });
      }

      // Process with new validation flags
      processExcelFile(upload.id, filePath, upload.originalName, activeUploads)
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

      const filePath = path.join(process.cwd(), 'uploads', upload.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
      }

      // Clear existing data first
      await storage.clearAllData();

      // Reprocess with updated field mapping
      processExcelFile(uploadId, filePath, upload.originalName, activeUploads)
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

  app.post("/api/upload", (req, res, next) => {
    console.log(`[UPLOAD] Starting upload, current multer limit: ${100 * 1024 * 1024} bytes`);
    upload.single('file')(req, res, (err) => {
      if (err) {
        console.error(`[UPLOAD] Multer error:`, err);
        if (err.code === 'LIMIT_FILE_SIZE') {
          console.error(`[UPLOAD] File size limit exceeded. Current limit: ${100 * 1024 * 1024} bytes`);
        }
        return res.status(500).json({ error: err.message || 'Upload failed' });
      }
      next();
    });
  }, async (req, res) => {
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
      
      // Read workbook with progress updates
      console.log('Loading workbook (this may take a moment for large files)...');
      progressTracker.set(uploadId, {
        progress: 10,
        phase: 'reading',
        message: 'Loading Excel workbook...'
      });
      
      const workbook = readFile(filePath, { cellDates: true });
      console.log('✓ Workbook loaded, sheet names:', workbook.SheetNames);
      
      progressTracker.set(uploadId, {
        progress: 15,
        phase: 'reading',
        message: 'Analyzing worksheet structure...'
      });
      
      const sheetName = workbook.SheetNames.find((name: string) => 
        name.toLowerCase().includes('validated') || 
        name.toLowerCase().includes('observation')
      ) || workbook.SheetNames[0];
      
      const worksheet = workbook.Sheets[sheetName];
      console.log('Converting sheet to JSON (this may take a moment for large files)...');
      
      progressTracker.set(uploadId, {
        progress: 20,
        phase: 'reading',
        message: 'Converting Excel data to JSON format...'
      });
      
      const rawData = utils.sheet_to_json(worksheet);

      console.log('✓ Raw data length:', rawData.length);
      
      progressTracker.set(uploadId, {
        progress: 25,
        phase: 'analyzing',
        message: `Analyzing ${rawData.length} observation records...`
      });
      
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
      const fixEncoding = (text: string | null | undefined): string | null => {
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

        // Phase 2: Skip database calculations - all record calculations are done dynamically by API

        // Phase 3: Contributor statistics (after state first calculation)
        console.log('Phase 3: Updating contributor statistics...');
        
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
        
        // Phase 4: Species statistics (after classification)
        console.log('Phase 4: Updating species statistics...');
        
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
        
        // Phase 5: GPS index building
        console.log('Phase 5: Building GPS index for map performance...');
        
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

        // Phase 6: iNaturalist API sync
        console.log('Phase 6: Syncing iNaturalist API data for thumbnail and validation support...');
        
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
            completedPhases: 6,
            totalPhases: 6
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
      const filePath = path.join(process.cwd(), 'attached_assets/Validated Observations05.30.25.xlsx');
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
              syncStatus: 'success'
            });
          }

          results.push({ observationId, status: 'success', photoCount: photoUrls.length });

        } catch (error) {
          results.push({ observationId, status: 'error', error: (error as Error).message || 'Unknown error' });
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
      const existingMoData = await db.select().from(observations).where(eq(observations.observationId, id)).limit(1);
      
      if (existingMoData.length > 0) {
        // Return data from our database
        const moData = existingMoData[0];
        const responseData = {
          scientific_name: moData.scientificName,
          common_name: moData.commonName,
          observer: moData.collector,
          location: moData.locality,
          state: moData.state,
          country: moData.country || 'United States',
          observed_on: moData.observationDate || moData.observedOn,
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
      const existingMcData = await db.select().from(observations).where(eq(observations.observationId, id)).limit(1);
      
      if (existingMcData.length > 0) {
        // Return data from our database
        const mcData = existingMcData[0];
        const responseData = {
          scientific_name: mcData.scientificName,
          common_name: mcData.commonName,
          recorded_by: mcData.collector,
          locality: mcData.locality,
          state_province: mcData.state,
          country: mcData.country || 'United States',
          event_date: mcData.observationDate || mcData.observedOn,
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
  
  // Set up WebSocket server for progress updates on a specific path
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws/progress' 
  });
  
  wss.on('connection', (ws) => {
    console.log('[WebSocket] Client connected');
    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected');
    });
  });

  // Global progress tracking
  const progressBroadcast = (data: any) => {
    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
      if (client.readyState === 1) { // OPEN state
        client.send(message);
      }
    });
  };

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
  // Create new field guide
  app.post("/api/field-guides", async (req, res) => {
    try {
      const { name, description, boundingBoxNorth, boundingBoxSouth, boundingBoxEast, boundingBoxWest } = req.body;
      
      if (!name || !boundingBoxNorth || !boundingBoxSouth || !boundingBoxEast || !boundingBoxWest) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const [newGuide] = await db.insert(fieldGuides).values({
        name: name.trim(),
        description: description?.trim() || null,
        boundingBoxNorth: boundingBoxNorth.toString(),
        boundingBoxSouth: boundingBoxSouth.toString(), 
        boundingBoxEast: boundingBoxEast.toString(),
        boundingBoxWest: boundingBoxWest.toString(),
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();

      res.json(newGuide);
    } catch (error) {
      console.error("Error creating field guide:", error);
      res.status(500).json({ error: "Failed to create field guide" });
    }
  });

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

  // Generate species list for a field guide
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

      // Query database for species in the bounding box
      const speciesInBoxResult = await db.execute(sql`
        SELECT 
          o.scientific_name,
          o.common_name,
          o.family,
          COUNT(*) as observation_count
        FROM observations o
        WHERE o.latitude IS NOT NULL 
          AND o.longitude IS NOT NULL
          AND CAST(o.latitude AS DECIMAL) <= ${parseFloat(boundingBoxNorth)}
          AND CAST(o.latitude AS DECIMAL) >= ${parseFloat(boundingBoxSouth)}
          AND CAST(o.longitude AS DECIMAL) <= ${parseFloat(boundingBoxEast)}
          AND CAST(o.longitude AS DECIMAL) >= ${parseFloat(boundingBoxWest)}
          AND o.scientific_name IS NOT NULL
          AND o.scientific_name != ''
          AND o.observed_on IS NOT NULL
        GROUP BY o.scientific_name, o.common_name, o.family
        ORDER BY o.scientific_name
      `);

      const speciesCount = speciesInBoxResult.rows.length;

      res.json({ 
        message: "Species list generated successfully",
        speciesCount: speciesCount 
      });
    } catch (error) {
      console.error("Error generating species list:", error);
      res.status(500).json({ error: "Failed to generate species list" });
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

  // Get species for a field guide with unified iNat API logic
  app.get("/api/field-guides/:id/species", async (req, res) => {
    try {
      const { id } = req.params;
      const { expansion, monthStart, monthEnd, includeInat } = req.query;
      const fieldGuideId = parseInt(id);
      const expansionMiles = expansion ? parseFloat(expansion as string) : 0;
      
      console.log(`[Species API] Query params:`, { expansion, monthStart, monthEnd, includeInat });
      console.log(`[Species API] Parsed values:`, { fieldGuideId, expansionMiles, includeInatBool: includeInat === 'true' });
      
      // Get the field guide to get bounding box coordinates
      const guide = await db.select().from(fieldGuides).where(eq(fieldGuides.id, fieldGuideId)).limit(1);
      
      if (guide.length === 0) {
        return res.status(404).json({ error: "Field guide not found" });
      }
      
      const { boundingBoxNorth, boundingBoxSouth, boundingBoxEast, boundingBoxWest } = guide[0];
      
      // Calculate final bounding box (original or expanded based on expansion parameter)
      let queryNorth, querySouth, queryEast, queryWest;
      
      if (expansionMiles > 0) {
        // Convert miles to degrees and expand the bounding box
        const latDelta = expansionMiles * 0.014483;
        const avgLat = (parseFloat(boundingBoxNorth) + parseFloat(boundingBoxSouth)) / 2;
        const lngDelta = expansionMiles * 0.014483 / Math.cos(avgLat * Math.PI / 180);
        
        queryNorth = parseFloat(boundingBoxNorth) + latDelta;
        querySouth = parseFloat(boundingBoxSouth) - latDelta;
        queryEast = parseFloat(boundingBoxEast) + lngDelta;
        queryWest = parseFloat(boundingBoxWest) - lngDelta;
      } else {
        // Use original bounding box
        queryNorth = parseFloat(boundingBoxNorth);
        querySouth = parseFloat(boundingBoxSouth);
        queryEast = parseFloat(boundingBoxEast);
        queryWest = parseFloat(boundingBoxWest);
      }
      
      // Build month filter conditions for database query
      let monthCondition = '';
      if (monthStart && monthEnd) {
        const startMonth = parseInt(monthStart as string);
        const endMonth = parseInt(monthEnd as string);
        if (startMonth <= endMonth) {
          monthCondition = `AND EXTRACT(MONTH FROM o.observed_on) BETWEEN ${startMonth} AND ${endMonth}`;
        } else {
          monthCondition = `AND (EXTRACT(MONTH FROM o.observed_on) >= ${startMonth} OR EXTRACT(MONTH FROM o.observed_on) <= ${endMonth})`;
        }
      } else if (monthStart) {
        monthCondition = `AND EXTRACT(MONTH FROM o.observed_on) >= ${parseInt(monthStart as string)}`;
      } else if (monthEnd) {
        monthCondition = `AND EXTRACT(MONTH FROM o.observed_on) <= ${parseInt(monthEnd as string)}`;
      }

      // Query database for species in the calculated bounding box
      const speciesInBoxResult = await db.execute(sql`
        SELECT 
          o.scientific_name,
          o.common_name,
          o.family,
          COUNT(*) as observation_count
        FROM observations o
        WHERE o.latitude IS NOT NULL 
          AND o.longitude IS NOT NULL
          AND CAST(o.latitude AS DECIMAL) <= ${queryNorth}
          AND CAST(o.latitude AS DECIMAL) >= ${querySouth}
          AND CAST(o.longitude AS DECIMAL) <= ${queryEast}
          AND CAST(o.longitude AS DECIMAL) >= ${queryWest}
          AND o.scientific_name IS NOT NULL
          AND o.scientific_name != ''
          AND o.observed_on IS NOT NULL
          ${sql.raw(monthCondition)}
        GROUP BY o.scientific_name, o.common_name, o.family
        ORDER BY o.scientific_name
      `);
      
      // Convert to species format
      let finalSpecies = speciesInBoxResult.rows.map((row: any) => ({
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
      
      // Add iNaturalist supplementation using smart caching
      if (includeInat === 'true') {
        try {
          console.time('[PERF] iNat Total Processing Time');
          const areaDescription = expansionMiles > 0 ? `expanded area (${expansionMiles} miles)` : 'original bounding box';
          console.log(`[iNat Cache] Getting observations for ${areaDescription}`);
          
          const boundingBox = { north: queryNorth, south: querySouth, east: queryEast, west: queryWest };
          
          // Check if we have cached data
          console.time('[PERF] Cache Check');
          const cachedMetadata = await checkCacheForArea(fieldGuideId, expansionMiles, boundingBox);
          console.timeEnd('[PERF] Cache Check');
          
          let inatObservations = [];
          if (cachedMetadata) {
            // Use cached data
            console.time('[PERF] Cache Retrieval');
            inatObservations = await getCachedObservations(boundingBox, monthStart as string, monthEnd as string);
            console.timeEnd('[PERF] Cache Retrieval');
            console.log(`[iNat Cache] Using ${inatObservations.length} cached observations`);
          } else {
            // Fetch fresh data and cache it
            console.time('[PERF] Fresh Data Fetch');
            const freshObs = await fetchAndCacheInatData(fieldGuideId, expansionMiles, boundingBox, monthStart as string, monthEnd as string, progressBroadcast);
            inatObservations = await getCachedObservations(boundingBox, monthStart as string, monthEnd as string);
            console.timeEnd('[PERF] Fresh Data Fetch');
            console.log(`[iNat Cache] Fetched fresh data, now have ${inatObservations.length} observations`);
            
            // Broadcast completion
            progressBroadcast({
              type: 'inat-caching-progress',
              stage: 'completed',
              current: inatObservations.length,
              total: inatObservations.length,
              message: `Successfully cached ${inatObservations.length} observations! Processing species list...`
            });
          }
          
          if (inatObservations.length > 0) {
            // Process cached observations into species format
            console.time('[PERF] Species Map Creation');
            const inatSpeciesMap = new Map();
            inatObservations.forEach((obs: any) => {
              if (obs.scientific_name && obs.rank === 'species') {
                if (!inatSpeciesMap.has(obs.scientific_name)) {
                  inatSpeciesMap.set(obs.scientific_name, {
                    id: null,
                    fieldGuideId: fieldGuideId,
                    scientificName: obs.scientific_name,
                    commonName: obs.common_name || null,
                    family: obs.family || null,
                    observationCount: 0,
                    selectedImageUrl: null,
                    selectedImageSource: null,
                    selectedObservationId: null,
                    selectedImageId: null,
                    source: 'iNaturalist'
                  });
                }
                inatSpeciesMap.get(obs.scientific_name).observationCount++;
              }
            });
            console.timeEnd('[PERF] Species Map Creation');
            
            console.time('[PERF] Species Array Conversion');
            const inatSpecies = Array.from(inatSpeciesMap.values());
            console.timeEnd('[PERF] Species Array Conversion');
            
            // Merge with database species (combine counts for overlapping species)
            console.time('[PERF] Species Merging');
            const allSpeciesMap = new Map();
            finalSpecies.forEach(species => allSpeciesMap.set(species.scientificName, species));
            inatSpecies.forEach(species => {
              if (allSpeciesMap.has(species.scientificName)) {
                // Species exists in both - combine observation counts
                const existingSpecies = allSpeciesMap.get(species.scientificName);
                existingSpecies.observationCount += species.observationCount;
                existingSpecies.source = 'Database + iNaturalist';
                // Update other fields if they're missing from database
                if (!existingSpecies.commonName && species.commonName) {
                  existingSpecies.commonName = species.commonName;
                }
                if (!existingSpecies.family && species.family) {
                  existingSpecies.family = species.family;
                }
              } else {
                // Species only exists in iNaturalist - add it
                allSpeciesMap.set(species.scientificName, species);
              }
            });
            console.timeEnd('[PERF] Species Merging');
            
            console.time('[PERF] Final Sorting');
            finalSpecies = Array.from(allSpeciesMap.values())
              .sort((a, b) => a.scientificName.localeCompare(b.scientificName));
            console.timeEnd('[PERF] Final Sorting');
            
            console.log(`[iNat Cache] Final merged list: ${finalSpecies.length} species (${speciesInBoxResult.rows.length} from DB, ${inatSpecies.length} from iNat)`);
          }
          console.timeEnd('[PERF] iNat Total Processing Time');
        } catch (error) {
          console.error(`[iNat Cache] Error supplementing species list:`, error);
        }
      }

      // Add Mushroom Observer supplementation using coordinate search
      if (includeInat === 'true') {
        try {
          const areaDescription = expansionMiles > 0 ? `expanded area (${expansionMiles} miles)` : 'original bounding box';
          console.log(`[MO API] Getting observations for ${areaDescription}`);
          
          const boundingBox = { north: queryNorth, south: querySouth, east: queryEast, west: queryWest };
          
          // Check cache first
          const moCache = await checkMoCacheForArea(fieldGuideId, expansionMiles, boundingBox);
          let moObservations = [];
          
          if (moCache) {
            console.log(`[MO Cache] Using cached data`);
            moObservations = await getCachedMoObservations(boundingBox, monthStart as string, monthEnd as string);
          } else {
            console.log(`[MO Cache] No cache found, fetching from API`);
            moObservations = await fetchMoObservations(boundingBox, monthStart as string, monthEnd as string);
            
            // Store in cache for future use
            if (moObservations.length > 0) {
              await storeMoObservationsInCache(fieldGuideId, expansionMiles, boundingBox, moObservations);
            }
          }
          
          console.log(`[MO API] Using ${moObservations.length} MO observations`);
          
          if (moObservations.length > 0) {
            // Process MO observations into species format
            const moSpeciesMap = new Map();
            moObservations.forEach((obs: any) => {
              if (obs.scientific_name && obs.rank === 'species') {
                if (!moSpeciesMap.has(obs.scientific_name)) {
                  moSpeciesMap.set(obs.scientific_name, {
                    id: null,
                    fieldGuideId: fieldGuideId,
                    scientificName: obs.scientific_name,
                    commonName: obs.common_name || null,
                    family: obs.family || null,
                    observationCount: 0,
                    selectedImageUrl: null,
                    selectedImageSource: null,
                    selectedObservationId: null,
                    selectedImageId: null,
                    source: 'Mushroom Observer'
                  });
                }
                moSpeciesMap.get(obs.scientific_name).observationCount++;
              }
            });
            
            const moSpecies = Array.from(moSpeciesMap.values());
            
            // Merge with existing species (database + iNaturalist)
            const allSpeciesMap = new Map();
            finalSpecies.forEach(species => allSpeciesMap.set(species.scientificName, species));
            moSpecies.forEach(species => {
              if (allSpeciesMap.has(species.scientificName)) {
                // Species exists - combine observation counts
                const existingSpecies = allSpeciesMap.get(species.scientificName);
                existingSpecies.observationCount += species.observationCount;
                // Update source to reflect multiple platforms
                if (existingSpecies.source === 'Database') {
                  existingSpecies.source = 'Database + Mushroom Observer';
                } else if (existingSpecies.source === 'Database + iNaturalist') {
                  existingSpecies.source = 'Database + iNaturalist + Mushroom Observer';
                } else if (existingSpecies.source === 'iNaturalist') {
                  existingSpecies.source = 'iNaturalist + Mushroom Observer';
                }
                // Update other fields if missing
                if (!existingSpecies.commonName && species.commonName) {
                  existingSpecies.commonName = species.commonName;
                }
                if (!existingSpecies.family && species.family) {
                  existingSpecies.family = species.family;
                }
              } else {
                // Species only exists in MO - add it
                allSpeciesMap.set(species.scientificName, species);
              }
            });
            
            finalSpecies = Array.from(allSpeciesMap.values())
              .sort((a, b) => a.scientificName.localeCompare(b.scientificName));
            
            console.log(`[MO API] Final merged list: ${finalSpecies.length} species (includes ${moSpecies.length} from MO)`);
          }
        } catch (error) {
          console.error(`[MO API] Error supplementing species list:`, error);
        }
      }
      
      return res.json(finalSpecies);
    } catch (error) {
      console.error("Error fetching field guide species:", error);
      res.status(500).json({ error: "Failed to fetch field guide species" });
    }
  });

  // Get contributors for a field guide
  app.get("/api/field-guides/:id/contributors", async (req, res) => {
    try {
      const { id } = req.params;
      const { includeInat } = req.query;
      const fieldGuideId = parseInt(id);
      
      // Get the field guide to get bounding box coordinates
      const guide = await db.select().from(fieldGuides).where(eq(fieldGuides.id, fieldGuideId)).limit(1);
      
      if (guide.length === 0) {
        return res.status(404).json({ error: "Field guide not found" });
      }
      
      const { boundingBoxNorth, boundingBoxSouth, boundingBoxEast, boundingBoxWest } = guide[0];
      
      // Get database contributors
      const dbContributors = await db.execute(sql`
        SELECT DISTINCT o.collector as name
        FROM observations o
        WHERE o.latitude IS NOT NULL 
          AND o.longitude IS NOT NULL
          AND CAST(o.latitude AS DECIMAL) <= ${parseFloat(boundingBoxNorth)}
          AND CAST(o.latitude AS DECIMAL) >= ${parseFloat(boundingBoxSouth)}
          AND CAST(o.longitude AS DECIMAL) <= ${parseFloat(boundingBoxEast)}
          AND CAST(o.longitude AS DECIMAL) >= ${parseFloat(boundingBoxWest)}
          AND o.collector IS NOT NULL
      `);
      
      let totalContributors = dbContributors.rows.length;
      console.log(`[Contributors] DB: ${totalContributors}`);
      
      // Add iNaturalist contributors using smart caching
      if (includeInat === 'true') {
        try {
          console.time('[PERF] Contributors Total Processing Time');
          console.log(`[Contributors Cache] Getting iNaturalist contributors...`);
          
          const boundingBox = { 
            north: parseFloat(boundingBoxNorth), 
            south: parseFloat(boundingBoxSouth), 
            east: parseFloat(boundingBoxEast), 
            west: parseFloat(boundingBoxWest) 
          };
          
          // Check if we have cached data (use 0 miles expansion for original bounding box)
          console.time('[PERF] Contributors Cache Check');
          const cachedMetadata = await checkCacheForArea(fieldGuideId, 0, boundingBox);
          console.timeEnd('[PERF] Contributors Cache Check');
          
          let inatObservations = [];
          if (cachedMetadata) {
            // Use cached data
            console.time('[PERF] Contributors Cache Retrieval');
            inatObservations = await getCachedObservations(boundingBox);
            console.timeEnd('[PERF] Contributors Cache Retrieval');
            console.log(`[Contributors Cache] Using ${inatObservations.length} cached observations`);
          } else {
            // Fetch fresh data and cache it
            console.time('[PERF] Contributors Fresh Data Fetch');
            const freshObs = await fetchAndCacheInatData(fieldGuideId, 0, boundingBox, undefined, undefined, progressBroadcast);
            inatObservations = await getCachedObservations(boundingBox);
            console.timeEnd('[PERF] Contributors Fresh Data Fetch');
            console.log(`[Contributors Cache] Fetched fresh data, now have ${inatObservations.length} observations`);
            
            // Broadcast completion
            progressBroadcast({
              type: 'inat-caching-progress',
              stage: 'completed',
              current: inatObservations.length,
              total: inatObservations.length,
              message: `Successfully cached ${inatObservations.length} observations! Processing contributors...`
            });
          }

          // Extract unique iNaturalist contributors from cached data
          console.time('[PERF] Contributors Processing');
          const inatContributors = new Set();
          inatObservations.forEach((obs: any) => {
            if (obs.user_name) {
              inatContributors.add(obs.user_name);
            }
          });
          console.timeEnd('[PERF] Contributors Processing');

          console.log(`[Contributors Cache] iNat: ${inatContributors.size} unique contributors`);

          // Combine database and iNaturalist contributors (removing duplicates)
          console.time('[PERF] Contributors Merging');
          const allContributors = new Set();
          dbContributors.rows.forEach(row => {
            if (row.name) allContributors.add(row.name);
          });
          inatContributors.forEach(name => allContributors.add(name));
          console.timeEnd('[PERF] Contributors Merging');

          totalContributors = allContributors.size;
          console.log(`[Contributors Cache] Combined: ${totalContributors} total unique contributors`);
          console.timeEnd('[PERF] Contributors Total Processing Time');

        } catch (inatError) {
          console.error("[Contributors Cache] Error:", inatError);
          // Fall back to database contributors only
        }
      }
      
      return res.json({ contributorsCount: totalContributors });
    } catch (error) {
      console.error("Error fetching contributors:", error);
      res.status(500).json({ error: "Failed to fetch contributors" });
    }
  });

  // Get detailed contributors list for a field guide (for the modal)
  app.get("/api/field-guides/:id/contributors/detailed", async (req, res) => {
    try {
      console.time('[PERF] Detailed Contributors Total Time');
      const { id } = req.params;
      const fieldGuideId = parseInt(id);
      
      // Get the field guide to get bounding box coordinates
      const guide = await db.select().from(fieldGuides).where(eq(fieldGuides.id, fieldGuideId)).limit(1);
      
      if (guide.length === 0) {
        return res.status(404).json({ error: "Field guide not found" });
      }
      
      const { boundingBoxNorth, boundingBoxSouth, boundingBoxEast, boundingBoxWest } = guide[0];
      
      // Get detailed database contributors with observation and species counts
      console.time('[PERF] DB Contributors Query');
      const dbContributors = await db.execute(sql`
        SELECT 
          o.collector as name,
          COUNT(*) as observationCount,
          COUNT(DISTINCT o.scientific_name) as speciesCount
        FROM observations o
        WHERE o.latitude IS NOT NULL 
          AND o.longitude IS NOT NULL
          AND CAST(o.latitude AS DECIMAL) <= ${parseFloat(boundingBoxNorth)}
          AND CAST(o.latitude AS DECIMAL) >= ${parseFloat(boundingBoxSouth)}
          AND CAST(o.longitude AS DECIMAL) <= ${parseFloat(boundingBoxEast)}
          AND CAST(o.longitude AS DECIMAL) >= ${parseFloat(boundingBoxWest)}
          AND o.collector IS NOT NULL
        GROUP BY o.collector
        ORDER BY COUNT(*) DESC
      `);
      console.timeEnd('[PERF] DB Contributors Query');
      
      const contributors: any[] = dbContributors.rows.map((row: any) => ({
        name: row.name,
        observationCount: parseInt(row.observationcount) || 0,  // PostgreSQL returns lowercase
        speciesCount: parseInt(row.speciescount) || 0           // PostgreSQL returns lowercase
      }));
      
      console.log(`[Detailed Contributors] Returning ${contributors.length} contributors`);
      console.timeEnd('[PERF] Detailed Contributors Total Time');
      
      return res.json({ contributors });
    } catch (error) {
      console.error("Error fetching detailed contributors:", error);
      res.status(500).json({ error: "Failed to fetch detailed contributors" });
    }
  });

  // Get images for a specific species in a field guide
  app.get("/api/field-guides/:id/species/:name/images", async (req, res) => {
    try {
      const { id, name } = req.params;
      const { expansion, monthStart, monthEnd, includeInat, includeNonValidated } = req.query;
      
      const fieldGuideId = parseInt(id);
      const scientificName = decodeURIComponent(name);
      const expansionMiles = expansion ? parseFloat(expansion as string) : 0;
      const includeInatBool = includeInat === 'true';
      const includeNonValidatedBool = includeNonValidated === 'true';
      
      console.log(`[Images API] Query params:`, { expansion, monthStart, monthEnd, includeInat, includeNonValidated });
      console.log(`[Images API] Parsed values:`, { fieldGuideId, expansionMiles, includeInatBool, includeNonValidatedBool });
      
      // Get the field guide to get bounding box coordinates
      const guide = await db.select().from(fieldGuides).where(eq(fieldGuides.id, fieldGuideId)).limit(1);
      
      if (guide.length === 0) {
        return res.status(404).json({ error: "Field guide not found" });
      }
      
      const { boundingBoxNorth, boundingBoxSouth, boundingBoxEast, boundingBoxWest } = guide[0];
      
      // Calculate final bounding box (EXACT same logic as main species list)
      let queryNorth, querySouth, queryEast, queryWest;
      
      if (expansionMiles > 0) {
        const latDelta = expansionMiles * 0.014483;
        const avgLat = (parseFloat(boundingBoxNorth) + parseFloat(boundingBoxSouth)) / 2;
        const lngDelta = expansionMiles * 0.014483 / Math.cos(avgLat * Math.PI / 180);
        
        queryNorth = parseFloat(boundingBoxNorth) + latDelta;
        querySouth = parseFloat(boundingBoxSouth) - latDelta;
        queryEast = parseFloat(boundingBoxEast) + lngDelta;
        queryWest = parseFloat(boundingBoxWest) - lngDelta;
      } else {
        queryNorth = parseFloat(boundingBoxNorth);
        querySouth = parseFloat(boundingBoxSouth);
        queryEast = parseFloat(boundingBoxEast);
        queryWest = parseFloat(boundingBoxWest);
      }
      
      // Get database observations with images (EXACT same filtering as main species list)
      let speciesObservations;
      
      if (monthStart && monthEnd) {
        const startMonth = parseInt(monthStart as string);
        const endMonth = parseInt(monthEnd as string);
        if (startMonth <= endMonth) {
          speciesObservations = await db.execute(sql`
            SELECT 
              o.observation_id,
              o.scientific_name,
              o.common_name,
              o.collector as observer,
              o.observed_on,
              o.state,
              o.place_guess,
              o.image_link,
              CASE 
                WHEN o.image_link LIKE '%inaturalist%' THEN 'iNaturalist'
                WHEN o.image_link LIKE '%mushroomobserver%' THEN 'Mushroom Observer'
                WHEN o.image_link LIKE '%myco%' THEN 'MyCoPortal'
                ELSE 'Database'
              END as source
            FROM observations o
            WHERE o.latitude IS NOT NULL 
              AND o.longitude IS NOT NULL
              AND CAST(o.latitude AS DECIMAL) <= ${queryNorth}
              AND CAST(o.latitude AS DECIMAL) >= ${querySouth}
              AND CAST(o.longitude AS DECIMAL) <= ${queryEast}
              AND CAST(o.longitude AS DECIMAL) >= ${queryWest}
              AND o.scientific_name = ${scientificName}
              AND EXTRACT(MONTH FROM o.observed_on) BETWEEN ${startMonth} AND ${endMonth}
            ORDER BY o.observed_on DESC
          `);
        } else {
          speciesObservations = await db.execute(sql`
            SELECT 
              o.observation_id,
              o.scientific_name,
              o.common_name,
              o.collector as observer,
              o.observed_on,
              o.state,
              o.place_guess,
              o.image_link,
              CASE 
                WHEN o.image_link LIKE '%inaturalist%' THEN 'iNaturalist'
                WHEN o.image_link LIKE '%mushroomobserver%' THEN 'Mushroom Observer'
                WHEN o.image_link LIKE '%myco%' THEN 'MyCoPortal'
                ELSE 'Database'
              END as source
            FROM observations o
            WHERE o.latitude IS NOT NULL 
              AND o.longitude IS NOT NULL
              AND CAST(o.latitude AS DECIMAL) <= ${queryNorth}
              AND CAST(o.latitude AS DECIMAL) >= ${querySouth}
              AND CAST(o.longitude AS DECIMAL) <= ${queryEast}
              AND CAST(o.longitude AS DECIMAL) >= ${queryWest}
              AND o.scientific_name = ${scientificName}
              AND (EXTRACT(MONTH FROM o.observed_on) >= ${startMonth} OR EXTRACT(MONTH FROM o.observed_on) <= ${endMonth})
            ORDER BY o.observed_on DESC
          `);
        }
      } else if (monthStart) {
        const startMonth = parseInt(monthStart as string);
        speciesObservations = await db.execute(sql`
          SELECT 
            o.observation_id,
            o.scientific_name,
            o.common_name,
            o.collector as observer,
            o.observed_on,
            o.state,
            o.place_guess,
'Database' as source
          FROM observations o
          WHERE o.latitude IS NOT NULL 
            AND o.longitude IS NOT NULL
            AND CAST(o.latitude AS DECIMAL) <= ${queryNorth}
            AND CAST(o.latitude AS DECIMAL) >= ${querySouth}
            AND CAST(o.longitude AS DECIMAL) <= ${queryEast}
            AND CAST(o.longitude AS DECIMAL) >= ${queryWest}
            AND o.scientific_name = ${scientificName}
            AND EXTRACT(MONTH FROM o.observed_on) >= ${startMonth}
          ORDER BY o.observed_on DESC
        `);
      } else if (monthEnd) {
        const endMonth = parseInt(monthEnd as string);
        speciesObservations = await db.execute(sql`
          SELECT 
            o.observation_id,
            o.scientific_name,
            o.common_name,
            o.collector as observer,
            o.observed_on,
            o.state,
            o.place_guess,
'Database' as source
          FROM observations o
          WHERE o.latitude IS NOT NULL 
            AND o.longitude IS NOT NULL
            AND CAST(o.latitude AS DECIMAL) <= ${queryNorth}
            AND CAST(o.latitude AS DECIMAL) >= ${querySouth}
            AND CAST(o.longitude AS DECIMAL) <= ${queryEast}
            AND CAST(o.longitude AS DECIMAL) >= ${queryWest}
            AND o.scientific_name = ${scientificName}
            AND EXTRACT(MONTH FROM o.observed_on) <= ${endMonth}
          ORDER BY o.observed_on DESC
        `);
      } else {
        speciesObservations = await db.execute(sql`
          SELECT 
            o.observation_id,
            o.scientific_name,
            o.common_name,
            o.collector as observer,
            o.observed_on,
            o.state,
            o.place_guess,
'Database' as source
          FROM observations o
          WHERE o.latitude IS NOT NULL 
            AND o.longitude IS NOT NULL
            AND CAST(o.latitude AS DECIMAL) <= ${queryNorth}
            AND CAST(o.latitude AS DECIMAL) >= ${querySouth}
            AND CAST(o.longitude AS DECIMAL) <= ${queryEast}
            AND CAST(o.longitude AS DECIMAL) >= ${queryWest}
            AND o.scientific_name = ${scientificName}
          ORDER BY o.observed_on DESC
        `);
      }

      let allImages = [...speciesObservations.rows];

      // Check database observations that are iNaturalist IDs (numeric) and fetch their images from iNaturalist
      const inatObservationsInMainTable = speciesObservations.rows
        .filter(row => row.source === 'Database' && /^\d+$/.test(row.observation_id))
        .map(row => row.observation_id);
      
      if (inatObservationsInMainTable.length > 0) {
        console.log(`[Images API] Found ${inatObservationsInMainTable.length} iNaturalist observations in main table:`, inatObservationsInMainTable);
        
        // Get all photos for each iNaturalist observation from cache
        const allInatCachePhotos = [];
        
        for (const inatId of inatObservationsInMainTable) {
          let inatCachePhotos;
          
          if (monthStart && monthEnd) {
            const startMonth = parseInt(monthStart as string);
            const endMonth = parseInt(monthEnd as string);
            if (startMonth <= endMonth) {
              inatCachePhotos = await db.execute(sql`
                SELECT 
                  inat_id as observation_id,
                  inat_id,
                  scientific_name,
                  common_name,
                  user_name as observer,
                  observed_on,
                  place_guess as state,
                  place_guess,
                  photo_url as image_link,
                  'iNaturalist' as source,
                  photo_index
                FROM (
                  SELECT 
                    inat_id,
                    scientific_name,
                    common_name,
                    user_name,
                    observed_on,
                    place_guess,
                    unnest(photos) as photo_url,
                    generate_subscripts(photos, 1) as photo_index
                  FROM inat_observations_cache
                  WHERE inat_id = ${inatId}
                    AND scientific_name = ${scientificName}
                    AND photos IS NOT NULL
                    AND array_length(photos, 1) > 0
                    AND quality_grade = 'research'
                    AND EXTRACT(MONTH FROM observed_on) BETWEEN ${startMonth} AND ${endMonth}
                ) t
                ORDER BY observed_on DESC, photo_index
              `);
            } else {
              inatCachePhotos = await db.execute(sql`
                SELECT 
                  inat_id as observation_id,
                  inat_id,
                  scientific_name,
                  common_name,
                  user_name as observer,
                  observed_on,
                  place_guess as state,
                  place_guess,
                  photo_url as image_link,
                  'iNaturalist' as source,
                  photo_index
                FROM (
                  SELECT 
                    inat_id,
                    scientific_name,
                    common_name,
                    user_name,
                    observed_on,
                    place_guess,
                    unnest(photos) as photo_url,
                    generate_subscripts(photos, 1) as photo_index
                  FROM inat_observations_cache
                  WHERE inat_id = ${inatId}
                    AND scientific_name = ${scientificName}
                    AND photos IS NOT NULL
                    AND array_length(photos, 1) > 0
                    AND quality_grade = 'research'
                    AND (EXTRACT(MONTH FROM observed_on) >= ${startMonth} OR EXTRACT(MONTH FROM observed_on) <= ${endMonth})
                ) t
                ORDER BY observed_on DESC, photo_index
              `);
            }
          } else if (monthStart) {
            const startMonth = parseInt(monthStart as string);
            inatCachePhotos = await db.execute(sql`
              SELECT 
                inat_id as observation_id,
                inat_id,
                scientific_name,
                common_name,
                user_name as observer,
                observed_on,
                place_guess as state,
                place_guess,
                photo_url as image_link,
                'iNaturalist' as source,
                photo_index
              FROM (
                SELECT 
                  inat_id,
                  scientific_name,
                  common_name,
                  user_name,
                  observed_on,
                  place_guess,
                  unnest(photos) as photo_url,
                  generate_subscripts(photos, 1) as photo_index
                FROM inat_observations_cache
                WHERE inat_id = ${inatId}
                  AND scientific_name = ${scientificName}
                  AND photos IS NOT NULL
                  AND array_length(photos, 1) > 0
                  AND quality_grade = 'research'
                  AND EXTRACT(MONTH FROM observed_on) >= ${startMonth}
              ) t
              ORDER BY observed_on DESC, photo_index
            `);
          } else if (monthEnd) {
            const endMonth = parseInt(monthEnd as string);
            inatCachePhotos = await db.execute(sql`
              SELECT 
                inat_id as observation_id,
                inat_id,
                scientific_name,
                common_name,
                user_name as observer,
                observed_on,
                place_guess as state,
                place_guess,
                photo_url as image_link,
                'iNaturalist' as source,
                photo_index
              FROM (
                SELECT 
                  inat_id,
                  scientific_name,
                  common_name,
                  user_name,
                  observed_on,
                  place_guess,
                  unnest(photos) as photo_url,
                  generate_subscripts(photos, 1) as photo_index
                FROM inat_observations_cache
                WHERE inat_id = ${inatId}
                  AND scientific_name = ${scientificName}
                  AND photos IS NOT NULL
                  AND array_length(photos, 1) > 0
                  AND quality_grade = 'research'
                  AND EXTRACT(MONTH FROM observed_on) <= ${endMonth}
              ) t
              ORDER BY observed_on DESC, photo_index
            `);
          } else {
            inatCachePhotos = await db.execute(sql`
              SELECT 
                inat_id as observation_id,
                inat_id,
                scientific_name,
                common_name,
                user_name as observer,
                observed_on,
                place_guess as state,
                place_guess,
                photo_url as image_link,
                'iNaturalist' as source,
                photo_index
              FROM (
                SELECT 
                  inat_id,
                  scientific_name,
                  common_name,
                  user_name,
                  observed_on,
                  place_guess,
                  unnest(photos) as photo_url,
                  generate_subscripts(photos, 1) as photo_index
                FROM inat_observations_cache
                WHERE inat_id = ${inatId}
                  AND scientific_name = ${scientificName}
                  AND photos IS NOT NULL
                  AND array_length(photos, 1) > 0
                  AND quality_grade = 'research'
              ) t
              ORDER BY observed_on DESC, photo_index
            `);
          }
          
          allInatCachePhotos.push(...inatCachePhotos.rows);
        }
        
        // Smart fallback: Keep main DB images when cache is empty, replace when cache has data
        if (allInatCachePhotos.length > 0) {
          // Cache has photos - replace database observations (that are iNaturalist IDs) with detailed cache versions
          allImages = allImages.filter(img => !((img.source === 'Database' || img.source === 'iNaturalist') && /^\d+$/.test(img.observation_id)));
          allImages.push(...allInatCachePhotos);
          console.log(`[Images API] Replaced database iNaturalist observations with ${allInatCachePhotos.length} photos from iNaturalist cache`);
        } else {
          // Cache is empty - fetch fresh data from iNaturalist API
          console.log(`[Images API] Cache empty for ${inatObservationsInMainTable.length} observations - fetching fresh data from API`);
          
          try {
            // Batch API call for missing observations
            const freshInatData: any[] = [];
            for (const inatId of inatObservationsInMainTable) {
              const response = await fetch(`https://api.inaturalist.org/v1/observations/${inatId}`);
              if (response.ok) {
                const data = await response.json();
                const obs = data.results[0];
                if (obs && obs.photos && obs.photos.length > 0) {
                  // Add each photo as separate entry  
                  obs.photos.forEach((photo: any, photoIndex: number) => {
                    freshInatData.push({
                      observation_id: obs.id.toString(), // Use raw iNaturalist ID
                      scientific_name: obs.taxon?.name || scientificName,
                      common_name: obs.taxon?.preferred_common_name || null,
                      observer: obs.user?.name || obs.user?.login,
                      observed_on: obs.observed_on,
                      state: obs.place_guess,
                      place_guess: obs.place_guess,
                      image_link: photo.url.replace('square', 'large'), // Get large version
                      source: 'iNaturalist'
                    });
                  });
                }
              }
              // Small delay to be respectful to iNaturalist API
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            if (freshInatData.length > 0) {
              // Replace database observations (that are iNaturalist IDs) with fresh API data
              allImages = allImages.filter(img => !((img.source === 'Database' || img.source === 'iNaturalist') && /^\d+$/.test(img.observation_id)));
              allImages.push(...freshInatData);
              console.log(`[Images API] Fetched ${freshInatData.length} fresh photos from iNaturalist API`);
            } else {
              console.log(`[Images API] No valid photos found via API fallback`);
            }
          } catch (error) {
            console.error(`[Images API] Error fetching fresh iNaturalist data:`, error);
            console.log(`[Images API] Keeping main DB images as fallback`);
          }
        }
        
        console.log(`[Images API] Using ${allImages.filter(img => img.source === 'iNaturalist').length} iNaturalist images`);
      }

      // Include additional iNaturalist cache observations if includeInat is true (EXACT same logic)
      if (includeInatBool) {
        let inatObservations;
        
        if (monthStart && monthEnd) {
          const startMonth = parseInt(monthStart as string);
          const endMonth = parseInt(monthEnd as string);
          if (startMonth <= endMonth) {
            inatObservations = await db.execute(sql`
              SELECT 
                inat_id as observation_id,
                inat_id,
                scientific_name,
                common_name,
                user_name as observer,
                observed_on,
                place_guess as state,
                place_guess,
                photo_url as image_link,
                'iNaturalist' as source,
                photo_index
              FROM (
                SELECT 
                  inat_id,
                  scientific_name,
                  common_name,
                  user_name,
                  observed_on,
                  place_guess,
                  unnest(photos) as photo_url,
                  generate_subscripts(photos, 1) as photo_index
                FROM inat_observations_cache
                WHERE latitude IS NOT NULL 
                  AND longitude IS NOT NULL
                  AND CAST(latitude AS DECIMAL) <= ${queryNorth}
                  AND CAST(latitude AS DECIMAL) >= ${querySouth}
                  AND CAST(longitude AS DECIMAL) <= ${queryEast}
                  AND CAST(longitude AS DECIMAL) >= ${queryWest}
                  AND scientific_name = ${scientificName}
                  AND photos IS NOT NULL
                  AND array_length(photos, 1) > 0
                  AND quality_grade = 'research'
                  AND EXTRACT(MONTH FROM observed_on) BETWEEN ${startMonth} AND ${endMonth}
              ) t
              ORDER BY observed_on DESC, photo_index
            `);
          } else {
            inatObservations = await db.execute(sql`
              SELECT 
                inat_id as observation_id,
                inat_id,
                scientific_name,
                common_name,
                user_name as observer,
                observed_on,
                place_guess as state,
                place_guess,
                photo_url as image_link,
                'iNaturalist' as source,
                photo_index
              FROM (
                SELECT 
                  inat_id,
                  scientific_name,
                  common_name,
                  user_name,
                  observed_on,
                  place_guess,
                  unnest(photos) as photo_url,
                  generate_subscripts(photos, 1) as photo_index
                FROM inat_observations_cache
                WHERE latitude IS NOT NULL 
                  AND longitude IS NOT NULL
                  AND CAST(latitude AS DECIMAL) <= ${queryNorth}
                  AND CAST(latitude AS DECIMAL) >= ${querySouth}
                  AND CAST(longitude AS DECIMAL) <= ${queryEast}
                  AND CAST(longitude AS DECIMAL) >= ${queryWest}
                  AND scientific_name = ${scientificName}
                  AND photos IS NOT NULL
                  AND array_length(photos, 1) > 0
                  AND quality_grade = 'research'
                  AND (EXTRACT(MONTH FROM observed_on) >= ${startMonth} OR EXTRACT(MONTH FROM observed_on) <= ${endMonth})
              ) t
              ORDER BY observed_on DESC, photo_index
            `);
          }
        } else if (monthStart) {
          const startMonth = parseInt(monthStart as string);
          inatObservations = await db.execute(sql`
            SELECT 
              inat_id as observation_id,
              inat_id,
              scientific_name,
              common_name,
              user_name as observer,
              observed_on,
              place_guess as state,
              place_guess,
              photo_url as image_link,
              'iNaturalist' as source,
              photo_index
            FROM (
              SELECT 
                inat_id,
                scientific_name,
                common_name,
                user_name,
                observed_on,
                place_guess,
                unnest(photos) as photo_url,
                generate_subscripts(photos, 1) as photo_index
              FROM inat_observations_cache
              WHERE latitude IS NOT NULL 
                AND longitude IS NOT NULL
                AND CAST(latitude AS DECIMAL) <= ${queryNorth}
                AND CAST(latitude AS DECIMAL) >= ${querySouth}
                AND CAST(longitude AS DECIMAL) <= ${queryEast}
                AND CAST(longitude AS DECIMAL) >= ${queryWest}
                AND scientific_name = ${scientificName}
                AND photos IS NOT NULL
                AND array_length(photos, 1) > 0
                AND quality_grade = 'research'
                AND EXTRACT(MONTH FROM observed_on) >= ${startMonth}
            ) t
            ORDER BY observed_on DESC, photo_index
          `);
        } else if (monthEnd) {
          const endMonth = parseInt(monthEnd as string);
          inatObservations = await db.execute(sql`
            SELECT 
              inat_id as observation_id,
              inat_id,
              scientific_name,
              common_name,
              user_name as observer,
              observed_on,
              place_guess as state,
              place_guess,
              photo_url as image_link,
              'iNaturalist' as source,
              photo_index
            FROM (
              SELECT 
                inat_id,
                scientific_name,
                common_name,
                user_name,
                observed_on,
                place_guess,
                unnest(photos) as photo_url,
                generate_subscripts(photos, 1) as photo_index
              FROM inat_observations_cache
              WHERE latitude IS NOT NULL 
                AND longitude IS NOT NULL
                AND CAST(latitude AS DECIMAL) <= ${queryNorth}
                AND CAST(latitude AS DECIMAL) >= ${querySouth}
                AND CAST(longitude AS DECIMAL) <= ${queryEast}
                AND CAST(longitude AS DECIMAL) >= ${queryWest}
                AND scientific_name = ${scientificName}
                AND photos IS NOT NULL
                AND array_length(photos, 1) > 0
                AND quality_grade = 'research'
                AND EXTRACT(MONTH FROM observed_on) <= ${endMonth}
            ) t
            ORDER BY observed_on DESC, photo_index
          `);
        } else {
          inatObservations = await db.execute(sql`
            SELECT 
              inat_id as observation_id,
              inat_id,
              scientific_name,
              common_name,
              user_name as observer,
              observed_on,
              place_guess as state,
              place_guess,
              photo_url as image_link,
              'iNaturalist' as source,
              photo_index
            FROM (
              SELECT 
                inat_id,
                scientific_name,
                common_name,
                user_name,
                observed_on,
                place_guess,
                unnest(photos) as photo_url,
                generate_subscripts(photos, 1) as photo_index
              FROM inat_observations_cache
              WHERE latitude IS NOT NULL 
                AND longitude IS NOT NULL
                AND CAST(latitude AS DECIMAL) <= ${queryNorth}
                AND CAST(latitude AS DECIMAL) >= ${querySouth}
                AND CAST(longitude AS DECIMAL) <= ${queryEast}
                AND CAST(longitude AS DECIMAL) >= ${queryWest}
                AND scientific_name = ${scientificName}
                AND photos IS NOT NULL
                AND array_length(photos, 1) > 0
                AND quality_grade = 'research'
            ) t
            ORDER BY observed_on DESC, photo_index
          `);
        }
        
        allImages.push(...inatObservations.rows);
      }

      // Only check iNaturalist if includeNonValidated is enabled
      if (includeNonValidatedBool) {
        console.log(`[Images API] Including non-validated data - checking iNaturalist for ${scientificName}`);
        
        try {
        const boundingBox = { north: queryNorth, south: querySouth, east: queryEast, west: queryWest };
        
        // Check if we have cached data
        const cachedMetadata = await checkCacheForArea(fieldGuideId, expansionMiles, boundingBox);
        
        let inatObservations = [];
        if (cachedMetadata) {
          // Use cached data
          console.log(`[Images API] Using cached iNaturalist data`);
          inatObservations = await getCachedObservations(boundingBox, monthStart as string, monthEnd as string);
        } else {
          // For images endpoint, fetch just this species instead of entire area (much faster!)
          console.log(`[Images API] No cache found, fetching ${scientificName} specifically from iNaturalist`);
          
          // Build URL with species-specific search
          const params = new URLSearchParams({
            taxon_name: scientificName,
            quality_grade: 'research',
            photos: 'true',
            nelat: queryNorth.toString(),
            nelng: queryEast.toString(), 
            swlat: querySouth.toString(),
            swlng: queryWest.toString(),
            per_page: '200'
          });
          
          if (monthStart && monthEnd) {
            const startMonth = parseInt(monthStart as string);
            const endMonth = parseInt(monthEnd as string);
            params.set('month', startMonth <= endMonth ? 
              `${startMonth},${endMonth}` : 
              `${startMonth},12,1,${endMonth}`);
          }
          
          const url = `https://api.inaturalist.org/v1/observations?${params.toString()}`;
          console.log(`[Images API] Fetching: ${url}`);
          
          const response = await fetch(url);
          const data = await response.json();
          
          // Transform to cached format
          inatObservations = data.results?.map((obs: any) => ({
            inat_id: obs.id,
            scientific_name: obs.taxon?.name,
            common_name: obs.taxon?.preferred_common_name,
            user_name: obs.user?.login,
            observed_on: obs.observed_on,
            place_guess: obs.place_guess,
            photos: obs.photos?.map((p: any) => p.url?.replace('square', 'medium')) || [],
            quality_grade: obs.quality_grade,
            latitude: obs.geojson?.coordinates?.[1],
            longitude: obs.geojson?.coordinates?.[0]
          })) || [];
          
          console.log(`[Images API] Found ${inatObservations.length} ${scientificName} observations from iNaturalist`);
        }
        
        // Filter for our specific species and extract images
        const speciesObservations = inatObservations.filter((obs: any) => obs.scientific_name === scientificName && obs.photos && obs.photos.length > 0);
        console.log(`[Images API] Found ${speciesObservations.length} iNaturalist observations with photos for ${scientificName}`);
        
        // Transform to image format (each photo as separate entry)
        const inatImages: any[] = [];
        speciesObservations.forEach((obs: any) => {
          obs.photos.forEach((photoUrl: string, photoIndex: number) => {
            inatImages.push({
              observation_id: obs.inat_id.toString(),
              scientific_name: obs.scientific_name,
              common_name: obs.common_name,
              observer: obs.user_name,
              observed_on: obs.observed_on,
              state: obs.place_guess,
              place_guess: obs.place_guess,
              image_link: photoUrl,
              source: 'iNaturalist'
            });
          });
        });
        
        // Extract existing iNaturalist IDs from database observations to avoid duplicates
        const existingInatIds = new Set<string>();
        allImages.forEach(img => {
          // Extract base iNaturalist ID from various formats:
          // "130418033" -> "130418033"
          // "iNat-130418033-1" -> "130418033"
          let baseId = img.observation_id;
          if (baseId.startsWith('iNat-')) {
            baseId = baseId.split('-')[1]; // Extract middle part from iNat-ID-photoIndex
          }
          // Only add if it's a numeric iNaturalist ID
          if (/^\d+$/.test(baseId)) {
            existingInatIds.add(baseId);
          }
        });
        
        // Filter out iNaturalist images that duplicate existing database observations
        const deduplicatedInatImages = inatImages.filter(img => {
          const inatId = img.observation_id.split('-')[1]; // Extract ID from "iNat-ID-photoIndex"
          return !existingInatIds.has(inatId);
        });
        
        allImages.push(...deduplicatedInatImages);
        console.log(`[Images API] Added ${deduplicatedInatImages.length} images from iNaturalist for ${scientificName} (filtered ${inatImages.length - deduplicatedInatImages.length} duplicates)`);
        
        } catch (error) {
          console.error(`[Images API] Error fetching iNaturalist images for ${scientificName}:`, error);
        }
      } else {
        console.log(`[Images API] Only showing DNA-validated observations (database only)`);
      }

      // Include MO observations if includeInat is true (using cache-first approach)
      if (includeInatBool) {
        try {
          console.log(`[MO Images API] Getting MO images for ${scientificName}`);
          
          const boundingBox = { north: queryNorth, south: querySouth, east: queryEast, west: queryWest };
          
          // Check cache first
          const moCache = await checkMoCacheForArea(fieldGuideId, expansionMiles, boundingBox);
          let moObservations = [];
          
          if (moCache) {
            console.log(`[MO Images Cache] Using cached data for ${scientificName}`);
            moObservations = await getCachedMoObservations(boundingBox, monthStart as string, monthEnd as string);
          } else {
            console.log(`[MO Images Cache] No cache found, fetching from API for ${scientificName}`);
            moObservations = await fetchMoObservations(boundingBox, monthStart as string, monthEnd as string);
            
            // Store in cache for future use
            if (moObservations.length > 0) {
              await storeMoObservationsInCache(fieldGuideId, expansionMiles, boundingBox, moObservations);
            }
          }
          
          // Filter MO observations for this specific species and with photos
          const moSpeciesObservations = moObservations.filter((obs: any) => 
            obs.scientific_name === scientificName && 
            obs.photos && 
            obs.photos.length > 0
          );
          
          console.log(`[MO Images API] Found ${moSpeciesObservations.length} MO observations with photos for ${scientificName}`);
          
          // Transform MO observations to image format (each photo as separate entry)
          const moImages: any[] = [];
          moSpeciesObservations.forEach((obs: any, obsIndex: number) => {
            obs.photos.forEach((photoUrl: string, photoIndex: number) => {
              moImages.push({
                observation_id: `MO-${obs.mo_id}-${photoIndex}`,
                scientific_name: obs.scientific_name,
                common_name: obs.common_name,
                observer: obs.user_name,
                observed_on: obs.observed_on,
                state: obs.location,
                place_guess: obs.place_guess,
                image_link: photoUrl,
                source: 'Mushroom Observer'
              });
            });
          });
          
          allImages.push(...moImages);
          console.log(`[MO Images API] Added ${moImages.length} images from MO for ${scientificName}`);
          
        } catch (error) {
          console.error(`[MO Images API] Error fetching MO images for ${scientificName}:`, error);
        }
      }
      
      // Format response
      const images = allImages.map((row: any) => ({
        observationId: row.observation_id,
        imageUrl: row.image_link,
        imageId: row.observation_id,
        observer: row.observer,
        observedOn: row.observed_on,
        state: row.state,
        placeGuess: row.place_guess,
        source: row.source,
        scientificName: row.scientific_name,
        isSelected: false
      })).filter(img => img.imageUrl);
      
      console.log(`[Images API] Returning ${images.length} images for ${scientificName} (expansion: ${expansionMiles}, includeNonValidated: ${includeNonValidatedBool}, months: ${monthStart}-${monthEnd})`);
      res.json(images);
    } catch (error) {
      console.error("Error fetching species images:", error);
      res.status(500).json({ error: "Failed to fetch species images" });
    }
  });

  // New species images endpoint - v2 (Field Guide approach)
  app.get("/api/species/:name/images-v2", async (req, res) => {
    try {
      const { name } = req.params;
      const { state, includeNonValidated } = req.query;
      
      const scientificName = decodeURIComponent(name);
      const selectedState = state as string;
      const includeNonValidatedBool = includeNonValidated === 'true';
      
      console.log(`[Species Images API] Getting images for ${scientificName}, state: ${selectedState}, includeNonValidated: ${includeNonValidatedBool}`);
      
      // Step 1: Get the observations (this is our 200 observations universe)
      let observations;
      if (selectedState && selectedState !== "all") {
        observations = await db.execute(sql`
          SELECT 
            observation_id,
            scientific_name,
            common_name,
            collector as observer,
            observed_on,
            state,
            place_guess,
            source,
            image_link
          FROM observations 
          WHERE scientific_name = ${scientificName} 
            AND state = ${selectedState}
          ORDER BY observed_on DESC
        `);
      } else {
        observations = await db.execute(sql`
          SELECT 
            observation_id,
            scientific_name,
            common_name,
            collector as observer,
            observed_on,
            state,
            place_guess,
            source,
            image_link
          FROM observations 
          WHERE scientific_name = ${scientificName}
          ORDER BY observed_on DESC
        `);
      }
      
      console.log(`[Species Images API] Found ${observations.rows.length} total observations for ${scientificName}`);
      
      let allImages = [];
      
      // Step 2: Check for iNaturalist observations in the main table and get their cached photos
      const inatObservationsInMainTable = observations.rows
        .filter(row => /^\d+$/.test(row.observation_id))
        .map(row => row.observation_id);
      
      console.log(`[Species Images API] Found ${inatObservationsInMainTable.length} potential iNaturalist observations:`, inatObservationsInMainTable.slice(0, 5));
      
      if (inatObservationsInMainTable.length > 0) {
        // Get cached photos for each iNaturalist observation
        const allInatCachePhotos = [];
        
        for (const inatId of inatObservationsInMainTable) {
          const inatCachePhotos = await db.execute(sql`
            SELECT 
              inat_id as observation_id,
              inat_id,
              scientific_name,
              common_name,
              user_name as observer,
              observed_on,
              place_guess as state,
              place_guess,
              photo_url as image_link,
              'iNaturalist' as source,
              photo_index
            FROM (
              SELECT 
                inat_id,
                scientific_name,
                common_name,
                user_name,
                observed_on,
                place_guess,
                unnest(photos) as photo_url,
                generate_subscripts(photos, 1) as photo_index
              FROM inat_observations_cache
              WHERE inat_id = ${inatId}
                AND scientific_name = ${scientificName}
                AND photos IS NOT NULL
                AND array_length(photos, 1) > 0
                AND quality_grade = 'research'
            ) t
            ORDER BY observed_on DESC, photo_index
          `);
          
          allInatCachePhotos.push(...inatCachePhotos.rows);
        }
        
        // Step 3: Handle missing or empty cache data
        if (allInatCachePhotos.length > 0) {
          // Cache has photos - use them
          allImages.push(...allInatCachePhotos);
          console.log(`[Species Images API] Using ${allInatCachePhotos.length} photos from cache`);
        } else {
          // Cache is empty - fetch fresh data from iNaturalist API in batches
          console.log(`[Species Images API] Cache empty for ${inatObservationsInMainTable.length} observations - fetching fresh data from API`);
          
          const freshInatData = [];
          for (const inatId of inatObservationsInMainTable) {
            try {
              const response = await fetch(`https://api.inaturalist.org/v1/observations/${inatId}`);
              if (response.ok) {
                const data = await response.json();
                const obs = data.results[0];
                if (obs && obs.photos && obs.photos.length > 0) {
                  // Add each photo as separate entry  
                  obs.photos.forEach((photo: any, photoIndex: number) => {
                    freshInatData.push({
                      observation_id: obs.id.toString(),
                      scientific_name: obs.taxon?.name || scientificName,
                      common_name: obs.taxon?.preferred_common_name || null,
                      observer: obs.user?.name || obs.user?.login,
                      observed_on: obs.observed_on,
                      state: obs.place_guess,
                      place_guess: obs.place_guess,
                      image_link: photo.url.replace('square', 'large'),
                      source: 'iNaturalist'
                    });
                  });
                  
                  // Store in cache for future use
                  try {
                    await db.insert(inatObservationsCache).values({
                      inatId: obs.id,
                      scientificName: obs.taxon?.name || scientificName,
                      commonName: obs.taxon?.preferred_common_name,
                      userName: obs.user?.name || obs.user?.login,
                      observedOn: obs.observed_on,
                      placeGuess: obs.place_guess,
                      latitude: obs.geojson?.coordinates?.[1]?.toString(),
                      longitude: obs.geojson?.coordinates?.[0]?.toString(),
                      photos: obs.photos?.map((p: any) => p.url?.replace('square', 'large')) || [],
                      qualityGrade: obs.quality_grade,
                      createdAt: new Date(),
                      updatedAt: new Date()
                    }).onConflictDoUpdate({
                      target: inatObservationsCache.inatId,
                      set: {
                        photos: obs.photos?.map((p: any) => p.url?.replace('square', 'large')) || [],
                        updatedAt: new Date()
                      }
                    });
                  } catch (cacheError) {
                    console.error(`[Species Images API] Error caching data for ${inatId}:`, cacheError);
                  }
                }
              }
              // Small delay to be respectful to iNaturalist API
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
              console.error(`[Species Images API] Error fetching iNaturalist observation ${inatId}:`, error);
            }
          }
          
          if (freshInatData.length > 0) {
            allImages.push(...freshInatData);
            console.log(`[Species Images API] Fetched ${freshInatData.length} fresh photos from iNaturalist API and stored in cache`);
          }
        }
      }
      
      // Step 4: Add non-iNaturalist observations from main database that have image links
      const dbObservationsWithImages = observations.rows
        .filter(row => row.image_link && row.image_link.trim() !== '' && !/^\d+$/.test(row.observation_id))
        .map(row => ({
          observation_id: row.observation_id,
          scientific_name: row.scientific_name,
          common_name: row.common_name,
          observer: row.observer,
          observed_on: row.observed_on,
          state: row.state,
          place_guess: row.place_guess,
          image_link: row.image_link,
          source: row.source || 'Database'
        }));
      
      allImages.push(...dbObservationsWithImages);
      console.log(`[Species Images API] Added ${dbObservationsWithImages.length} database observations with image links`);
      
      // Step 5: Additional iNaturalist search if includeNonValidated is true
      if (includeNonValidatedBool) {
        console.log(`[Species Images API] Including non-validated data - searching iNaturalist directly for ${scientificName}`);
        
        try {
          // Build iNaturalist API parameters for broader search
          const inatParams = new URLSearchParams({
            taxon_name: scientificName,
            photos: 'true',
            per_page: '200',
            order: 'desc',
            order_by: 'created_at'
          });
          
          if (selectedState && selectedState !== "all") {
            // Use state name directly for iNaturalist search
            inatParams.set('place_guess', selectedState);
          }
          
          const inatResponse = await fetch(`https://api.inaturalist.org/v1/observations?${inatParams}`);
          if (inatResponse.ok) {
            const inatData = await inatResponse.json();
            console.log(`[Species Images API] Found ${inatData.results?.length || 0} additional iNaturalist observations`);
            
            if (inatData.results && inatData.results.length > 0) {
              const additionalImages = inatData.results
                .filter((obs: any) => obs.photos && obs.photos.length > 0)
                .flatMap((obs: any) => 
                  obs.photos.map((photo: any, index: number) => ({
                    observation_id: `iNat-${obs.id}-${index}`,
                    scientific_name: obs.taxon?.name || scientificName,
                    common_name: obs.taxon?.preferred_common_name,
                    observer: obs.user?.name || obs.user?.login,
                    observed_on: obs.observed_on,
                    state: obs.place_guess?.includes(',') ? obs.place_guess.split(',').pop()?.trim() : obs.place_guess,
                    place_guess: obs.place_guess,
                    image_link: photo.url?.replace('square', 'medium'),
                    source: 'iNaturalist'
                  }))
                );
              
              allImages.push(...additionalImages);
              console.log(`[Species Images API] Added ${additionalImages.length} additional iNaturalist images`);
            }
          }
        } catch (error) {
          console.error(`[Species Images API] Error fetching additional iNaturalist data:`, error);
        }
      }
      
      // Step 6: Format response (same as Field Guide)
      const images = allImages.map((row: any) => ({
        observationId: row.observation_id,
        imageUrl: row.image_link,
        imageId: row.observation_id,
        observer: row.observer,
        observedOn: row.observed_on,
        state: row.state,
        placeGuess: row.place_guess,
        source: row.source,
        scientificName: row.scientific_name
      })).filter(img => img.imageUrl);
      
      console.log(`[Species Images API] Returning ${images.length} images for ${scientificName} (state: ${selectedState}, includeNonValidated: ${includeNonValidatedBool})`);
      res.json(images);
      
    } catch (error) {
      console.error("Error fetching species images:", error);
      res.status(500).json({ error: "Failed to fetch species images" });
    }
  });

  // Admin endpoint to run state first record calculations
  app.post('/api/admin/calculate-state-firsts', async (req, res) => {
    try {
      console.log('Running state first record calculations on all observations...');
      // State first records are now calculated dynamically - no need for database calculation
      res.json({ success: true, message: 'State first record calculations completed successfully' });
    } catch (error) {
      console.error('Error running state first calculations:', error);
      res.status(500).json({ error: 'Failed to calculate state first records' });
    }
  });

  // ============================================
  // SHIPMENT MANAGEMENT API ENDPOINTS
  // ============================================

  // Get all shipments for the current user
  app.get("/api/shipments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userShipments = await db.select()
        .from(shipments)
        .where(eq(shipments.userId, userId))
        .orderBy(desc(shipments.createdAt));

      res.json(userShipments);
    } catch (error) {
      console.error("Error fetching shipments:", error);
      res.status(500).json({ error: "Failed to fetch shipments" });
    }
  });

  // Get a single shipment with bags and specimens
  app.get("/api/shipments/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const shipmentId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const [shipment] = await db.select()
        .from(shipments)
        .where(and(eq(shipments.id, shipmentId), eq(shipments.userId, userId)));

      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      // Get bags for this shipment
      const bags = await db.select()
        .from(shipmentBags)
        .where(eq(shipmentBags.shipmentId, shipmentId))
        .orderBy(shipmentBags.sortOrder);

      // Get specimens for each bag
      const bagsWithSpecimens = await Promise.all(
        bags.map(async (bag) => {
          const specimens = await db.select()
            .from(shipmentSpecimens)
            .where(eq(shipmentSpecimens.bagId, bag.id))
            .orderBy(shipmentSpecimens.sortOrder);
          return { ...bag, specimens };
        })
      );

      res.json({ ...shipment, bags: bagsWithSpecimens });
    } catch (error) {
      console.error("Error fetching shipment:", error);
      res.status(500).json({ error: "Failed to fetch shipment" });
    }
  });

  // Create a new shipment
  app.post("/api/shipments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const shipmentData = {
        ...req.body,
        userId,
        status: "draft",
      };

      const [newShipment] = await db.insert(shipments).values(shipmentData).returning();
      res.json(newShipment);
    } catch (error) {
      console.error("Error creating shipment:", error);
      res.status(500).json({ error: "Failed to create shipment" });
    }
  });

  // Update a shipment (questionnaire answers, status, tracking)
  app.patch("/api/shipments/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const shipmentId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verify ownership
      const [existing] = await db.select()
        .from(shipments)
        .where(and(eq(shipments.id, shipmentId), eq(shipments.userId, userId)));

      if (!existing) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      const [updated] = await db.update(shipments)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(shipments.id, shipmentId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating shipment:", error);
      res.status(500).json({ error: "Failed to update shipment" });
    }
  });

  // Delete a shipment
  app.delete("/api/shipments/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const shipmentId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verify ownership
      const [existing] = await db.select()
        .from(shipments)
        .where(and(eq(shipments.id, shipmentId), eq(shipments.userId, userId)));

      if (!existing) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      await db.delete(shipments).where(eq(shipments.id, shipmentId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting shipment:", error);
      res.status(500).json({ error: "Failed to delete shipment" });
    }
  });

  // Create a new bag in a shipment
  app.post("/api/shipments/:id/bags", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const shipmentId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verify shipment ownership
      const [existing] = await db.select()
        .from(shipments)
        .where(and(eq(shipments.id, shipmentId), eq(shipments.userId, userId)));

      if (!existing) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      // Get current max sort order
      const existingBags = await db.select()
        .from(shipmentBags)
        .where(eq(shipmentBags.shipmentId, shipmentId));

      const nextSortOrder = existingBags.length;
      const bagName = req.body.name || `Bag ${existingBags.length + 1}`;

      const [newBag] = await db.insert(shipmentBags).values({
        shipmentId,
        name: bagName,
        sortOrder: nextSortOrder,
      }).returning();

      res.json(newBag);
    } catch (error) {
      console.error("Error creating bag:", error);
      res.status(500).json({ error: "Failed to create bag" });
    }
  });

  // Update a bag
  app.patch("/api/shipments/bags/:bagId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const bagId = parseInt(req.params.bagId);

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verify ownership through shipment
      const [bag] = await db.select()
        .from(shipmentBags)
        .where(eq(shipmentBags.id, bagId));

      if (!bag) {
        return res.status(404).json({ error: "Bag not found" });
      }

      const [shipment] = await db.select()
        .from(shipments)
        .where(and(eq(shipments.id, bag.shipmentId), eq(shipments.userId, userId)));

      if (!shipment) {
        return res.status(403).json({ error: "Access denied" });
      }

      const [updated] = await db.update(shipmentBags)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(shipmentBags.id, bagId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating bag:", error);
      res.status(500).json({ error: "Failed to update bag" });
    }
  });

  // Delete a bag
  app.delete("/api/shipments/bags/:bagId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const bagId = parseInt(req.params.bagId);

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verify ownership through shipment
      const [bag] = await db.select()
        .from(shipmentBags)
        .where(eq(shipmentBags.id, bagId));

      if (!bag) {
        return res.status(404).json({ error: "Bag not found" });
      }

      const [shipment] = await db.select()
        .from(shipments)
        .where(and(eq(shipments.id, bag.shipmentId), eq(shipments.userId, userId)));

      if (!shipment) {
        return res.status(403).json({ error: "Access denied" });
      }

      await db.delete(shipmentBags).where(eq(shipmentBags.id, bagId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting bag:", error);
      res.status(500).json({ error: "Failed to delete bag" });
    }
  });

  // Add specimens to a bag
  app.post("/api/shipments/bags/:bagId/specimens", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const bagId = parseInt(req.params.bagId);

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verify ownership through shipment
      const [bag] = await db.select()
        .from(shipmentBags)
        .where(eq(shipmentBags.id, bagId));

      if (!bag) {
        return res.status(404).json({ error: "Bag not found" });
      }

      const [shipment] = await db.select()
        .from(shipments)
        .where(and(eq(shipments.id, bag.shipmentId), eq(shipments.userId, userId)));

      if (!shipment) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get current max sort order
      const existingSpecimens = await db.select()
        .from(shipmentSpecimens)
        .where(eq(shipmentSpecimens.bagId, bagId));

      const specimens = req.body.specimens || [req.body];
      const insertedSpecimens = [];

      for (let i = 0; i < specimens.length; i++) {
        const specimen = specimens[i];
        const [inserted] = await db.insert(shipmentSpecimens).values({
          bagId,
          platform: specimen.platform || "iNaturalist",
          observationId: specimen.observationId,
          sortOrder: existingSpecimens.length + i,
        }).returning();
        insertedSpecimens.push(inserted);
      }

      res.json(insertedSpecimens);
    } catch (error) {
      console.error("Error adding specimens:", error);
      res.status(500).json({ error: "Failed to add specimens" });
    }
  });

  // Update a specimen
  app.patch("/api/shipments/specimens/:specimenId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const specimenId = parseInt(req.params.specimenId);

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verify ownership through bag -> shipment
      const [specimen] = await db.select()
        .from(shipmentSpecimens)
        .where(eq(shipmentSpecimens.id, specimenId));

      if (!specimen) {
        return res.status(404).json({ error: "Specimen not found" });
      }

      const [bag] = await db.select()
        .from(shipmentBags)
        .where(eq(shipmentBags.id, specimen.bagId));

      const [shipment] = await db.select()
        .from(shipments)
        .where(and(eq(shipments.id, bag.shipmentId), eq(shipments.userId, userId)));

      if (!shipment) {
        return res.status(403).json({ error: "Access denied" });
      }

      const [updated] = await db.update(shipmentSpecimens)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(shipmentSpecimens.id, specimenId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating specimen:", error);
      res.status(500).json({ error: "Failed to update specimen" });
    }
  });

  // Delete a specimen
  app.delete("/api/shipments/specimens/:specimenId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const specimenId = parseInt(req.params.specimenId);

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verify ownership through bag -> shipment
      const [specimen] = await db.select()
        .from(shipmentSpecimens)
        .where(eq(shipmentSpecimens.id, specimenId));

      if (!specimen) {
        return res.status(404).json({ error: "Specimen not found" });
      }

      const [bag] = await db.select()
        .from(shipmentBags)
        .where(eq(shipmentBags.id, specimen.bagId));

      const [shipment] = await db.select()
        .from(shipments)
        .where(and(eq(shipments.id, bag.shipmentId), eq(shipments.userId, userId)));

      if (!shipment) {
        return res.status(403).json({ error: "Access denied" });
      }

      await db.delete(shipmentSpecimens).where(eq(shipmentSpecimens.id, specimenId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting specimen:", error);
      res.status(500).json({ error: "Failed to delete specimen" });
    }
  });

  // Validate specimens in a bag (ping iNaturalist/MO APIs)
  app.post("/api/shipments/bags/:bagId/validate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const bagId = parseInt(req.params.bagId);

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verify ownership
      const [bag] = await db.select()
        .from(shipmentBags)
        .where(eq(shipmentBags.id, bagId));

      if (!bag) {
        return res.status(404).json({ error: "Bag not found" });
      }

      const [shipment] = await db.select()
        .from(shipments)
        .where(and(eq(shipments.id, bag.shipmentId), eq(shipments.userId, userId)));

      if (!shipment) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get all specimens in this bag
      const specimens = await db.select()
        .from(shipmentSpecimens)
        .where(eq(shipmentSpecimens.bagId, bagId));

      const validatedSpecimens = [];

      // Validate each specimen
      for (const specimen of specimens) {
        try {
          let validationResult: any = {
            isValidated: true,
            validationStatus: "error",
            validationMessage: "Unknown platform",
          };

          // Extract numeric ID from URL or use as-is
          let obsId = specimen.observationId;
          if (obsId.includes("inaturalist.org")) {
            const match = obsId.match(/observations\/(\d+)/);
            if (match) obsId = match[1];
          } else if (obsId.includes("mushroomobserver.org")) {
            const match = obsId.match(/\/(\d+)/);
            if (match) obsId = match[1];
          }

          if (specimen.platform === "iNaturalist") {
            // Include observation fields in the API request
            const response = await fetch(`https://api.inaturalist.org/v1/observations/${obsId}?include=ofvs`);
            if (response.ok) {
              const data = await response.json();
              const obs = data.results?.[0];
              if (obs) {
                const kingdom = obs.taxon?.ancestor_ids?.length > 0 ? 
                  (obs.taxon?.ancestors?.find((a: any) => a.rank === "kingdom")?.name || 
                   (obs.taxon?.iconic_taxon_name === "Fungi" ? "Fungi" : null)) : null;
                
                // Check for Myxomycetes (slime molds) - iNaturalist classifies them as Protozoa
                const taxonomicClass = obs.taxon?.ancestors?.find((a: any) => a.rank === "class")?.name || null;
                const iconicTaxon = obs.taxon?.iconic_taxon_name;
                const isSlimeMold = iconicTaxon === "Protozoa" || 
                  taxonomicClass === "Myxomycetes" || 
                  obs.taxon?.name?.toLowerCase().includes("myxomycete") ||
                  obs.taxon?.ancestors?.some((a: any) => a.name === "Myxomycetes");
                
                // Extract Voucher Number(s) from observation fields
                const observationFields = obs.ofvs || [];
                const voucherNumberField = observationFields.find((field: any) => 
                  field.name === "Voucher Number(s)" || 
                  field.observation_field?.name === "Voucher Number(s)"
                );
                const voucherNumber = voucherNumberField?.value || null;
                
                let validationStatus = "invalid";
                let validationMessage = "This observation is not fungal";
                
                if (kingdom === "Fungi" || isSlimeMold) {
                  // Both fungi and slime molds are valid specimens
                  // The bag-level check for mixing will happen after all specimens are validated
                  validationStatus = "valid";
                  validationMessage = isSlimeMold ? "Valid slime mold specimen" : "Valid fungal specimen";
                }
                
                validationResult = {
                  isValidated: true,
                  validationStatus,
                  validationMessage,
                  scientificName: obs.taxon?.name || "Unknown",
                  observedDate: obs.observed_on,
                  location: obs.place_guess,
                  username: obs.user?.login,
                  kingdom: kingdom || obs.taxon?.iconic_taxon_name,
                  taxonomicClass: isSlimeMold ? "Myxomycetes" : taxonomicClass,
                  voucherNumber,
                };
              } else {
                validationResult = {
                  isValidated: true,
                  validationStatus: "error",
                  validationMessage: "Observation not found",
                };
              }
            } else {
              validationResult = {
                isValidated: true,
                validationStatus: "error",
                validationMessage: `API error: ${response.status}`,
              };
            }
          } else if (specimen.platform === "Mushroom Observer") {
            // Mushroom Observer API
            const response = await fetch(`https://mushroomobserver.org/api2/observations?id=${obsId}&detail=high`);
            if (response.ok) {
              const data = await response.json();
              const obs = data.results?.[0];
              if (obs) {
                validationResult = {
                  isValidated: true,
                  validationStatus: "valid", // MO is fungi-only
                  validationMessage: "Valid fungal specimen",
                  scientificName: obs.consensus?.name || "Unknown",
                  observedDate: obs.date,
                  location: obs.location?.name || obs.where,
                  username: obs.owner?.login_name,
                  kingdom: "Fungi",
                };
              } else {
                validationResult = {
                  isValidated: true,
                  validationStatus: "error",
                  validationMessage: "Observation not found",
                };
              }
            } else {
              validationResult = {
                isValidated: true,
                validationStatus: "error",
                validationMessage: `API error: ${response.status}`,
              };
            }
          }

          // Update the specimen with validation data
          const [updated] = await db.update(shipmentSpecimens)
            .set({ ...validationResult, updatedAt: new Date() })
            .where(eq(shipmentSpecimens.id, specimen.id))
            .returning();

          validatedSpecimens.push(updated);
        } catch (error) {
          console.error(`Error validating specimen ${specimen.id}:`, error);
          const [updated] = await db.update(shipmentSpecimens)
            .set({
              isValidated: true,
              validationStatus: "error",
              validationMessage: "Validation failed",
              updatedAt: new Date(),
            })
            .where(eq(shipmentSpecimens.id, specimen.id))
            .returning();
          validatedSpecimens.push(updated);
        }
      }

      // After validating all specimens, check for bag-level mixing issues
      // If a bag has both slime molds and regular fungi, mark the slime molds as needing their own bag
      const slimeMolds = validatedSpecimens.filter(s => s.taxonomicClass === "Myxomycetes");
      const regularFungi = validatedSpecimens.filter(s => 
        s.validationStatus === "valid" && s.taxonomicClass !== "Myxomycetes" && s.kingdom === "Fungi"
      );
      
      if (slimeMolds.length > 0 && regularFungi.length > 0) {
        // Mixed bag - update slime molds to show the error
        for (const slimeMold of slimeMolds) {
          await db.update(shipmentSpecimens)
            .set({
              validationStatus: "slime_mold",
              validationMessage: "This observation is a slime mold and should be in its own bag",
              updatedAt: new Date(),
            })
            .where(eq(shipmentSpecimens.id, slimeMold.id));
          
          // Update the local copy for the response
          const idx = validatedSpecimens.findIndex(s => s.id === slimeMold.id);
          if (idx !== -1) {
            validatedSpecimens[idx] = {
              ...validatedSpecimens[idx],
              validationStatus: "slime_mold",
              validationMessage: "This observation is a slime mold and should be in its own bag",
            };
          }
        }
      }

      res.json(validatedSpecimens);
    } catch (error) {
      console.error("Error validating specimens:", error);
      res.status(500).json({ error: "Failed to validate specimens" });
    }
  });

  // Override specimen validation (user clicks "This is ok")
  app.post("/api/specimens/:id/override", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const specimenId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get specimen and verify ownership through bag -> shipment
      const [specimen] = await db.select()
        .from(shipmentSpecimens)
        .where(eq(shipmentSpecimens.id, specimenId));

      if (!specimen) {
        return res.status(404).json({ error: "Specimen not found" });
      }

      const [bag] = await db.select()
        .from(shipmentBags)
        .where(eq(shipmentBags.id, specimen.bagId));

      if (!bag) {
        return res.status(404).json({ error: "Bag not found" });
      }

      const [shipment] = await db.select()
        .from(shipments)
        .where(and(eq(shipments.id, bag.shipmentId), eq(shipments.userId, userId)));

      if (!shipment) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Update specimen with user override
      const [updated] = await db.update(shipmentSpecimens)
        .set({
          userOverride: true,
          validationStatus: "valid",
          validationMessage: "User confirmed specimen",
          updatedAt: new Date(),
        })
        .where(eq(shipmentSpecimens.id, specimenId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error overriding specimen validation:", error);
      res.status(500).json({ error: "Failed to override validation" });
    }
  });

  // Submit shipment (marks as submitted and returns lab address)
  app.post("/api/shipments/:id/submit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const shipmentId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verify ownership
      const [existing] = await db.select()
        .from(shipments)
        .where(and(eq(shipments.id, shipmentId), eq(shipments.userId, userId)));

      if (!existing) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      const [updated] = await db.update(shipments)
        .set({
          status: "submitted",
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, shipmentId))
        .returning();

      // Update all specimens in this shipment to "submitted" processingStatus
      const bags = await db.select().from(shipmentBags).where(eq(shipmentBags.shipmentId, shipmentId));
      const bagIds = bags.map(b => b.id);
      if (bagIds.length > 0) {
        await db.update(shipmentSpecimens)
          .set({ processingStatus: "submitted", updatedAt: new Date() })
          .where(inArray(shipmentSpecimens.bagId, bagIds));
      }

      res.json({
        shipment: updated,
        labAddress: {
          name: "Mycota Lab",
          street: "46701 Commerce Center Dr.",
          city: "Plymouth",
          state: "MI",
          zip: "48170",
        },
      });
    } catch (error) {
      console.error("Error submitting shipment:", error);
      res.status(500).json({ error: "Failed to submit shipment" });
    }
  });

  // =============================================
  // ADMIN LIMS API ENDPOINTS
  // =============================================

  // Get all pending shipments (admin only)
  app.get("/api/admin/shipments/pending", isAdmin, async (req: any, res) => {
    try {
      const pendingShipments = await db.select({
        id: shipments.id,
        userId: shipments.userId,
        status: shipments.status,
        trackingNumber: shipments.trackingNumber,
        submittedAt: shipments.submittedAt,
        createdAt: shipments.createdAt,
      })
      .from(shipments)
      .where(eq(shipments.status, "submitted"))
      .orderBy(desc(shipments.submittedAt));

      // Enrich with user info and specimen counts
      const enrichedShipments = await Promise.all(pendingShipments.map(async (shipment) => {
        const [user] = await db.select({
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        }).from(users).where(eq(users.id, shipment.userId));

        // Get specimen count and first specimen's state
        const bagsWithSpecimens = await db.select()
          .from(shipmentBags)
          .where(eq(shipmentBags.shipmentId, shipment.id));
        
        let specimenCount = 0;
        let state = null;
        for (const bag of bagsWithSpecimens) {
          const specimens = await db.select().from(shipmentSpecimens).where(eq(shipmentSpecimens.bagId, bag.id));
          specimenCount += specimens.length;
          if (!state && specimens.length > 0 && specimens[0].location) {
            // Try to extract state from location
            const loc = specimens[0].location;
            const stateMatch = loc?.match(/,\s*([A-Z]{2}),?\s*U/i) || loc?.match(/([A-Z]{2})\s*$/);
            if (stateMatch) state = stateMatch[1];
          }
        }

        return {
          ...shipment,
          userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Unknown',
          state: state || 'N/A',
          specimenCount,
        };
      }));

      res.json(enrichedShipments);
    } catch (error) {
      console.error("Error fetching pending shipments:", error);
      res.status(500).json({ error: "Failed to fetch pending shipments" });
    }
  });

  // Get shipment details for admin
  app.get("/api/admin/shipments/:id", isAdmin, async (req: any, res) => {
    try {
      const shipmentId = parseInt(req.params.id);
      
      const [shipment] = await db.select().from(shipments).where(eq(shipments.id, shipmentId));
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      // Get user info
      const [user] = await db.select({
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      }).from(users).where(eq(users.id, shipment.userId));

      // Get bags with specimens
      const bags = await db.select().from(shipmentBags).where(eq(shipmentBags.shipmentId, shipmentId));
      const bagsWithSpecimens = await Promise.all(bags.map(async (bag) => {
        const specimens = await db.select().from(shipmentSpecimens).where(eq(shipmentSpecimens.bagId, bag.id));
        return { ...bag, specimens };
      }));

      res.json({
        ...shipment,
        user,
        bags: bagsWithSpecimens,
      });
    } catch (error) {
      console.error("Error fetching admin shipment details:", error);
      res.status(500).json({ error: "Failed to fetch shipment details" });
    }
  });

  // Update shipment status (admin action: mark received, sent to indiana)
  app.patch("/api/admin/shipments/:id/status", isAdmin, async (req: any, res) => {
    try {
      const shipmentId = parseInt(req.params.id);
      const { action, newStatus } = req.body;

      // Get shipment
      const [shipment] = await db.select().from(shipments).where(eq(shipments.id, shipmentId));
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      // Update shipment status
      const [updated] = await db.update(shipments)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(shipments.id, shipmentId))
        .returning();

      // Update all specimens in this shipment
      const bags = await db.select().from(shipmentBags).where(eq(shipmentBags.shipmentId, shipmentId));
      const bagIds = bags.map(b => b.id);
      
      let processingStatus = newStatus;
      if (action === "mark_received") processingStatus = "received";
      if (action === "sent_to_indiana") processingStatus = "processing";

      if (bagIds.length > 0) {
        await db.update(shipmentSpecimens)
          .set({ processingStatus, updatedAt: new Date() })
          .where(inArray(shipmentSpecimens.bagId, bagIds));
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating shipment status:", error);
      res.status(500).json({ error: "Failed to update shipment status" });
    }
  });

  // Lab Runs CRUD
  app.get("/api/admin/runs", isAdmin, async (req: any, res) => {
    try {
      const runs = await db.select().from(labRuns).orderBy(desc(labRuns.createdAt));
      res.json(runs);
    } catch (error) {
      console.error("Error fetching lab runs:", error);
      res.status(500).json({ error: "Failed to fetch lab runs" });
    }
  });

  app.post("/api/admin/runs", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { name, notes, plateCount } = req.body;
      const numPlates = Math.min(Math.max(parseInt(plateCount) || 20, 1), 100);

      const [run] = await db.insert(labRuns)
        .values({ name: name || `Run ${new Date().toLocaleDateString()}`, notes, createdBy: userId })
        .returning();

      // Create plates based on user selection
      for (let i = 1; i <= numPlates; i++) {
        await db.insert(labPlates).values({
          runId: run.id,
          plateNumber: i,
          name: `Plate ${i}`,
        });
      }

      res.json(run);
    } catch (error) {
      console.error("Error creating lab run:", error);
      res.status(500).json({ error: "Failed to create lab run" });
    }
  });

  app.get("/api/admin/runs/:id", isAdmin, async (req: any, res) => {
    try {
      const runId = parseInt(req.params.id);
      const [run] = await db.select().from(labRuns).where(eq(labRuns.id, runId));
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }

      const plates = await db.select().from(labPlates).where(eq(labPlates.runId, runId)).orderBy(labPlates.plateNumber);
      
      // Get sample counts and validation status for each plate
      const platesWithStats = await Promise.all(plates.map(async (plate) => {
        const wells = await db.select().from(labWells).where(eq(labWells.plateId, plate.id));
        const sampleCount = wells.filter(w => w.observationId || w.labCode).length;
        const validatedCount = wells.filter(w => w.isValidated && w.validationStatus === 'valid').length;
        // no_voucher is acceptable - don't count it as an error for plate status
        const acceptableStatuses = ['valid', 'no_voucher'];
        const errorCount = wells.filter(w => w.isValidated && w.validationStatus && !acceptableStatuses.includes(w.validationStatus)).length;
        // Plate is "fully validated" if all samples are validated with acceptable statuses OR manually cleared
        const validatedOrNoVoucherCount = wells.filter(w => w.isValidated && w.validationStatus && acceptableStatuses.includes(w.validationStatus)).length;
        // Cleared wells = was part of validation but status manually cleared (isValidated=false, no status, but has sample)
        const clearedCount = wells.filter(w => !w.isValidated && !w.validationStatus && (w.observationId || w.labCode)).length;
        // Green if: has samples, no errors, and all samples are either validated/no_voucher OR cleared
        const isFullyValidated = sampleCount > 0 && (validatedOrNoVoucherCount + clearedCount) === sampleCount && errorCount === 0;
        
        return {
          ...plate,
          sampleCount,
          validatedCount,
          errorCount,
          clearedCount,
          isFullyValidated,
        };
      }));
      
      res.json({ ...run, plates: platesWithStats });
    } catch (error) {
      console.error("Error fetching lab run:", error);
      res.status(500).json({ error: "Failed to fetch lab run" });
    }
  });

  // Add plate to a run
  app.post("/api/admin/runs/:id/plates", isAdmin, async (req: any, res) => {
    try {
      const runId = parseInt(req.params.id);
      const { name, sampleCount = 96 } = req.body;
      
      // Validate sampleCount is between 1 and 96
      const validSampleCount = Math.max(1, Math.min(96, parseInt(sampleCount) || 96));
      
      // Get the next plate number
      const existingPlates = await db.select().from(labPlates).where(eq(labPlates.runId, runId));
      const nextPlateNumber = existingPlates.length > 0 
        ? Math.max(...existingPlates.map(p => p.plateNumber)) + 1 
        : 1;
      
      const [newPlate] = await db.insert(labPlates).values({
        runId,
        plateNumber: nextPlateNumber,
        name: name || `Plate ${nextPlateNumber}`,
        sampleCount: validSampleCount,
        status: 'empty',
      }).returning();
      
      res.json(newPlate);
    } catch (error) {
      console.error("Error adding plate:", error);
      res.status(500).json({ error: "Failed to add plate" });
    }
  });

  // Get plate with wells
  app.get("/api/admin/plates/:id", isAdmin, async (req: any, res) => {
    try {
      const plateId = parseInt(req.params.id);
      const [plate] = await db.select().from(labPlates).where(eq(labPlates.id, plateId));
      if (!plate) {
        return res.status(404).json({ error: "Plate not found" });
      }
      
      // Fetch run name
      const [run] = await db.select({ name: labRuns.name }).from(labRuns).where(eq(labRuns.id, plate.runId));
      const runName = run?.name || null;

      let wells = await db.select().from(labWells).where(eq(labWells.plateId, plateId)).orderBy(labWells.sortOrder);
      
      // If no wells exist, create wells based on sampleCount
      if (wells.length === 0) {
        const sampleCount = plate.sampleCount || 96;
        const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        const cols = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
        
        // Generate all 96 well positions in order
        const allWellPositions = plate.orientation === 'right-left' 
          ? rows.flatMap((row, ri) => cols.map((col, ci) => ({ pos: `${row}${col}`, order: ci * 8 + ri + 1 })))
          : rows.reverse().flatMap((row, ri) => cols.map((col, ci) => ({ pos: `${row}${col}`, order: ci * 8 + (7 - ri) + 1 })));
        
        // Sort by order and take only the first sampleCount wells
        allWellPositions.sort((a, b) => a.order - b.order);
        const wellPositions = allWellPositions.slice(0, sampleCount);
        
        for (const { pos, order } of wellPositions) {
          await db.insert(labWells).values({
            plateId,
            wellPosition: pos,
            sortOrder: order,
          });
        }
        
        wells = await db.select().from(labWells).where(eq(labWells.plateId, plateId)).orderBy(labWells.sortOrder);
      }

      res.json({ ...plate, runName, wells });
    } catch (error) {
      console.error("Error fetching plate:", error);
      res.status(500).json({ error: "Failed to fetch plate" });
    }
  });

  // Update plate settings (orientation, primers, index sets)
  app.patch("/api/admin/plates/:id", isAdmin, async (req: any, res) => {
    try {
      const plateId = parseInt(req.params.id);
      const { orientation, defaultForwardPrimer, defaultReversePrimer, notes, forwardIndexSetId, reverseIndexSetId } = req.body;

      const updateData: any = { updatedAt: new Date() };
      if (orientation !== undefined) updateData.orientation = orientation;
      if (defaultForwardPrimer !== undefined) updateData.defaultForwardPrimer = defaultForwardPrimer;
      if (defaultReversePrimer !== undefined) updateData.defaultReversePrimer = defaultReversePrimer;
      if (notes !== undefined) updateData.notes = notes;
      if (forwardIndexSetId !== undefined) updateData.forwardIndexSetId = forwardIndexSetId;
      if (reverseIndexSetId !== undefined) updateData.reverseIndexSetId = reverseIndexSetId;

      const [updated] = await db.update(labPlates)
        .set(updateData)
        .where(eq(labPlates.id, plateId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating plate:", error);
      res.status(500).json({ error: "Failed to update plate" });
    }
  });

  // Update plate sample count (add/remove wells)
  app.patch("/api/admin/plates/:id/sample-count", isAdmin, async (req: any, res) => {
    try {
      const plateId = parseInt(req.params.id);
      const { sampleCount } = req.body;
      
      // Validate sampleCount
      const validSampleCount = Math.max(1, Math.min(96, parseInt(sampleCount) || 96));
      
      // Get current wells
      const currentWells = await db.select().from(labWells)
        .where(eq(labWells.plateId, plateId))
        .orderBy(labWells.sortOrder);
      
      if (validSampleCount < currentWells.length) {
        // Remove excess wells (those with sortOrder > sampleCount)
        const wellsToDelete = currentWells.slice(validSampleCount);
        for (const well of wellsToDelete) {
          await db.delete(labWells).where(eq(labWells.id, well.id));
        }
      } else if (validSampleCount > currentWells.length) {
        // Add more wells
        const [plate] = await db.select().from(labPlates).where(eq(labPlates.id, plateId));
        if (plate) {
          const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
          const cols = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
          
          const allWellPositions = plate.orientation === 'right-left' 
            ? rows.flatMap((row, ri) => cols.map((col, ci) => ({ pos: `${row}${col}`, order: ci * 8 + ri + 1 })))
            : rows.reverse().flatMap((row, ri) => cols.map((col, ci) => ({ pos: `${row}${col}`, order: ci * 8 + (7 - ri) + 1 })));
          
          allWellPositions.sort((a, b) => a.order - b.order);
          
          // Get positions that already exist
          const existingPositions = new Set(currentWells.map(w => w.wellPosition));
          
          // Add wells for positions that don't exist yet, up to sampleCount
          const wellsNeeded = allWellPositions.slice(0, validSampleCount);
          for (const { pos, order } of wellsNeeded) {
            if (!existingPositions.has(pos)) {
              await db.insert(labWells).values({
                plateId,
                wellPosition: pos,
                sortOrder: order,
              });
            }
          }
        }
      }
      
      // Update plate sampleCount
      const [updated] = await db.update(labPlates)
        .set({ sampleCount: validSampleCount, updatedAt: new Date() })
        .where(eq(labPlates.id, plateId))
        .returning();
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating sample count:", error);
      res.status(500).json({ error: "Failed to update sample count" });
    }
  });

  // Bulk update wells (for applying primers to all)
  app.post("/api/admin/plates/:id/bulk-update", isAdmin, async (req: any, res) => {
    try {
      const plateId = parseInt(req.params.id);
      const { primerPool, forwardPrimer, reversePrimer } = req.body;

      const updateData: any = { updatedAt: new Date() };
      if (primerPool !== undefined) updateData.primerPool = primerPool;
      if (forwardPrimer !== undefined) updateData.forwardPrimer = forwardPrimer;
      if (reversePrimer !== undefined) updateData.reversePrimer = reversePrimer;

      await db.update(labWells)
        .set(updateData)
        .where(eq(labWells.plateId, plateId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error bulk updating wells:", error);
      res.status(500).json({ error: "Failed to bulk update wells" });
    }
  });

  // Update single well
  app.patch("/api/admin/wells/:id", isAdmin, async (req: any, res) => {
    try {
      const wellId = parseInt(req.params.id);
      const { 
        platform, 
        observationId, 
        labCode, 
        primerPool, 
        forwardPrimer, 
        reversePrimer,
        validationStatus,
        validationMessage,
        isValidated
      } = req.body;

      // Build update object, explicitly including null values for validation fields
      const updateData: any = { updatedAt: new Date() };
      
      if (platform !== undefined) updateData.platform = platform;
      if (observationId !== undefined) updateData.observationId = observationId;
      if (labCode !== undefined) updateData.labCode = labCode;
      if (primerPool !== undefined) updateData.primerPool = primerPool;
      if (forwardPrimer !== undefined) updateData.forwardPrimer = forwardPrimer;
      if (reversePrimer !== undefined) updateData.reversePrimer = reversePrimer;
      
      // Explicitly handle validation fields - allow null to clear them
      if ('validationStatus' in req.body) updateData.validationStatus = validationStatus;
      if ('validationMessage' in req.body) updateData.validationMessage = validationMessage;
      if ('isValidated' in req.body) updateData.isValidated = isValidated;

      const [updated] = await db.update(labWells)
        .set(updateData)
        .where(eq(labWells.id, wellId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating well:", error);
      res.status(500).json({ error: "Failed to update well" });
    }
  });

  // Validate plate wells (check iNaturalist for voucher numbers) - uses batch API
  app.post("/api/admin/plates/:id/validate", isAdmin, async (req: any, res) => {
    try {
      const plateId = parseInt(req.params.id);
      const wells = await db.select().from(labWells).where(eq(labWells.plateId, plateId));

      const results: any[] = [];
      const wellsToProcess: { well: any; effectiveObsId: string; effectivePlatform: string; validationResult: any }[] = [];

      // Phase 1: Pre-process wells - detect platforms and collect iNaturalist observation IDs
      for (const well of wells) {
        if (!well.observationId && !well.labCode) continue;

        let validationResult: any = { wellId: well.id };
        let effectivePlatform = well.platform;
        let effectiveObsId = well.observationId;

        // Auto-detect platform based on observation ID length
        if (!effectivePlatform && effectiveObsId) {
          const digits = effectiveObsId.replace(/\D/g, '');
          if (digits.length === 6) {
            validationResult.detectedPlatform = 'MO';
            effectivePlatform = 'MO';
          } else if (digits.length >= 8 && digits.length <= 9) {
            validationResult.detectedPlatform = 'iNaturalist';
            effectivePlatform = 'iNaturalist';
          }
        }

        wellsToProcess.push({ well, effectiveObsId: effectiveObsId || '', effectivePlatform: effectivePlatform || '', validationResult });
      }

      // Phase 2: Batch fetch iNaturalist observations (up to 200 per request)
      const inatObsIds = wellsToProcess
        .filter(w => w.effectivePlatform === 'iNaturalist' && w.effectiveObsId)
        .map(w => w.effectiveObsId.replace(/\D/g, ''));
      
      const obsDataMap: Record<string, any> = {};
      
      if (inatObsIds.length > 0) {
        console.log(`[Validate] Batch fetching ${inatObsIds.length} iNaturalist observations...`);
        
        // Split into batches of 100 (API limit is 200, but being conservative)
        const batchSize = 100;
        for (let i = 0; i < inatObsIds.length; i += batchSize) {
          const batch = inatObsIds.slice(i, i + batchSize);
          const batchUrl = `https://api.inaturalist.org/v1/observations?id=${batch.join(',')}&per_page=${batchSize}`;
          
          try {
            const response = await fetch(batchUrl, {
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(30000) // 30 second timeout for batch
            });
            
            if (response.ok) {
              const data = await response.json();
              console.log(`[Validate] Batch ${Math.floor(i/batchSize) + 1}: Retrieved ${data.results?.length || 0} observations`);
              
              for (const obs of (data.results || [])) {
                obsDataMap[String(obs.id)] = obs;
              }
            } else {
              console.error(`[Validate] Batch API error: ${response.status}`);
            }
          } catch (e: any) {
            console.error(`[Validate] Batch fetch error: ${e.message}`);
          }
        }
      }

      // Phase 2b: Fetch Mushroom Observer observations
      const moObsIds = wellsToProcess
        .filter(w => w.effectivePlatform === 'MO' && w.effectiveObsId)
        .map(w => w.effectiveObsId.replace(/\D/g, ''));
      
      const moDataMap: Record<string, any> = {};
      
      if (moObsIds.length > 0) {
        console.log(`[Validate] Fetching ${moObsIds.length} Mushroom Observer observations...`);
        
        // MO API doesn't support batch requests, so we need to fetch one at a time
        // But we can do it in parallel with rate limiting
        const moFetchPromises = moObsIds.map(async (obsId, index) => {
          // Rate limit: wait 200ms between requests to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, index * 200));
          
          try {
            const moUrl = `https://mushroomobserver.org/api2/observations?id=${obsId}&detail=high`;
            const response = await fetch(moUrl, {
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(15000)
            });
            
            if (response.ok) {
              const data = await response.json();
              if (data.results && data.results.length > 0) {
                moDataMap[obsId] = data.results[0];
              }
            }
          } catch (e: any) {
            console.error(`[Validate] MO fetch error for ${obsId}: ${e.message}`);
          }
        });
        
        await Promise.all(moFetchPromises);
        console.log(`[Validate] Retrieved ${Object.keys(moDataMap).length} Mushroom Observer observations`);
      }

      // Phase 3: Process each well with the fetched data
      for (const { well, effectiveObsId, effectivePlatform, validationResult } of wellsToProcess) {
        const obsId = effectiveObsId?.replace(/\D/g, '');
        
        // Process iNaturalist observations using cached data
        if (effectivePlatform === 'iNaturalist' && obsId) {
          const obs = obsDataMap[obsId];
          
          if (obs) {
            validationResult.apiFetched = true;
            
            const voucherField = obs.ofvs?.find((f: any) => f.name === 'Voucher Number(s)');
            const inatVoucher = voucherField?.value || null;

            validationResult.voucherNumber = inatVoucher;
            validationResult.scientificName = obs.taxon?.name;
            validationResult.username = obs.user?.login || null;
            
            // Extract location data from iNaturalist using structured place_ids
            try {
              const location = await extractLocationFromObservation(obs);
              validationResult.state = location.stateCode || location.stateName || null;
              validationResult.country = location.countryCode || location.countryName || null;
            } catch (locError) {
              console.error(`[Validate] Location extraction error for ${obsId}:`, locError);
              validationResult.state = null;
              validationResult.country = null;
            }
            
            const iconicTaxon = obs.taxon?.iconic_taxon_name;
            const taxonomicClass = obs.taxon?.ancestors?.find((a: any) => a.rank === "class")?.name || null;
            const isSlimeMold = iconicTaxon === "Protozoa" || 
              taxonomicClass === "Myxomycetes" || 
              obs.taxon?.name?.toLowerCase().includes("myxomycete") ||
              obs.taxon?.ancestors?.some((a: any) => a.name === "Myxomycetes");
            const isFungal = iconicTaxon === "Fungi";
            
            validationResult.isSlimeMold = isSlimeMold;
            validationResult.isFungal = isFungal;
            
            if (!isFungal && !isSlimeMold) {
              validationResult.status = 'not_fungal';
              validationResult.message = `Not fungal: ${iconicTaxon || 'Unknown taxon'} - ${obs.taxon?.name || 'Unknown species'}`;
            } else if (well.labCode && inatVoucher && well.labCode !== inatVoucher) {
              validationResult.status = 'mismatch';
              validationResult.message = `Lab code "${well.labCode}" doesn't match iNat voucher "${inatVoucher}"`;
            } else if (inatVoucher) {
              validationResult.status = 'valid';
              validationResult.message = isSlimeMold ? 'Valid (Slime Mold)' : 'Validated successfully';
            } else {
              validationResult.status = 'no_voucher';
              validationResult.message = 'No voucher number in iNaturalist';
            }
          } else {
            validationResult.status = 'error';
            validationResult.message = 'Observation not found in iNaturalist';
          }
        }

        // Process Mushroom Observer observations
        if (effectivePlatform === 'MO' && obsId) {
          const moObs = moDataMap[obsId];
          
          if (moObs) {
            validationResult.apiFetched = true;
            
            // Extract username from MO API response
            const moUsername = moObs.user?.login || moObs.user?.name || moObs.owner || null;
            validationResult.username = moUsername;
            validationResult.scientificName = moObs.consensus?.name || moObs.name?.name || null;
            
            // Extract location data from Mushroom Observer
            // MO location format can vary - use normalizer for consistent output
            const moLocation = moObs.location?.name || moObs.where || '';
            const moLocationParts = moLocation.split(',').map((p: string) => p.trim());
            if (moLocationParts.length >= 2) {
              // Format is typically "County, State, Country" or "City, State, Country"
              // Try to normalize the last two parts
              const potentialState = moLocationParts[moLocationParts.length - 2];
              const potentialCountry = moLocationParts[moLocationParts.length - 1];
              
              const normalizedCountry = normalizeCountry(potentialCountry);
              const normalizedState = normalizeState(potentialState);
              
              validationResult.country = normalizedCountry?.code || potentialCountry || null;
              validationResult.state = normalizedState?.code || potentialState || null;
            } else if (moLocationParts.length === 1) {
              const normalizedCountry = normalizeCountry(moLocationParts[0]);
              validationResult.country = normalizedCountry?.code || moLocationParts[0] || null;
            }
            
            // MO observations are fungi by default (it's a mycology platform)
            validationResult.isFungal = true;
            validationResult.status = 'valid';
            validationResult.message = 'Validated via Mushroom Observer';
          } else {
            // Still mark as valid even if API fetch failed - MO is a trusted source
            validationResult.status = 'valid';
            validationResult.message = 'Mushroom Observer observation (API lookup pending)';
          }
        }

        // Determine final validation status
        const finalPlatform = validationResult.detectedPlatform || well.platform;
        const finalObsId = effectiveObsId || well.observationId;
        if (!validationResult.status) {
          if (!finalPlatform && finalObsId) {
            validationResult.status = 'missing_platform';
            validationResult.message = 'Platform not specified';
          } else if (finalPlatform === 'iNaturalist' && finalObsId && !validationResult.apiFetched) {
            validationResult.status = 'pending';
            validationResult.message = 'Awaiting API verification';
          } else if (finalPlatform && finalObsId) {
            validationResult.status = 'valid';
            validationResult.message = 'Ready for processing';
          } else if (well.labCode && !finalObsId) {
            validationResult.status = 'no_observation';
            validationResult.message = 'No matching observation found for voucher';
          }
        }

        // Update well with validation result
        if (validationResult.status || validationResult.detectedPlatform) {
          const updateData: any = {
            isValidated: true,
            validationStatus: validationResult.status,
            validationMessage: validationResult.message,
            updatedAt: new Date(),
          };
          
          if (validationResult.apiFetched) {
            updateData.voucherNumber = validationResult.voucherNumber || null;
            updateData.username = validationResult.username || null;
            updateData.state = validationResult.state || null;
            updateData.country = validationResult.country || null;
          }
          
          if (!well.labCode && validationResult.voucherNumber) {
            updateData.labCode = validationResult.voucherNumber;
            validationResult.labCodeUpdated = true;
          }
          
          if (validationResult.detectedPlatform) {
            updateData.platform = validationResult.detectedPlatform;
            validationResult.platformUpdated = true;
          }
          
          if (validationResult.foundObservationId) {
            updateData.observationId = validationResult.foundObservationId;
            validationResult.observationIdUpdated = true;
          }
          
          await db.update(labWells)
            .set(updateData)
            .where(eq(labWells.id, well.id));
        }

        results.push(validationResult);
      }

      console.log(`[Validate] Complete: ${results.length} wells processed`);
      res.json({ results });
    } catch (error) {
      console.error("Error validating plate:", error);
      res.status(500).json({ error: "Failed to validate plate" });
    }
  });

  // ============ RUN FILE GENERATION ============

  // Get files for a run
  app.get("/api/admin/runs/:id/files", isAdmin, async (req: any, res) => {
    try {
      const runId = parseInt(req.params.id);
      const files = await db.select({
        id: labRunFiles.id,
        fileType: labRunFiles.fileType,
        filename: labRunFiles.filename,
        mimeType: labRunFiles.mimeType,
        createdAt: labRunFiles.createdAt,
        size: sql<number>`length(${labRunFiles.content})`,
      }).from(labRunFiles).where(eq(labRunFiles.runId, runId)).orderBy(desc(labRunFiles.createdAt));
      res.json(files);
    } catch (error) {
      console.error("Error fetching run files:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  // Download a file
  app.get("/api/admin/runs/:runId/files/:fileId/download", isAdmin, async (req: any, res) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const [file] = await db.select().from(labRunFiles).where(eq(labRunFiles.id, fileId));
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.setHeader('Content-Type', file.mimeType);
      res.send(file.content);
    } catch (error) {
      console.error("Error downloading file:", error);
      res.status(500).json({ error: "Failed to download file" });
    }
  });

  // Delete a file
  app.delete("/api/admin/runs/:runId/files/:fileId", isAdmin, async (req: any, res) => {
    try {
      const fileId = parseInt(req.params.fileId);
      await db.delete(labRunFiles).where(eq(labRunFiles.id, fileId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  // Generate files for a run
  app.post("/api/admin/runs/:id/generate-files", isAdmin, async (req: any, res) => {
    try {
      const runId = parseInt(req.params.id);
      
      // Get run with plates and wells
      const [run] = await db.select().from(labRuns).where(eq(labRuns.id, runId));
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      const plates = await db.select().from(labPlates).where(eq(labPlates.runId, runId)).orderBy(labPlates.plateNumber);
      
      // Get all wells for all plates and index sets
      const allWellsData: { plate: typeof plates[0], wells: any[], forwardIndexEntries: any[], reverseIndexEntries: any[] }[] = [];
      
      for (const plate of plates) {
        const wells = await db.select().from(labWells).where(eq(labWells.plateId, plate.id)).orderBy(labWells.sortOrder);
        
        // Get index entries for this plate
        let forwardIndexEntries: any[] = [];
        let reverseIndexEntries: any[] = [];
        
        if (plate.forwardIndexSetId) {
          forwardIndexEntries = await db.select().from(indexEntries).where(eq(indexEntries.indexSetId, plate.forwardIndexSetId));
        }
        if (plate.reverseIndexSetId) {
          reverseIndexEntries = await db.select().from(indexEntries).where(eq(indexEntries.indexSetId, plate.reverseIndexSetId));
        }
        
        allWellsData.push({ plate, wells, forwardIndexEntries, reverseIndexEntries });
      }
      
      // Get primer pools for primer pool names
      const primerPoolsList = await db.select().from(primerPools);
      const primerPoolsMap = new Map(primerPoolsList.map(p => [p.name, p]));
      
      // Get all primer sets with items for sequence lookups
      const allPrimerSets = await db.select().from(primerSets);
      const allPrimerItems = await db.select().from(primerItems);
      const primerSetItemsMap = new Map<number, typeof allPrimerItems>();
      for (const item of allPrimerItems) {
        if (!primerSetItemsMap.has(item.primerSetId)) {
          primerSetItemsMap.set(item.primerSetId, []);
        }
        primerSetItemsMap.get(item.primerSetId)!.push(item);
      }
      
      // Build Index.txt content
      const indexLines: string[] = ['SampleID\tPrimerPool\tFwIndex\tFwPrimer\tRvIndex\tRvPrimer'];
      const usedPrimers: Map<string, { sequence: string; pool: string; position: string }> = new Map();
      const missingSequences: string[] = [];
      
      for (const { plate, wells, forwardIndexEntries, reverseIndexEntries } of allWellsData) {
        // Build index lookup maps by well position
        const fwIndexMap = new Map(forwardIndexEntries.map(e => [e.wellPosition, e.indexSequence]));
        const rvIndexMap = new Map(reverseIndexEntries.map(e => [e.wellPosition, e.indexSequence]));
        
        for (const well of wells) {
          if (!well.observationId && !well.labCode) continue; // Skip empty wells
          
          // Build SampleID: ONT[PlateNumber].[WellNumber]-[WellPosition]-[LabCode]-[iNat/MO][ObsNumber]
          const plateNum = plate.plateNumber.toString().padStart(2, '0');
          const wellNum = well.sortOrder.toString().padStart(2, '0');
          const wellPos = well.wellPosition;
          const labCode = well.labCode || 'Unknown';
          
          // Determine platform abbreviation
          let platformAbbrev = '';
          let obsNum = '';
          if (well.platform === 'iNaturalist' && well.observationId) {
            platformAbbrev = 'iNat';
            obsNum = well.observationId;
          } else if (well.platform === 'MO' && well.observationId) {
            platformAbbrev = 'MO';
            obsNum = well.observationId;
          } else if (well.observationId) {
            // Auto-detect from ID length
            const digits = well.observationId.replace(/\D/g, '');
            if (digits.length === 6) {
              platformAbbrev = 'MO';
            } else {
              platformAbbrev = 'iNat';
            }
            obsNum = well.observationId;
          }
          
          // Build sampleId - only include platform/observation suffix if we have observation data
          const platformSuffix = platformAbbrev && obsNum ? `-${platformAbbrev}${obsNum}` : '';
          const sampleId = `ONT${plateNum}.${wellNum}-${wellPos}-${labCode}${platformSuffix}`;
          
          // Get primer pool name
          const primerPoolName = well.primerPool || plate.defaultForwardPrimer?.split(' ')[0] || 'ITS';
          
          // Get forward index sequence
          const fwIndex = fwIndexMap.get(well.wellPosition) || fwIndexMap.get('single') || '';
          
          // Get reverse index sequence
          const rvIndex = rvIndexMap.get(well.wellPosition) || rvIndexMap.get('single') || '';
          
          // Determine forward primer name (use * if it's a pool)
          const fwPrimerRaw = well.forwardPrimer || plate.defaultForwardPrimer || '';
          const rvPrimerRaw = well.reversePrimer || plate.defaultReversePrimer || '';
          
          // Check if primer is a pool (has a pool reference)
          const fwIsPool = primerPoolsMap.has(fwPrimerRaw);
          const rvIsPool = primerPoolsMap.has(rvPrimerRaw);
          
          const fwPrimer = fwIsPool ? '*' : fwPrimerRaw;
          const rvPrimer = rvIsPool ? '*' : rvPrimerRaw;
          
          indexLines.push(`${sampleId}\t${primerPoolName}\t${fwIndex}\t${fwPrimer}\t${rvIndex}\t${rvPrimer}`);
          
          // Track primers for FASTA generation
          if (fwPrimerRaw && !fwIsPool) {
            if (!usedPrimers.has(fwPrimerRaw)) {
              // Find sequence from primer items
              let seq = '';
              for (const [setId, items] of primerSetItemsMap.entries()) {
                const item = items.find(i => i.label === fwPrimerRaw);
                if (item?.sequence) {
                  seq = item.sequence;
                  break;
                }
              }
              if (!seq && !missingSequences.includes(fwPrimerRaw)) {
                missingSequences.push(fwPrimerRaw);
              }
              usedPrimers.set(fwPrimerRaw, { sequence: seq, pool: primerPoolName, position: 'forward' });
            }
          }
          if (rvPrimerRaw && !rvIsPool) {
            if (!usedPrimers.has(rvPrimerRaw)) {
              let seq = '';
              for (const [setId, items] of primerSetItemsMap.entries()) {
                const item = items.find(i => i.label === rvPrimerRaw);
                if (item?.sequence) {
                  seq = item.sequence;
                  break;
                }
              }
              if (!seq && !missingSequences.includes(rvPrimerRaw)) {
                missingSequences.push(rvPrimerRaw);
              }
              usedPrimers.set(rvPrimerRaw, { sequence: seq, pool: primerPoolName, position: 'reverse' });
            }
          }
        }
      }
      
      // Check for missing primer sequences - fail if any are missing
      if (missingSequences.length > 0) {
        return res.status(400).json({ 
          error: "Missing primer sequences", 
          missingPrimers: missingSequences,
          message: `The following primers are missing sequences: ${missingSequences.join(', ')}. Please configure primer sequences in Primer Management before generating files.`
        });
      }
      
      // Build primers.fasta content
      const fastaLines: string[] = [];
      for (const [name, info] of usedPrimers.entries()) {
        fastaLines.push(`>${name}  pool=${info.pool}    position=${info.position}`);
        fastaLines.push(info.sequence);
      }
      
      // Build primers.txt content (no metadata)
      const txtLines: string[] = [];
      for (const [name, info] of usedPrimers.entries()) {
        txtLines.push(`>${name}`);
        txtLines.push(info.sequence);
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      
      // Delete existing files for this run (replace with new ones)
      await db.delete(labRunFiles).where(eq(labRunFiles.runId, runId));
      
      // Insert new files
      const filesToCreate = [
        {
          runId,
          fileType: 'index',
          filename: `Index_Run${runId}_${timestamp}.txt`,
          content: indexLines.join('\n'),
          mimeType: 'text/plain',
        },
        {
          runId,
          fileType: 'primers_fasta',
          filename: `primers_Run${runId}_${timestamp}.fasta`,
          content: fastaLines.join('\n'),
          mimeType: 'text/plain',
        },
        {
          runId,
          fileType: 'primers_txt',
          filename: `primers_Run${runId}_${timestamp}.txt`,
          content: txtLines.join('\n'),
          mimeType: 'text/plain',
        },
      ];
      
      const createdFiles = [];
      for (const file of filesToCreate) {
        const [created] = await db.insert(labRunFiles).values(file).returning();
        createdFiles.push(created);
      }
      
      res.json({ 
        success: true, 
        files: createdFiles,
        stats: {
          totalSamples: indexLines.length - 1,
          uniquePrimers: usedPrimers.size,
          missingSequences: missingSequences.length > 0 ? missingSequences : undefined,
        }
      });
    } catch (error) {
      console.error("Error generating files:", error);
      res.status(500).json({ error: "Failed to generate files" });
    }
  });

  // Check if current user is admin
  app.get("/api/admin/check", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      res.json({ isAdmin: user?.role === 'admin' });
    } catch (error) {
      res.json({ isAdmin: false });
    }
  });

  // ============ INDEX MANAGEMENT ============

  // Get all index sets
  app.get("/api/admin/index-sets", isAdmin, async (req: any, res) => {
    try {
      const sets = await db.select().from(indexSets).orderBy(indexSets.title);
      res.json(sets);
    } catch (error) {
      console.error("Error fetching index sets:", error);
      res.status(500).json({ error: "Failed to fetch index sets" });
    }
  });

  // Get single index set with entries
  app.get("/api/admin/index-sets/:id", isAdmin, async (req: any, res) => {
    try {
      const setId = parseInt(req.params.id);
      const [indexSet] = await db.select().from(indexSets).where(eq(indexSets.id, setId));
      if (!indexSet) {
        return res.status(404).json({ error: "Index set not found" });
      }
      const entries = await db.select().from(indexEntries).where(eq(indexEntries.indexSetId, setId));
      res.json({ ...indexSet, entries });
    } catch (error) {
      console.error("Error fetching index set:", error);
      res.status(500).json({ error: "Failed to fetch index set" });
    }
  });

  // Create index set with entries
  app.post("/api/admin/index-sets", isAdmin, async (req: any, res) => {
    try {
      const { title, orientation, type, entries } = req.body;
      
      const [newSet] = await db.insert(indexSets).values({
        title,
        orientation,
        type,
      }).returning();
      
      // Insert entries if provided
      if (entries && entries.length > 0) {
        for (const entry of entries) {
          await db.insert(indexEntries).values({
            indexSetId: newSet.id,
            wellPosition: entry.wellPosition,
            indexSequence: entry.indexSequence,
          });
        }
      }
      
      const allEntries = await db.select().from(indexEntries).where(eq(indexEntries.indexSetId, newSet.id));
      res.json({ ...newSet, entries: allEntries });
    } catch (error) {
      console.error("Error creating index set:", error);
      res.status(500).json({ error: "Failed to create index set" });
    }
  });

  // Update index set
  app.patch("/api/admin/index-sets/:id", isAdmin, async (req: any, res) => {
    try {
      const setId = parseInt(req.params.id);
      const { title, orientation, type, entries } = req.body;
      
      const updateData: any = { updatedAt: new Date() };
      if (title !== undefined) updateData.title = title;
      if (orientation !== undefined) updateData.orientation = orientation;
      if (type !== undefined) updateData.type = type;
      
      const [updated] = await db.update(indexSets)
        .set(updateData)
        .where(eq(indexSets.id, setId))
        .returning();
      
      // If entries provided, replace all entries
      if (entries !== undefined) {
        await db.delete(indexEntries).where(eq(indexEntries.indexSetId, setId));
        for (const entry of entries) {
          await db.insert(indexEntries).values({
            indexSetId: setId,
            wellPosition: entry.wellPosition,
            indexSequence: entry.indexSequence,
          });
        }
      }
      
      const allEntries = await db.select().from(indexEntries).where(eq(indexEntries.indexSetId, setId));
      res.json({ ...updated, entries: allEntries });
    } catch (error) {
      console.error("Error updating index set:", error);
      res.status(500).json({ error: "Failed to update index set" });
    }
  });

  // Delete index set
  app.delete("/api/admin/index-sets/:id", isAdmin, async (req: any, res) => {
    try {
      const setId = parseInt(req.params.id);
      await db.delete(indexSets).where(eq(indexSets.id, setId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting index set:", error);
      res.status(500).json({ error: "Failed to delete index set" });
    }
  });

  // ============ PRIMER MANAGEMENT ============

  // Get all primer sets
  app.get("/api/admin/primer-sets", isAdmin, async (req: any, res) => {
    try {
      const sets = await db.select().from(primerSets).orderBy(primerSets.title);
      res.json(sets);
    } catch (error) {
      console.error("Error fetching primer sets:", error);
      res.status(500).json({ error: "Failed to fetch primer sets" });
    }
  });

  // Get single primer set with items
  app.get("/api/admin/primer-sets/:id", isAdmin, async (req: any, res) => {
    try {
      const setId = parseInt(req.params.id);
      const [primerSet] = await db.select().from(primerSets).where(eq(primerSets.id, setId));
      if (!primerSet) {
        return res.status(404).json({ error: "Primer set not found" });
      }
      const items = await db.select().from(primerItems).where(eq(primerItems.primerSetId, setId)).orderBy(primerItems.sortOrder);
      res.json({ ...primerSet, items });
    } catch (error) {
      console.error("Error fetching primer set:", error);
      res.status(500).json({ error: "Failed to fetch primer set" });
    }
  });

  // Create primer set with items
  app.post("/api/admin/primer-sets", isAdmin, async (req: any, res) => {
    try {
      const { title, orientation, type, poolSize, items } = req.body;
      
      const [newSet] = await db.insert(primerSets).values({
        title,
        orientation,
        type,
        poolSize: type === 'Pool' ? poolSize : null,
      }).returning();
      
      // Insert items if provided
      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          await db.insert(primerItems).values({
            primerSetId: newSet.id,
            label: item.label,
            sequence: item.sequence || null,
            sortOrder: i + 1,
          });
        }
      }
      
      const allItems = await db.select().from(primerItems).where(eq(primerItems.primerSetId, newSet.id)).orderBy(primerItems.sortOrder);
      res.json({ ...newSet, items: allItems });
    } catch (error) {
      console.error("Error creating primer set:", error);
      res.status(500).json({ error: "Failed to create primer set" });
    }
  });

  // Update primer set
  app.patch("/api/admin/primer-sets/:id", isAdmin, async (req: any, res) => {
    try {
      const setId = parseInt(req.params.id);
      const { title, orientation, type, poolSize, items, isActive } = req.body;
      
      const updateData: any = { updatedAt: new Date() };
      if (title !== undefined) updateData.title = title;
      if (orientation !== undefined) updateData.orientation = orientation;
      if (type !== undefined) updateData.type = type;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (type === 'Pool' && poolSize !== undefined) {
        updateData.poolSize = poolSize;
      } else if (type === 'Single') {
        updateData.poolSize = null;
      }
      
      const [updated] = await db.update(primerSets)
        .set(updateData)
        .where(eq(primerSets.id, setId))
        .returning();
      
      // If items provided, replace all items
      if (items !== undefined) {
        await db.delete(primerItems).where(eq(primerItems.primerSetId, setId));
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          await db.insert(primerItems).values({
            primerSetId: setId,
            label: item.label,
            sequence: item.sequence || null,
            sortOrder: i + 1,
          });
        }
      }
      
      const allItems = await db.select().from(primerItems).where(eq(primerItems.primerSetId, setId)).orderBy(primerItems.sortOrder);
      res.json({ ...updated, items: allItems });
    } catch (error) {
      console.error("Error updating primer set:", error);
      res.status(500).json({ error: "Failed to update primer set" });
    }
  });

  // Delete primer set
  app.delete("/api/admin/primer-sets/:id", isAdmin, async (req: any, res) => {
    try {
      const setId = parseInt(req.params.id);
      await db.delete(primerSets).where(eq(primerSets.id, setId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting primer set:", error);
      res.status(500).json({ error: "Failed to delete primer set" });
    }
  });

  // ==================== PRIMER POOLS ====================

  // Get all primer pools with their associated primer sets
  app.get("/api/admin/primer-pools", isAdmin, async (req: any, res) => {
    try {
      const pools = await db.select().from(primerPools).orderBy(primerPools.name);
      
      // Fetch forward and reverse primer set details for each pool
      const poolsWithSets = await Promise.all(pools.map(async (pool) => {
        const forwardSet = await db.select().from(primerSets).where(eq(primerSets.id, pool.forwardPrimerSetId)).then(r => r[0]);
        const reverseSet = await db.select().from(primerSets).where(eq(primerSets.id, pool.reversePrimerSetId)).then(r => r[0]);
        return {
          ...pool,
          forwardPrimerSet: forwardSet,
          reversePrimerSet: reverseSet,
        };
      }));
      
      res.json(poolsWithSets);
    } catch (error) {
      console.error("Error fetching primer pools:", error);
      res.status(500).json({ error: "Failed to fetch primer pools" });
    }
  });

  // Create primer pool
  app.post("/api/admin/primer-pools", isAdmin, async (req: any, res) => {
    try {
      const { name, forwardPrimerSetId, reversePrimerSetId, isActive } = req.body;
      
      if (!name || !forwardPrimerSetId || !reversePrimerSetId) {
        return res.status(400).json({ error: "Name, forward primer set, and reverse primer set are required" });
      }
      
      const [pool] = await db.insert(primerPools).values({
        name,
        forwardPrimerSetId,
        reversePrimerSetId,
        isActive: isActive !== false,
      }).returning();
      
      // Fetch the full sets for response
      const forwardSet = await db.select().from(primerSets).where(eq(primerSets.id, forwardPrimerSetId)).then(r => r[0]);
      const reverseSet = await db.select().from(primerSets).where(eq(primerSets.id, reversePrimerSetId)).then(r => r[0]);
      
      res.json({ ...pool, forwardPrimerSet: forwardSet, reversePrimerSet: reverseSet });
    } catch (error) {
      console.error("Error creating primer pool:", error);
      res.status(500).json({ error: "Failed to create primer pool" });
    }
  });

  // Update primer pool
  app.patch("/api/admin/primer-pools/:id", isAdmin, async (req: any, res) => {
    try {
      const poolId = parseInt(req.params.id);
      const { name, forwardPrimerSetId, reversePrimerSetId, isActive } = req.body;
      
      const updateData: any = { updatedAt: new Date() };
      if (name !== undefined) updateData.name = name;
      if (forwardPrimerSetId !== undefined) updateData.forwardPrimerSetId = forwardPrimerSetId;
      if (reversePrimerSetId !== undefined) updateData.reversePrimerSetId = reversePrimerSetId;
      if (isActive !== undefined) updateData.isActive = isActive;
      
      const [updated] = await db.update(primerPools)
        .set(updateData)
        .where(eq(primerPools.id, poolId))
        .returning();
      
      // Fetch the full sets for response
      const forwardSet = await db.select().from(primerSets).where(eq(primerSets.id, updated.forwardPrimerSetId)).then(r => r[0]);
      const reverseSet = await db.select().from(primerSets).where(eq(primerSets.id, updated.reversePrimerSetId)).then(r => r[0]);
      
      res.json({ ...updated, forwardPrimerSet: forwardSet, reversePrimerSet: reverseSet });
    } catch (error) {
      console.error("Error updating primer pool:", error);
      res.status(500).json({ error: "Failed to update primer pool" });
    }
  });

  // Delete primer pool
  app.delete("/api/admin/primer-pools/:id", isAdmin, async (req: any, res) => {
    try {
      const poolId = parseInt(req.params.id);
      await db.delete(primerPools).where(eq(primerPools.id, poolId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting primer pool:", error);
      res.status(500).json({ error: "Failed to delete primer pool" });
    }
  });

  return httpServer;
}
