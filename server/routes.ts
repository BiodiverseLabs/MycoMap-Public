import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertObservationSchema, insertUploadSchema, species, observations, inaturalistData, fieldGuides, fieldGuideSpecies, insertFieldGuideSchema, insertFieldGuideSpeciesSchema, inatObservationsCache, inatCacheMetadata, moObservationsCache, moCacheMetadata, inaturalistApiCache, insertInaturalistApiCacheSchema, cmsPages, cmsPageSections, cmsNavigationLinks, cmsMediaAssets, insertCmsPageSchema, insertCmsPageSectionSchema, insertCmsNavigationLinkSchema, users, shipments, shipmentBags, shipmentSpecimens, insertShipmentSchema, insertShipmentBagSchema, insertShipmentSpecimenSchema, labRuns, labPlates, labWells, insertLabRunSchema, insertLabPlateSchema, insertLabWellSchema, indexSets, indexEntries, primerSets, primerItems, primerPools, labRunFiles, labRunBioSteps, insertLabRunBioStepSchema, bioinformaticsMethods, labRunMethodSelections, specimens, specimenSources, specimenEvents, insertSpecimenSchema, shipmentPlates, specimenRecipients, specimenRequests, insertSpecimenRecipientSchema, insertSpecimenRequestSchema, observationCache, observationMedia, observationTaxa, shippingDestinations, insertShippingDestinationSchema, specimenRefreshMetadata } from "@shared/schema";
import { randomUUID } from "crypto";
import { z } from "zod";
import multer from "multer";
// XLSX will be imported dynamically
import path from "path";
import fs from "fs";
import csv from "csv-parser";
import { db, pool } from "./db";
import { sql, eq, desc, and, gte, lte, inArray, or, isNotNull, isNull } from "drizzle-orm";
import { blastDownloader } from "./blastDownloader";
import { ipfsService } from "./ipfsService";
import { extractLocationFromObservation, normalizeState, normalizeCountry, fetchPlaces } from "./locationService";
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

// Normalize lab codes for comparison - extracts numeric portion and removes leading zeros
// Examples: "MI25-03183" → "3183", "03183" → "3183", "3183" → "3183"
function normalizeLabCode(code: string | null): string {
  if (!code) return '';
  // Extract just the numeric portion (last group of digits)
  const numericMatch = code.match(/(\d+)$/);
  if (numericMatch) {
    // Remove leading zeros
    return parseInt(numericMatch[1], 10).toString();
  }
  return code;
}

// Check if two lab codes are equivalent (considering various formats, case-insensitive)
function labCodesMatch(code1: string | null, code2: string | null): boolean {
  if (!code1 || !code2) return false;
  // Compare case-insensitively using normalized versions
  return normalizeLabCode(code1.toLowerCase()) === normalizeLabCode(code2.toLowerCase());
}

// Get the correct scientific name with proper override priority:
// 1. Species Name Override (highest priority) - field 20259
// 2. Provisional Species Name (second priority) - field 10675
// 3. iNaturalist scientific name (base)
function getInatScientificName(
  inatName: string | null,
  provisionalSpeciesName: string | null,
  speciesNameOverride: string | null
): string | null {
  if (speciesNameOverride && speciesNameOverride.trim()) {
    return speciesNameOverride.trim();
  }
  if (provisionalSpeciesName && provisionalSpeciesName.trim()) {
    return provisionalSpeciesName.trim();
  }
  return inatName || null;
}

// Extract observation field value by field ID from ofvs array
function getObservationFieldValue(ofvs: any[], fieldId: number): string | null {
  if (!ofvs || !Array.isArray(ofvs)) return null;
  const field = ofvs.find((f: any) => f.field_id === fieldId);
  return field?.value || null;
}

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
  
  // Serve attached_assets as static files
  app.use('/attached_assets', express.static(path.join(process.cwd(), 'attached_assets')));
  
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

  // Admin: Get page sections
  app.get("/api/cms/admin/pages/:pageId/sections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const pageId = parseInt(req.params.pageId);
      const sections = await db.select().from(cmsPageSections)
        .where(eq(cmsPageSections.pageId, pageId))
        .orderBy(cmsPageSections.sortOrder);
      
      res.json(sections);
    } catch (error) {
      console.error("Error fetching sections:", error);
      res.status(500).json({ error: "Failed to fetch sections" });
    }
  });

  // Admin: Reorder section
  app.post("/api/cms/admin/sections/:id/reorder", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const sectionId = parseInt(req.params.id);
      const { direction } = req.body;
      
      const [section] = await db.select().from(cmsPageSections).where(eq(cmsPageSections.id, sectionId));
      if (!section) {
        return res.status(404).json({ error: "Section not found" });
      }

      const allSections = await db.select().from(cmsPageSections)
        .where(eq(cmsPageSections.pageId, section.pageId))
        .orderBy(cmsPageSections.sortOrder);

      const currentIndex = allSections.findIndex(s => s.id === sectionId);
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

      if (targetIndex < 0 || targetIndex >= allSections.length) {
        return res.status(400).json({ error: "Cannot move section in that direction" });
      }

      const targetSection = allSections[targetIndex];
      
      await db.update(cmsPageSections)
        .set({ sortOrder: targetSection.sortOrder })
        .where(eq(cmsPageSections.id, sectionId));
      
      await db.update(cmsPageSections)
        .set({ sortOrder: section.sortOrder })
        .where(eq(cmsPageSections.id, targetSection.id));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering section:", error);
      res.status(500).json({ error: "Failed to reorder section" });
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

  // Admin: Get all navigation links
  app.get("/api/cms/admin/navigation", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const links = await db.select().from(cmsNavigationLinks).orderBy(cmsNavigationLinks.sortOrder);
      res.json(links);
    } catch (error) {
      console.error("Error fetching navigation links:", error);
      res.status(500).json({ error: "Failed to fetch navigation links" });
    }
  });

  // Admin: Update navigation link
  app.patch("/api/cms/admin/navigation/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const linkId = parseInt(req.params.id);
      const updates = req.body;
      
      const [updated] = await db.update(cmsNavigationLinks)
        .set(updates)
        .where(eq(cmsNavigationLinks.id, linkId))
        .returning();
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating navigation link:", error);
      res.status(500).json({ error: "Failed to update navigation link" });
    }
  });

  // Admin: Delete navigation link
  app.delete("/api/cms/admin/navigation/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const linkId = parseInt(req.params.id);
      
      // Move children to top level (set parentId to null)
      await db.update(cmsNavigationLinks)
        .set({ parentId: null })
        .where(eq(cmsNavigationLinks.parentId, linkId));
      
      await db.delete(cmsNavigationLinks).where(eq(cmsNavigationLinks.id, linkId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting navigation link:", error);
      res.status(500).json({ error: "Failed to delete navigation link" });
    }
  });

  // Admin: Reorder navigation link
  app.post("/api/cms/admin/navigation/:id/reorder", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const linkId = parseInt(req.params.id);
      const { direction } = req.body;

      const [link] = await db.select().from(cmsNavigationLinks).where(eq(cmsNavigationLinks.id, linkId));
      if (!link) {
        return res.status(404).json({ error: "Navigation link not found" });
      }

      // Get siblings (same parentId)
      const siblings = await db.select().from(cmsNavigationLinks)
        .where(link.parentId === null 
          ? isNull(cmsNavigationLinks.parentId)
          : eq(cmsNavigationLinks.parentId, link.parentId))
        .orderBy(cmsNavigationLinks.sortOrder);

      const currentIndex = siblings.findIndex(s => s.id === linkId);
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

      if (targetIndex < 0 || targetIndex >= siblings.length) {
        return res.status(400).json({ error: "Cannot move item in that direction" });
      }

      const targetLink = siblings[targetIndex];
      
      await db.update(cmsNavigationLinks)
        .set({ sortOrder: targetLink.sortOrder })
        .where(eq(cmsNavigationLinks.id, linkId));
      
      await db.update(cmsNavigationLinks)
        .set({ sortOrder: link.sortOrder })
        .where(eq(cmsNavigationLinks.id, targetLink.id));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering navigation link:", error);
      res.status(500).json({ error: "Failed to reorder navigation link" });
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
  // SHIPPING DESTINATIONS API ENDPOINTS
  // ============================================

  // Get all shipping destinations
  app.get("/api/shipping/destinations", async (req, res) => {
    try {
      const destinations = await db.select()
        .from(shippingDestinations)
        .orderBy(shippingDestinations.name);
      res.json(destinations);
    } catch (error) {
      console.error("Error fetching shipping destinations:", error);
      res.status(500).json({ error: "Failed to fetch shipping destinations" });
    }
  });

  // Get a single shipping destination
  app.get("/api/shipping/destinations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [destination] = await db.select()
        .from(shippingDestinations)
        .where(eq(shippingDestinations.id, id));
      
      if (!destination) {
        return res.status(404).json({ error: "Destination not found" });
      }
      res.json(destination);
    } catch (error) {
      console.error("Error fetching shipping destination:", error);
      res.status(500).json({ error: "Failed to fetch shipping destination" });
    }
  });

  // Create a new shipping destination
  app.post("/api/shipping/destinations", async (req, res) => {
    try {
      const validatedData = insertShippingDestinationSchema.parse(req.body);
      const [destination] = await db.insert(shippingDestinations)
        .values(validatedData)
        .returning();
      res.status(201).json(destination);
    } catch (error: any) {
      console.error("Error creating shipping destination:", error);
      if (error.code === '23505') {
        return res.status(400).json({ error: "A destination with this short code already exists" });
      }
      res.status(500).json({ error: "Failed to create shipping destination" });
    }
  });

  // Update a shipping destination
  app.patch("/api/shipping/destinations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [destination] = await db.update(shippingDestinations)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(shippingDestinations.id, id))
        .returning();
      
      if (!destination) {
        return res.status(404).json({ error: "Destination not found" });
      }
      res.json(destination);
    } catch (error: any) {
      console.error("Error updating shipping destination:", error);
      if (error.code === '23505') {
        return res.status(400).json({ error: "A destination with this short code already exists" });
      }
      res.status(500).json({ error: "Failed to update shipping destination" });
    }
  });

  // Delete a shipping destination
  app.delete("/api/shipping/destinations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [destination] = await db.delete(shippingDestinations)
        .where(eq(shippingDestinations.id, id))
        .returning();
      
      if (!destination) {
        return res.status(404).json({ error: "Destination not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting shipping destination:", error);
      res.status(500).json({ error: "Failed to delete shipping destination" });
    }
  });

  // Set a destination as default (clears other defaults)
  app.post("/api/shipping/destinations/:id/set-default", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Clear existing default
      await db.update(shippingDestinations)
        .set({ isDefault: false })
        .where(eq(shippingDestinations.isDefault, true));
      
      // Set new default
      const [destination] = await db.update(shippingDestinations)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(shippingDestinations.id, id))
        .returning();
      
      if (!destination) {
        return res.status(404).json({ error: "Destination not found" });
      }
      res.json(destination);
    } catch (error) {
      console.error("Error setting default destination:", error);
      res.status(500).json({ error: "Failed to set default destination" });
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
                const taxonomicGenus = obs.taxon?.ancestors?.find((a: any) => a.rank === "genus")?.name || obs.taxon?.name?.split(' ')[0] || null;
                const iconicTaxon = obs.taxon?.iconic_taxon_name;
                const isSlimeMold = iconicTaxon === "Protozoa" || 
                  taxonomicClass === "Myxomycetes" || 
                  obs.taxon?.name?.toLowerCase().includes("myxomycete") ||
                  obs.taxon?.ancestors?.some((a: any) => a.name === "Myxomycetes");
                // Nostoc is a cyanobacteria genus that is acceptable for sequencing
                const isNostoc = taxonomicGenus === "Nostoc" || 
                  obs.taxon?.name?.toLowerCase().startsWith("nostoc");
                
                // Extract Voucher Number(s) from observation fields
                // Check both "Voucher Number(s)" and "Voucher Number" (field ID 8257)
                const observationFields = obs.ofvs || [];
                const voucherNumbersField = observationFields.find((field: any) => 
                  field.name === "Voucher Number(s)" || 
                  field.observation_field?.name === "Voucher Number(s)"
                );
                const voucherNumberField = observationFields.find((field: any) => 
                  field.name === "Voucher Number" || 
                  field.observation_field?.name === "Voucher Number" ||
                  field.observation_field_id === 8257
                );
                // Prefer "Voucher Number(s)" but fall back to "Voucher Number"
                const voucherNumber = voucherNumbersField?.value || voucherNumberField?.value || null;
                
                let validationStatus = "invalid";
                let validationMessage = "This observation is not fungal";
                
                if (kingdom === "Fungi" || isSlimeMold || isNostoc) {
                  // Fungi, slime molds, and Nostoc (cyanobacteria) are valid specimens
                  // The bag-level check for mixing will happen after all specimens are validated
                  validationStatus = "valid";
                  validationMessage = isSlimeMold ? "Valid slime mold specimen" : 
                    isNostoc ? "Valid Nostoc specimen" : "Valid fungal specimen";
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

  // Get all shipments (admin only) - for dashboard statistics
  app.get("/api/admin/shipments", isAdmin, async (req: any, res) => {
    try {
      const allShipments = await db.select({
        id: shipments.id,
        status: shipments.status,
      }).from(shipments);
      res.json(allShipments);
    } catch (error) {
      console.error("Error fetching shipments:", error);
      res.status(500).json({ error: "Failed to fetch shipments" });
    }
  });

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

  // Create a lab transfer shipment from pending plates
  app.post("/api/admin/shipments/lab-transfer", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id || 'admin';
      const { plateIds, sourceLab, destinationLab, createSpecimens, trackingNumber } = req.body;
      
      if (!plateIds || !Array.isArray(plateIds) || plateIds.length === 0) {
        return res.status(400).json({ error: "At least one plate must be selected" });
      }
      
      // Create the shipment
      const [newShipment] = await db.insert(shipments).values({
        userId,
        shipmentType: 'lab_transfer',
        status: 'submitted',
        sourceLab: sourceLab || 'Satellite Lab',
        destinationLab: destinationLab || 'Main Lab',
        trackingNumber,
        submittedAt: new Date(),
      }).returning();
      
      // Link plates to shipment
      for (const plateId of plateIds) {
        await db.insert(shipmentPlates).values({
          shipmentId: newShipment.id,
          plateId,
          specimensCreated: createSpecimens || false,
        });
      }
      
      // If createSpecimens is true, create specimen records from plate wells or link to existing ones
      let specimensCreated = 0;
      let specimensLinked = 0;
      if (createSpecimens) {
        for (const plateId of plateIds) {
          // Get all wells for this plate that have either observation ID or lab code
          const wells = await db.select().from(labWells)
            .where(and(
              eq(labWells.plateId, plateId),
              or(isNotNull(labWells.observationId), isNotNull(labWells.labCode))
            ));
          
          for (const well of wells) {
            const platform = well.platform?.toLowerCase().includes('mushroom') ? 'mo' : 'inat';
            let existingSpecimen = null;
            
            // First check by observation ID if available
            if (well.observationId) {
              const [found] = await db.select().from(specimens)
                .where(eq(specimens.primaryObservationId, well.observationId));
              existingSpecimen = found;
            }
            
            // If no match by observation ID and we have a lab code, check by lab code
            if (!existingSpecimen && well.labCode) {
              const [found] = await db.select().from(specimens)
                .where(eq(specimens.labCode, well.labCode));
              existingSpecimen = found;
            }
            
            if (existingSpecimen) {
              // Link existing specimen to this well
              await db.update(labWells)
                .set({ coreSpecimenId: existingSpecimen.id, updatedAt: new Date() })
                .where(eq(labWells.id, well.id));
              
              specimensLinked++;
            } else {
              // Check if this observation ID already has OTHER specimens (duplicate detection)
              let isDuplicate = false;
              if (well.observationId) {
                const [existingObs] = await db.select({ count: sql<number>`count(*)` })
                  .from(specimens)
                  .where(eq(specimens.primaryObservationId, well.observationId));
                isDuplicate = Number(existingObs?.count || 0) > 0;
              }
              
              // Create new specimen record
              const uuid = randomUUID();
              // Always generate unique MYCO number for displayCode
              // Lab codes are stored separately in the labCode field and can be duplicated
              const displayCode = await generateUniqueDisplayCode();
              
              const [newSpecimen] = await db.insert(specimens).values({
                uuid,
                displayCode,
                intakeDate: new Date(),
                primaryObservationSource: well.observationId ? platform : null,
                primaryObservationId: well.observationId || null,
                voucherNumber: well.voucherNumber,
                labCode: well.labCode || null, // Store lab code separately (can be duplicated)
                scientificName: null, // Can be populated from well validation later
                locality: well.state ? `${well.state}, ${well.country || 'USA'}` : null,
                currentStatus: 'pending_accession',
                statusChangedAt: new Date(),
                inatFieldConflict: isDuplicate ? 'duplicate_inat' : null, // Flag duplicates
              }).returning();
              
              // If duplicate, also flag the existing specimen(s) with same observation ID
              if (isDuplicate && well.observationId) {
                await db.update(specimens)
                  .set({ inatFieldConflict: 'duplicate_inat' })
                  .where(and(
                    eq(specimens.primaryObservationId, well.observationId),
                    isNull(specimens.inatFieldConflict) // Only update if no existing flag
                  ));
              }
              
              // Add source record if we have an observation ID
              if (well.observationId) {
                await db.insert(specimenSources).values({
                  specimenId: newSpecimen.id,
                  platform,
                  externalId: well.observationId,
                  isPrimary: true,
                });
              }
              
              // Log creation event
              await db.insert(specimenEvents).values({
                specimenId: newSpecimen.id,
                eventType: 'created',
                newValue: `Created from lab transfer plate (well ${well.wellPosition})`,
                performedBy: userId,
              });
              
              // Link to well
              await db.update(labWells)
                .set({ coreSpecimenId: newSpecimen.id, updatedAt: new Date() })
                .where(eq(labWells.id, well.id));
              
              specimensCreated++;
            }
          }
        }
      }
      
      res.json({ 
        shipment: newShipment, 
        platesLinked: plateIds.length,
        specimensCreated,
        specimensLinked,
        message: `Lab transfer shipment created with ${plateIds.length} plates` + 
          (createSpecimens ? ` (${specimensCreated} new specimens, ${specimensLinked} linked to existing)` : '')
      });
    } catch (error) {
      console.error("Error creating lab transfer:", error);
      res.status(500).json({ error: "Failed to create lab transfer" });
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

  // Specimen Summary for Sequencing Runs page
  app.get("/api/admin/specimen-summary", isAdmin, async (req: any, res) => {
    try {
      // Get all lab runs with their plates and wells
      const allRuns = await db.select().from(labRuns);
      const allPlates = await db.select().from(labPlates);
      const allWells = await db.select().from(labWells);
      
      // Group plates by run
      const platesByRun = new Map<number, typeof labPlates.$inferSelect[]>();
      for (const plate of allPlates) {
        if (plate.runId) {
          if (!platesByRun.has(plate.runId)) {
            platesByRun.set(plate.runId, []);
          }
          platesByRun.get(plate.runId)!.push(plate);
        }
      }
      
      // Group wells by plate
      const wellsByPlate = new Map<number, typeof labWells.$inferSelect[]>();
      for (const well of allWells) {
        if (!wellsByPlate.has(well.plateId)) {
          wellsByPlate.set(well.plateId, []);
        }
        wellsByPlate.get(well.plateId)!.push(well);
      }
      
      // Define status categories
      const completedStatuses = ['complete', 'completed'];
      const sequencingQueueStatuses = ['dna_extraction', 'dna_amplification', 'dna_sequencing_pooled', 
                                        'dna_sequencing_library', 'dna_sequencing_raw_data', 'tissue_collection'];
      const tissueExtractedStatuses = ['dna_extraction'];
      const dataAnalysisStatuses = ['sequence_analysis'];
      
      // Calculate counts with breakdowns by run name and status
      const breakdown = {
        inQueue: [] as { username: string; state: string; count: number }[],
        inSequencingQueue: [] as { username: string; state: string; count: number }[],
        tissueExtracted: [] as { username: string; state: string; count: number }[],
        underDataAnalysis: [] as { username: string; state: string; count: number }[],
      };
      
      let inQueue = 0;
      let inSequencingQueue = 0;
      let tissueExtracted = 0;
      let underDataAnalysis = 0;
      
      // Aggregate by run name and status
      const inQueueByRunStatus = new Map<string, number>();
      const inSequencingQueueByRunStatus = new Map<string, number>();
      const tissueExtractedByRunStatus = new Map<string, number>();
      const underDataAnalysisByRunStatus = new Map<string, number>();
      
      for (const run of allRuns) {
        const runPlates = platesByRun.get(run.id) || [];
        let specimenCount = 0;
        
        // Count specimens (wells with data) in this run
        for (const plate of runPlates) {
          const plateWells = wellsByPlate.get(plate.id) || [];
          specimenCount += plateWells.filter(w => w.observationId || w.labCode).length;
        }
        
        if (specimenCount === 0) continue;
        
        const runName = run.name;
        const status = run.status || 'draft';
        const statusLabel = status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const key = `${runName}|||${statusLabel}`;
        
        // Not completed = in queue
        if (!completedStatuses.includes(status)) {
          inQueue += specimenCount;
          inQueueByRunStatus.set(key, (inQueueByRunStatus.get(key) || 0) + specimenCount);
        }
        
        // In sequencing queue (extraction through sequencing stages)
        if (sequencingQueueStatuses.includes(status)) {
          inSequencingQueue += specimenCount;
          inSequencingQueueByRunStatus.set(key, (inSequencingQueueByRunStatus.get(key) || 0) + specimenCount);
        }
        
        // Tissue extracted (DNA extraction stage)
        if (tissueExtractedStatuses.includes(status)) {
          tissueExtracted += specimenCount;
          tissueExtractedByRunStatus.set(key, (tissueExtractedByRunStatus.get(key) || 0) + specimenCount);
        }
        
        // Under data analysis
        if (dataAnalysisStatuses.includes(status)) {
          underDataAnalysis += specimenCount;
          underDataAnalysisByRunStatus.set(key, (underDataAnalysisByRunStatus.get(key) || 0) + specimenCount);
        }
      }
      
      // Convert maps to arrays (using username for run name and state for status)
      for (const [key, count] of inQueueByRunStatus) {
        const [username, state] = key.split('|||');
        breakdown.inQueue.push({ username, state, count });
      }
      for (const [key, count] of inSequencingQueueByRunStatus) {
        const [username, state] = key.split('|||');
        breakdown.inSequencingQueue.push({ username, state, count });
      }
      for (const [key, count] of tissueExtractedByRunStatus) {
        const [username, state] = key.split('|||');
        breakdown.tissueExtracted.push({ username, state, count });
      }
      for (const [key, count] of underDataAnalysisByRunStatus) {
        const [username, state] = key.split('|||');
        breakdown.underDataAnalysis.push({ username, state, count });
      }
      
      // Sort breakdowns by count descending
      breakdown.inQueue.sort((a, b) => b.count - a.count);
      breakdown.inSequencingQueue.sort((a, b) => b.count - a.count);
      breakdown.tissueExtracted.sort((a, b) => b.count - a.count);
      breakdown.underDataAnalysis.sort((a, b) => b.count - a.count);
      
      res.json({
        inQueue,
        inSequencingQueue,
        tissueExtracted,
        underDataAnalysis,
        breakdown,
      });
    } catch (error) {
      console.error("Error fetching specimen summary:", error);
      res.status(500).json({ error: "Failed to fetch specimen summary" });
    }
  });

  // Lab Runs CRUD
  app.get("/api/admin/runs", isAdmin, async (req: any, res) => {
    try {
      const searchQuery = req.query.search as string | undefined;
      const statusFilter = req.query.status as string | undefined;
      
      // Fetch all runs with plate counts
      let allRuns = await db.select().from(labRuns).orderBy(desc(labRuns.createdAt));
      
      // Apply status filter
      if (statusFilter && statusFilter.trim()) {
        allRuns = allRuns.filter(run => run.status === statusFilter);
      }
      
      // Apply search filter - optimized: name-first search, fallback to content search only if no name matches
      if (searchQuery && searchQuery.trim()) {
        const search = searchQuery.trim().toLowerCase();
        
        // First, try name-only search (fast)
        const nameMatches = allRuns.filter(run => run.name.toLowerCase().includes(search));
        
        if (nameMatches.length > 0) {
          // Found matches by name, use those without expensive content search
          allRuns = nameMatches;
        } else {
          // No name matches - fall back to content search (slower)
          const matchingRunIds = new Set<number>();
          
          // Search in well contents (observation IDs and lab codes)
          const matchingWells = await db.select({
            runId: labPlates.runId
          })
            .from(labWells)
            .innerJoin(labPlates, eq(labWells.plateId, labPlates.id))
            .where(
              or(
                sql`LOWER(${labWells.observationId}) LIKE ${'%' + search + '%'}`,
                sql`LOWER(${labWells.labCode}) LIKE ${'%' + search + '%'}`
              )
            );
          
          for (const well of matchingWells) {
            if (well.runId) matchingRunIds.add(well.runId);
          }
          
          allRuns = allRuns.filter(run => matchingRunIds.has(run.id));
        }
      }
      
      // Batch fetch all plates and wells for all runs at once (performance optimization)
      const runIds = allRuns.map(r => r.id);
      
      // Single query for all plates
      const allPlates = runIds.length > 0 
        ? await db.select().from(labPlates).where(inArray(labPlates.runId, runIds))
        : [];
      
      // Group plates by runId
      const platesByRunId = new Map<number, typeof allPlates>();
      for (const plate of allPlates) {
        if (plate.runId) {
          if (!platesByRunId.has(plate.runId)) {
            platesByRunId.set(plate.runId, []);
          }
          platesByRunId.get(plate.runId)!.push(plate);
        }
      }
      
      // Single query for all wells
      const plateIds = allPlates.map(p => p.id);
      const allWellsForRuns = plateIds.length > 0
        ? await db.select().from(labWells).where(inArray(labWells.plateId, plateIds))
        : [];
      
      // Group wells by plateId
      const wellsByPlateId = new Map<number, typeof allWellsForRuns>();
      for (const well of allWellsForRuns) {
        if (!wellsByPlateId.has(well.plateId)) {
          wellsByPlateId.set(well.plateId, []);
        }
        wellsByPlateId.get(well.plateId)!.push(well);
      }
      
      // Now calculate counts using in-memory data (no more DB queries)
      const runsWithCounts = allRuns.map((run) => {
        const plates = platesByRunId.get(run.id) || [];
        const plateCount = plates.length;
        
        // Count validated plates
        let validatedPlateCount = 0;
        const allWellsForRun: typeof allWellsForRuns = [];
        
        for (const plate of plates) {
          const wells = wellsByPlateId.get(plate.id) || [];
          allWellsForRun.push(...wells);
          
          const sampleCount = wells.filter(w => w.observationId || w.labCode).length;
          const acceptableStatuses = ['valid', 'no_voucher', 'cleared'];
          const validatedOrAcceptableCount = wells.filter(w => 
            w.isValidated && w.validationStatus && acceptableStatuses.includes(w.validationStatus)
          ).length;
          const errorCount = wells.filter(w => w.isValidated && w.validationStatus && !acceptableStatuses.includes(w.validationStatus)).length;
          const hasIndexSets = plate.forwardIndexSetId && plate.reverseIndexSetId;
          const hasPrimerConfig = plate.defaultForwardPrimer && plate.defaultReversePrimer;
          
          let wellsHavePrimers = false;
          if (!hasPrimerConfig && sampleCount > 0) {
            const wellsWithPrimers = wells.filter(w => 
              (w.observationId || w.labCode) && 
              (w.primerPool || (w.forwardPrimer && w.reversePrimer))
            );
            wellsHavePrimers = wellsWithPrimers.length === sampleCount;
          }
          
          const isFullyValidated = sampleCount > 0 && 
            validatedOrAcceptableCount === sampleCount && 
            errorCount === 0 &&
            hasIndexSets &&
            (hasPrimerConfig || wellsHavePrimers);
          
          if (isFullyValidated) validatedPlateCount++;
        }
        
        // Success rate is undefined for now - will be calculated from sequence data later
        const successRate: number | undefined = undefined;
        
        let rerunCount = 0;
        // Count wells marked for rerun
        for (const well of allWellsForRun) {
          if ((well as any).needsRerun) {
            rerunCount++;
          }
        }
        
        return { ...run, plateCount, validatedPlateCount, successRate, rerunCount };
      });
      
      res.json(runsWithCounts);
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

      const initialStatus = 'tissue_collection';
      const initialHistory = [{ status: initialStatus, timestamp: new Date().toISOString() }];
      
      const [run] = await db.insert(labRuns)
        .values({ 
          name: name || `Run ${new Date().toLocaleDateString()}`, 
          notes, 
          createdBy: userId,
          status: initialStatus,
          statusHistory: initialHistory,
        })
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

  // Create run from index file
  app.post("/api/admin/runs/from-index", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { name, indexFileContent, allowMissingReverseIndexes } = req.body;
      
      if (!indexFileContent) {
        return res.status(400).json({ error: "Index file content is required" });
      }
      
      // Import the parser dynamically
      const { parseIndexFile } = await import("@shared/indexFileParser");
      const parseResult = parseIndexFile(indexFileContent);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Failed to parse index file", 
          details: parseResult.errors 
        });
      }
      
      if (parseResult.plates.length === 0) {
        return res.status(400).json({ error: "No valid plates found in index file" });
      }
      
      // Validate indexes exist in our system
      const allIndexEntries = await db.select().from(indexEntries);
      const allIndexSequences = new Set(allIndexEntries.map(e => e.indexSequence));
      
      console.log(`[Index Upload] Checking ${parseResult.uniqueFwIndexes.size} unique forward indexes and ${parseResult.uniqueRvIndexes.size} unique reverse indexes`);
      console.log(`[Index Upload] Database has ${allIndexSequences.size} unique index sequences`);
      console.log(`[Index Upload] Sample from file - FwIndexes:`, Array.from(parseResult.uniqueFwIndexes).slice(0, 3));
      console.log(`[Index Upload] Sample from DB:`, Array.from(allIndexSequences).slice(0, 3));
      
      const missingFwIndexes: string[] = [];
      const missingRvIndexes: string[] = [];
      
      parseResult.uniqueFwIndexes.forEach(seq => {
        if (!allIndexSequences.has(seq)) {
          missingFwIndexes.push(seq);
        }
      });
      
      parseResult.uniqueRvIndexes.forEach(seq => {
        if (!allIndexSequences.has(seq)) {
          missingRvIndexes.push(seq);
        }
      });
      
      // Allow missing reverse indexes if override flag is set
      const blockOnMissingRv = missingRvIndexes.length > 0 && !allowMissingReverseIndexes;
      
      if (missingFwIndexes.length > 0 || blockOnMissingRv) {
        console.log(`[Index Upload] Missing FW indexes (first 5):`, missingFwIndexes.slice(0, 5));
        console.log(`[Index Upload] Missing RV indexes (first 5):`, missingRvIndexes.slice(0, 5));
        console.log(`[Index Upload] allowMissingReverseIndexes:`, allowMissingReverseIndexes);
        return res.status(400).json({
          error: "Some index sequences not found in the system",
          missingFwIndexes: missingFwIndexes.slice(0, 10),
          missingRvIndexes: missingRvIndexes.slice(0, 10),
        });
      }
      
      if (missingRvIndexes.length > 0 && allowMissingReverseIndexes) {
        console.log(`[Index Upload] Proceeding with override - missing ${missingRvIndexes.length} reverse indexes`);
      }
      
      // Validate primers exist in our system
      const allPrimerItems = await db.select().from(primerItems);
      const allPrimerLabels = new Set(allPrimerItems.map(p => p.label));
      
      console.log(`[Index Upload] Checking ${parseResult.uniqueFwPrimers.size} unique forward primers and ${parseResult.uniqueRvPrimers.size} unique reverse primers`);
      console.log(`[Index Upload] Database has ${allPrimerLabels.size} unique primer labels`);
      console.log(`[Index Upload] Sample from file - FwPrimers:`, Array.from(parseResult.uniqueFwPrimers).slice(0, 3));
      console.log(`[Index Upload] Sample from DB:`, Array.from(allPrimerLabels).slice(0, 5));
      
      const missingFwPrimers: string[] = [];
      const missingRvPrimers: string[] = [];
      
      parseResult.uniqueFwPrimers.forEach(primer => {
        // Skip "*" as it indicates a primer pool
        if (primer !== '*' && !allPrimerLabels.has(primer)) {
          missingFwPrimers.push(primer);
        }
      });
      
      parseResult.uniqueRvPrimers.forEach(primer => {
        // Skip "*" as it indicates a primer pool
        if (primer !== '*' && !allPrimerLabels.has(primer)) {
          missingRvPrimers.push(primer);
        }
      });
      
      if (missingFwPrimers.length > 0 || missingRvPrimers.length > 0) {
        return res.status(400).json({
          error: "Some primers not found in the system",
          missingFwPrimers,
          missingRvPrimers,
        });
      }
      
      // Create the run
      const initialStatus = 'tissue_collection';
      const initialHistory = [{ status: initialStatus, timestamp: new Date().toISOString() }];
      
      const [run] = await db.insert(labRuns)
        .values({ 
          name: name || `Run ${new Date().toLocaleDateString()}`, 
          createdBy: userId,
          status: initialStatus,
          statusHistory: initialHistory,
        })
        .returning();
      
      // Build index set lookup structures
      const allIndexSets = await db.select().from(indexSets);
      
      // Build map of indexSetId -> { wellPosition -> sequence }
      const indexSetEntriesMap = new Map<number, Map<string, string>>();
      for (const entry of allIndexEntries) {
        if (!indexSetEntriesMap.has(entry.indexSetId)) {
          indexSetEntriesMap.set(entry.indexSetId, new Map());
        }
        indexSetEntriesMap.get(entry.indexSetId)!.set(entry.wellPosition, entry.indexSequence);
      }
      
      // Build map of sequence -> array of sets (a sequence can exist in multiple sets)
      const sequenceToSetsMap = new Map<string, Array<{ setId: number; setTitle: string; orientation: string; entryCount: number }>>();
      
      // First, count entries per set
      const setEntryCounts = new Map<number, number>();
      for (const entry of allIndexEntries) {
        setEntryCounts.set(entry.indexSetId, (setEntryCounts.get(entry.indexSetId) || 0) + 1);
      }
      
      for (const entry of allIndexEntries) {
        const set = allIndexSets.find(s => s.id === entry.indexSetId);
        if (set) {
          if (!sequenceToSetsMap.has(entry.indexSequence)) {
            sequenceToSetsMap.set(entry.indexSequence, []);
          }
          // Only add if not already in the array for this set
          const existing = sequenceToSetsMap.get(entry.indexSequence)!;
          if (!existing.some(s => s.setId === set.id)) {
            existing.push({ 
              setId: set.id, 
              setTitle: set.title, 
              orientation: set.orientation,
              entryCount: setEntryCounts.get(set.id) || 0
            });
          }
        }
      }
      
      // Helper function to find matching index set for a plate's indexes
      const findMatchingIndexSet = (
        samples: typeof parseResult.plates[0]['samples'],
        orientation: 'Forward' | 'Reverse',
        indexExtractor: (sample: typeof samples[0]) => string
      ): { setId: number | null; matchType: 'full_plate' | 'single_index' | 'none'; setTitle?: string } => {
        if (samples.length === 0) return { setId: null, matchType: 'none' };
        
        // Collect all unique indexes and their well positions
        const indexByWell = new Map<string, string>();
        const uniqueIndexes = new Set<string>();
        for (const sample of samples) {
          const idx = indexExtractor(sample);
          if (idx) {
            indexByWell.set(sample.wellPosition, idx);
            uniqueIndexes.add(idx);
          }
        }
        
        // Case 1: Single index (all samples have the same index)
        // Prefer single-entry sets for single-index plates
        if (uniqueIndexes.size === 1) {
          const singleIndex = Array.from(uniqueIndexes)[0];
          const matchingSets = sequenceToSetsMap.get(singleIndex);
          if (matchingSets) {
            // Filter by orientation and sort by entry count (prefer single-entry sets)
            const orientedSets = matchingSets
              .filter(s => s.orientation === orientation)
              .sort((a, b) => a.entryCount - b.entryCount); // Smallest first
            
            if (orientedSets.length > 0) {
              const bestMatch = orientedSets[0];
              return { setId: bestMatch.setId, matchType: 'single_index', setTitle: bestMatch.setTitle };
            }
          }
        }
        
        // Case 2: Full plate (96 different indexes matching a set by well position)
        const orientedSets = allIndexSets.filter(s => s.orientation === orientation);
        
        for (const set of orientedSets) {
          const setEntries = indexSetEntriesMap.get(set.id);
          if (!setEntries) continue;
          
          // Check if all plate indexes match this set by well position
          let allMatch = true;
          let matchCount = 0;
          
          for (const [wellPos, plateIndex] of indexByWell) {
            const setIndex = setEntries.get(wellPos);
            if (setIndex === plateIndex) {
              matchCount++;
            } else {
              allMatch = false;
              break;
            }
          }
          
          if (allMatch && matchCount === indexByWell.size) {
            return { setId: set.id, matchType: 'full_plate', setTitle: set.title };
          }
        }
        
        return { setId: null, matchType: 'none' };
      };
      
      // Create plates and wells
      for (const plateData of parseResult.plates) {
        let forwardIndexSetId: number | null = null;
        let reverseIndexSetId: number | null = null;
        
        if (plateData.samples.length > 0) {
          // Detect forward index set
          const fwMatch = findMatchingIndexSet(plateData.samples, 'Forward', s => s.fwIndex);
          if (fwMatch.setId) {
            forwardIndexSetId = fwMatch.setId;
            console.log(`[Index Upload] Plate ${plateData.plateNumber}: Detected forward index set "${fwMatch.setTitle}" (${fwMatch.matchType})`);
          } else if (plateData.samples[0].fwIndex) {
            console.log(`[Index Upload] Plate ${plateData.plateNumber}: WARNING - No matching Forward index set found`);
          }
          
          // Detect reverse index set
          const rvMatch = findMatchingIndexSet(plateData.samples, 'Reverse', s => s.rvIndex);
          if (rvMatch.setId) {
            reverseIndexSetId = rvMatch.setId;
            console.log(`[Index Upload] Plate ${plateData.plateNumber}: Detected reverse index set "${rvMatch.setTitle}" (${rvMatch.matchType})`);
          } else if (plateData.samples[0].rvIndex) {
            console.log(`[Index Upload] Plate ${plateData.plateNumber}: WARNING - No matching Reverse index set found (leaving unassigned)`);
          }
        }
        
        const [plate] = await db.insert(labPlates).values({
          runId: run.id,
          plateNumber: plateData.plateNumber,
          name: `Plate ${plateData.plateNumber}`,
          orientation: plateData.orientation,
          sampleCount: plateData.samples.length,
          forwardIndexSetId,
          reverseIndexSetId,
        }).returning();
        
        // Create wells for each sample
        for (const sample of plateData.samples) {
          // Map platform names to match database expected values
          let dbPlatform: string | null = null;
          if (sample.platform === 'iNat') {
            dbPlatform = 'iNaturalist';
          } else if (sample.platform === 'MO') {
            dbPlatform = 'MO';
          } else if (sample.platform === 'MyCoPortal') {
            dbPlatform = 'MyCoPortal';
          }
          
          await db.insert(labWells).values({
            plateId: plate.id,
            wellPosition: sample.wellPosition,
            sortOrder: sample.position,
            labCode: sample.labCode || null,
            platform: dbPlatform,
            observationId: sample.observationId || null,
            primerPool: sample.primerPool || null,
            forwardPrimer: sample.fwPrimer || null,
            reversePrimer: sample.rvPrimer || null,
          });
        }
      }
      
      res.json({ 
        success: true, 
        run,
        plateCount: parseResult.plates.length,
        sampleCount: parseResult.plates.reduce((sum, p) => sum + p.samples.length, 0)
      });
    } catch (error) {
      console.error("Error creating run from index file:", error);
      res.status(500).json({ error: "Failed to create run from index file" });
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
        // no_voucher and cleared are acceptable - don't count them as errors for plate status
        const acceptableStatuses = ['valid', 'no_voucher', 'cleared'];
        const errorCount = wells.filter(w => w.isValidated && w.validationStatus && !acceptableStatuses.includes(w.validationStatus)).length;
        // "Cleared" wells are those explicitly marked with 'cleared' status
        const clearedCount = wells.filter(w => 
          w.isValidated && w.validationStatus === 'cleared'
        ).length;
        // Plate is "fully validated" if all samples are validated with acceptable statuses
        // Fresh/unvalidated wells do NOT count as validated
        const validatedOrAcceptableCount = wells.filter(w => 
          w.isValidated && w.validationStatus && acceptableStatuses.includes(w.validationStatus)
        ).length;
        
        // Plate is fully validated only if:
        // 1. Has samples
        // 2. All samples have been validated with acceptable statuses (valid, no_voucher, or cleared)
        // 3. Has index sets assigned (both forward and reverse)
        // 4. Has primer configuration (either default primers or wells have primers)
        const hasIndexSets = plate.forwardIndexSetId && plate.reverseIndexSetId;
        const hasPrimerConfig = plate.defaultForwardPrimer && plate.defaultReversePrimer;
        
        // Check if any wells have primer pool or individual primers (if no defaults)
        let wellsHavePrimers = false;
        if (!hasPrimerConfig && sampleCount > 0) {
          // Check if wells have primer configuration
          const wellsWithPrimers = wells.filter(w => 
            (w.observationId || w.labCode) && 
            (w.primerPool || (w.forwardPrimer && w.reversePrimer))
          );
          wellsHavePrimers = wellsWithPrimers.length === sampleCount;
        }
        
        const isFullyValidated = sampleCount > 0 && 
          validatedOrAcceptableCount === sampleCount && 
          errorCount === 0 &&
          hasIndexSets &&
          (hasPrimerConfig || wellsHavePrimers);
        
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

  // Update run (rawDataUrl, notes, etc.)
  app.patch("/api/admin/runs/:id", isAdmin, async (req: any, res) => {
    try {
      const runId = parseInt(req.params.id);
      const { rawDataUrl, notes, name, status } = req.body;
      
      // Fetch current run to check for status change
      const [currentRun] = await db.select().from(labRuns).where(eq(labRuns.id, runId));
      if (!currentRun) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      const updateData: any = { updatedAt: new Date() };
      if (rawDataUrl !== undefined) updateData.rawDataUrl = rawDataUrl;
      if (notes !== undefined) updateData.notes = notes;
      if (name !== undefined) updateData.name = name;
      
      // Track status change in history
      if (status !== undefined && status !== currentRun.status) {
        updateData.status = status;
        const currentHistory = (currentRun.statusHistory as { status: string; timestamp: string }[]) || [];
        const newEntry = { status, timestamp: new Date().toISOString() };
        updateData.statusHistory = [...currentHistory, newEntry];
      }
      
      const [updatedRun] = await db.update(labRuns)
        .set(updateData)
        .where(eq(labRuns.id, runId))
        .returning();
      
      res.json(updatedRun);
    } catch (error) {
      console.error("Error updating lab run:", error);
      res.status(500).json({ error: "Failed to update lab run" });
    }
  });

  // Delete run and all associated data
  app.delete("/api/admin/runs/:id", isAdmin, async (req: any, res) => {
    try {
      const runId = parseInt(req.params.id);
      
      // Get all plates for this run
      const plates = await db.select().from(labPlates).where(eq(labPlates.runId, runId));
      const plateIds = plates.map(p => p.id);
      
      // Delete wells for all plates
      if (plateIds.length > 0) {
        for (const plateId of plateIds) {
          await db.delete(labWells).where(eq(labWells.plateId, plateId));
        }
      }
      
      // Delete plates
      await db.delete(labPlates).where(eq(labPlates.runId, runId));
      
      // Delete run files
      await db.delete(labRunFiles).where(eq(labRunFiles.runId, runId));
      
      // Delete method selections
      await db.delete(labRunMethodSelections).where(eq(labRunMethodSelections.runId, runId));
      
      // Delete the run itself
      await db.delete(labRuns).where(eq(labRuns.id, runId));
      
      res.json({ success: true, message: "Run deleted successfully" });
    } catch (error) {
      console.error("Error deleting lab run:", error);
      res.status(500).json({ error: "Failed to delete lab run" });
    }
  });

  // Fetch Google Drive folder contents
  app.get("/api/admin/runs/:id/drive-files", isAdmin, async (req: any, res) => {
    try {
      const runId = parseInt(req.params.id);
      const [run] = await db.select().from(labRuns).where(eq(labRuns.id, runId));
      
      if (!run || !run.rawDataUrl) {
        return res.json({ files: [], error: null });
      }
      
      // Extract folder ID from Google Drive URL
      const folderIdMatch = run.rawDataUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
      if (!folderIdMatch) {
        return res.json({ files: [], error: "Invalid Google Drive folder URL" });
      }
      
      const folderId = folderIdMatch[1];
      const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
      
      if (!apiKey) {
        return res.json({ 
          files: [], 
          error: "Google Drive API key not configured",
          folderId,
          folderUrl: run.rawDataUrl
        });
      }
      
      const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&key=${apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.error) {
        return res.json({ 
          files: [], 
          error: data.error.message || "Failed to fetch folder contents",
          folderId,
          folderUrl: run.rawDataUrl
        });
      }
      
      res.json({ 
        files: data.files || [], 
        error: null,
        folderId,
        folderUrl: run.rawDataUrl
      });
    } catch (error) {
      console.error("Error fetching Google Drive files:", error);
      res.status(500).json({ error: "Failed to fetch Google Drive files" });
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
        ? Math.max(...existingPlates.map(p => p.plateNumber ?? 0)) + 1 
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

  // =============================================
  // PENDING PLATES API ENDPOINTS (plates without runId)
  // =============================================

  // Get all pending plates (runId is null)
  app.get("/api/admin/pending-plates", isAdmin, async (req: any, res) => {
    try {
      const showInactive = req.query.showInactive === 'true';
      const searchTerm = req.query.search?.trim() || '';
      
      // Build conditions: runId is null, optionally filter by isActive
      // Treat NULL as active (for legacy data before isActive was added)
      const conditions = showInactive
        ? [isNull(labPlates.runId)]
        : [isNull(labPlates.runId), or(eq(labPlates.isActive, true), isNull(labPlates.isActive))];
      
      let pendingPlates = await db.select().from(labPlates).where(and(...conditions));
      
      // Get all unique creator IDs to fetch user names
      const creatorIds = [...new Set(pendingPlates.map(p => p.createdBy).filter(Boolean))];
      const userNames = new Map<string, string>();
      
      if (creatorIds.length > 0) {
        const usersData = await db.select().from(users).where(inArray(users.id, creatorIds as string[]));
        for (const user of usersData) {
          const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user.id;
          userNames.set(user.id, displayName);
        }
      }
      
      // If search term provided, first filter by name
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const nameMatches = pendingPlates.filter(p => 
          p.name?.toLowerCase().includes(searchLower)
        );
        
        // If name matches found, use those. Otherwise search content (notes, creator)
        if (nameMatches.length > 0) {
          pendingPlates = nameMatches;
        } else {
          pendingPlates = pendingPlates.filter(p => {
            const creatorName = p.createdBy ? (userNames.get(p.createdBy) || '') : '';
            return (
              p.notes?.toLowerCase().includes(searchLower) ||
              creatorName.toLowerCase().includes(searchLower)
            );
          });
        }
      }
      
      // Get wells for all plates in a batch
      const plateIds = pendingPlates.map(p => p.id);
      let allWells: any[] = [];
      if (plateIds.length > 0) {
        allWells = await db.select().from(labWells).where(inArray(labWells.plateId, plateIds));
      }
      
      // Group wells by plateId
      const wellsByPlate = new Map<number, typeof allWells>();
      for (const well of allWells) {
        if (!wellsByPlate.has(well.plateId)) {
          wellsByPlate.set(well.plateId, []);
        }
        wellsByPlate.get(well.plateId)!.push(well);
      }
      
      const platesWithWells = pendingPlates.map((plate) => {
        const wells = wellsByPlate.get(plate.id) || [];
        // Replace createdBy ID with the user's display name
        const createdByName = plate.createdBy ? (userNames.get(plate.createdBy) || plate.createdBy) : null;
        return { ...plate, createdBy: createdByName, wells };
      });
      
      res.json(platesWithWells);
    } catch (error) {
      console.error("Error fetching pending plates:", error);
      res.status(500).json({ error: "Failed to fetch pending plates" });
    }
  });

  // Create a new pending plate
  app.post("/api/admin/pending-plates", isAdmin, async (req: any, res) => {
    try {
      const { name, sampleCount = 96 } = req.body;
      const validSampleCount = Math.max(1, Math.min(96, parseInt(sampleCount) || 96));
      
      // Get the username from the authenticated user (Replit auth uses claims.sub)
      const createdBy = req.user?.claims?.sub || req.user?.id || null;
      
      const [newPlate] = await db.insert(labPlates).values({
        runId: null,
        plateNumber: null,
        name: name || null,
        sampleCount: validSampleCount,
        status: 'empty',
        isActive: true,
        createdBy,
      }).returning();
      
      // Create wells for the plate - batch insert for efficiency
      const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const cols = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
      const allWellPositions = rows.flatMap((row, ri) => cols.map((col, ci) => ({ pos: `${row}${col}`, order: ci * 8 + ri + 1 })));
      allWellPositions.sort((a, b) => a.order - b.order);
      const wellPositions = allWellPositions.slice(0, validSampleCount);
      
      const wellsToInsert = wellPositions.map(({ pos, order }) => ({
        plateId: newPlate.id,
        wellPosition: pos,
        sortOrder: order,
      }));
      
      if (wellsToInsert.length > 0) {
        await db.insert(labWells).values(wellsToInsert);
      }
      
      res.json(newPlate);
    } catch (error) {
      console.error("Error creating pending plate:", error);
      res.status(500).json({ error: "Failed to create pending plate" });
    }
  });

  // Get single pending plate with wells
  app.get("/api/admin/pending-plates/:id", isAdmin, async (req: any, res) => {
    try {
      const plateId = parseInt(req.params.id);
      const [plate] = await db.select().from(labPlates).where(eq(labPlates.id, plateId));
      
      if (!plate) {
        return res.status(404).json({ error: "Plate not found" });
      }
      
      let wells = await db.select().from(labWells).where(eq(labWells.plateId, plateId)).orderBy(labWells.sortOrder);
      
      // If no wells exist, create wells based on sampleCount
      if (wells.length === 0) {
        const sampleCount = plate.sampleCount || 96;
        const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        const cols = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
        const orientation = plate.orientation || 'right-left';
        
        const allWellPositions = orientation === 'right-left' 
          ? rows.flatMap((row, ri) => cols.map((col, ci) => ({ pos: `${row}${col}`, order: ci * 8 + ri + 1 })))
          : rows.reverse().flatMap((row, ri) => cols.map((col, ci) => ({ pos: `${row}${col}`, order: ci * 8 + (7 - ri) + 1 })));
        
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

      // For pending plates, runName is always null
      res.json({ ...plate, runName: null, wells });
    } catch (error) {
      console.error("Error fetching pending plate:", error);
      res.status(500).json({ error: "Failed to fetch pending plate" });
    }
  });

  // Update pending plate settings
  app.patch("/api/admin/pending-plates/:id", isAdmin, async (req: any, res) => {
    try {
      const plateId = parseInt(req.params.id);
      const { name, notes, orientation } = req.body;

      const updateData: any = { updatedAt: new Date() };
      if (name !== undefined) updateData.name = name;
      if (notes !== undefined) updateData.notes = notes;
      if (orientation !== undefined) updateData.orientation = orientation;

      const [updated] = await db.update(labPlates)
        .set(updateData)
        .where(eq(labPlates.id, plateId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating pending plate:", error);
      res.status(500).json({ error: "Failed to update pending plate" });
    }
  });

  // Delete pending plate
  app.delete("/api/admin/pending-plates/:id", isAdmin, async (req: any, res) => {
    try {
      const plateId = parseInt(req.params.id);
      
      // First delete associated wells
      await db.delete(labWells).where(eq(labWells.plateId, plateId));
      
      // Then delete the plate
      await db.delete(labPlates).where(eq(labPlates.id, plateId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting pending plate:", error);
      res.status(500).json({ error: "Failed to delete pending plate" });
    }
  });

  // Update pending plate sample count
  app.patch("/api/admin/pending-plates/:id/sample-count", isAdmin, async (req: any, res) => {
    try {
      const plateId = parseInt(req.params.id);
      const { sampleCount, name } = req.body;
      
      const validSampleCount = Math.max(1, Math.min(96, parseInt(sampleCount) || 96));
      
      const [plate] = await db.select().from(labPlates).where(eq(labPlates.id, plateId));
      if (!plate) {
        return res.status(404).json({ error: "Plate not found" });
      }
      
      const currentWells = await db.select().from(labWells).where(eq(labWells.plateId, plateId)).orderBy(labWells.sortOrder);
      const orientation = plate.orientation || 'right-left';
      const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const cols = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
      
      const allWellPositions = orientation === 'right-left' 
        ? rows.flatMap((row, ri) => cols.map((col, ci) => ({ pos: `${row}${col}`, order: ci * 8 + ri + 1 })))
        : rows.reverse().flatMap((row, ri) => cols.map((col, ci) => ({ pos: `${row}${col}`, order: ci * 8 + (7 - ri) + 1 })));
      
      allWellPositions.sort((a, b) => a.order - b.order);
      
      if (validSampleCount > currentWells.length) {
        // Add new wells
        const existingPositions = new Set(currentWells.map(w => w.wellPosition));
        const wellPositions = allWellPositions.slice(0, validSampleCount);
        
        for (const { pos, order } of wellPositions) {
          if (!existingPositions.has(pos)) {
            await db.insert(labWells).values({
              plateId,
              wellPosition: pos,
              sortOrder: order,
            });
          }
        }
      } else if (validSampleCount < currentWells.length) {
        // Remove excess wells
        const wellPositionsToKeep = allWellPositions.slice(0, validSampleCount).map(w => w.pos);
        const wellsToDelete = currentWells.filter(w => !wellPositionsToKeep.includes(w.wellPosition));
        
        for (const well of wellsToDelete) {
          await db.delete(labWells).where(eq(labWells.id, well.id));
        }
      }
      
      const updateData: any = { sampleCount: validSampleCount, updatedAt: new Date() };
      if (name !== undefined) updateData.name = name;
      
      const [updated] = await db.update(labPlates)
        .set(updateData)
        .where(eq(labPlates.id, plateId))
        .returning();
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating pending plate sample count:", error);
      res.status(500).json({ error: "Failed to update sample count" });
    }
  });

  // Validate pending plate wells
  app.post("/api/admin/pending-plates/:id/validate", isAdmin, async (req: any, res) => {
    try {
      const plateId = parseInt(req.params.id);
      const wells = await db.select().from(labWells).where(eq(labWells.plateId, plateId));

      const results: any[] = [];
      const wellsToProcess: { well: any; effectiveObsId: string; effectivePlatform: string; validationResult: any }[] = [];

      // Phase 1: Pre-process wells
      for (const well of wells) {
        if (!well.observationId && !well.labCode) continue;

        let validationResult: any = { wellId: well.id };
        let effectivePlatform = well.platform;
        let effectiveObsId = well.observationId;

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

      // Phase 2: Batch fetch iNaturalist observations
      const inatObsIds = wellsToProcess
        .filter(w => w.effectivePlatform === 'iNaturalist' && w.effectiveObsId)
        .map(w => w.effectiveObsId.replace(/\D/g, ''));
      
      const obsDataMap: Record<string, any> = {};
      
      if (inatObsIds.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < inatObsIds.length; i += batchSize) {
          const batch = inatObsIds.slice(i, i + batchSize);
          const batchUrl = `https://api.inaturalist.org/v1/observations?id=${batch.join(',')}&per_page=${batchSize}`;
          
          try {
            const response = await fetch(batchUrl, {
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(30000)
            });
            
            if (response.ok) {
              const data = await response.json();
              for (const obs of (data.results || [])) {
                obsDataMap[String(obs.id)] = obs;
              }
            }
          } catch (e: any) {
            console.error(`[Validate Pending] Batch fetch error: ${e.message}`);
          }
        }
      }

      // Phase 2b: Fetch Mushroom Observer observations
      const moObsIds = wellsToProcess
        .filter(w => w.effectivePlatform === 'MO' && w.effectiveObsId)
        .map(w => w.effectiveObsId.replace(/\D/g, ''));
      
      const moDataMap: Record<string, any> = {};
      
      if (moObsIds.length > 0) {
        const moFetchPromises = moObsIds.map(async (obsId, index) => {
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
            console.error(`[Validate Pending] MO fetch error for ${obsId}: ${e.message}`);
          }
        });
        
        await Promise.all(moFetchPromises);
      }

      // Phase 3: Process each well
      for (const { well, effectiveObsId, effectivePlatform, validationResult } of wellsToProcess) {
        const obsId = effectiveObsId?.replace(/\D/g, '');
        
        if (effectivePlatform === 'iNaturalist' && obsId) {
          const obs = obsDataMap[obsId];
          
          if (obs) {
            validationResult.apiFetched = true;
            
            // Check both "Voucher Number(s)" and "Voucher Number" (field ID 8257)
            const voucherNumbersField = obs.ofvs?.find((f: any) => f.name === 'Voucher Number(s)');
            const voucherNumberField = obs.ofvs?.find((f: any) => 
              f.name === 'Voucher Number' || f.observation_field_id === 8257
            );
            const inatVoucher = voucherNumbersField?.value || voucherNumberField?.value || null;

            validationResult.voucherNumber = inatVoucher;
            validationResult.scientificName = obs.taxon?.name;
            validationResult.username = obs.user?.login || null;
            
            try {
              const location = await extractLocationFromObservation(obs);
              validationResult.state = location.stateCode || location.stateName || null;
              validationResult.country = location.countryCode || location.countryName || null;
            } catch (locError) {
              validationResult.state = null;
              validationResult.country = null;
            }
            
            const iconicTaxon = obs.taxon?.iconic_taxon_name;
            const isFungal = iconicTaxon === "Fungi";
            const isSlimeMold = iconicTaxon === "Protozoa";
            
            let status = 'valid';
            let message = 'Observation verified';
            
            if (!isFungal && !isSlimeMold) {
              status = 'not_fungal';
              message = `Organism is ${iconicTaxon || 'unknown'}, not fungal`;
            } else if (well.labCode && inatVoucher) {
              if (!labCodesMatch(well.labCode, inatVoucher)) {
                status = 'mismatch';
                message = `Lab code "${well.labCode}" not found in voucher "${inatVoucher}"`;
              }
            } else if (!inatVoucher) {
              status = 'no_voucher';
              message = 'No voucher number in iNaturalist';
            }
            
            validationResult.status = status;
            validationResult.message = message;
            
            const updateData: any = {
              isValidated: true,
              validationStatus: status,
              validationMessage: message,
              voucherNumber: inatVoucher,
              username: validationResult.username,
              state: validationResult.state,
              country: validationResult.country,
              platform: effectivePlatform,
              updatedAt: new Date(),
            };
            
            // Auto-fill labCode from voucher number if labCode is empty (same logic as regular plate validation)
            if (!well.labCode && inatVoucher) {
              updateData.labCode = inatVoucher;
              validationResult.labCodeUpdated = true;
            }
            
            await db.update(labWells)
              .set(updateData)
              .where(eq(labWells.id, well.id));
          } else {
            validationResult.status = 'error';
            validationResult.message = 'Observation not found on iNaturalist';
            
            await db.update(labWells)
              .set({
                isValidated: true,
                validationStatus: 'error',
                validationMessage: 'Observation not found on iNaturalist',
                updatedAt: new Date(),
              })
              .where(eq(labWells.id, well.id));
          }
        } else if (effectivePlatform === 'MO' && obsId) {
          const moObs = moDataMap[obsId];
          
          if (moObs) {
            validationResult.apiFetched = true;
            
            let username = null;
            try {
              const userInfo = moObs.owner || moObs.user;
              if (typeof userInfo === 'string') {
                const parsed = JSON.parse(userInfo);
                username = parsed.login_name || parsed.name || null;
              } else if (userInfo) {
                username = userInfo.login_name || userInfo.name || null;
              }
            } catch (e) {
              username = null;
            }
            
            validationResult.username = username;
            validationResult.scientificName = moObs.consensus?.name || null;
            
            await db.update(labWells)
              .set({
                isValidated: true,
                validationStatus: 'valid',
                validationMessage: 'MO observation verified',
                username,
                platform: 'MO',
                updatedAt: new Date(),
              })
              .where(eq(labWells.id, well.id));
              
            validationResult.status = 'valid';
            validationResult.message = 'MO observation verified';
          } else {
            validationResult.status = 'error';
            validationResult.message = 'Observation not found on Mushroom Observer';
            
            await db.update(labWells)
              .set({
                isValidated: true,
                validationStatus: 'error',
                validationMessage: 'Observation not found on Mushroom Observer',
                updatedAt: new Date(),
              })
              .where(eq(labWells.id, well.id));
          }
        } else if (!effectivePlatform && effectiveObsId) {
          validationResult.status = 'missing_platform';
          validationResult.message = 'Platform not specified';
          
          await db.update(labWells)
            .set({
              isValidated: true,
              validationStatus: 'missing_platform',
              validationMessage: 'Platform not specified',
              updatedAt: new Date(),
            })
            .where(eq(labWells.id, well.id));
        }

        results.push(validationResult);
      }

      res.json({ success: true, results });
    } catch (error) {
      console.error("Error validating pending plate:", error);
      res.status(500).json({ error: "Failed to validate plate" });
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

  // Clear all well data for a plate (reset to empty)
  app.post("/api/admin/plates/:id/clear-data", isAdmin, async (req: any, res) => {
    try {
      const plateId = parseInt(req.params.id);
      
      // Reset all wells to empty state
      await db.update(labWells)
        .set({
          platform: null,
          observationId: null,
          labCode: null,
          primerPool: null,
          forwardPrimer: null,
          reversePrimer: null,
          isValidated: false,
          validationStatus: null,
          validationMessage: null,
          voucherNumber: null,
          username: null,
          state: null,
          country: null,
          updatedAt: new Date(),
        })
        .where(eq(labWells.plateId, plateId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error clearing well data:", error);
      res.status(500).json({ error: "Failed to clear well data" });
    }
  });

  // Import data from a pending plate into current plate
  app.post("/api/admin/plates/:id/import-pending", isAdmin, async (req: any, res) => {
    try {
      const plateId = parseInt(req.params.id);
      const { pendingPlateId } = req.body;

      if (!pendingPlateId) {
        return res.status(400).json({ error: "Pending plate ID is required" });
      }

      // Get the target plate
      const [targetPlate] = await db.select().from(labPlates).where(eq(labPlates.id, plateId));
      if (!targetPlate) {
        return res.status(404).json({ error: "Target plate not found" });
      }

      // Get the pending plate with wells
      const [pendingPlate] = await db.select().from(labPlates).where(eq(labPlates.id, pendingPlateId));
      if (!pendingPlate) {
        return res.status(404).json({ error: "Pending plate not found" });
      }

      // Get wells from both plates
      const targetWells = await db.select().from(labWells).where(eq(labWells.plateId, plateId));
      const pendingWells = await db.select().from(labWells).where(eq(labWells.plateId, pendingPlateId));

      // Create a map of well position to pending well data
      const pendingWellMap = new Map(pendingWells.map(w => [w.wellPosition, w]));

      // Update target wells with data from matching pending wells
      let importedCount = 0;
      for (const targetWell of targetWells) {
        const pendingWell = pendingWellMap.get(targetWell.wellPosition);
        if (pendingWell && (pendingWell.observationId || pendingWell.labCode)) {
          await db.update(labWells)
            .set({
              platform: pendingWell.platform,
              observationId: pendingWell.observationId,
              labCode: pendingWell.labCode,
              isValidated: pendingWell.isValidated,
              validationStatus: pendingWell.validationStatus,
              validationMessage: pendingWell.validationMessage,
              voucherNumber: pendingWell.voucherNumber,
              username: pendingWell.username,
              state: pendingWell.state,
              country: pendingWell.country,
              updatedAt: new Date(),
            })
            .where(eq(labWells.id, targetWell.id));
          importedCount++;
        }
      }

      // Append note about the import (include both name and ID)
      const pendingPlateName = pendingPlate.name || 'Pending Plate';
      const importNote = `Imported from ${pendingPlateName} (ID: ${pendingPlate.id})`;
      const existingNotes = targetPlate.notes || "";
      const newNotes = existingNotes 
        ? `${existingNotes}\n\n${importNote}` 
        : importNote;

      await db.update(labPlates)
        .set({ 
          notes: newNotes,
          updatedAt: new Date() 
        })
        .where(eq(labPlates.id, plateId));

      // Mark the pending plate as inactive (it's been imported)
      await db.update(labPlates)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(labPlates.id, pendingPlateId));

      res.json({ 
        success: true, 
        importedCount,
        message: `Imported ${importedCount} samples from ${pendingPlateName} (ID: ${pendingPlate.id})`
      });
    } catch (error) {
      console.error("Error importing pending plate:", error);
      res.status(500).json({ error: "Failed to import pending plate" });
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
      
      // When platform or observationId changes, reset validation so it can be re-validated
      const needsRevalidation = platform !== undefined || observationId !== undefined;
      
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
      
      // If platform or observation changed and validation fields not explicitly set, reset validation
      if (needsRevalidation && !('validationStatus' in req.body)) {
        updateData.isValidated = false;
        updateData.validationStatus = null;
        updateData.validationMessage = null;
      }

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
                
                // Store observation in unified cache and update linked specimens
                try {
                  const obsId = String(obs.id);
                  const ofvs = obs.ofvs || [];
                  
                  // Extract all observation fields using helper function
                  const voucherNumber = getObservationFieldValue(ofvs, 8257);
                  const voucherNumberMultiple = getObservationFieldValue(ofvs, 2863);
                  const provisionalSpeciesName = getObservationFieldValue(ofvs, 10675);
                  const speciesNameOverride = getObservationFieldValue(ofvs, 20259);
                  const collectorsName = getObservationFieldValue(ofvs, 9051);
                  const herbariumName = getObservationFieldValue(ofvs, 9539);
                  const herbariumCatalogNumber = getObservationFieldValue(ofvs, 9540);
                  const genbankAccession = getObservationFieldValue(ofvs, 7555);
                  const genbankNumberUrl = getObservationFieldValue(ofvs, 4191);
                  const mycomapBlastResults = getObservationFieldValue(ofvs, 9864);
                  const traceFiles = getObservationFieldValue(ofvs, 10109);
                  const dnaBarcodIts = getObservationFieldValue(ofvs, 2330);
                  const readsInConsensus = getObservationFieldValue(ofvs, 16718);
                  
                  const inatBaseName = obs.taxon?.name || obs.species_guess || null;
                  const scientificName = getInatScientificName(inatBaseName, provisionalSpeciesName, speciesNameOverride);
                  
                  // Upsert into observation_cache
                  const existingCache = await db.select({ id: observationCache.id })
                    .from(observationCache)
                    .where(and(
                      eq(observationCache.source, 'inat'),
                      eq(observationCache.sourceObservationId, obsId)
                    ))
                    .limit(1);
                  
                  const cacheData = {
                    source: 'inat' as const,
                    sourceObservationId: obsId,
                    sourceUuid: obs.uuid || null,
                    scientificName: inatBaseName,
                    commonName: obs.taxon?.preferred_common_name || null,
                    family: obs.taxon?.ancestry?.split('/')?.slice(-2, -1)?.[0] || null,
                    genus: inatBaseName?.split(' ')?.[0] || null,
                    observerName: obs.user?.name || null,
                    observerUsername: obs.user?.login || null,
                    observerId: obs.user?.id?.toString() || null,
                    latitude: obs.geojson?.coordinates?.[1]?.toString() || null,
                    longitude: obs.geojson?.coordinates?.[0]?.toString() || null,
                    coordinatesObscured: obs.obscured || false,
                    placeGuess: obs.place_guess || null,
                    locality: obs.place_guess || null,
                    observedOn: obs.observed_on || null,
                    qualityGrade: obs.quality_grade || null,
                    voucherNumber,
                    voucherNumberMultiple,
                    provisionalSpeciesName,
                    speciesNameOverride,
                    collectorsName,
                    herbariumName,
                    herbariumCatalogNumber,
                    genbankAccession,
                    genbankNumberUrl,
                    mycomapBlastResults,
                    traceFiles,
                    dnaBarcodIts,
                    readsInConsensus,
                    apiResponseJson: JSON.stringify({ results: [obs] }),
                    lastSyncedAt: new Date(),
                    syncStatus: 'success',
                    updatedAt: new Date(),
                  };
                  
                  let cacheId: number;
                  if (existingCache.length > 0) {
                    cacheId = existingCache[0].id;
                    await db.update(observationCache)
                      .set(cacheData)
                      .where(eq(observationCache.id, cacheId));
                  } else {
                    const [inserted] = await db.insert(observationCache).values({
                      ...cacheData,
                      createdAt: new Date(),
                    }).returning({ id: observationCache.id });
                    cacheId = inserted.id;
                  }
                  
                  // Store photos in observation_media
                  if (obs.photos && obs.photos.length > 0) {
                    // Delete existing photos for this cache entry
                    await db.delete(observationMedia).where(eq(observationMedia.observationCacheId, cacheId));
                    
                    // Insert new photos
                    for (let photoIdx = 0; photoIdx < obs.photos.length; photoIdx++) {
                      const photo = obs.photos[photoIdx];
                      await db.insert(observationMedia).values({
                        observationCacheId: cacheId,
                        mediaType: 'photo',
                        url: photo.url || '',
                        thumbnailUrl: photo.url?.replace('/square.', '/thumb.') || photo.url || null,
                        mediumUrl: photo.url?.replace('/square.', '/medium.') || null,
                        largeUrl: photo.url?.replace('/square.', '/large.') || null,
                        originalUrl: photo.url?.replace('/square.', '/original.') || null,
                        licenseCode: photo.license_code || null,
                        attribution: photo.attribution || null,
                        sortOrder: photoIdx,
                      });
                    }
                  }
                  
                  // Extract state and country from observation
                  let specimenState: string | null = null;
                  let specimenCountry: string | null = null;
                  try {
                    const location = await extractLocationFromObservation(obs);
                    specimenState = location.stateCode || location.stateName || null;
                    specimenCountry = location.countryCode || location.countryName || null;
                  } catch (locErr) {
                    console.error(`[Validate] Location extraction error for specimen update:`, locErr);
                  }
                  
                  // Update any linked specimens with this observation
                  await db.update(specimens)
                    .set({
                      scientificName: scientificName || undefined,
                      collectorName: collectorsName || obs.user?.name || obs.user?.login || undefined,
                      collectionDate: obs.observed_on || undefined,
                      locality: obs.place_guess || undefined,
                      state: specimenState || undefined,
                      country: specimenCountry || undefined,
                      latitude: obs.geojson?.coordinates?.[1]?.toString() || undefined,
                      longitude: obs.geojson?.coordinates?.[0]?.toString() || undefined,
                      genus: inatBaseName?.split(' ')?.[0] || undefined,
                    })
                    .where(and(
                      eq(specimens.primaryObservationSource, 'inat'),
                      eq(specimens.primaryObservationId, obsId)
                    ));
                    
                } catch (cacheError) {
                  console.error(`[Validate] Cache/specimen update error for obs ${obs.id}:`, cacheError);
                }
              }
            } else {
              console.error(`[Validate] Batch API error: ${response.status}`);
            }
          } catch (e: any) {
            console.error(`[Validate] Batch fetch error: ${e.message}`);
          }
        }
      }

      // Phase 2b: Validate and fetch Mushroom Observer observations
      // MO observation IDs should be 5-6 digits (currently in ~300000-600000 range)
      const moWells = wellsToProcess.filter(w => w.effectivePlatform === 'MO' && w.effectiveObsId);
      
      // Pre-validate MO IDs and mark invalid ones
      for (const moWell of moWells) {
        const digits = moWell.effectiveObsId.replace(/\D/g, '');
        if (digits.length < 5 || digits.length > 6) {
          moWell.validationResult.status = 'invalid_observation';
          moWell.validationResult.message = `Invalid MO ID format: "${moWell.effectiveObsId}" has ${digits.length} digits (expected 5-6). This may be an iNaturalist ID.`;
          moWell.validationResult.apiFetched = false;
        }
      }
      
      // Only fetch valid MO IDs
      const validMoWells = moWells.filter(w => !w.validationResult.status);
      const moObsIds = validMoWells.map(w => w.effectiveObsId.replace(/\D/g, ''));
      
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
            
            // Check both "Voucher Number(s)" and "Voucher Number" (field ID 8257)
            const voucherNumbersField = obs.ofvs?.find((f: any) => f.name === 'Voucher Number(s)');
            const voucherNumberField = obs.ofvs?.find((f: any) => 
              f.name === 'Voucher Number' || f.observation_field_id === 8257
            );
            const inatVoucher = voucherNumbersField?.value || voucherNumberField?.value || null;

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
            const taxonomicGenus = obs.taxon?.ancestors?.find((a: any) => a.rank === "genus")?.name || obs.taxon?.name?.split(' ')[0] || null;
            const isSlimeMold = iconicTaxon === "Protozoa" || 
              taxonomicClass === "Myxomycetes" || 
              obs.taxon?.name?.toLowerCase().includes("myxomycete") ||
              obs.taxon?.ancestors?.some((a: any) => a.name === "Myxomycetes");
            const isFungal = iconicTaxon === "Fungi";
            // Nostoc is a cyanobacteria genus that is acceptable for sequencing
            const isNostoc = taxonomicGenus === "Nostoc" || 
              obs.taxon?.name?.toLowerCase().startsWith("nostoc");
            
            validationResult.isSlimeMold = isSlimeMold;
            validationResult.isFungal = isFungal;
            validationResult.isNostoc = isNostoc;
            
            if (!isFungal && !isSlimeMold && !isNostoc) {
              validationResult.status = 'not_fungal';
              validationResult.message = `Not fungal: ${iconicTaxon || 'Unknown taxon'} - ${obs.taxon?.name || 'Unknown species'}`;
            } else if (well.labCode && inatVoucher && !labCodesMatch(well.labCode, inatVoucher)) {
              validationResult.status = 'mismatch';
              validationResult.message = `Lab code "${well.labCode}" doesn't match iNat voucher "${inatVoucher}"`;
            } else if (inatVoucher) {
              validationResult.status = 'valid';
              validationResult.message = isSlimeMold ? 'Valid (Slime Mold)' : isNostoc ? 'Valid (Nostoc)' : 'Validated successfully';
            } else {
              validationResult.status = 'no_voucher';
              validationResult.message = 'No voucher number in iNaturalist';
            }
          } else {
            validationResult.status = 'error';
            validationResult.message = 'Observation not found in iNaturalist';
          }
        }

        // Process Mushroom Observer observations (skip if already marked invalid)
        if (effectivePlatform === 'MO' && obsId && validationResult.status !== 'invalid_observation') {
          const moObs = moDataMap[obsId];
          
          if (moObs) {
            validationResult.apiFetched = true;
            
            // Extract username from MO API response
            // MO API uses 'user' field (with login_name), falling back to 'owner'
            let moUsername: string | null = null;
            // Try 'user' field first (more common in API v2)
            if (moObs.user) {
              if (typeof moObs.user === 'object') {
                moUsername = moObs.user.login_name || moObs.user.login || moObs.user.name || null;
              } else if (typeof moObs.user === 'string') {
                moUsername = moObs.user;
              }
            }
            // Fallback to 'owner' field
            if (!moUsername && moObs.owner) {
              if (typeof moObs.owner === 'object') {
                moUsername = moObs.owner.login_name || moObs.owner.login || moObs.owner.name || null;
              } else if (typeof moObs.owner === 'string') {
                moUsername = moObs.owner;
              }
            }
            validationResult.username = moUsername;
            validationResult.scientificName = moObs.consensus?.name || moObs.name?.name || null;
            
            // Extract location data from Mushroom Observer
            // Try structured location fields first, then fall back to 'where' string
            let moState: string | null = null;
            let moCountry: string | null = null;
            
            // Check for structured location object
            if (moObs.location) {
              if (typeof moObs.location === 'object') {
                // Structured location - try direct fields
                if (moObs.location.country) {
                  const normalizedCountry = normalizeCountry(moObs.location.country);
                  moCountry = normalizedCountry?.code || moObs.location.country;
                }
                if (moObs.location.state) {
                  const normalizedState = normalizeState(moObs.location.state);
                  moState = normalizedState?.code || moObs.location.state;
                }
                // Fall back to name field if structured fields don't exist
                if (!moCountry && moObs.location.name) {
                  const parts = moObs.location.name.split(',').map((p: string) => p.trim());
                  if (parts.length >= 2) {
                    const normalizedCountry = normalizeCountry(parts[parts.length - 1]);
                    const normalizedState = normalizeState(parts[parts.length - 2]);
                    moCountry = normalizedCountry?.code || parts[parts.length - 1];
                    moState = normalizedState?.code || parts[parts.length - 2];
                  }
                }
              }
            }
            
            // Fall back to 'where' string if no structured data
            if (!moCountry && moObs.where) {
              const moLocationParts = moObs.where.split(',').map((p: string) => p.trim());
              if (moLocationParts.length >= 2) {
                const potentialState = moLocationParts[moLocationParts.length - 2];
                const potentialCountry = moLocationParts[moLocationParts.length - 1];
                
                const normalizedCountry = normalizeCountry(potentialCountry);
                const normalizedState = normalizeState(potentialState);
                
                moCountry = normalizedCountry?.code || potentialCountry || null;
                moState = normalizedState?.code || potentialState || null;
              } else if (moLocationParts.length === 1) {
                const normalizedCountry = normalizeCountry(moLocationParts[0]);
                moCountry = normalizedCountry?.code || moLocationParts[0] || null;
              }
            }
            
            validationResult.country = moCountry;
            validationResult.state = moState;
            
            // MO observations are fungi by default (it's a mycology platform)
            validationResult.isFungal = true;
            validationResult.status = 'valid';
            validationResult.message = 'Validated via Mushroom Observer';
          } else if (!validationResult.status) {
            // Only set error if not already marked (e.g., invalid_observation)
            validationResult.status = 'error';
            validationResult.message = 'Observation not found on Mushroom Observer';
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

  // ============ RUN STATISTICS ============
  
  // Get run statistics (total specimens, top states, top users)
  app.get("/api/admin/runs/:id/stats", isAdmin, async (req: any, res) => {
    try {
      const runId = parseInt(req.params.id);
      
      // Get all plates for this run
      const plates = await db.select().from(labPlates).where(eq(labPlates.runId, runId));
      const plateIds = plates.map(p => p.id);
      
      if (plateIds.length === 0) {
        return res.json({
          totalSpecimens: 0,
          topStates: [],
          allStates: [],
          topUsers: [],
          allUsers: [],
          successRate: null,
          totalFails: null,
        });
      }
      
      // Get all wells for these plates that have observation data
      const wells = await db.select().from(labWells)
        .where(and(
          inArray(labWells.plateId, plateIds),
          or(
            isNotNull(labWells.observationId),
            isNotNull(labWells.specimenId)
          )
        ));
      
      const totalSpecimens = wells.length;
      
      // Aggregate states
      const stateCounts: Record<string, number> = {};
      for (const well of wells) {
        if (well.state) {
          stateCounts[well.state] = (stateCounts[well.state] || 0) + 1;
        }
      }
      const sortedStates = Object.entries(stateCounts)
        .map(([state, count]) => ({ state, count }))
        .sort((a, b) => b.count - a.count);
      
      // Aggregate users
      const userCounts: Record<string, number> = {};
      for (const well of wells) {
        if (well.username) {
          userCounts[well.username] = (userCounts[well.username] || 0) + 1;
        }
      }
      const sortedUsers = Object.entries(userCounts)
        .map(([username, count]) => ({ username, count }))
        .sort((a, b) => b.count - a.count);
      
      // Check for plates with wells missing primers
      const platesWithMissingPrimers: { plateNumber: number; plateName: string | null; wellsWithData: number; wellsMissingPrimers: number }[] = [];
      for (const plate of plates) {
        const plateWells = wells.filter(w => w.plateId === plate.id);
        const wellsWithData = plateWells.filter(w => w.observationId || w.labCode);
        const wellsMissingPrimers = wellsWithData.filter(w => !w.primerPool && (!w.forwardPrimer || !w.reversePrimer));
        
        if (wellsMissingPrimers.length > 0) {
          platesWithMissingPrimers.push({
            plateNumber: plate.plateNumber || 0,
            plateName: plate.name,
            wellsWithData: wellsWithData.length,
            wellsMissingPrimers: wellsMissingPrimers.length,
          });
        }
      }
      
      // Count wells that need specimen records (have observation data but no coreSpecimenId)
      const wellsNeedingRecords = wells.filter(w => 
        (w.observationId || w.labCode) && !w.coreSpecimenId
      ).length;
      
      res.json({
        totalSpecimens,
        specimensNeedingRecords: wellsNeedingRecords,
        topStates: sortedStates.slice(0, 5),
        allStates: sortedStates,
        topUsers: sortedUsers.slice(0, 5),
        allUsers: sortedUsers,
        successRate: null,  // Will be populated when results are linked
        totalFails: null,   // Will be populated when results are linked
        platesWithMissingPrimers,
      });
    } catch (error) {
      console.error("Error fetching run stats:", error);
      res.status(500).json({ error: "Failed to fetch run statistics" });
    }
  });

  // In-memory job registry for specimen generation progress
  const specimenGenerationJobs: Map<string, {
    status: 'running' | 'completed' | 'error';
    total: number;
    processed: number;
    created: number;
    linked: number;
    error?: string;
  }> = new Map();

  // Generate specimen records for wells in a run that don't have them
  app.post("/api/admin/runs/:id/generate-specimens", isAdmin, async (req: any, res) => {
    try {
      const runId = parseInt(req.params.id);
      const userId = req.user?.claims?.sub || req.user?.id || 'admin';
      const jobId = `run-${runId}-${Date.now()}`;
      
      // Get the run info
      const [run] = await db.select().from(labRuns).where(eq(labRuns.id, runId));
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      const runName = run.name || `Run${String(runId).padStart(3, '0')}`;
      
      // Get all plates for this run
      const plates = await db.select().from(labPlates).where(eq(labPlates.runId, runId));
      const plateIds = plates.map(p => p.id);
      
      if (plateIds.length === 0) {
        return res.json({ jobId: null, created: 0, linked: 0, message: "No plates found in this run", status: 'completed' });
      }
      
      // Get wells that have observation data but no coreSpecimenId
      const wells = await db.select().from(labWells)
        .where(and(
          inArray(labWells.plateId, plateIds),
          or(isNotNull(labWells.observationId), isNotNull(labWells.labCode)),
          isNull(labWells.coreSpecimenId)
        ));
      
      if (wells.length === 0) {
        return res.json({ jobId: null, created: 0, linked: 0, message: "All wells already have specimen records", status: 'completed' });
      }
      
      // Create plate lookup map
      const plateMap = new Map(plates.map(p => [p.id, p]));

      // Initialize job tracking
      specimenGenerationJobs.set(jobId, {
        status: 'running',
        total: wells.length,
        processed: 0,
        created: 0,
        linked: 0,
      });

      // Return immediately with jobId
      res.json({ jobId, total: wells.length, status: 'running' });

      // Process in background with batched operations
      setImmediate(async () => {
        const job = specimenGenerationJobs.get(jobId)!;
        const CHUNK_SIZE = 50;
        
        try {
          // Pre-fetch existing specimens by observation ID and lab code for faster lookups
          const observationIds = wells.filter(w => w.observationId).map(w => w.observationId!);
          const labCodes = wells.filter(w => w.labCode).map(w => w.labCode!);
          
          const existingByObsId = new Map<string, number>();
          const existingByLabCode = new Map<string, number>();
          
          if (observationIds.length > 0) {
            const existing = await db.select({ id: specimens.id, obsId: specimens.primaryObservationId })
              .from(specimens)
              .where(inArray(specimens.primaryObservationId, observationIds));
            existing.forEach(s => { if (s.obsId) existingByObsId.set(s.obsId, s.id); });
          }
          
          if (labCodes.length > 0) {
            const existing = await db.select({ id: specimens.id, code: specimens.labCode })
              .from(specimens)
              .where(inArray(specimens.labCode, labCodes));
            existing.forEach(s => { if (s.code) existingByLabCode.set(s.code, s.id); });
          }

          // Process wells in chunks
          for (let i = 0; i < wells.length; i += CHUNK_SIZE) {
            const chunk = wells.slice(i, i + CHUNK_SIZE);
            const wellsToLink: { wellId: number; specimenId: number }[] = [];
            const wellsToCreate: typeof chunk = [];
            
            // Categorize wells
            for (const well of chunk) {
              let existingId = well.observationId ? existingByObsId.get(well.observationId) : undefined;
              if (!existingId && well.labCode) {
                existingId = existingByLabCode.get(well.labCode);
              }
              
              if (existingId) {
                wellsToLink.push({ wellId: well.id, specimenId: existingId });
                job.linked++;
              } else {
                wellsToCreate.push(well);
              }
            }
            
            // Batch link existing specimens
            for (const link of wellsToLink) {
              await db.update(labWells)
                .set({ coreSpecimenId: link.specimenId, updatedAt: new Date() })
                .where(eq(labWells.id, link.wellId));
            }
            
            // Batch create new specimens
            for (const well of wellsToCreate) {
              const platform = well.platform?.toLowerCase().includes('mushroom') ? 'mo' : 'inat';
              const uuid = randomUUID();
              
              // Always generate unique MYCO number for displayCode
              // Lab codes are stored separately in the labCode field and can be duplicated
              const displayCode = await generateUniqueDisplayCode();
              
              const [newSpecimen] = await db.insert(specimens).values({
                uuid,
                displayCode,
                intakeDate: new Date(),
                primaryObservationSource: well.observationId ? platform : null,
                primaryObservationId: well.observationId || null,
                voucherNumber: well.voucherNumber,
                labCode: well.labCode || null, // Store lab code separately (can be duplicated)
                scientificName: null,
                locality: well.state ? `${well.state}, ${well.country || 'USA'}` : null,
                currentStatus: 'pending_accession',
                statusChangedAt: new Date(),
              }).returning();
              
              // Add to lookup maps for future chunks
              if (well.observationId) {
                existingByObsId.set(well.observationId, newSpecimen.id);
                await db.insert(specimenSources).values({
                  specimenId: newSpecimen.id,
                  platform,
                  externalId: well.observationId,
                  isPrimary: true,
                });
              }
              if (well.labCode) {
                existingByLabCode.set(well.labCode, newSpecimen.id);
              }
              
              // Calculate well position number (A01=1, A12=12, B01=13, H12=96)
              const wellPosStr = well.wellPosition || '';
              const rowLetter = wellPosStr.charAt(0).toUpperCase();
              const colNum = parseInt(wellPosStr.substring(1)) || 0;
              const rowNum = rowLetter.charCodeAt(0) - 'A'.charCodeAt(0); // A=0, B=1, etc
              const positionNumber = rowNum * 12 + colNum; // 1-96
              
              const plate = plateMap.get(well.plateId);
              const plateNumber = plate?.plateNumber || 1;
              
              await db.insert(specimenEvents).values({
                specimenId: newSpecimen.id,
                eventType: 'created',
                newValue: `Created from ${runName} (Position ${positionNumber})`,
                notes: JSON.stringify({ runId, runName, wellId: well.id, wellPosition: well.wellPosition, plateId: well.plateId, plateNumber, positionNumber }),
                performedBy: userId,
              });
              
              await db.update(labWells)
                .set({ coreSpecimenId: newSpecimen.id, updatedAt: new Date() })
                .where(eq(labWells.id, well.id));
              
              job.created++;
            }
            
            job.processed += chunk.length;
          }
          
          job.status = 'completed';
        } catch (error: any) {
          console.error("Error in specimen generation job:", error);
          job.status = 'error';
          job.error = error.message || 'Unknown error';
        }
        
        // Clean up job after 5 minutes
        setTimeout(() => specimenGenerationJobs.delete(jobId), 5 * 60 * 1000);
      });
    } catch (error) {
      console.error("Error starting specimen generation:", error);
      res.status(500).json({ error: "Failed to start specimen generation" });
    }
  });

  // Get specimen generation job status
  app.get("/api/admin/runs/:id/generate-specimens/status/:jobId", isAdmin, async (req: any, res) => {
    const jobId = req.params.jobId;
    const job = specimenGenerationJobs.get(jobId);
    
    if (!job) {
      return res.status(404).json({ error: "Job not found or expired" });
    }
    
    res.json({
      status: job.status,
      total: job.total,
      processed: job.processed,
      created: job.created,
      linked: job.linked,
      error: job.error,
      progress: job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0,
    });
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
      const plateIds = plates.map(p => p.id);
      
      // Batch fetch all wells for all plates at once
      const allWells = plateIds.length > 0 
        ? await db.select().from(labWells).where(inArray(labWells.plateId, plateIds)).orderBy(labWells.sortOrder)
        : [];
      
      // Group wells by plate ID
      const wellsByPlateId = new Map<number, typeof allWells>();
      for (const well of allWells) {
        if (!wellsByPlateId.has(well.plateId)) {
          wellsByPlateId.set(well.plateId, []);
        }
        wellsByPlateId.get(well.plateId)!.push(well);
      }
      
      // Batch fetch all index entries for all unique index set IDs
      const allIndexSetIds = new Set<number>();
      for (const plate of plates) {
        if (plate.forwardIndexSetId) allIndexSetIds.add(plate.forwardIndexSetId);
        if (plate.reverseIndexSetId) allIndexSetIds.add(plate.reverseIndexSetId);
      }
      
      const allIndexEntries = allIndexSetIds.size > 0
        ? await db.select().from(indexEntries).where(inArray(indexEntries.indexSetId, Array.from(allIndexSetIds)))
        : [];
      
      // Group index entries by index set ID
      const indexEntriesBySetId = new Map<number, typeof allIndexEntries>();
      for (const entry of allIndexEntries) {
        if (!indexEntriesBySetId.has(entry.indexSetId)) {
          indexEntriesBySetId.set(entry.indexSetId, []);
        }
        indexEntriesBySetId.get(entry.indexSetId)!.push(entry);
      }
      
      // Build allWellsData using the batched data
      const allWellsData: { plate: typeof plates[0], wells: any[], forwardIndexEntries: any[], reverseIndexEntries: any[] }[] = [];
      
      for (const plate of plates) {
        const wells = wellsByPlateId.get(plate.id) || [];
        const forwardIndexEntries = plate.forwardIndexSetId ? (indexEntriesBySetId.get(plate.forwardIndexSetId) || []) : [];
        const reverseIndexEntries = plate.reverseIndexSetId ? (indexEntriesBySetId.get(plate.reverseIndexSetId) || []) : [];
        
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
        
        // For "Single Plate" type indices, the well_position is "plate_N"
        const plateIndexKey = `plate_${plate.plateNumber}`;
        
        for (const well of wells) {
          if (!well.observationId && !well.labCode) continue; // Skip empty wells
          
          // Build SampleID: ONT[PlateNumber].[WellNumber]-[WellPosition]-[LabCode]-[iNat/MO][ObsNumber]
          const plateNum = plate.plateNumber.toString().padStart(2, '0');
          const wellNum = well.sortOrder.toString().padStart(2, '0');
          const wellPos = well.wellPosition;
          
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
          
          // Determine lab code - exclude if empty, "Unknown", or is just the iNat number
          let labCodePart = '';
          if (well.labCode) {
            const rawLabCode = well.labCode.trim();
            // Check if lab code is just the iNat number in various formats
            const isJustInatNum = 
              rawLabCode === obsNum ||
              rawLabCode.toLowerCase().replace(/\s+/g, '') === `inat${obsNum}` ||
              rawLabCode.toLowerCase().startsWith('inat ') && rawLabCode.replace(/\D/g, '') === obsNum ||
              rawLabCode.toLowerCase().startsWith('inat') && rawLabCode.replace(/\D/g, '') === obsNum;
            
            if (!isJustInatNum && rawLabCode.toLowerCase() !== 'unknown') {
              // Remove spaces from lab code
              labCodePart = `-${rawLabCode.replace(/\s+/g, '')}`;
            }
          }
          
          // Build sampleId - only include platform/observation suffix if we have observation data
          const platformSuffix = platformAbbrev && obsNum ? `-${platformAbbrev}${obsNum}` : '';
          let sampleId = `ONT${plateNum}.${wellNum}-${wellPos}${labCodePart}${platformSuffix}`;
          
          // Replace -MOXX- with -MissouriXX- (where XX is any number for state abbreviation, not platform)
          // This matches -MO followed by digits and a dash (state abbreviation in lab code)
          sampleId = sampleId.replace(/-MO(\d+)-/g, '-Missouri$1-');
          
          // Get primer pool name
          const primerPoolName = well.primerPool || plate.defaultForwardPrimer?.split(' ')[0] || 'ITS';
          
          // Get forward index sequence - check well position, then plate index (Single Plate type), then single
          const fwIndex = fwIndexMap.get(well.wellPosition) || fwIndexMap.get(plateIndexKey) || fwIndexMap.get('single') || '';
          
          // Get reverse index sequence - check well position, then plate index (Single Plate type), then single
          const rvIndex = rvIndexMap.get(well.wellPosition) || rvIndexMap.get(plateIndexKey) || rvIndexMap.get('single') || '';
          
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
          // Skip if primer is a pool reference, a wildcard (*), or empty
          if (fwPrimerRaw && !fwIsPool && fwPrimerRaw !== '*') {
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
          // Skip if primer is a pool reference, a wildcard (*), or empty
          if (rvPrimerRaw && !rvIsPool && rvPrimerRaw !== '*') {
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
      
      // Expand primer pools to include all their member primers
      // Collect all unique pool names used in the run
      const usedPoolNames = new Set<string>();
      for (const { wells } of allWellsData) {
        for (const well of wells) {
          if (well.primerPool) {
            usedPoolNames.add(well.primerPool);
          }
        }
      }
      
      // For each pool, add all its member primers
      for (const poolName of usedPoolNames) {
        const pool = primerPoolsMap.get(poolName);
        if (!pool) continue;
        
        // Get forward primers from the pool's forward set
        const fwItems = primerSetItemsMap.get(pool.forwardPrimerSetId) || [];
        for (const item of fwItems) {
          if (!usedPrimers.has(item.label)) {
            if (!item.sequence && !missingSequences.includes(item.label)) {
              missingSequences.push(item.label);
            }
            usedPrimers.set(item.label, { 
              sequence: item.sequence || '', 
              pool: poolName, 
              position: 'forward' 
            });
          }
        }
        
        // Get reverse primers from the pool's reverse set
        const rvItems = primerSetItemsMap.get(pool.reversePrimerSetId) || [];
        for (const item of rvItems) {
          if (!usedPrimers.has(item.label)) {
            if (!item.sequence && !missingSequences.includes(item.label)) {
              missingSequences.push(item.label);
            }
            usedPrimers.set(item.label, { 
              sequence: item.sequence || '', 
              pool: poolName, 
              position: 'reverse' 
            });
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
      const safeRunName = run.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      // Delete existing files for this run (replace with new ones)
      await db.delete(labRunFiles).where(eq(labRunFiles.runId, runId));
      
      // Insert new files
      const filesToCreate = [
        {
          runId,
          fileType: 'index',
          filename: `Index_${safeRunName}_${timestamp}.txt`,
          content: indexLines.join('\n'),
          mimeType: 'text/plain',
        },
        {
          runId,
          fileType: 'primers_fasta',
          filename: `primers_${safeRunName}_${timestamp}.fasta`,
          content: fastaLines.join('\n'),
          mimeType: 'text/plain',
        },
        {
          runId,
          fileType: 'primers_txt',
          filename: `primers_${safeRunName}_${timestamp}.txt`,
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

  // ============ BIOINFORMATICS MANAGEMENT (Global Methods) ============

  // Get all bioinformatics methods (grouped by stage)
  app.get("/api/admin/bioinformatics/methods", isAdmin, async (req: any, res) => {
    try {
      const methods = await db.select()
        .from(bioinformaticsMethods)
        .orderBy(bioinformaticsMethods.stage, bioinformaticsMethods.sortOrder);
      
      // Group by stage
      const grouped: Record<string, typeof methods> = {
        basecalling: [],
        qc_filtering: [],
        qc_reports: [],
        demultiplexing: [],
        consensus_building: [],
      };
      
      for (const method of methods) {
        if (grouped[method.stage]) {
          grouped[method.stage].push(method);
        }
      }
      
      res.json({ methods, grouped });
    } catch (error) {
      console.error("Error fetching bioinformatics methods:", error);
      res.status(500).json({ error: "Failed to fetch bioinformatics methods" });
    }
  });

  // Create a bioinformatics method
  app.post("/api/admin/bioinformatics/methods", isAdmin, async (req: any, res) => {
    try {
      const { stage, name, programName, programVersion, code, description, notes, sortOrder } = req.body;
      
      if (!stage || !name || !code) {
        return res.status(400).json({ error: "Stage, name, and code are required" });
      }
      
      const validStages = ['basecalling', 'qc_filtering', 'qc_reports', 'demultiplexing', 'consensus_building'];
      if (!validStages.includes(stage)) {
        return res.status(400).json({ error: "Invalid stage" });
      }
      
      const [method] = await db.insert(bioinformaticsMethods).values({
        stage: stage as any,
        name,
        programName,
        programVersion,
        code,
        description,
        notes,
        isActive: true,
        sortOrder: sortOrder || 0,
      }).returning();
      
      res.json(method);
    } catch (error) {
      console.error("Error creating bioinformatics method:", error);
      res.status(500).json({ error: "Failed to create bioinformatics method" });
    }
  });

  // Update a bioinformatics method
  app.patch("/api/admin/bioinformatics/methods/:id", isAdmin, async (req: any, res) => {
    try {
      const methodId = parseInt(req.params.id);
      const { name, programName, programVersion, code, description, notes, sortOrder, isActive } = req.body;
      
      const updateData: any = { updatedAt: new Date() };
      if (name !== undefined) updateData.name = name;
      if (programName !== undefined) updateData.programName = programName;
      if (programVersion !== undefined) updateData.programVersion = programVersion;
      if (code !== undefined) updateData.code = code;
      if (description !== undefined) updateData.description = description;
      if (notes !== undefined) updateData.notes = notes;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      if (isActive !== undefined) updateData.isActive = isActive;
      
      const [updated] = await db.update(bioinformaticsMethods)
        .set(updateData)
        .where(eq(bioinformaticsMethods.id, methodId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Method not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating bioinformatics method:", error);
      res.status(500).json({ error: "Failed to update bioinformatics method" });
    }
  });

  // Delete a bioinformatics method
  app.delete("/api/admin/bioinformatics/methods/:id", isAdmin, async (req: any, res) => {
    try {
      const methodId = parseInt(req.params.id);
      await db.delete(bioinformaticsMethods).where(eq(bioinformaticsMethods.id, methodId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting bioinformatics method:", error);
      res.status(500).json({ error: "Failed to delete bioinformatics method" });
    }
  });

  // Legacy: Get bio steps for a run (kept for backwards compatibility)
  app.get("/api/admin/runs/:runId/bioinformatics", isAdmin, async (req: any, res) => {
    try {
      const runId = parseInt(req.params.runId);
      const steps = await db.select()
        .from(labRunBioSteps)
        .where(eq(labRunBioSteps.runId, runId))
        .orderBy(labRunBioSteps.stage, labRunBioSteps.sequence);
      
      const grouped: Record<string, typeof steps> = {
        basecalling: [],
        qc_filtering: [],
        qc_reports: [],
        demultiplexing: [],
        consensus_building: [],
      };
      
      for (const step of steps) {
        if (grouped[step.stage]) {
          grouped[step.stage].push(step);
        }
      }
      
      res.json({ steps, grouped });
    } catch (error) {
      console.error("Error fetching bioinformatics steps:", error);
      res.status(500).json({ error: "Failed to fetch bioinformatics steps" });
    }
  });

  // Get method selections for a run
  app.get("/api/admin/runs/:runId/method-selections", isAdmin, async (req: any, res) => {
    try {
      const runId = parseInt(req.params.runId);
      
      const selections = await db.select({
        id: labRunMethodSelections.id,
        runId: labRunMethodSelections.runId,
        stage: labRunMethodSelections.stage,
        methodId: labRunMethodSelections.methodId,
        methodName: bioinformaticsMethods.name,
        programName: bioinformaticsMethods.programName,
        programVersion: bioinformaticsMethods.programVersion,
        code: bioinformaticsMethods.code,
      })
        .from(labRunMethodSelections)
        .leftJoin(bioinformaticsMethods, eq(labRunMethodSelections.methodId, bioinformaticsMethods.id))
        .where(eq(labRunMethodSelections.runId, runId));
      
      // Group by stage
      const byStage: Record<string, any> = {};
      for (const sel of selections) {
        byStage[sel.stage] = sel;
      }
      
      res.json({ selections, byStage });
    } catch (error) {
      console.error("Error fetching method selections:", error);
      res.status(500).json({ error: "Failed to fetch method selections" });
    }
  });

  // Set method selection for a run stage
  app.post("/api/admin/runs/:runId/method-selections", isAdmin, async (req: any, res) => {
    try {
      const runId = parseInt(req.params.runId);
      const { stage, methodId } = req.body;
      
      if (!stage || !methodId) {
        return res.status(400).json({ error: "stage and methodId are required" });
      }
      
      // Delete existing selection for this run/stage
      await db.delete(labRunMethodSelections)
        .where(and(
          eq(labRunMethodSelections.runId, runId),
          eq(labRunMethodSelections.stage, stage)
        ));
      
      // Insert new selection
      const [selection] = await db.insert(labRunMethodSelections).values({
        runId,
        stage,
        methodId,
      }).returning();
      
      res.json(selection);
    } catch (error) {
      console.error("Error setting method selection:", error);
      res.status(500).json({ error: "Failed to set method selection" });
    }
  });

  // Remove method selection for a run stage
  app.delete("/api/admin/runs/:runId/method-selections/:stage", isAdmin, async (req: any, res) => {
    try {
      const runId = parseInt(req.params.runId);
      const stage = req.params.stage;
      
      await db.delete(labRunMethodSelections)
        .where(and(
          eq(labRunMethodSelections.runId, runId),
          eq(labRunMethodSelections.stage, stage)
        ));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing method selection:", error);
      res.status(500).json({ error: "Failed to remove method selection" });
    }
  });

  // =============================================
  // SPECIMENS API ENDPOINTS
  // =============================================

  // Helper function to generate display codes
  async function generateUniqueDisplayCode(): Promise<string> {
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 10; attempt++) {
      const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
      const code = `MYCO-${year}-${random}`;
      const [existing] = await db.select({ id: specimens.id })
        .from(specimens)
        .where(eq(specimens.displayCode, code))
        .limit(1);
      if (!existing) return code;
    }
    // Fallback with timestamp for uniqueness
    const ts = Date.now().toString(36);
    return `MYCO-${year}-${ts}`;
  }

  // Get all specimens with filtering and search
  app.get("/api/admin/specimens", isAdmin, async (req: any, res) => {
    try {
      const searchTerm = req.query.search?.trim() || '';
      const status = req.query.status && req.query.status !== 'all' ? req.query.status : '';
      // Support both single validationFlag (legacy) and comma-separated validationFlags
      const validationFlagsParam = req.query.validationFlags || req.query.validationFlag || '';
      const validationFlags = validationFlagsParam ? validationFlagsParam.split(',').filter((f: string) => f && f !== 'all') : [];
      const dateFrom = req.query.dateFrom || '';
      const dateTo = req.query.dateTo || '';
      const hasSequence = req.query.hasSequence === 'true';
      const sortField = req.query.sortField || 'displayCode';
      const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      
      // Build conditions
      const conditions: any[] = [];
      
      if (status) {
        conditions.push(eq(specimens.currentStatus, status));
      }
      
      // Validation flag filter - supports multiple flags (OR logic)
      if (validationFlags.length > 0) {
        const flagConditions: any[] = [];
        for (const flag of validationFlags) {
          if (flag === 'has_flag') {
            flagConditions.push(sql`${specimens.inatFieldConflict} IS NOT NULL AND ${specimens.inatFieldConflict} != ''`);
          } else if (flag === 'no_flag') {
            flagConditions.push(sql`(${specimens.inatFieldConflict} IS NULL OR ${specimens.inatFieldConflict} = '')`);
          } else if (flag === 'push_incomplete') {
            // Dynamic flag: iNat records with push incomplete status
            // Condition 1: Has MYCO number but cache missing catalog/name
            // Condition 2: Cache has MYCO in catalog but missing herbarium_name
            flagConditions.push(sql`(
              ${specimens.primaryObservationSource} = 'inat'
              AND (
                (
                  ${specimens.mycoNumber} IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM observation_cache oc 
                    WHERE oc.source = 'inat' 
                      AND oc.source_observation_id = ${specimens.primaryObservationId}
                      AND oc.herbarium_catalog_number LIKE '%' || ${specimens.mycoNumber}::text || '%'
                      AND oc.herbarium_name IS NOT NULL 
                      AND oc.herbarium_name != ''
                  )
                )
                OR EXISTS (
                  SELECT 1 FROM observation_cache oc 
                  WHERE oc.source = 'inat' 
                    AND oc.source_observation_id = ${specimens.primaryObservationId}
                    AND oc.herbarium_catalog_number LIKE '%MYCO%'
                    AND (oc.herbarium_name IS NULL OR oc.herbarium_name = '')
                )
              )
            )`);
          } else if (flag === 'herbarium_catalog_conflict') {
            // Dynamic flag: catalog conflict includes stored conflicts + specimens without MYCO but with catalog data
            // Exclude University of West Alabama Herbarium - their catalog numbers are valid
            flagConditions.push(sql`(
              ${specimens.inatFieldConflict} = 'herbarium_catalog_conflict'
              OR ${specimens.inatFieldConflict} = 'both_conflict'
              OR (
                ${specimens.primaryObservationSource} = 'inat'
                AND ${specimens.mycoNumber} IS NULL
                AND EXISTS (
                  SELECT 1 FROM observation_cache oc 
                  WHERE oc.source = 'inat' 
                    AND oc.source_observation_id = ${specimens.primaryObservationId}
                    AND oc.herbarium_catalog_number IS NOT NULL 
                    AND oc.herbarium_catalog_number != ''
                    AND (oc.herbarium_name IS NULL OR oc.herbarium_name NOT LIKE '%University of West Alabama Herbarium%')
                )
              )
            )`);
          } else {
            flagConditions.push(eq(specimens.inatFieldConflict, flag));
          }
        }
        if (flagConditions.length > 0) {
          conditions.push(or(...flagConditions));
        }
      }
      
      // Date range filter on collection date
      if (dateFrom) {
        conditions.push(sql`${specimens.collectionDate} >= ${dateFrom}::date`);
      }
      if (dateTo) {
        conditions.push(sql`${specimens.collectionDate} <= ${dateTo}::date`);
      }
      
      // Add search filter at database level
      if (searchTerm) {
        const searchPattern = `%${searchTerm}%`;
        conditions.push(
          or(
            sql`${specimens.displayCode} ILIKE ${searchPattern}`,
            sql`${specimens.scientificName} ILIKE ${searchPattern}`,
            sql`${specimens.voucherNumber} ILIKE ${searchPattern}`,
            sql`${specimens.collectorName} ILIKE ${searchPattern}`,
            sql`${specimens.locality} ILIKE ${searchPattern}`,
            sql`${specimens.primaryObservationId} ILIKE ${searchPattern}`,
            sql`${specimens.labCode} ILIKE ${searchPattern}`,
            sql`EXISTS (SELECT 1 FROM observation_cache oc WHERE oc.source = ${specimens.primaryObservationSource}::text AND oc.source_observation_id = ${specimens.primaryObservationId} AND oc.observer_username ILIKE ${searchPattern})`,
            sql`EXISTS (SELECT 1 FROM observation_cache oc WHERE oc.source = ${specimens.primaryObservationSource}::text AND oc.source_observation_id = ${specimens.primaryObservationId} AND oc.herbarium_catalog_number ILIKE ${searchPattern})`
          )
        );
      }
      
      // Has sequence filter - join with observation_cache to check for DNA barcode
      if (hasSequence) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM observation_cache oc 
            WHERE oc.source = 'inat' 
              AND oc.source_observation_id = ${specimens.primaryObservationId}
              AND oc.dna_barcode_its IS NOT NULL 
              AND oc.dna_barcode_its != ''
          )`
        );
      }
      
      // Build dynamic order by clause based on sortField and sortOrder
      const validSortFields: Record<string, any> = {
        displayCode: specimens.displayCode,
        scientificName: specimens.scientificName,
        currentStatus: specimens.currentStatus,
        collectionDate: specimens.collectionDate,
        locality: specimens.locality,
        primaryObservationId: specimens.primaryObservationId,
      };
      
      const sortColumn = validSortFields[sortField] || specimens.displayCode;
      const orderByClause = sortOrder === 'desc' 
        ? sql`${sortColumn} DESC NULLS LAST`
        : sql`${sortColumn} ASC NULLS LAST`;
      
      let allSpecimens;
      if (conditions.length > 0) {
        allSpecimens = await db.select().from(specimens)
          .where(and(...conditions))
          .orderBy(orderByClause)
          .limit(limit)
          .offset(offset);
      } else {
        allSpecimens = await db.select().from(specimens)
          .orderBy(orderByClause)
          .limit(limit)
          .offset(offset);
      }
      
      // Get observation cache data for dynamic flag computation
      const obsIds = allSpecimens.filter(s => s.primaryObservationId).map(s => s.primaryObservationId!);
      const cacheData = obsIds.length > 0 
        ? await db.select({
            sourceObservationId: observationCache.sourceObservationId,
            herbariumCatalogNumber: observationCache.herbariumCatalogNumber,
            herbariumName: observationCache.herbariumName,
          }).from(observationCache).where(inArray(observationCache.sourceObservationId, obsIds))
        : [];
      const cacheMap = new Map(cacheData.map(c => [c.sourceObservationId, c]));
      
      // Compute dynamic flags for each specimen - can have multiple flags
      const specimensWithFlags = allSpecimens.map(spec => {
        const flags: string[] = [];
        const storedFlag = spec.inatFieldConflict;
        const cache = spec.primaryObservationId ? cacheMap.get(spec.primaryObservationId) : null;
        
        // Add stored flag first (duplicate_inat should be on top)
        if (storedFlag === 'duplicate_inat') {
          flags.push('duplicate_inat');
        }
        
        // Compute push_incomplete dynamically - ONLY for iNat records
        // Skip for removed observations - nothing to push to
        let hasPushIncomplete = false;
        const isInatRecord = spec.primaryObservationSource === 'inat';
        const isRemovedObservation = spec.scientificName === 'Removed' || spec.locality === 'Removed';
        
        if (isInatRecord && cache && !isRemovedObservation) {
          const herbariumCatalog = cache.herbariumCatalogNumber || '';
          const herbariumName = cache.herbariumName || '';
          const mycoNum = spec.mycoNumber;
          // University of West Alabama Herbarium is a valid alternative herbarium
          const isWestAlabamaHerbarium = herbariumName.includes('University of West Alabama Herbarium');
          
          // Check if has MYCO number but catalog doesn't contain it
          if (mycoNum && (!herbariumCatalog || !herbariumCatalog.includes(String(mycoNum)))) {
            hasPushIncomplete = true;
          }
          // Check if has MYCO in catalog but missing herbarium name (unless West Alabama Herbarium)
          else if (herbariumCatalog.includes('MYCO') && !herbariumName && !isWestAlabamaHerbarium) {
            hasPushIncomplete = true;
          }
        } else if (isInatRecord && spec.mycoNumber && spec.primaryObservationId && !isRemovedObservation) {
          // Has MYCO number but no cache data - definitely push incomplete
          hasPushIncomplete = true;
        }
        
        if (hasPushIncomplete) {
          flags.push('push_incomplete');
        }
        
        // Add other stored flags if not already handled
        if (storedFlag && storedFlag !== 'duplicate_inat' && storedFlag !== 'push_incomplete') {
          if (!flags.includes(storedFlag)) {
            flags.push(storedFlag);
          }
        }
        
        // Return combined flags as comma-separated or the primary flag for backward compatibility
        const combinedFlag = flags.length > 0 ? flags.join(',') : null;
        return { ...spec, inatFieldConflict: combinedFlag, validationFlags: flags };
      });
      
      // Get total count with same filters
      let countQuery;
      if (conditions.length > 0) {
        [countQuery] = await db.select({ count: sql`count(*)` }).from(specimens).where(and(...conditions));
      } else {
        [countQuery] = await db.select({ count: sql`count(*)` }).from(specimens);
      }
      const total = Number(countQuery?.count || 0);
      
      res.json({
        specimens: specimensWithFlags,
        total,
        limit,
        offset,
      });
    } catch (error) {
      console.error("Error fetching specimens:", error);
      res.status(500).json({ error: "Failed to fetch specimens" });
    }
  });

  // Get specimen statistics (must be before :id route)
  app.get("/api/admin/specimens/stats", isAdmin, async (req: any, res) => {
    try {
      const statusCounts = await db.select({
        status: specimens.currentStatus,
        count: sql`count(*)`,
      })
        .from(specimens)
        .groupBy(specimens.currentStatus);
      
      const [totalResult] = await db.select({ count: sql`count(*)` }).from(specimens);
      
      // Count specimens with MYCO accession numbers (display_code starts with 'MYCO-')
      const [accessionedResult] = await db.select({ count: sql`count(*)` })
        .from(specimens)
        .where(sql`${specimens.displayCode} LIKE 'MYCO-%'`);
      
      // Count specimens ready for accession: have DNA barcode ITS but no MYCO number
      const readyForAccessionQuery = await db.execute(sql`
        SELECT count(*) as count FROM specimens s
        INNER JOIN observation_cache oc ON oc.source = s.primary_observation_source::text 
          AND oc.source_observation_id = s.primary_observation_id
        WHERE oc.dna_barcode_its IS NOT NULL 
          AND oc.dna_barcode_its != '' 
          AND (s.display_code IS NULL OR s.display_code NOT LIKE 'MYCO-%')
      `);
      const readyForAccessionResult = { count: readyForAccessionQuery.rows[0]?.count || 0 };
      
      // Count specimens with check_specimen flag
      const [checkSpecimenFlagResult] = await db.select({ count: sql`count(*)` })
        .from(specimens)
        .where(sql`${specimens.inatFieldConflict} = 'check_specimen'`);
      
      // Count specimens with metadata flag
      const [metadataFlagResult] = await db.select({ count: sql`count(*)` })
        .from(specimens)
        .where(sql`${specimens.inatFieldConflict} = 'metadata'`);
      
      // Count specimens with other flags (not check_specimen and not metadata)
      const [otherFlagResult] = await db.select({ count: sql`count(*)` })
        .from(specimens)
        .where(sql`${specimens.inatFieldConflict} IS NOT NULL AND ${specimens.inatFieldConflict} != '' AND ${specimens.inatFieldConflict} != 'check_specimen' AND ${specimens.inatFieldConflict} != 'metadata'`);
      
      // Count dynamic push_incomplete: MYCO number exists but herbarium catalog doesn't contain it, or has MYCO catalog but no herbarium name
      // Exclude removed observations and specimens with University of West Alabama Herbarium (valid alternative)
      const pushIncompleteQuery = await db.execute(sql`
        SELECT count(*) as count FROM specimens s
        LEFT JOIN observation_cache oc ON oc.source_observation_id = s.primary_observation_id 
          AND oc.source = s.primary_observation_source::text
        WHERE s.scientific_name != 'Removed' AND s.locality != 'Removed' AND (
          (s.myco_number IS NOT NULL AND (
            oc.herbarium_catalog_number IS NULL 
            OR oc.herbarium_catalog_number = ''
            OR oc.herbarium_catalog_number NOT LIKE '%' || s.myco_number::text || '%'
          ))
          OR (
            oc.herbarium_catalog_number IS NOT NULL 
            AND oc.herbarium_catalog_number LIKE '%MYCO%'
            AND (oc.herbarium_name IS NULL OR oc.herbarium_name = '')
            AND (oc.herbarium_name IS NULL OR oc.herbarium_name NOT LIKE '%University of West Alabama Herbarium%')
          )
        )
      `);
      const dynamicPushIncompleteResult = { count: pushIncompleteQuery.rows[0]?.count || 0 };
      
      res.json({
        total: Number(totalResult?.count || 0),
        accessioned: Number(accessionedResult?.count || 0),
        readyForAccession: Number(readyForAccessionResult?.count || 0),
        checkSpecimenFlag: Number(checkSpecimenFlagResult?.count || 0),
        metadataFlag: Number(metadataFlagResult?.count || 0),
        otherFlag: Number(otherFlagResult?.count || 0),
        pushIncomplete: Number(dynamicPushIncompleteResult?.count || 0),
        byStatus: statusCounts.reduce((acc, row) => {
          acc[row.status] = Number(row.count);
          return acc;
        }, {} as Record<string, number>),
      });
    } catch (error) {
      console.error("Error fetching specimen stats:", error);
      res.status(500).json({ error: "Failed to fetch specimen stats" });
    }
  });

  // Get single specimen with sources and events
  app.get("/api/admin/specimens/:id", isAdmin, async (req: any, res) => {
    try {
      const specimenId = parseInt(req.params.id);
      
      const [specimen] = await db.select().from(specimens).where(eq(specimens.id, specimenId));
      
      if (!specimen) {
        return res.status(404).json({ error: "Specimen not found" });
      }
      
      // Get sources
      const sources = await db.select().from(specimenSources)
        .where(eq(specimenSources.specimenId, specimenId));
      
      // Get events (most recent first)
      const events = await db.select({
        id: specimenEvents.id,
        eventType: specimenEvents.eventType,
        previousValue: specimenEvents.previousValue,
        newValue: specimenEvents.newValue,
        notes: specimenEvents.notes,
        performedBy: specimenEvents.performedBy,
        performedAt: specimenEvents.performedAt,
        performedByName: users.firstName,
      })
        .from(specimenEvents)
        .leftJoin(users, eq(specimenEvents.performedBy, users.id))
        .where(eq(specimenEvents.specimenId, specimenId))
        .orderBy(desc(specimenEvents.performedAt))
        .limit(50);
      
      // Get observation cache data if linked
      let observationData = null;
      let photos: any[] = [];
      
      if (specimen.primaryObservationSource && specimen.primaryObservationId) {
        const sourceMap: Record<string, string> = { inat: 'inat', mo: 'mo', mycoportal: 'mycoportal' };
        const cacheSource = sourceMap[specimen.primaryObservationSource] || specimen.primaryObservationSource;
        
        const [cache] = await db.select().from(observationCache)
          .where(and(
            eq(observationCache.source, cacheSource as any),
            eq(observationCache.sourceObservationId, specimen.primaryObservationId)
          ))
          .limit(1);
        
        if (cache) {
          observationData = {
            sourceUuid: cache.sourceUuid,
            commonName: cache.commonName,
            observerName: cache.observerName,
            observerUsername: cache.observerUsername,
            qualityGrade: cache.qualityGrade,
            voucherNumber: cache.voucherNumber,
            voucherNumberMultiple: cache.voucherNumberMultiple,
            provisionalSpeciesName: cache.provisionalSpeciesName,
            speciesNameOverride: cache.speciesNameOverride,
            collectorsName: cache.collectorsName,
            herbariumName: cache.herbariumName,
            herbariumCatalogNumber: cache.herbariumCatalogNumber,
            genbankAccession: cache.genbankAccession,
            genbankNumberUrl: cache.genbankNumberUrl,
            mycomapBlastResults: cache.mycomapBlastResults,
            traceFiles: cache.traceFiles,
            dnaBarcodIts: cache.dnaBarcodIts,
            readsInConsensus: cache.readsInConsensus,
            coordinatesObscured: cache.coordinatesObscured,
            lastSyncedAt: cache.lastSyncedAt,
          };
          
          // Get photos from observation_media
          photos = await db.select({
            id: observationMedia.id,
            thumbnailUrl: observationMedia.thumbnailUrl,
            mediumUrl: observationMedia.mediumUrl,
            largeUrl: observationMedia.largeUrl,
            originalUrl: observationMedia.originalUrl,
            attribution: observationMedia.attribution,
          })
            .from(observationMedia)
            .where(eq(observationMedia.observationCacheId, cache.id))
            .orderBy(observationMedia.sortOrder);
        }
      }
      
      // Compute dynamic validation flags - can have multiple
      const validationFlags: string[] = [];
      const storedFlag = specimen.inatFieldConflict;
      
      // Add stored flag first (duplicate_inat should be on top)
      if (storedFlag === 'duplicate_inat') {
        validationFlags.push('duplicate_inat');
      }
      
      // Compute push_incomplete dynamically - ONLY for iNat records
      let hasPushIncomplete = false;
      const isInatRecord = specimen.primaryObservationSource === 'inat';
      
      if (isInatRecord && observationData) {
        const herbariumCatalog = observationData.herbariumCatalogNumber || '';
        const herbariumName = observationData.herbariumName || '';
        const mycoNum = specimen.mycoNumber;
        // University of West Alabama Herbarium is a valid alternative herbarium
        const isWestAlabamaHerbarium = herbariumName.includes('University of West Alabama Herbarium');
        
        // Check if has MYCO number but catalog doesn't contain it
        if (mycoNum && (!herbariumCatalog || !herbariumCatalog.includes(String(mycoNum)))) {
          hasPushIncomplete = true;
        }
        // Check if has MYCO in catalog but missing herbarium name (unless West Alabama Herbarium)
        else if (herbariumCatalog.includes('MYCO') && !herbariumName && !isWestAlabamaHerbarium) {
          hasPushIncomplete = true;
        }
      } else if (isInatRecord && specimen.mycoNumber && specimen.primaryObservationId) {
        // Has MYCO number but no cache data - definitely push incomplete
        hasPushIncomplete = true;
      }
      
      if (hasPushIncomplete) {
        validationFlags.push('push_incomplete');
      }
      
      // Add other stored flags if not already handled
      if (storedFlag && storedFlag !== 'duplicate_inat' && storedFlag !== 'push_incomplete') {
        if (!validationFlags.includes(storedFlag)) {
          validationFlags.push(storedFlag);
        }
      }
      
      const combinedFlag = validationFlags.length > 0 ? validationFlags.join(',') : null;
      res.json({ ...specimen, inatFieldConflict: combinedFlag, validationFlags, sources, events, observationData, photos });
    } catch (error) {
      console.error("Error fetching specimen:", error);
      res.status(500).json({ error: "Failed to fetch specimen" });
    }
  });

  // Refresh a specimen from its linked observation
  app.post("/api/admin/specimens/:id/refresh", isAdmin, async (req: any, res) => {
    try {
      const specimenId = parseInt(req.params.id);
      
      const [specimen] = await db.select().from(specimens).where(eq(specimens.id, specimenId));
      
      if (!specimen) {
        return res.status(404).json({ error: "Specimen not found" });
      }
      
      if (!specimen.primaryObservationId || specimen.primaryObservationSource !== 'inat') {
        return res.status(400).json({ error: "Specimen has no iNaturalist observation linked" });
      }
      
      // Fetch fresh data from iNaturalist API
      const inatUrl = `https://api.inaturalist.org/v1/observations/${specimen.primaryObservationId}`;
      const response = await fetch(inatUrl);
      
      if (!response.ok) {
        // Differentiate between "not found" (404) and temporary errors (5xx, etc.)
        if (response.status === 404) {
          // 404 = Observation was deleted from iNaturalist
          // Set key fields to "Removed" and clear any validation flag
          await db.update(specimens)
            .set({ 
              scientificName: 'Removed',
              locality: 'Removed', 
              collectorName: 'Removed',
              inatFieldConflict: null 
            })
            .where(eq(specimens.id, specimenId));
          return res.json({ 
            success: true,
            message: "Observation was deleted from iNaturalist - specimen marked as Removed"
          });
        } else if (response.status === 403) {
          // 403 = Access denied (different owner's private observation)
          return res.status(403).json({ 
            error: "Access denied - observation may be private and owned by another user"
          });
        } else {
          // 5xx or other errors = temporary API failure, don't flag
          return res.status(502).json({ 
            error: `iNaturalist API error (HTTP ${response.status}) - try again later`
          });
        }
      }
      
      const data = await response.json();
      
      if (!data.results || data.results.length === 0) {
        // Observation no longer exists - set key fields to "Removed"
        await db.update(specimens)
          .set({ 
            scientificName: 'Removed',
            locality: 'Removed', 
            collectorName: 'Removed',
            inatFieldConflict: null 
          })
          .where(eq(specimens.id, specimenId));
        return res.json({ 
          success: true,
          message: "Observation no longer exists on iNaturalist - specimen marked as Removed"
        });
      }
      
      const obs = data.results[0];
      
      // Extract observation fields
      const observationFields = obs.ofvs || [];
      const getField = (fieldId: number) => observationFields.find((f: any) => f.field_id === fieldId)?.value || null;
      
      // iNaturalist observation field IDs
      const voucherNumber = getField(8257); // Voucher Number
      const voucherNumberMultiple = getField(2863); // Voucher Number(s)
      const herbariumName = getField(9539); // Herbarium Name
      const herbariumCatalogNumber = getField(9540); // Herbarium Catalog Number  
      const genbankAccession = getField(7555); // GenBank Accession Number
      const genbankNumberUrl = getField(4191); // GenBank Number (URL)
      const provisionalSpeciesName = getField(10675); // Provisional Species Name
      const mycomapBlastResults = getField(9864); // MycoMap BLAST Results
      const traceFiles = getField(10109); // Trace Files (Raw DNA Data)
      const dnaBarcodIts = getField(2330); // DNA Barcode ITS
      const readsInConsensus = getField(16718); // Reads in Consensus (Ric)
      const speciesNameOverride = getField(20259); // Species Name Override
      const collectorsName = getField(9051); // Collector's Name
      
      // Update or create observation cache entry
      const cacheData = {
        source: 'inat' as const,
        sourceObservationId: specimen.primaryObservationId,
        sourceUuid: obs.uuid || null,
        scientificName: obs.taxon?.name || obs.species_guess || null,
        commonName: obs.taxon?.preferred_common_name || null,
        family: obs.taxon?.ancestry?.split('/')?.slice(-2, -1)?.[0] || null,
        genus: obs.taxon?.name?.split(' ')?.[0] || null,
        species: obs.taxon?.name?.split(' ')?.[1] || null,
        taxonRank: obs.taxon?.rank || null,
        observerName: obs.user?.name || null,
        observerUsername: obs.user?.login || null,
        observerId: obs.user?.id?.toString() || null,
        latitude: obs.geojson?.coordinates?.[1]?.toString() || null,
        longitude: obs.geojson?.coordinates?.[0]?.toString() || null,
        coordinatesObscured: obs.obscured || false,
        geoprivacy: obs.geoprivacy || null,
        taxonGeoprivacy: obs.taxon_geoprivacy || null,
        positionalAccuracy: obs.positional_accuracy || null,
        placeGuess: obs.geoprivacy === 'private' ? 'Private' : (obs.place_guess || null),
        locality: obs.geoprivacy === 'private' ? 'Private' : (obs.place_guess || null),
        observedOn: obs.observed_on || null,
        observedOnString: obs.observed_on_string || null,
        qualityGrade: obs.quality_grade || null,
        identificationCount: obs.identifications_count || 0,
        captive: obs.captive || false,
        licenseCode: obs.license_code || null,
        voucherNumber,
        voucherNumberMultiple,
        herbariumName,
        herbariumCatalogNumber,
        genbankAccession,
        genbankNumberUrl,
        provisionalSpeciesName,
        mycomapBlastResults,
        traceFiles,
        dnaBarcodIts,
        readsInConsensus,
        speciesNameOverride,
        collectorsName,
        apiResponseJson: JSON.stringify(data),
        lastSyncedAt: new Date(),
        syncStatus: 'success',
        updatedAt: new Date(),
      };
      
      // Upsert into observation_cache
      const existingCache = await db.select().from(observationCache)
        .where(and(
          eq(observationCache.source, 'inat'),
          eq(observationCache.sourceObservationId, specimen.primaryObservationId)
        ))
        .limit(1);
      
      let cacheId: number;
      if (existingCache.length > 0) {
        cacheId = existingCache[0].id;
        console.log(`[iNat Refresh] Updating cache ID ${cacheId} for observation ${specimen.primaryObservationId}, observer: ${cacheData.observerName || 'null'}`);
        await db.update(observationCache)
          .set(cacheData)
          .where(eq(observationCache.id, cacheId));
      } else {
        const [inserted] = await db.insert(observationCache).values({
          ...cacheData,
          createdAt: new Date(),
        }).returning({ id: observationCache.id });
        cacheId = inserted.id;
      }
      
      // Store photos in observation_media
      if (obs.photos && obs.photos.length > 0) {
        // Delete existing photos for this cache entry
        await db.delete(observationMedia).where(eq(observationMedia.observationCacheId, cacheId));
        
        // Insert new photos
        for (let photoIdx = 0; photoIdx < obs.photos.length; photoIdx++) {
          const photo = obs.photos[photoIdx];
          await db.insert(observationMedia).values({
            observationCacheId: cacheId,
            mediaType: 'photo',
            url: photo.url || '',
            thumbnailUrl: photo.url?.replace('/square.', '/thumb.') || photo.url || null,
            mediumUrl: photo.url?.replace('/square.', '/medium.') || null,
            largeUrl: photo.url?.replace('/square.', '/large.') || null,
            originalUrl: photo.url?.replace('/square.', '/original.') || null,
            licenseCode: photo.license_code || null,
            attribution: photo.attribution || null,
            sortOrder: photoIdx,
          });
        }
      }
      
      // Update specimen with data from observation
      const inatBaseName = obs.taxon?.name || obs.species_guess || null;
      
      // Extract state and country from observation
      let specimenState: string | null = null;
      let specimenCountry: string | null = null;
      try {
        const location = await extractLocationFromObservation(obs);
        specimenState = location.stateCode || location.stateName || null;
        specimenCountry = location.countryCode || location.countryName || null;
      } catch (locErr) {
        console.error("[Refresh] Location extraction error:", locErr);
      }
      
      const specimenUpdate: any = {
        scientificName: getInatScientificName(inatBaseName, provisionalSpeciesName, speciesNameOverride) || specimen.scientificName,
        collectorName: collectorsName || obs.user?.name || obs.user?.login || specimen.collectorName,
        collectionDate: obs.observed_on || specimen.collectionDate,
        locality: obs.geoprivacy === 'private' ? 'Private' : (obs.place_guess || specimen.locality),
        state: specimenState || specimen.state,
        country: specimenCountry || specimen.country,
        latitude: obs.geojson?.coordinates?.[1]?.toString() || specimen.latitude,
        longitude: obs.geojson?.coordinates?.[0]?.toString() || specimen.longitude,
        voucherNumber: voucherNumber || voucherNumberMultiple || specimen.voucherNumber,
      };
      
      // Auto-update status to 'sequenced' if DNA barcode is now present
      if (dnaBarcodIts && specimen.currentStatus !== 'sequenced') {
        specimenUpdate.currentStatus = 'sequenced';
      }
      
      // Extract genus and family if available
      if (obs.taxon?.name) {
        specimenUpdate.genus = obs.taxon.name.split(' ')[0];
      }
      
      await db.update(specimens)
        .set(specimenUpdate)
        .where(eq(specimens.id, specimenId));
      
      // TWO-WAY SYNC: Push MYCO data to iNaturalist if conditions are met
      // CRITICAL: Only push if specimen has a valid MYCO number - never use displayCode/voucherNumber
      let inatPushResult: { 
        pushed: boolean; 
        herbariumNamePushed?: boolean;
        herbariumCatalogPushed?: boolean;
        conflict?: string;
      } = { pushed: false };
      
      // Only use actual MYCO number - never fallback to displayCode or voucherNumber
      const hasValidMycoNumber = specimen.mycoNumber != null;
      const mycoAccession = hasValidMycoNumber ? `MYCO-${specimen.mycoNumber}` : null;
      console.log(`[iNat Push] Checking push for ${specimen.primaryObservationId}: mycoNumber=${specimen.mycoNumber}, mycoAccession=${mycoAccession}, hasToken=${!!process.env.INATURALIST_API_TOKEN}`);
      if (mycoAccession && process.env.INATURALIST_API_TOKEN) {
        const conflicts: string[] = [];
        const pushUpdates: { field_id: number; value: string }[] = [];
        
        // Get existing ofvs IDs for updating existing fields
        const existingOfvs = obs.ofvs || [];
        const getOfvId = (fieldId: number) => existingOfvs.find((f: any) => f.field_id === fieldId)?.id || null;
        
        // Check Herbarium Catalog Number (field 9540)
        const currentCatalogNumber = herbariumCatalogNumber;
        if (!currentCatalogNumber || currentCatalogNumber.trim() === '') {
          // Blank - push MYCO accession
          pushUpdates.push({ field_id: 9540, value: mycoAccession });
        } else if (currentCatalogNumber.includes(mycoAccession)) {
          // Already contains proper mycoAccession, no update needed
        } else if (currentCatalogNumber.toLowerCase().includes('myco')) {
          // Contains MYCO but wrong format - update to proper format
          const mycoMatch = currentCatalogNumber.match(/MYCO[-\s]*(\d+)/i);
          if (mycoMatch) {
            const fullMatch = mycoMatch[0];
            const matchIndex = currentCatalogNumber.indexOf(fullMatch);
            const afterMyco = currentCatalogNumber.substring(matchIndex + fullMatch.length);
            const newValue = mycoAccession + afterMyco;
            pushUpdates.push({ field_id: 9540, value: newValue });
          }
        } else {
          // Has data but NO MYCO - append our MYCO accession (e.g., "TENN-F-078927; MYCO-1004770")
          const appendedValue = `${currentCatalogNumber.trim()}; ${mycoAccession}`;
          pushUpdates.push({ field_id: 9540, value: appendedValue });
        }
        
        // Check Herbarium Name (field 9539)
        // Skip if already "University of West Alabama Herbarium" - this is a valid alternative herbarium
        const currentHerbariumName = herbariumName;
        const isWestAlabamaHerbarium = currentHerbariumName && currentHerbariumName.includes('University of West Alabama Herbarium');
        if (isWestAlabamaHerbarium) {
          // Valid alternative herbarium - no update needed
        } else if (!currentHerbariumName || currentHerbariumName.trim() === '') {
          // Blank - push MYCO
          pushUpdates.push({ field_id: 9539, value: 'MYCO' });
        } else if (currentHerbariumName.toUpperCase().includes('MYCO')) {
          // Already contains MYCO, no update needed
        } else {
          // Has different data - append MYCO
          const appendedName = `${currentHerbariumName.trim()}; MYCO`;
          pushUpdates.push({ field_id: 9539, value: appendedName });
        }
        
        // Push updates to iNaturalist if we have any
        if (pushUpdates.length > 0) {
          const inatToken = process.env.INATURALIST_API_TOKEN;
          
          for (const update of pushUpdates) {
            try {
              const existingOfvId = getOfvId(update.field_id);
              
              if (existingOfvId) {
                // Update existing observation field value
                const putResponse = await fetch(`https://api.inaturalist.org/v1/observation_field_values/${existingOfvId}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${inatToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    observation_field_value: {
                      value: update.value
                    }
                  }),
                });
                
                if (putResponse.ok) {
                  inatPushResult.pushed = true;
                  if (update.field_id === 9539) inatPushResult.herbariumNamePushed = true;
                  if (update.field_id === 9540) inatPushResult.herbariumCatalogPushed = true;
                  console.log(`[iNat Push] Updated field ${update.field_id} for observation ${specimen.primaryObservationId}`);
                } else {
                  const errorBody = await putResponse.text();
                  console.error(`[iNat Push] Failed to update field ${update.field_id}: ${putResponse.status} - ${errorBody}`);
                }
              } else {
                // Create new observation field value
                const postResponse = await fetch('https://api.inaturalist.org/v1/observation_field_values', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${inatToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    observation_field_value: {
                      observation_id: parseInt(specimen.primaryObservationId),
                      observation_field_id: update.field_id,
                      value: update.value
                    }
                  }),
                });
                
                if (postResponse.ok) {
                  inatPushResult.pushed = true;
                  if (update.field_id === 9539) inatPushResult.herbariumNamePushed = true;
                  if (update.field_id === 9540) inatPushResult.herbariumCatalogPushed = true;
                  console.log(`[iNat Push] Created field ${update.field_id} for observation ${specimen.primaryObservationId}`);
                } else {
                  const errorBody = await postResponse.text();
                  console.error(`[iNat Push] Failed to create field ${update.field_id}: ${postResponse.status} - ${errorBody}`);
                }
              }
            } catch (pushError) {
              console.error(`[iNat Push] Error pushing field ${update.field_id}:`, pushError);
            }
          }
        }
        
        // Update specimen with conflict status if any
        if (conflicts.length > 0) {
          const conflictValue = conflicts.length === 2 ? 'both_conflict' : conflicts[0];
          inatPushResult.conflict = conflictValue;
          await db.update(specimens)
            .set({ inatFieldConflict: conflictValue })
            .where(eq(specimens.id, specimenId));
        } else {
          // Check for missing metadata (location, collector, scientific name, or collection date)
          // Skip this check for private observations - they legitimately have no location
          // Skip this check for "Removed" specimens - deleted observations don't need metadata
          const isPrivateLocation = obs.geoprivacy === 'private';
          const finalScientificName = specimenUpdate.scientificName || specimen.scientificName;
          const finalCollectorName = specimenUpdate.collectorName || specimen.collectorName;
          const finalCollectionDate = specimenUpdate.collectionDate || specimen.collectionDate;
          const finalState = specimenUpdate.state || specimen.state;
          const finalCountry = specimenUpdate.country || specimen.country;
          const finalLocality = specimenUpdate.locality || specimen.locality;
          const hasLocation = isPrivateLocation || finalLocality || finalState || finalCountry;
          
          // Specimens marked as "Removed" should never get metadata flags
          const isRemovedSpecimen = finalScientificName === 'Removed' || finalCollectorName === 'Removed';
          const missingMetadata = !isRemovedSpecimen && (!finalScientificName || !finalCollectorName || !finalCollectionDate || !hasLocation);
          
          if (missingMetadata) {
            await db.update(specimens)
              .set({ inatFieldConflict: 'metadata' })
              .where(eq(specimens.id, specimenId));
          } else {
            // Clear any previous conflict - either we pushed successfully or data already matches
            await db.update(specimens)
              .set({ inatFieldConflict: null })
              .where(eq(specimens.id, specimenId));
          }
        }
        
        // Update observation cache with the pushed values so local data reflects iNat
        if (inatPushResult.pushed) {
          const cacheUpdates: any = {};
          if (inatPushResult.herbariumCatalogPushed) {
            // Get the value we pushed
            const catalogPush = pushUpdates.find(u => u.field_id === 9540);
            if (catalogPush) {
              cacheUpdates.herbariumCatalogNumber = catalogPush.value;
            }
          }
          if (inatPushResult.herbariumNamePushed) {
            // Get the actual value we pushed (could be 'MYCO' or 'Existing Name; MYCO')
            const namePush = pushUpdates.find(u => u.field_id === 9539);
            if (namePush) {
              cacheUpdates.herbariumName = namePush.value;
            }
          }
          
          if (Object.keys(cacheUpdates).length > 0) {
            await db.update(observationCache)
              .set(cacheUpdates)
              .where(and(
                eq(observationCache.source, 'inat'),
                eq(observationCache.sourceObservationId, specimen.primaryObservationId)
              ));
          }
        }
      } else {
        // No MYCO number - check if existing flags should be cleared
        const currentFlag = specimen.inatFieldConflict;
        
        if (currentFlag === 'metadata') {
          // Check if metadata is now complete after the update
          const finalScientificName = specimenUpdate.scientificName || specimen.scientificName;
          const finalCollectorName = specimenUpdate.collectorName || specimen.collectorName;
          const finalCollectionDate = specimenUpdate.collectionDate || specimen.collectionDate;
          const finalState = specimenUpdate.state || specimen.state;
          const finalCountry = specimenUpdate.country || specimen.country;
          const finalLocality = specimenUpdate.locality || specimen.locality;
          const hasLocation = finalLocality || finalState || finalCountry;
          
          // Specimens marked as "Removed" should have their metadata flag cleared
          const isRemovedSpecimen = finalScientificName === 'Removed' || finalCollectorName === 'Removed';
          const missingMetadata = !isRemovedSpecimen && (!finalScientificName || !finalCollectorName || !finalCollectionDate || !hasLocation);
          
          if (!missingMetadata) {
            // Metadata is now complete - clear the flag
            await db.update(specimens)
              .set({ inatFieldConflict: null })
              .where(eq(specimens.id, specimenId));
            console.log(`[iNat Refresh] Cleared metadata flag for specimen ${specimenId} - all metadata now present`);
          }
        } else if (currentFlag && ['herbarium_catalog_conflict', 'herbarium_name_conflict', 'both_conflict'].includes(currentFlag)) {
          // University of West Alabama Herbarium is a valid alternative - their catalog numbers and herbarium name are not conflicts
          const isWestAlabamaHerbarium = herbariumName && herbariumName.includes('University of West Alabama Herbarium');
          
          // Herbarium conflicts are only valid if there's conflicting data on iNat
          // Skip catalog conflict check for West Alabama Herbarium - their catalog numbers (UWAL-M-*) are valid
          const hasCatalogConflict = !isWestAlabamaHerbarium && herbariumCatalogNumber && 
            !herbariumCatalogNumber.trim().includes('MYCO') && 
            herbariumCatalogNumber.trim() !== '';
          const hasNameConflict = herbariumName && 
            herbariumName.toUpperCase() !== 'MYCO' && 
            herbariumName.trim() !== '' &&
            !isWestAlabamaHerbarium;
          
          if (!hasCatalogConflict && !hasNameConflict) {
            // Conflict resolved - clear the flag
            await db.update(specimens)
              .set({ inatFieldConflict: null })
              .where(eq(specimens.id, specimenId));
            console.log(`[iNat Refresh] Cleared resolved conflict flag for specimen ${specimenId}`);
          }
        }
      }
      
      res.json({ 
        success: true, 
        message: "Specimen refreshed from iNaturalist",
        updated: specimenUpdate,
        inatPush: inatPushResult
      });
    } catch (error) {
      console.error("Error refreshing specimen:", error);
      res.status(500).json({ error: "Failed to refresh specimen" });
    }
  });

  // =============================================
  // BULK SPECIMEN REFRESH ENDPOINTS
  // =============================================

  // Track active bulk refresh state
  let bulkRefreshActive = false;
  let bulkRefreshCancelled = false;

  // Get bulk refresh status
  app.get("/api/admin/specimens/refresh/status", isAdmin, async (req: any, res) => {
    try {
      const [metadata] = await db.select().from(specimenRefreshMetadata).orderBy(sql`id DESC`).limit(1);
      
      if (!metadata) {
        return res.json({
          syncStatus: 'idle',
          syncProgress: 0,
          totalSpecimens: 0,
          processedCount: 0,
          successCount: 0,
          errorCount: 0,
          syncMessage: null,
          lastRefreshAt: null,
        });
      }
      
      res.json(metadata);
    } catch (error) {
      console.error("Error fetching bulk refresh status:", error);
      res.status(500).json({ error: "Failed to fetch refresh status" });
    }
  });

  // Helper to build specimen filter conditions
  function buildSpecimenFilterConditions(params: {
    search?: string;
    status?: string;
    validationFlags?: string;
    dateFrom?: string;
    dateTo?: string;
    hasSequence?: boolean;
    ignoreRefreshDate?: boolean;
  }) {
    const conditions: any[] = [
      eq(specimens.primaryObservationSource, 'inat'),
      isNotNull(specimens.primaryObservationId)
    ];
    
    // Recency filter: when onlyStale is explicitly true, only include specimens
    // that haven't been refreshed in the last 24 hours
    // Default behavior (ignoreRefreshDate not specified or true): refresh all filtered specimens
    if (params.ignoreRefreshDate === false) {
      conditions.push(sql`(
        NOT EXISTS (
          SELECT 1 FROM observation_cache oc 
          WHERE oc.source = 'inat' 
            AND oc.source_observation_id = ${specimens.primaryObservationId}
            AND oc.updated_at > NOW() - INTERVAL '24 hours'
        )
      )`);
    }
    
    if (params.status && params.status !== 'all') {
      conditions.push(eq(specimens.currentStatus, params.status));
    }
    
    // Support comma-separated validation flags (OR logic)
    const flagsStr = params.validationFlags || '';
    const validationFlags = flagsStr ? flagsStr.split(',').filter((f: string) => f && f !== 'all') : [];
    
    if (validationFlags.length > 0) {
      const flagConditions: any[] = [];
      for (const flag of validationFlags) {
        if (flag === 'has_flag') {
          flagConditions.push(sql`${specimens.inatFieldConflict} IS NOT NULL AND ${specimens.inatFieldConflict} != ''`);
        } else if (flag === 'no_flag') {
          flagConditions.push(sql`(${specimens.inatFieldConflict} IS NULL OR ${specimens.inatFieldConflict} = '')`);
        } else if (flag === 'push_incomplete') {
          // Dynamic flag: iNat records with push incomplete status
          // Condition 1: Has MYCO number but cache missing catalog/name
          // Condition 2: Cache has MYCO in catalog but missing herbarium_name
          flagConditions.push(sql`(
            ${specimens.primaryObservationSource} = 'inat'
            AND (
              (
                ${specimens.mycoNumber} IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1 FROM observation_cache oc 
                  WHERE oc.source = 'inat' 
                    AND oc.source_observation_id = ${specimens.primaryObservationId}
                    AND oc.herbarium_catalog_number LIKE '%' || ${specimens.mycoNumber}::text || '%'
                    AND oc.herbarium_name IS NOT NULL 
                    AND oc.herbarium_name != ''
                )
              )
              OR EXISTS (
                SELECT 1 FROM observation_cache oc 
                WHERE oc.source = 'inat' 
                  AND oc.source_observation_id = ${specimens.primaryObservationId}
                  AND oc.herbarium_catalog_number LIKE '%MYCO%'
                  AND (oc.herbarium_name IS NULL OR oc.herbarium_name = '')
              )
            )
          )`);
        } else if (flag === 'herbarium_catalog_conflict') {
          // Dynamic flag: catalog conflict includes stored conflicts + specimens without MYCO but with catalog data
          flagConditions.push(sql`(
            ${specimens.inatFieldConflict} = 'herbarium_catalog_conflict'
            OR ${specimens.inatFieldConflict} = 'both_conflict'
            OR (
              ${specimens.primaryObservationSource} = 'inat'
              AND ${specimens.mycoNumber} IS NULL
              AND EXISTS (
                SELECT 1 FROM observation_cache oc 
                WHERE oc.source = 'inat' 
                  AND oc.source_observation_id = ${specimens.primaryObservationId}
                  AND oc.herbarium_catalog_number IS NOT NULL 
                  AND oc.herbarium_catalog_number != ''
              )
            )
          )`);
        } else {
          flagConditions.push(eq(specimens.inatFieldConflict, flag));
        }
      }
      if (flagConditions.length > 0) {
        conditions.push(or(...flagConditions));
      }
    }
    
    if (params.dateFrom) {
      conditions.push(sql`${specimens.collectionDate} >= ${params.dateFrom}::date`);
    }
    if (params.dateTo) {
      conditions.push(sql`${specimens.collectionDate} <= ${params.dateTo}::date`);
    }
    
    if (params.search) {
      const searchPattern = `%${params.search}%`;
      conditions.push(
        or(
          sql`${specimens.displayCode} ILIKE ${searchPattern}`,
          sql`${specimens.scientificName} ILIKE ${searchPattern}`,
          sql`${specimens.voucherNumber} ILIKE ${searchPattern}`,
          sql`${specimens.collectorName} ILIKE ${searchPattern}`,
          sql`${specimens.locality} ILIKE ${searchPattern}`,
          sql`${specimens.primaryObservationId} ILIKE ${searchPattern}`,
          sql`${specimens.labCode} ILIKE ${searchPattern}`,
          sql`EXISTS (SELECT 1 FROM observation_cache oc WHERE oc.source = ${specimens.primaryObservationSource}::text AND oc.source_observation_id = ${specimens.primaryObservationId} AND oc.observer_username ILIKE ${searchPattern})`,
          sql`EXISTS (SELECT 1 FROM observation_cache oc WHERE oc.source = ${specimens.primaryObservationSource}::text AND oc.source_observation_id = ${specimens.primaryObservationId} AND oc.herbarium_catalog_number ILIKE ${searchPattern})`
        )
      );
    }
    
    if (params.hasSequence) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM observation_cache oc 
          WHERE oc.source = 'inat' 
            AND oc.source_observation_id = ${specimens.primaryObservationId}
            AND oc.dna_barcode_its IS NOT NULL 
            AND oc.dna_barcode_its != ''
        )`
      );
    }
    
    return conditions;
  }

  // Start bulk refresh
  app.post("/api/admin/specimens/refresh/start", isAdmin, async (req: any, res) => {
    try {
      // Check if already running
      const [existing] = await db.select().from(specimenRefreshMetadata).orderBy(sql`id DESC`).limit(1);
      
      if (existing && existing.syncStatus === 'syncing') {
        // Check if it's actually stale (updated more than 5 minutes ago = likely orphaned)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const isStale = existing.updatedAt && new Date(existing.updatedAt) < fiveMinutesAgo;
        
        if (!isStale && bulkRefreshActive) {
          return res.json({ status: 'already_syncing', message: 'Bulk refresh is already in progress' });
        }
        // If stale or not active, reset and continue to start fresh
        console.log(`[BulkRefresh] Detected stale/orphaned sync status, resetting...`);
      }
      
      // Get filter params from request body
      const filterParams = {
        search: req.body.search || '',
        status: req.body.status || '',
        validationFlags: req.body.validationFlags || req.body.validationFlag || '',
        dateFrom: req.body.dateFrom || '',
        dateTo: req.body.dateTo || '',
        hasSequence: req.body.hasSequence === true,
        pushEnabled: req.body.pushEnabled === true, // Default to false - pull only
        ignoreRefreshDate: req.body.ignoreRefreshDate === true, // Refresh all filtered specimens
      };
      
      // Build filter conditions
      const conditions = buildSpecimenFilterConditions(filterParams);
      
      // Count filtered iNat-linked specimens
      const [countResult] = await db.select({ count: sql`count(*)` })
        .from(specimens)
        .where(and(...conditions));
      const totalSpecimens = Number(countResult?.count || 0);
      
      if (totalSpecimens === 0) {
        // Check if there are specimens that match filters but were recently refreshed
        if (!filterParams.ignoreRefreshDate) {
          const conditionsWithoutRecency = buildSpecimenFilterConditions({ ...filterParams, ignoreRefreshDate: true });
          const [totalWithoutRecency] = await db.select({ count: sql`count(*)` })
            .from(specimens)
            .where(and(...conditionsWithoutRecency));
          const countWithoutRecency = Number(totalWithoutRecency?.count || 0);
          
          if (countWithoutRecency > 0) {
            return res.json({ 
              status: 'error', 
              message: `All ${countWithoutRecency} matching specimens were refreshed within the last 24 hours. Check "Ignore Previous Refresh Date" to refresh them again.`
            });
          }
        }
        return res.json({ status: 'error', message: 'No specimens match the current filters' });
      }
      
      // Store filter params as JSON
      const filterParamsJson = JSON.stringify(filterParams);
      
      // Check if previous sync is stale (orphaned after server restart)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const isStaleSync = existing?.syncStatus === 'syncing' && 
        existing.updatedAt && new Date(existing.updatedAt) < fiveMinutesAgo;
      
      // Create or update metadata record - always start fresh when filters change or sync is stale/completed
      const isNewFilter = !existing || existing.filterParams !== filterParamsJson || 
        existing.syncStatus === 'completed' || isStaleSync;
      const startId = !isNewFilter && existing?.lastProcessedId ? existing.lastProcessedId : 0;
      
      if (existing) {
        await db.update(specimenRefreshMetadata)
          .set({
            totalSpecimens,
            processedCount: isNewFilter ? 0 : (existing.processedCount || 0),
            successCount: isNewFilter ? 0 : (existing.successCount || 0),
            errorCount: isNewFilter ? 0 : (existing.errorCount || 0),
            lastProcessedId: startId,
            syncStatus: 'syncing',
            syncProgress: isNewFilter ? 0 : (existing.syncProgress || 0),
            syncMessage: isNewFilter ? 'Starting filtered refresh...' : 'Resuming refresh...',
            filterParams: filterParamsJson,
            updatedAt: new Date(),
          })
          .where(eq(specimenRefreshMetadata.id, existing.id));
      } else {
        await db.insert(specimenRefreshMetadata).values({
          totalSpecimens,
          processedCount: 0,
          successCount: 0,
          errorCount: 0,
          lastProcessedId: 0,
          syncStatus: 'syncing',
          syncProgress: 0,
          syncMessage: 'Starting filtered refresh...',
          filterParams: filterParamsJson,
        });
      }
      
      // Start background processing
      bulkRefreshActive = true;
      bulkRefreshCancelled = false;
      processBulkRefresh();
      
      res.json({ status: 'started', message: `Starting refresh of ${totalSpecimens} filtered specimens` });
    } catch (error) {
      console.error("Error starting bulk refresh:", error);
      res.status(500).json({ error: "Failed to start bulk refresh" });
    }
  });

  // Cancel bulk refresh
  app.post("/api/admin/specimens/refresh/cancel", isAdmin, async (req: any, res) => {
    try {
      bulkRefreshCancelled = true;
      
      const [metadata] = await db.select().from(specimenRefreshMetadata).orderBy(sql`id DESC`).limit(1);
      
      if (metadata) {
        await db.update(specimenRefreshMetadata)
          .set({
            syncStatus: 'cancelled',
            syncMessage: 'Cancelled by user',
            updatedAt: new Date(),
          })
          .where(eq(specimenRefreshMetadata.id, metadata.id));
      }
      
      res.json({ status: 'cancelled', message: 'Bulk refresh cancelled' });
    } catch (error) {
      console.error("Error cancelling bulk refresh:", error);
      res.status(500).json({ error: "Failed to cancel bulk refresh" });
    }
  });

  // Background bulk refresh processor - optimized with bulk database operations
  async function processBulkRefresh() {
    const BATCH_SIZE = 200; // iNaturalist allows up to 200 per request
    const DELAY_MS = 1000; // 1 second between API calls
    
    try {
      const [metadata] = await db.select().from(specimenRefreshMetadata).orderBy(sql`id DESC`).limit(1);
      if (!metadata) return;
      
      console.log(`[BulkRefresh] Starting refresh of ${metadata.totalSpecimens} specimens...`);
      
      // Parse filter params from metadata
      let filterParams = {
        search: '',
        status: '',
        validationFlags: '',
        dateFrom: '',
        dateTo: '',
        hasSequence: false,
        pushEnabled: false, // Default to false - pull only
        ignoreRefreshDate: false, // Default to respecting refresh dates
      };
      if (metadata.filterParams) {
        try {
          filterParams = JSON.parse(metadata.filterParams);
        } catch (e) {
          console.log(`[BulkRefresh] No valid filter params, using defaults`);
        }
      }
      
      console.log(`[BulkRefresh] Options - Push: ${filterParams.pushEnabled ? 'YES' : 'NO'}, Ignore Refresh Date: ${filterParams.ignoreRefreshDate ? 'YES' : 'NO'}`);
      
      
      // Build filter conditions
      const conditions = buildSpecimenFilterConditions(filterParams);
      
      // Get filtered iNat-linked specimens ordered by ID (include all fields needed for push)
      const allSpecimens = await db.select({ 
        id: specimens.id, 
        primaryObservationId: specimens.primaryObservationId, 
        currentStatus: specimens.currentStatus,
        displayCode: specimens.displayCode,
        herbariumAccessionNumber: specimens.herbariumAccessionNumber,
        mycoNumber: specimens.mycoNumber,
      })
        .from(specimens)
        .where(and(...conditions))
        .orderBy(specimens.id);
      
      let processed = metadata.processedCount || 0;
      let success = metadata.successCount || 0;
      let errors = metadata.errorCount || 0;
      let lastId = metadata.lastProcessedId || 0;
      
      // Find starting index
      let startIndex = 0;
      if (lastId > 0) {
        startIndex = allSpecimens.findIndex(s => s.id > lastId);
        if (startIndex === -1) startIndex = allSpecimens.length;
      }
      
      console.log(`[BulkRefresh] Resuming from index ${startIndex}, processed: ${processed}`);
      
      for (let i = startIndex; i < allSpecimens.length; i += BATCH_SIZE) {
        if (bulkRefreshCancelled) {
          console.log(`[BulkRefresh] Cancelled by user at ${processed}/${metadata.totalSpecimens}`);
          await db.update(specimenRefreshMetadata)
            .set({
              syncStatus: 'cancelled',
              syncMessage: `Cancelled at ${processed}/${metadata.totalSpecimens} specimens`,
              updatedAt: new Date(),
            })
            .where(eq(specimenRefreshMetadata.id, metadata.id));
          bulkRefreshActive = false;
          return;
        }
        
        const batch = allSpecimens.slice(i, i + BATCH_SIZE);
        
        // Build comma-separated list of observation IDs for batch API call
        const observationIds = batch.map(s => s.primaryObservationId).join(',');
        const inatUrl = `https://api.inaturalist.org/v1/observations?id=${observationIds}&per_page=${BATCH_SIZE}`;
        
        console.log(`[BulkRefresh] Fetching batch of ${batch.length} observations...`);
        
        try {
          const response = await fetch(inatUrl);
          
          if (response.status === 429) {
            console.log(`[BulkRefresh] Rate limited at ${processed}/${metadata.totalSpecimens}`);
            await db.update(specimenRefreshMetadata)
              .set({
                syncStatus: 'rate_limited',
                syncMessage: `Rate limited at ${processed}/${metadata.totalSpecimens}. Wait 2 min and resume.`,
                lastProcessedId: batch[0].id - 1,
                processedCount: processed,
                successCount: success,
                errorCount: errors,
                syncProgress: Math.round((processed / metadata.totalSpecimens!) * 100),
                updatedAt: new Date(),
              })
              .where(eq(specimenRefreshMetadata.id, metadata.id));
            bulkRefreshActive = false;
            return;
          }
          
          if (!response.ok) {
            console.error(`[BulkRefresh] API error: ${response.status}`);
            errors += batch.length;
            processed += batch.length;
            continue;
          }
          
          const data = await response.json();
          const resultsMap = new Map<string, any>();
          
          // Build map of observation ID -> observation data
          for (const obs of data.results || []) {
            resultsMap.set(obs.id.toString(), obs);
          }
          
          console.log(`[BulkRefresh] Got ${resultsMap.size} observations from API`);
          
          // OPTIMIZATION: Pre-fetch all unique place_ids in one batch before processing
          const allPlaceIds = new Set<number>();
          for (const obs of data.results || []) {
            if (obs.place_ids && Array.isArray(obs.place_ids)) {
              obs.place_ids.forEach((id: number) => allPlaceIds.add(id));
            }
          }
          if (allPlaceIds.size > 0) {
            console.log(`[BulkRefresh] Pre-fetching ${allPlaceIds.size} unique places...`);
            await fetchPlaces(Array.from(allPlaceIds));
          }
          
          // Prepare bulk data arrays
          const cacheUpserts: any[] = [];
          const specimenUpdates: { id: number; data: any }[] = [];
          const observationIdsForPhotos: string[] = [];
          const photoInserts: any[] = [];
          
          // Pre-process all observations in the batch (now fast - places are cached)
          // Track specimens with deleted observations for bulk update
          const deletedSpecimenIds: number[] = [];
          
          for (const spec of batch) {
            const obs = resultsMap.get(spec.primaryObservationId!);
            
            if (!obs) {
              // Observation was deleted from iNaturalist - mark for "Removed" update
              deletedSpecimenIds.push(spec.id);
              success++; // Count as success since we're handling it
              processed++;
              continue;
            }
            
            // Extract observation fields
            const observationFields = obs.ofvs || [];
            const getField = (fieldId: number) => observationFields.find((f: any) => f.field_id === fieldId)?.value || null;
            
            const voucherNumber = getField(8257);
            const voucherNumberMultiple = getField(2863);
            const herbariumName = getField(9539);
            const herbariumCatalogNumber = getField(9540);
            const genbankAccession = getField(7555);
            const genbankNumberUrl = getField(4191);
            const provisionalSpeciesName = getField(10675);
            const mycomapBlastResults = getField(9864);
            const traceFiles = getField(10109);
            const dnaBarcodIts = getField(2330);
            const readsInConsensus = getField(16718);
            const speciesNameOverride = getField(20259);
            const collectorsName = getField(9051);
            
            // Extract location (fast now - places are pre-cached)
            let specimenState: string | null = null;
            let specimenCountry: string | null = null;
            try {
              const location = await extractLocationFromObservation(obs);
              specimenState = location.stateCode || location.stateName || null;
              specimenCountry = location.countryCode || location.countryName || null;
            } catch (locErr) {
              // Location extraction failed, continue without it
            }
            
            // Prepare cache upsert data (matching single refresh fields)
            cacheUpserts.push({
              source: 'inat' as const,
              sourceObservationId: spec.primaryObservationId!,
              sourceUuid: obs.uuid || null,
              scientificName: obs.taxon?.name || obs.species_guess || null,
              commonName: obs.taxon?.preferred_common_name || null,
              family: obs.taxon?.ancestry?.split('/')?.slice(-2, -1)?.[0] || null,
              genus: obs.taxon?.name?.split(' ')?.[0] || null,
              species: obs.taxon?.name?.split(' ')?.[1] || null,
              taxonRank: obs.taxon?.rank || null,
              observerName: obs.user?.name || null,
              observerUsername: obs.user?.login || null,
              observerId: obs.user?.id?.toString() || null,
              latitude: obs.geojson?.coordinates?.[1]?.toString() || null,
              longitude: obs.geojson?.coordinates?.[0]?.toString() || null,
              coordinatesObscured: obs.obscured || false,
              geoprivacy: obs.geoprivacy || null,
              taxonGeoprivacy: obs.taxon_geoprivacy || null,
              positionalAccuracy: obs.positional_accuracy || null,
              placeGuess: obs.geoprivacy === 'private' ? 'Private' : (obs.place_guess || null),
              locality: obs.geoprivacy === 'private' ? 'Private' : (obs.place_guess || null),
              observedOn: obs.observed_on || null,
              observedOnString: obs.observed_on_string || null,
              qualityGrade: obs.quality_grade || null,
              identificationCount: obs.identifications_count || 0,
              captive: obs.captive || false,
              licenseCode: obs.license_code || null,
              voucherNumber,
              voucherNumberMultiple,
              herbariumName,
              herbariumCatalogNumber,
              genbankAccession,
              genbankNumberUrl,
              provisionalSpeciesName,
              mycomapBlastResults,
              traceFiles,
              dnaBarcodIts,
              readsInConsensus,
              speciesNameOverride,
              collectorsName,
              apiResponseJson: JSON.stringify({ results: [obs] }),
              lastSyncedAt: new Date(),
              syncStatus: 'success',
              updatedAt: new Date(),
            });
            
            observationIdsForPhotos.push(spec.primaryObservationId!);
            
            // Prepare photo data
            if (obs.photos && obs.photos.length > 0) {
              for (let photoIdx = 0; photoIdx < obs.photos.length; photoIdx++) {
                const photo = obs.photos[photoIdx];
                photoInserts.push({
                  sourceObservationId: spec.primaryObservationId!,
                  mediaType: 'photo',
                  url: photo.url || '',
                  thumbnailUrl: photo.url?.replace('/square.', '/thumb.') || photo.url || null,
                  mediumUrl: photo.url?.replace('/square.', '/medium.') || null,
                  largeUrl: photo.url?.replace('/square.', '/large.') || null,
                  originalUrl: photo.url?.replace('/square.', '/original.') || null,
                  licenseCode: photo.license_code || null,
                  attribution: photo.attribution || null,
                  sortOrder: photoIdx,
                });
              }
            }
            
            // Prepare specimen update
            const inatBaseName = obs.taxon?.name || obs.species_guess || null;
            const specimenUpdate: any = {
              scientificName: getInatScientificName(inatBaseName, provisionalSpeciesName, speciesNameOverride),
              collectorName: collectorsName || obs.user?.name || obs.user?.login,
              collectionDate: obs.observed_on,
              locality: obs.geoprivacy === 'private' ? 'Private' : obs.place_guess,
              state: specimenState,
              country: specimenCountry,
              latitude: obs.geojson?.coordinates?.[1]?.toString(),
              longitude: obs.geojson?.coordinates?.[0]?.toString(),
              voucherNumber: voucherNumber || voucherNumberMultiple,
            };
            
            if (dnaBarcodIts && spec.currentStatus !== 'sequenced') {
              specimenUpdate.currentStatus = 'sequenced';
            }
            
            if (obs.taxon?.name) {
              specimenUpdate.genus = obs.taxon.name.split(' ')[0];
            }
            
            specimenUpdates.push({ id: spec.id, data: specimenUpdate });
            success++;
            processed++;
          }
          
          // Upsert observation cache in smaller chunks (10 at a time for speed)
          console.log(`[BulkRefresh] Upserting ${cacheUpserts.length} cache entries...`);
          const CACHE_CHUNK_SIZE = 10;
          for (let ci = 0; ci < cacheUpserts.length; ci += CACHE_CHUNK_SIZE) {
            const chunk = cacheUpserts.slice(ci, ci + CACHE_CHUNK_SIZE);
            await Promise.all(chunk.map(cacheData => 
              db.insert(observationCache)
                .values({ ...cacheData, createdAt: new Date() })
                .onConflictDoUpdate({
                  target: [observationCache.source, observationCache.sourceObservationId],
                  set: cacheData,
                })
            ));
          }
          
          // Update photos
          if (observationIdsForPhotos.length > 0) {
            const cacheRows = await db.select({ id: observationCache.id, sourceObservationId: observationCache.sourceObservationId })
              .from(observationCache)
              .where(and(
                eq(observationCache.source, 'inat'),
                sql`${observationCache.sourceObservationId} IN (${sql.raw(observationIdsForPhotos.map(id => `'${id}'`).join(','))})`
              ));
            
            const cacheIdMap = new Map<string, number>();
            for (const row of cacheRows) {
              if (row.sourceObservationId) {
                cacheIdMap.set(row.sourceObservationId, row.id);
              }
            }
            
            // Bulk delete existing photos
            const cacheIds = Array.from(cacheIdMap.values());
            if (cacheIds.length > 0) {
              await db.delete(observationMedia)
                .where(sql`${observationMedia.observationCacheId} IN (${sql.raw(cacheIds.join(','))})`);
            }
            
            // Bulk insert photos
            if (photoInserts.length > 0) {
              const photosWithCacheId = photoInserts
                .map(p => ({
                  ...p,
                  observationCacheId: cacheIdMap.get(p.sourceObservationId),
                }))
                .filter(p => p.observationCacheId);
              
              if (photosWithCacheId.length > 0) {
                for (let j = 0; j < photosWithCacheId.length; j += 100) {
                  const chunk = photosWithCacheId.slice(j, j + 100).map(({ sourceObservationId, ...rest }) => rest);
                  await db.insert(observationMedia).values(chunk);
                }
              }
            }
          }
          
          
          console.log(`[BulkRefresh] Updating ${specimenUpdates.length} specimens...`);
          
          // Bulk update specimens
          for (const { id, data } of specimenUpdates) {
            await db.update(specimens).set(data).where(eq(specimens.id, id));
          }
          
          // Handle deleted observations - mark specimens as "Removed"
          if (deletedSpecimenIds.length > 0) {
            console.log(`[BulkRefresh] Marking ${deletedSpecimenIds.length} specimens as Removed (observations deleted from iNat)...`);
            for (const specId of deletedSpecimenIds) {
              await db.update(specimens)
                .set({ 
                  scientificName: 'Removed',
                  locality: 'Removed', 
                  collectorName: 'Removed',
                  inatFieldConflict: null 
                })
                .where(eq(specimens.id, specId));
            }
          }
          
          // Handle metadata flags - check for missing metadata and update flags
          // Track specimens that need metadata flag changes
          const metadataFlagUpdates: { id: number; flag: string | null }[] = [];
          
          for (const spec of batch) {
            const obs = resultsMap.get(spec.primaryObservationId!);
            if (!obs) continue;
            
            // Skip if specimen has a conflict flag that takes precedence
            if (spec.inatFieldConflict && ['herbarium_catalog_conflict', 'herbarium_name_conflict', 'both_conflict'].includes(spec.inatFieldConflict)) {
              continue;
            }
            
            // Get the final data (updated or original)
            const specimenUpdate = specimenUpdates.find(u => u.id === spec.id)?.data || {};
            const finalScientificName = specimenUpdate.scientificName || spec.scientificName;
            const finalCollectorName = specimenUpdate.collectorName || spec.collectorName;
            const finalCollectionDate = specimenUpdate.collectionDate || spec.collectionDate;
            const finalState = specimenUpdate.state || spec.state;
            const finalCountry = specimenUpdate.country || spec.country;
            const finalLocality = specimenUpdate.locality || spec.locality;
            
            // Private observations don't need location
            const isPrivateLocation = obs.geoprivacy === 'private';
            const hasLocation = isPrivateLocation || finalLocality || finalState || finalCountry;
            
            // Specimens marked as "Removed" should never get metadata flags
            const isRemovedSpecimen = finalScientificName === 'Removed' || finalCollectorName === 'Removed';
            const missingMetadata = !isRemovedSpecimen && (!finalScientificName || !finalCollectorName || !finalCollectionDate || !hasLocation);
            
            if (missingMetadata && spec.inatFieldConflict !== 'metadata') {
              // Set metadata flag
              metadataFlagUpdates.push({ id: spec.id, flag: 'metadata' });
            } else if (!missingMetadata && spec.inatFieldConflict === 'metadata') {
              // Clear metadata flag - data is now complete
              metadataFlagUpdates.push({ id: spec.id, flag: null });
            }
          }
          
          // Apply metadata flag updates
          if (metadataFlagUpdates.length > 0) {
            console.log(`[BulkRefresh] Updating ${metadataFlagUpdates.length} metadata flags...`);
            for (const { id, flag } of metadataFlagUpdates) {
              await db.update(specimens)
                .set({ inatFieldConflict: flag })
                .where(eq(specimens.id, id));
            }
          }
          
          // TWO-WAY SYNC: Push MYCO data to iNaturalist if conditions are met
          // Only runs if pushEnabled is true AND specimen has a valid MYCO number
          // Uses individual observation_field_values API (v1 PUT doesn't support batched fields)
          const inatToken = process.env.INATURALIST_API_TOKEN;
          if (inatToken && filterParams.pushEnabled) {
            const PUSH_CONCURRENCY = 5; // Run 5 field updates in parallel
            let pushCount = 0;
            
            // Collect individual field push tasks
            interface FieldPush {
              specId: number;
              obsId: string;
              fieldId: number;
              value: string;
              existingOfvId: number | null;
            }
            const fieldPushes: FieldPush[] = [];
            const conflictMap = new Map<number, string[]>();
            
            for (const spec of batch) {
              const obs = resultsMap.get(spec.primaryObservationId!);
              if (!obs) continue;
              
              // CRITICAL: Only push if specimen has a valid MYCO number
              // Never use displayCode or voucherNumber as fallback
              if (!spec.mycoNumber) {
                console.log(`[BulkRefresh Push] Skipping ${spec.primaryObservationId}: no mycoNumber`);
                continue; // Skip specimens without MYCO numbers - nothing to push
              }
              
              // Format MYCO accession properly
              const mycoAccession = `MYCO-${spec.mycoNumber}`;
              
              const existingOfvs = obs.ofvs || [];
              const getOfvId = (fieldId: number) => existingOfvs.find((f: any) => f.field_id === fieldId)?.id || null;
              const getFieldValue = (fieldId: number) => existingOfvs.find((f: any) => f.field_id === fieldId)?.value || null;
              
              const herbariumName = getFieldValue(9539);
              const herbariumCatalogNumber = getFieldValue(9540);
              
              // Debug: Log what we're comparing
              console.log(`[BulkRefresh Push] Checking ${spec.primaryObservationId}: mycoAccession=${mycoAccession}, herbariumName="${herbariumName}", herbariumCatalogNumber="${herbariumCatalogNumber}"`);
              
              // Check Herbarium Catalog Number (field 9540)
              if (!herbariumCatalogNumber || herbariumCatalogNumber.trim() === '') {
                // Blank - push MYCO accession
                fieldPushes.push({ specId: spec.id, obsId: spec.primaryObservationId!, fieldId: 9540, value: mycoAccession, existingOfvId: getOfvId(9540) });
              } else if (herbariumCatalogNumber.includes(mycoAccession)) {
                // Already contains proper mycoAccession, no update needed
              } else if (herbariumCatalogNumber.toLowerCase().includes('myco')) {
                // Contains MYCO but wrong format - update to proper format
                const mycoMatch = herbariumCatalogNumber.match(/MYCO[-\s]*(\d+)/i);
                if (mycoMatch) {
                  const fullMatch = mycoMatch[0];
                  const matchIndex = herbariumCatalogNumber.indexOf(fullMatch);
                  const afterMyco = herbariumCatalogNumber.substring(matchIndex + fullMatch.length);
                  fieldPushes.push({ specId: spec.id, obsId: spec.primaryObservationId!, fieldId: 9540, value: mycoAccession + afterMyco, existingOfvId: getOfvId(9540) });
                }
              } else {
                // Has data but NO MYCO - append our MYCO accession (e.g., "TENN-F-078927; MYCO-1004770")
                const appendedValue = `${herbariumCatalogNumber.trim()}; ${mycoAccession}`;
                fieldPushes.push({ specId: spec.id, obsId: spec.primaryObservationId!, fieldId: 9540, value: appendedValue, existingOfvId: getOfvId(9540) });
              }
              
              // Check Herbarium Name (field 9539)
              // Skip if already "University of West Alabama Herbarium" - this is a valid alternative herbarium
              const isWestAlabamaHerbarium = herbariumName && herbariumName.includes('University of West Alabama Herbarium');
              if (isWestAlabamaHerbarium) {
                // Valid alternative herbarium - no update needed
              } else if (!herbariumName || herbariumName.trim() === '') {
                // Blank - push MYCO
                fieldPushes.push({ specId: spec.id, obsId: spec.primaryObservationId!, fieldId: 9539, value: 'MYCO', existingOfvId: getOfvId(9539) });
              } else if (herbariumName.toUpperCase().includes('MYCO')) {
                // Already contains MYCO, no update needed
              } else {
                // Has different data - append MYCO
                const appendedName = `${herbariumName.trim()}; MYCO`;
                fieldPushes.push({ specId: spec.id, obsId: spec.primaryObservationId!, fieldId: 9539, value: appendedName, existingOfvId: getOfvId(9539) });
              }
            }
            
            // Track successful and failed pushes per specimen
            const successfulPushes = new Map<number, Set<number>>();
            const failedPushes = new Map<number, Set<number>>();
            
            // Log field push distribution
            const field9539Count = fieldPushes.filter(f => f.fieldId === 9539).length;
            const field9540Count = fieldPushes.filter(f => f.fieldId === 9540).length;
            console.log(`[BulkRefresh Push] Field breakdown: ${field9539Count} Herbarium Name (9539), ${field9540Count} Catalog Number (9540)`);
            
            // Execute field updates - serialize per observation to avoid iNat race conditions
            // Group by observation, then process observations in parallel but fields sequentially
            if (fieldPushes.length > 0) {
              console.log(`[BulkRefresh Push] Pushing ${fieldPushes.length} field updates...`);
              
              // Group field pushes by observation ID
              const pushesByObs = new Map<string, FieldPush[]>();
              for (const fp of fieldPushes) {
                if (!pushesByObs.has(fp.obsId)) {
                  pushesByObs.set(fp.obsId, []);
                }
                pushesByObs.get(fp.obsId)!.push(fp);
              }
              
              // Process observations in parallel, but fields within each observation sequentially
              const obsIds = Array.from(pushesByObs.keys());
              for (let pi = 0; pi < obsIds.length; pi += PUSH_CONCURRENCY) {
                const parallelObsIds = obsIds.slice(pi, pi + PUSH_CONCURRENCY);
                
                // Process each observation's fields sequentially within parallel execution
                const obsResults = await Promise.allSettled(parallelObsIds.map(async (obsId) => {
                  const obsPushes = pushesByObs.get(obsId)!;
                  const results: { ok: boolean; fp: FieldPush; status: number }[] = [];
                  
                  for (const fp of obsPushes) {
                    const MAX_RETRIES = 2;
                    let lastStatus = 0;
                    let succeeded = false;
                    
                    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                      try {
                        if (fp.existingOfvId) {
                          console.log(`[BulkRefresh Push] PUT field ${fp.fieldId} for obs ${fp.obsId}, ofvId=${fp.existingOfvId}, value="${fp.value}"`);
                          const putResponse = await fetch(`https://api.inaturalist.org/v1/observation_field_values/${fp.existingOfvId}`, {
                            method: 'PUT',
                            headers: {
                              'Authorization': `Bearer ${inatToken}`,
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                              observation_field_value: { value: fp.value }
                            }),
                          });
                          lastStatus = putResponse.status;
                          const responseText = await putResponse.text();
                          console.log(`[BulkRefresh Push] PUT response ${putResponse.status}: ${responseText.substring(0, 200)}`);
                          if (putResponse.ok) {
                            results.push({ ok: true, fp, status: putResponse.status });
                            succeeded = true;
                            break;
                          }
                          if (putResponse.status >= 500 && attempt < MAX_RETRIES) {
                            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                            continue;
                          }
                        } else {
                          console.log(`[BulkRefresh Push] POST field ${fp.fieldId} for obs ${fp.obsId}, value="${fp.value}"`);
                          const postResponse = await fetch('https://api.inaturalist.org/v1/observation_field_values', {
                            method: 'POST',
                            headers: {
                              'Authorization': `Bearer ${inatToken}`,
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                              observation_field_value: {
                                observation_id: parseInt(fp.obsId),
                                observation_field_id: fp.fieldId,
                                value: fp.value
                              }
                            }),
                          });
                          lastStatus = postResponse.status;
                          const responseText = await postResponse.text();
                          console.log(`[BulkRefresh Push] POST response ${postResponse.status}: ${responseText.substring(0, 200)}`);
                          if (postResponse.ok) {
                            results.push({ ok: true, fp, status: postResponse.status });
                            succeeded = true;
                            break;
                          }
                          if (postResponse.status >= 500 && attempt < MAX_RETRIES) {
                            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                            continue;
                          }
                        }
                      } catch (err) {
                        if (attempt < MAX_RETRIES) {
                          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                          continue;
                        }
                      }
                    }
                    
                    if (!succeeded) {
                      results.push({ ok: false, fp, status: lastStatus });
                    }
                    
                    // Small delay between fields on the same observation
                    await new Promise(r => setTimeout(r, 100));
                  }
                  
                  return results;
                }));
                
                // Process results
                for (const obsResult of obsResults) {
                  if (obsResult.status === 'fulfilled') {
                    for (const result of obsResult.value) {
                      if (result.ok) {
                        pushCount++;
                        const specId = result.fp.specId;
                        const fieldId = result.fp.fieldId;
                        if (!successfulPushes.has(specId)) {
                          successfulPushes.set(specId, new Set());
                        }
                        successfulPushes.get(specId)!.add(fieldId);
                      } else {
                        const specId = result.fp.specId;
                        const fieldId = result.fp.fieldId;
                        if (!failedPushes.has(specId)) {
                          failedPushes.set(specId, new Set());
                        }
                        failedPushes.get(specId)!.add(fieldId);
                        if (result.status !== 422) {
                          console.error(`[BulkRefresh Push] Failed obs ${result.fp.obsId} field ${result.fp.fieldId}: HTTP ${result.status}`);
                        }
                      }
                    }
                  }
                }
                
                console.log(`[BulkRefresh Push] Batch complete: ${pushCount} total success so far`);
                
                // Delay between parallel observation batches
                if (pi + PUSH_CONCURRENCY < obsIds.length) {
                  await new Promise(resolve => setTimeout(resolve, 200));
                }
              }
            }
            
            // Flag specimens that had push failures (didn't get both fields updated)
            const specimenPushFailures: number[] = [];
            for (const [specId, failedFields] of failedPushes) {
              // Check if any field failed that wasn't also successful
              const successfulFields = successfulPushes.get(specId) || new Set();
              for (const fieldId of failedFields) {
                if (!successfulFields.has(fieldId)) {
                  specimenPushFailures.push(specId);
                  break;
                }
              }
            }
            
            // Also flag specimens that were supposed to push both fields but only got one
            for (const spec of batch) {
              const attemptedFields = fieldPushes.filter(f => f.specId === spec.id);
              if (attemptedFields.length === 2) {
                // Should have pushed both fields
                const successfulFields = successfulPushes.get(spec.id) || new Set();
                if (successfulFields.size < 2 && !specimenPushFailures.includes(spec.id)) {
                  specimenPushFailures.push(spec.id);
                }
              }
            }
            
            // Update validation flag for push failures
            if (specimenPushFailures.length > 0) {
              console.log(`[BulkRefresh Push] Flagging ${specimenPushFailures.length} specimens with incomplete field updates`);
              for (const specId of specimenPushFailures) {
                await db.update(specimens)
                  .set({ inatFieldConflict: 'push_incomplete' })
                  .where(eq(specimens.id, specId));
              }
            }
            
            // Bulk update conflicts
            if (conflictMap.size > 0) {
              for (const [specId, conflicts] of conflictMap) {
                const conflictValue = conflicts.length === 2 ? 'both_conflict' : conflicts[0];
                await db.update(specimens)
                  .set({ inatFieldConflict: conflictValue })
                  .where(eq(specimens.id, specId));
              }
            }
            
            if (pushCount > 0) {
              console.log(`[BulkRefresh Push] Successfully pushed ${pushCount} field updates to iNaturalist`);
            }
            
            // Clear conflict flags for specimens that:
            // 1. Successfully pushed all attempted fields, OR
            // 2. Didn't need to push (data already matched)
            // (exclude specimens with push failures)
            const successfullyClearedIds: number[] = [];
            
            for (const spec of batch) {
              if (!spec.mycoNumber) continue; // Only clear for specimens with MYCO numbers
              if (specimenPushFailures.includes(spec.id)) continue; // Skip failures
              
              // Check if this specimen had any attempted pushes
              const attemptedFields = fieldPushes.filter(f => f.specId === spec.id);
              const successfulFields = successfulPushes.get(spec.id) || new Set();
              
              if (attemptedFields.length === 0) {
                // No push needed - data already matched, clear the flag
                successfullyClearedIds.push(spec.id);
              } else if (successfulFields.size >= attemptedFields.length) {
                // All attempted pushes succeeded, clear the flag
                successfullyClearedIds.push(spec.id);
              }
            }
            
            if (successfullyClearedIds.length > 0) {
              console.log(`[BulkRefresh Push] Clearing conflict flags for ${successfullyClearedIds.length} specimens (data matched or push successful)`);
              for (const specId of successfullyClearedIds) {
                await db.update(specimens)
                  .set({ inatFieldConflict: null })
                  .where(eq(specimens.id, specId));
              }
            }
            
            // Update observation cache with the actual values that were pushed to iNat
            if (successfulPushes.size > 0) {
              console.log(`[BulkRefresh Push] Updating cache for ${successfulPushes.size} specimens with pushed values...`);
              for (const [specId, pushedFields] of successfulPushes) {
                const spec = batch.find(s => s.id === specId);
                if (!spec?.primaryObservationId) continue;
                
                const cacheUpdates: any = {};
                
                // Find the actual values that were pushed from the fieldPushes array
                if (pushedFields.has(9539)) {
                  const pushed9539 = fieldPushes.find(f => f.specId === specId && f.fieldId === 9539);
                  if (pushed9539) {
                    cacheUpdates.herbariumName = pushed9539.value;
                  }
                }
                if (pushedFields.has(9540)) {
                  const pushed9540 = fieldPushes.find(f => f.specId === specId && f.fieldId === 9540);
                  if (pushed9540) {
                    cacheUpdates.herbariumCatalogNumber = pushed9540.value;
                  }
                }
                
                if (Object.keys(cacheUpdates).length > 0) {
                  await db.update(observationCache)
                    .set(cacheUpdates)
                    .where(and(
                      eq(observationCache.source, 'inat'),
                      eq(observationCache.sourceObservationId, spec.primaryObservationId)
                    ));
                }
              }
            }
          }
          
        } catch (fetchErr) {
          console.error(`[BulkRefresh] Fetch error:`, fetchErr);
          // Mark batch as errors and advance past it to avoid infinite retry loop
          errors += batch.length;
          processed += batch.length;
          
          // Clamp to prevent exceeding total
          processed = Math.min(processed, metadata.totalSpecimens!);
          errors = Math.min(errors, metadata.totalSpecimens!);
        }
        
        // Clamp values to prevent exceeding total (defensive)
        processed = Math.min(processed, metadata.totalSpecimens!);
        success = Math.min(success, metadata.totalSpecimens!);
        errors = Math.min(errors, metadata.totalSpecimens! - success);
        
        // Update progress
        const progress = Math.min(100, Math.round((processed / metadata.totalSpecimens!) * 100));
        const lastSpecimen = batch[batch.length - 1];
        
        console.log(`[BulkRefresh] Progress: ${processed}/${metadata.totalSpecimens} (${progress}%)`);
        
        await db.update(specimenRefreshMetadata)
          .set({
            processedCount: processed,
            successCount: success,
            errorCount: errors,
            lastProcessedId: lastSpecimen.id,
            syncProgress: progress,
            syncMessage: `Processing ${processed}/${metadata.totalSpecimens} (${success} success, ${errors} errors)`,
            updatedAt: new Date(),
          })
          .where(eq(specimenRefreshMetadata.id, metadata.id));
        
        // Delay between API calls
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
      
      // Complete
      await db.update(specimenRefreshMetadata)
        .set({
          syncStatus: 'completed',
          syncProgress: 100,
          syncMessage: `Completed: ${success} success, ${errors} errors`,
          lastRefreshAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(specimenRefreshMetadata.id, metadata.id));
      
      bulkRefreshActive = false;
      
    } catch (error) {
      console.error("Bulk refresh error:", error);
      
      const [metadata] = await db.select().from(specimenRefreshMetadata).orderBy(sql`id DESC`).limit(1);
      if (metadata) {
        await db.update(specimenRefreshMetadata)
          .set({
            syncStatus: 'error',
            syncMessage: `Error: ${(error as Error).message}`,
            updatedAt: new Date(),
          })
          .where(eq(specimenRefreshMetadata.id, metadata.id));
      }
      
      bulkRefreshActive = false;
    }
  }

  // Create a new specimen manually
  app.post("/api/admin/specimens", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id || null;
      const {
        primaryObservationSource,
        primaryObservationId,
        voucherNumber,
        collectorName,
        collectionDate,
        locality,
        latitude,
        longitude,
        habitat,
        substrate,
        scientificName,
        genus,
        family,
        notes,
      } = req.body;
      
      const uuid = randomUUID();
      const displayCode = await generateUniqueDisplayCode();
      
      const [newSpecimen] = await db.insert(specimens).values({
        uuid,
        displayCode,
        intakeDate: new Date(),
        primaryObservationSource,
        primaryObservationId,
        voucherNumber,
        collectorName,
        collectionDate,
        locality,
        latitude,
        longitude,
        habitat,
        substrate,
        scientificName,
        genus,
        family,
        currentStatus: 'received',
        statusChangedAt: new Date(),
        notes,
      }).returning();
      
      // Log the creation event
      await db.insert(specimenEvents).values({
        specimenId: newSpecimen.id,
        eventType: 'created',
        newValue: 'Created manually',
        performedBy: userId,
      });
      
      // If primary observation source provided, add to sources
      if (primaryObservationSource && primaryObservationId) {
        await db.insert(specimenSources).values({
          specimenId: newSpecimen.id,
          platform: primaryObservationSource,
          externalId: primaryObservationId,
          isPrimary: true,
        });
      }
      
      res.json(newSpecimen);
    } catch (error) {
      console.error("Error creating specimen:", error);
      res.status(500).json({ error: "Failed to create specimen" });
    }
  });

  // Update specimen
  app.patch("/api/admin/specimens/:id", isAdmin, async (req: any, res) => {
    try {
      const specimenId = parseInt(req.params.id);
      const userId = req.user?.claims?.sub || req.user?.id || null;
      
      const [existingSpecimen] = await db.select().from(specimens).where(eq(specimens.id, specimenId));
      
      if (!existingSpecimen) {
        return res.status(404).json({ error: "Specimen not found" });
      }
      
      const {
        currentStatus,
        herbariumAccessionNumber,
        storageLocation,
        scientificName,
        genus,
        family,
        collectorName,
        collectionDate,
        locality,
        latitude,
        longitude,
        habitat,
        substrate,
        notes,
        isPublic,
      } = req.body;
      
      const updates: any = { updatedAt: new Date() };
      const events: any[] = [];
      
      // Track status changes
      if (currentStatus && currentStatus !== existingSpecimen.currentStatus) {
        updates.currentStatus = currentStatus;
        updates.statusChangedAt = new Date();
        events.push({
          specimenId,
          eventType: 'status_change',
          previousValue: existingSpecimen.currentStatus,
          newValue: currentStatus,
          performedBy: userId,
        });
      }
      
      // Track other field updates
      if (herbariumAccessionNumber !== undefined) updates.herbariumAccessionNumber = herbariumAccessionNumber;
      if (storageLocation !== undefined) {
        if (storageLocation !== existingSpecimen.storageLocation) {
          events.push({
            specimenId,
            eventType: 'location_move',
            previousValue: existingSpecimen.storageLocation,
            newValue: storageLocation,
            performedBy: userId,
          });
        }
        updates.storageLocation = storageLocation;
      }
      if (scientificName !== undefined) updates.scientificName = scientificName;
      if (genus !== undefined) updates.genus = genus;
      if (family !== undefined) updates.family = family;
      if (collectorName !== undefined) updates.collectorName = collectorName;
      if (collectionDate !== undefined) updates.collectionDate = collectionDate;
      if (locality !== undefined) updates.locality = locality;
      if (latitude !== undefined) updates.latitude = latitude;
      if (longitude !== undefined) updates.longitude = longitude;
      if (habitat !== undefined) updates.habitat = habitat;
      if (substrate !== undefined) updates.substrate = substrate;
      if (notes !== undefined) updates.notes = notes;
      if (isPublic !== undefined) updates.isPublic = isPublic;
      
      const [updatedSpecimen] = await db.update(specimens)
        .set(updates)
        .where(eq(specimens.id, specimenId))
        .returning();
      
      // Log events
      if (events.length > 0) {
        await db.insert(specimenEvents).values(events);
      }
      
      res.json(updatedSpecimen);
    } catch (error) {
      console.error("Error updating specimen:", error);
      res.status(500).json({ error: "Failed to update specimen" });
    }
  });

  // Update specimen validation flag
  app.patch("/api/admin/specimens/:id/flag", isAdmin, async (req: any, res) => {
    try {
      const specimenId = parseInt(req.params.id);
      const { flag } = req.body;
      
      const [existingSpecimen] = await db.select().from(specimens).where(eq(specimens.id, specimenId));
      
      if (!existingSpecimen) {
        return res.status(404).json({ error: "Specimen not found" });
      }
      
      const [updatedSpecimen] = await db.update(specimens)
        .set({ 
          inatFieldConflict: flag || null,
          updatedAt: new Date()
        })
        .where(eq(specimens.id, specimenId))
        .returning();
      
      res.json(updatedSpecimen);
    } catch (error) {
      console.error("Error updating specimen flag:", error);
      res.status(500).json({ error: "Failed to update specimen flag" });
    }
  });

  // Add source to specimen
  app.post("/api/admin/specimens/:id/sources", isAdmin, async (req: any, res) => {
    try {
      const specimenId = parseInt(req.params.id);
      const userId = req.user?.claims?.sub || req.user?.id || null;
      const { platform, externalId, isPrimary, url } = req.body;
      
      if (!platform || !externalId) {
        return res.status(400).json({ error: "platform and externalId are required" });
      }
      
      const [newSource] = await db.insert(specimenSources).values({
        specimenId,
        platform,
        externalId,
        isPrimary: isPrimary || false,
        url,
      }).returning();
      
      // Log the event
      await db.insert(specimenEvents).values({
        specimenId,
        eventType: 'source_added',
        newValue: `${platform}: ${externalId}`,
        performedBy: userId,
      });
      
      res.json(newSource);
    } catch (error) {
      console.error("Error adding specimen source:", error);
      res.status(500).json({ error: "Failed to add specimen source" });
    }
  });

  // Create specimen from shipment specimen (for auto-creation on validation)
  app.post("/api/admin/shipment-specimens/:id/create-specimen", isAdmin, async (req: any, res) => {
    try {
      const shipmentSpecimenId = parseInt(req.params.id);
      const userId = req.user?.claims?.sub || req.user?.id || null;
      
      // Get the shipment specimen
      const [shipmentSpec] = await db.select().from(shipmentSpecimens)
        .where(eq(shipmentSpecimens.id, shipmentSpecimenId));
      
      if (!shipmentSpec) {
        return res.status(404).json({ error: "Shipment specimen not found" });
      }
      
      // Check if already linked
      if (shipmentSpec.specimenId) {
        return res.status(400).json({ error: "Specimen already created for this shipment specimen" });
      }
      
      // Determine platform
      const platform = shipmentSpec.platform?.toLowerCase().includes('mushroom') ? 'mo' : 'inat';
      
      // Create the specimen
      const uuid = randomUUID();
      const displayCode = await generateUniqueDisplayCode();
      
      const [newSpecimen] = await db.insert(specimens).values({
        uuid,
        displayCode,
        intakeSourceId: shipmentSpecimenId,
        intakeDate: new Date(),
        primaryObservationSource: platform,
        primaryObservationId: shipmentSpec.observationId,
        voucherNumber: shipmentSpec.voucherNumber,
        scientificName: shipmentSpec.scientificName,
        locality: shipmentSpec.location,
        currentStatus: 'received',
        statusChangedAt: new Date(),
      }).returning();
      
      // Link the shipment specimen to the new specimen
      await db.update(shipmentSpecimens)
        .set({ specimenId: newSpecimen.id, updatedAt: new Date() })
        .where(eq(shipmentSpecimens.id, shipmentSpecimenId));
      
      // Add source record
      await db.insert(specimenSources).values({
        specimenId: newSpecimen.id,
        platform,
        externalId: shipmentSpec.observationId,
        isPrimary: true,
      });
      
      // Log creation event
      await db.insert(specimenEvents).values({
        specimenId: newSpecimen.id,
        eventType: 'created',
        newValue: `Created from shipment specimen #${shipmentSpecimenId}`,
        performedBy: userId,
      });
      
      res.json(newSpecimen);
    } catch (error) {
      console.error("Error creating specimen from shipment:", error);
      res.status(500).json({ error: "Failed to create specimen" });
    }
  });

  // Batch create specimens from validated shipment specimens
  app.post("/api/admin/shipments/:id/create-specimens", isAdmin, async (req: any, res) => {
    try {
      const shipmentId = parseInt(req.params.id);
      const userId = req.user?.claims?.sub || req.user?.id || null;
      
      // Get all bags for this shipment
      const bags = await db.select().from(shipmentBags)
        .where(eq(shipmentBags.shipmentId, shipmentId));
      
      const bagIds = bags.map(b => b.id);
      
      if (bagIds.length === 0) {
        return res.json({ created: 0, message: "No bags found" });
      }
      
      // Get all validated specimens that don't have a specimen record yet
      const validatedSpecs = await db.select().from(shipmentSpecimens)
        .where(and(
          inArray(shipmentSpecimens.bagId, bagIds),
          eq(shipmentSpecimens.isValidated, true),
          isNull(shipmentSpecimens.specimenId)
        ));
      
      let created = 0;
      
      for (const shipmentSpec of validatedSpecs) {
        const platform = shipmentSpec.platform?.toLowerCase().includes('mushroom') ? 'mo' : 'inat';
        const uuid = randomUUID();
        const displayCode = await generateUniqueDisplayCode();
        
        const [newSpecimen] = await db.insert(specimens).values({
          uuid,
          displayCode,
          intakeSourceId: shipmentSpec.id,
          intakeDate: new Date(),
          primaryObservationSource: platform,
          primaryObservationId: shipmentSpec.observationId,
          voucherNumber: shipmentSpec.voucherNumber,
          scientificName: shipmentSpec.scientificName,
          locality: shipmentSpec.location,
          currentStatus: 'received',
          statusChangedAt: new Date(),
        }).returning();
        
        // Link and add source
        await db.update(shipmentSpecimens)
          .set({ specimenId: newSpecimen.id, updatedAt: new Date() })
          .where(eq(shipmentSpecimens.id, shipmentSpec.id));
        
        await db.insert(specimenSources).values({
          specimenId: newSpecimen.id,
          platform,
          externalId: shipmentSpec.observationId,
          isPrimary: true,
        });
        
        await db.insert(specimenEvents).values({
          specimenId: newSpecimen.id,
          eventType: 'created',
          newValue: `Created from shipment specimen #${shipmentSpec.id}`,
          performedBy: userId,
        });
        
        created++;
      }
      
      res.json({ 
        created, 
        message: `Created ${created} specimen records from validated shipment specimens` 
      });
    } catch (error) {
      console.error("Error batch creating specimens:", error);
      res.status(500).json({ error: "Failed to create specimens" });
    }
  });

  // Link a lab well to a core specimen
  app.patch("/api/admin/lab-wells/:wellId/link-specimen", isAdmin, async (req: any, res) => {
    try {
      const wellId = parseInt(req.params.wellId);
      const userId = req.user?.claims?.sub || req.user?.id || null;
      const { coreSpecimenId } = req.body;
      
      const [well] = await db.select().from(labWells).where(eq(labWells.id, wellId));
      if (!well) {
        return res.status(404).json({ error: "Well not found" });
      }
      
      // Update the well with the core specimen link
      const [updatedWell] = await db.update(labWells)
        .set({ coreSpecimenId, updatedAt: new Date() })
        .where(eq(labWells.id, wellId))
        .returning();
      
      // If specimen exists, log event
      if (coreSpecimenId) {
        await db.insert(specimenEvents).values({
          specimenId: coreSpecimenId,
          eventType: 'sequencing_started',
          newValue: `Linked to lab well ${well.wellPosition}`,
          performedBy: userId,
        });
        
        // Update specimen status to processing if still received
        const [spec] = await db.select().from(specimens).where(eq(specimens.id, coreSpecimenId));
        if (spec && spec.currentStatus === 'received') {
          await db.update(specimens)
            .set({ currentStatus: 'processing', statusChangedAt: new Date() })
            .where(eq(specimens.id, coreSpecimenId));
        }
      }
      
      res.json(updatedWell);
    } catch (error) {
      console.error("Error linking specimen to well:", error);
      res.status(500).json({ error: "Failed to link specimen" });
    }
  });

  // Auto-link lab wells to specimens based on observation IDs
  app.post("/api/admin/plates/:plateId/auto-link-specimens", isAdmin, async (req: any, res) => {
    try {
      const plateId = parseInt(req.params.plateId);
      const userId = req.user?.claims?.sub || req.user?.id || null;
      
      // Get all wells for this plate with observation IDs
      const wells = await db.select().from(labWells)
        .where(and(
          eq(labWells.plateId, plateId),
          isNotNull(labWells.observationId),
          isNull(labWells.coreSpecimenId)
        ));
      
      let linked = 0;
      
      for (const well of wells) {
        // Find specimen by observation ID
        const [specimen] = await db.select().from(specimens)
          .where(eq(specimens.primaryObservationId, well.observationId));
        
        if (specimen) {
          await db.update(labWells)
            .set({ coreSpecimenId: specimen.id, updatedAt: new Date() })
            .where(eq(labWells.id, well.id));
          
          await db.insert(specimenEvents).values({
            specimenId: specimen.id,
            eventType: 'sequencing_started',
            newValue: `Auto-linked to lab well ${well.wellPosition}`,
            performedBy: userId,
          });
          
          linked++;
        }
      }
      
      res.json({ linked, message: `Linked ${linked} wells to specimen records` });
    } catch (error) {
      console.error("Error auto-linking specimens:", error);
      res.status(500).json({ error: "Failed to auto-link specimens" });
    }
  });

  // =============================================
  // SPECIMEN REQUESTS (Splits Sent) API ENDPOINTS
  // =============================================

  // Get all specimen requests
  app.get("/api/admin/specimen-requests", isAdmin, async (req: any, res) => {
    try {
      const { search, recipientId, status, limit = '100', offset = '0' } = req.query;
      
      let conditions: any[] = [];
      
      if (recipientId) {
        conditions.push(eq(specimenRequests.recipientId, parseInt(recipientId)));
      }
      if (status && status !== 'all') {
        conditions.push(eq(specimenRequests.status, status));
      }
      
      let requests = await db.select().from(specimenRequests)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(specimenRequests.shipmentDate), desc(specimenRequests.id))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));
      
      // Filter by search term if provided
      if (search) {
        const searchLower = (search as string).toLowerCase();
        requests = requests.filter(r => 
          r.observationId?.toLowerCase().includes(searchLower) ||
          r.voucherNumbers?.toLowerCase().includes(searchLower) ||
          r.mycoNumber?.toLowerCase().includes(searchLower) ||
          r.recipientName?.toLowerCase().includes(searchLower) ||
          r.notes?.toLowerCase().includes(searchLower)
        );
      }
      
      // Get total count
      const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
        .from(specimenRequests)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      
      res.json({
        requests,
        total: countResult?.count || 0,
      });
    } catch (error) {
      console.error("Error fetching specimen requests:", error);
      res.status(500).json({ error: "Failed to fetch specimen requests" });
    }
  });

  // Get specimen request stats
  app.get("/api/admin/specimen-requests/stats", isAdmin, async (req: any, res) => {
    try {
      const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(specimenRequests);
      const [shipped] = await db.select({ count: sql<number>`count(*)::int` }).from(specimenRequests)
        .where(eq(specimenRequests.status, 'shipped'));
      const [pending] = await db.select({ count: sql<number>`count(*)::int` }).from(specimenRequests)
        .where(eq(specimenRequests.status, 'pending'));
      
      // Get unique recipients count
      const [recipients] = await db.select({ count: sql<number>`count(distinct recipient_id)::int` })
        .from(specimenRequests)
        .where(isNotNull(specimenRequests.recipientId));
      
      res.json({
        total: total?.count || 0,
        shipped: shipped?.count || 0,
        pending: pending?.count || 0,
        uniqueRecipients: recipients?.count || 0,
      });
    } catch (error) {
      console.error("Error fetching specimen request stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Create specimen request
  app.post("/api/admin/specimen-requests", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id || null;
      const data = req.body;
      
      const [newRequest] = await db.insert(specimenRequests).values({
        ...data,
        createdBy: userId,
      }).returning();
      
      res.json(newRequest);
    } catch (error) {
      console.error("Error creating specimen request:", error);
      res.status(500).json({ error: "Failed to create specimen request" });
    }
  });

  // Update specimen request
  app.patch("/api/admin/specimen-requests/:id", isAdmin, async (req: any, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const data = req.body;
      
      const [updated] = await db.update(specimenRequests)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(specimenRequests.id, requestId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Request not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating specimen request:", error);
      res.status(500).json({ error: "Failed to update specimen request" });
    }
  });

  // Delete specimen request
  app.delete("/api/admin/specimen-requests/:id", isAdmin, async (req: any, res) => {
    try {
      const requestId = parseInt(req.params.id);
      
      await db.delete(specimenRequests).where(eq(specimenRequests.id, requestId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting specimen request:", error);
      res.status(500).json({ error: "Failed to delete specimen request" });
    }
  });

  // Import specimen requests from Excel data
  app.post("/api/admin/specimen-requests/import", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id || null;
      const { records } = req.body;
      
      if (!records || !Array.isArray(records)) {
        return res.status(400).json({ error: "records array is required" });
      }
      
      let imported = 0;
      for (const record of records) {
        await db.insert(specimenRequests).values({
          observationId: record.observationId || record['iNat/MO']?.toString(),
          voucherNumbers: record.voucherNumbers || record['Voucher Number(s)'],
          runNumber: record.runNumber || (record['Run Number'] ? parseInt(record['Run Number']) : null),
          plateCell: record.plateCell || record['Plate + Cell']?.toString(),
          mycoNumber: record.mycoNumber || record['MYCO #'],
          shipmentDate: record.shipmentDate || record['Shipment Date'],
          recipientName: record.recipientName || record['Recipient'],
          notes: record.notes || record['Notes'],
          otherNotes: record.otherNotes || record['Other Notes'],
          status: 'shipped',
          createdBy: userId,
        });
        imported++;
      }
      
      res.json({ imported, message: `Imported ${imported} specimen requests` });
    } catch (error) {
      console.error("Error importing specimen requests:", error);
      res.status(500).json({ error: "Failed to import specimen requests" });
    }
  });

  // =============================================
  // SPECIMEN RECIPIENTS API ENDPOINTS
  // =============================================

  // Get all recipients
  app.get("/api/admin/specimen-recipients", isAdmin, async (req: any, res) => {
    try {
      const { activeOnly } = req.query;
      
      let conditions: any[] = [];
      if (activeOnly === 'true') {
        conditions.push(eq(specimenRecipients.isActive, true));
      }
      
      const recipients = await db.select().from(specimenRecipients)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(specimenRecipients.name);
      
      res.json(recipients);
    } catch (error) {
      console.error("Error fetching recipients:", error);
      res.status(500).json({ error: "Failed to fetch recipients" });
    }
  });

  // Create recipient
  app.post("/api/admin/specimen-recipients", isAdmin, async (req: any, res) => {
    try {
      const data = req.body;
      
      const [newRecipient] = await db.insert(specimenRecipients).values(data).returning();
      
      res.json(newRecipient);
    } catch (error) {
      console.error("Error creating recipient:", error);
      res.status(500).json({ error: "Failed to create recipient" });
    }
  });

  // Update recipient
  app.patch("/api/admin/specimen-recipients/:id", isAdmin, async (req: any, res) => {
    try {
      const recipientId = parseInt(req.params.id);
      const data = req.body;
      
      const [updated] = await db.update(specimenRecipients)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(specimenRecipients.id, recipientId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Recipient not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating recipient:", error);
      res.status(500).json({ error: "Failed to update recipient" });
    }
  });

  // Get recipient by ID with full address
  app.get("/api/admin/specimen-recipients/:id", isAdmin, async (req: any, res) => {
    try {
      const recipientId = parseInt(req.params.id);
      
      const [recipient] = await db.select().from(specimenRecipients)
        .where(eq(specimenRecipients.id, recipientId));
      
      if (!recipient) {
        return res.status(404).json({ error: "Recipient not found" });
      }
      
      res.json(recipient);
    } catch (error) {
      console.error("Error fetching recipient:", error);
      res.status(500).json({ error: "Failed to fetch recipient" });
    }
  });

  // ============ PUBLIC FUNGARIUM API ============

  // Public: Validate specimen exists in system
  app.get("/api/public/fungarium/validate", async (req: any, res) => {
    try {
      const { mycoNumber, observationId, platform, voucherNumber } = req.query;
      
      if (!mycoNumber && !observationId && !voucherNumber) {
        return res.status(400).json({ error: "At least one identifier required" });
      }

      const conditions: any[] = [];

      // Search by MYCO number (format: MYCO1000129 or MYCO-2025-00129)
      if (mycoNumber) {
        const cleanMyco = (mycoNumber as string).replace(/-/g, '').toUpperCase();
        conditions.push(
          or(
            sql`REPLACE(${specimens.displayCode}, '-', '') ILIKE ${cleanMyco}`,
            sql`${specimens.uuid} ILIKE ${`%${mycoNumber}%`}`
          )
        );
      }

      // Search by observation ID and platform
      if (observationId && platform) {
        const platformMap: Record<string, string> = {
          'iNaturalist': 'inat',
          'inat': 'inat',
          'MO': 'mo',
          'MyCoPortal': 'mycoportal'
        };
        const normalizedPlatform = platformMap[platform as string] || (platform as string).toLowerCase();
        conditions.push(
          and(
            eq(specimens.primaryObservationSource, normalizedPlatform),
            eq(specimens.primaryObservationId, observationId as string)
          )
        );
      }

      // Search by voucher number
      if (voucherNumber) {
        conditions.push(sql`${specimens.voucherNumber} ILIKE ${`%${voucherNumber}%`}`);
      }

      if (conditions.length === 0) {
        return res.json({ found: false });
      }

      const [specimen] = await db.select({
        id: specimens.id,
        displayCode: specimens.displayCode,
        scientificName: specimens.scientificName,
        currentStatus: specimens.currentStatus,
      })
      .from(specimens)
      .where(or(...conditions))
      .limit(1);

      if (specimen) {
        res.json({
          found: true,
          displayCode: specimen.displayCode,
          scientificName: specimen.scientificName,
          status: specimen.currentStatus
        });
      } else {
        res.json({ found: false });
      }
    } catch (error) {
      console.error("Error validating specimen:", error);
      res.status(500).json({ error: "Validation failed" });
    }
  });

  // Public: Search specimens (with same filters as admin but no mutation capabilities)
  app.get("/api/public/fungarium/specimens", async (req: any, res) => {
    try {
      const { search, status, validationFlag, validationFlags: validationFlagsParam, dateFrom, dateTo, hasSequence, limit: limitParam = "50", offset: offsetParam = "0" } = req.query;
      const limit = Math.min(parseInt(limitParam as string) || 50, 100);
      const offset = parseInt(offsetParam as string) || 0;
      
      // Support both single validationFlag (legacy) and comma-separated validationFlags
      const flagsRaw = validationFlagsParam || validationFlag || '';
      const validationFlags = flagsRaw ? (flagsRaw as string).split(',').filter((f: string) => f && f !== 'all') : [];

      const conditions: any[] = [];
      
      // Status filter
      if (status && status !== 'all') {
        conditions.push(eq(specimens.currentStatus, status as string));
      }

      // Search term
      if (search) {
        const searchTerm = `%${search}%`;
        conditions.push(
          or(
            sql`${specimens.scientificName} ILIKE ${searchTerm}`,
            sql`${specimens.displayCode} ILIKE ${searchTerm}`,
            sql`${specimens.locality} ILIKE ${searchTerm}`,
            sql`${specimens.voucherNumber} ILIKE ${searchTerm}`,
            sql`${specimens.collectorName} ILIKE ${searchTerm}`,
            sql`${specimens.primaryObservationId} ILIKE ${searchTerm}`,
            sql`${specimens.state} ILIKE ${searchTerm}`,
            sql`${specimens.country} ILIKE ${searchTerm}`,
            sql`${observationCache.observerUsername} ILIKE ${searchTerm}`,
            sql`${observationCache.herbariumCatalogNumber} ILIKE ${searchTerm}`
          )
        );
      }

      // Validation flag filter - supports multiple flags (OR logic)
      if (validationFlags.length > 0) {
        const flagConditions: any[] = [];
        for (const flag of validationFlags) {
          if (flag === 'has_flag') {
            flagConditions.push(sql`${specimens.inatFieldConflict} IS NOT NULL AND ${specimens.inatFieldConflict} != ''`);
          } else if (flag === 'no_flag') {
            flagConditions.push(sql`(${specimens.inatFieldConflict} IS NULL OR ${specimens.inatFieldConflict} = '')`);
          } else if (flag === 'conflicts') {
            flagConditions.push(sql`${specimens.inatFieldConflict} IN ('herbarium_catalog_conflict', 'herbarium_name_conflict', 'both_conflict', 'push_incomplete')`);
          } else if (flag === 'push_incomplete') {
            // Dynamic flag: iNat records with push incomplete status
            // Condition 1: Has MYCO number but cache missing catalog/name
            // Condition 2: Cache has MYCO in catalog but missing herbarium_name
            flagConditions.push(sql`(
              ${specimens.primaryObservationSource} = 'inat'
              AND (
                (
                  ${specimens.mycoNumber} IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM observation_cache oc 
                    WHERE oc.source = 'inat' 
                      AND oc.source_observation_id = ${specimens.primaryObservationId}
                      AND oc.herbarium_catalog_number LIKE '%' || ${specimens.mycoNumber}::text || '%'
                      AND oc.herbarium_name IS NOT NULL 
                      AND oc.herbarium_name != ''
                  )
                )
                OR EXISTS (
                  SELECT 1 FROM observation_cache oc 
                  WHERE oc.source = 'inat' 
                    AND oc.source_observation_id = ${specimens.primaryObservationId}
                    AND oc.herbarium_catalog_number LIKE '%MYCO%'
                    AND (oc.herbarium_name IS NULL OR oc.herbarium_name = '')
                )
              )
            )`);
          } else if (flag === 'herbarium_catalog_conflict') {
            // Dynamic flag: catalog conflict includes stored conflicts + specimens without MYCO but with catalog data
            // Exclude University of West Alabama Herbarium - their catalog numbers are valid
            flagConditions.push(sql`(
              ${specimens.inatFieldConflict} = 'herbarium_catalog_conflict'
              OR ${specimens.inatFieldConflict} = 'both_conflict'
              OR (
                ${specimens.primaryObservationSource} = 'inat'
                AND ${specimens.mycoNumber} IS NULL
                AND EXISTS (
                  SELECT 1 FROM observation_cache oc 
                  WHERE oc.source = 'inat' 
                    AND oc.source_observation_id = ${specimens.primaryObservationId}
                    AND oc.herbarium_catalog_number IS NOT NULL 
                    AND oc.herbarium_catalog_number != ''
                    AND (oc.herbarium_name IS NULL OR oc.herbarium_name NOT LIKE '%University of West Alabama Herbarium%')
                )
              )
            )`);
          } else {
            flagConditions.push(eq(specimens.inatFieldConflict, flag as string));
          }
        }
        if (flagConditions.length > 0) {
          conditions.push(or(...flagConditions));
        }
      }

      // Date range filter
      if (dateFrom) {
        conditions.push(sql`${specimens.collectionDate} >= ${dateFrom}`);
      }
      if (dateTo) {
        conditions.push(sql`${specimens.collectionDate} <= ${dateTo}`);
      }

      // Build query - always left join to observation cache to get observerUsername
      const selectFields = {
        id: specimens.id,
        uuid: specimens.uuid,
        displayCode: specimens.displayCode,
        scientificName: specimens.scientificName,
        locality: specimens.locality,
        state: specimens.state,
        country: specimens.country,
        collectionDate: specimens.collectionDate,
        collectorName: specimens.collectorName,
        currentStatus: specimens.currentStatus,
        primaryObservationSource: specimens.primaryObservationSource,
        primaryObservationId: specimens.primaryObservationId,
        voucherNumber: specimens.voucherNumber,
        inatFieldConflict: specimens.inatFieldConflict,
        observerUsername: observationCache.observerUsername,
      };

      let query;
      if (hasSequence === 'true') {
        query = db.select(selectFields)
        .from(specimens)
        .innerJoin(observationCache, and(
          sql`${observationCache.source} = ${specimens.primaryObservationSource}::text`,
          eq(observationCache.sourceObservationId, specimens.primaryObservationId)
        ))
        .where(conditions.length > 0 ? and(...conditions, isNotNull(observationCache.dnaBarcodeIts), sql`${observationCache.dnaBarcodeIts} != ''`) : and(isNotNull(observationCache.dnaBarcodeIts), sql`${observationCache.dnaBarcodeIts} != ''`))
        .orderBy(desc(specimens.id))
        .limit(limit)
        .offset(offset);
      } else {
        query = db.select(selectFields)
        .from(specimens)
        .leftJoin(observationCache, and(
          sql`${observationCache.source} = ${specimens.primaryObservationSource}::text`,
          eq(observationCache.sourceObservationId, specimens.primaryObservationId)
        ))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(specimens.id))
        .limit(limit)
        .offset(offset);
      }

      const specimenList = await query;

      // Count query
      let countQuery;
      if (hasSequence === 'true') {
        countQuery = db.select({ count: sql<number>`count(*)` })
          .from(specimens)
          .innerJoin(observationCache, and(
            sql`${observationCache.source} = ${specimens.primaryObservationSource}::text`,
            eq(observationCache.sourceObservationId, specimens.primaryObservationId)
          ))
          .where(conditions.length > 0 ? and(...conditions, isNotNull(observationCache.dnaBarcodeIts), sql`${observationCache.dnaBarcodeIts} != ''`) : and(isNotNull(observationCache.dnaBarcodeIts), sql`${observationCache.dnaBarcodeIts} != ''`));
      } else {
        countQuery = db.select({ count: sql<number>`count(*)` })
          .from(specimens)
          .where(conditions.length > 0 ? and(...conditions) : undefined);
      }

      const countResult = await countQuery;

      res.json({
        specimens: specimenList,
        total: Number(countResult[0]?.count || 0),
        limit,
        offset
      });
    } catch (error) {
      console.error("Error searching specimens:", error);
      res.status(500).json({ error: "Failed to search specimens" });
    }
  });

  // Public: Submit specimen request
  const publicSpecimenRequestSchema = z.object({
    requestType: z.enum(['donation', 'donation_majority', 'loan', 'image', 'data']),
    specimenIds: z.string().min(1, "At least one specimen ID required").max(500),
    name: z.string().min(2, "Name required").max(200),
    institution: z.string().min(2, "Institution required").max(300),
    email: z.string().email("Valid email required").max(200),
    phone: z.string().max(50).optional().default(''),
    addressLine1: z.string().max(200).optional().default(''),
    addressLine2: z.string().max(200).optional().default(''),
    city: z.string().max(100).optional().default(''),
    state: z.string().max(100).optional().default(''),
    postalCode: z.string().max(20).optional().default(''),
    country: z.string().max(100).optional().default('USA'),
    purpose: z.enum(['taxonomic', 'molecular', 'ecological', 'educational', 'verification', 'other']),
    projectDescription: z.string().max(2000).optional().default(''),
    expectedReturnDate: z.string().optional().default(''),
    agreeToTerms: z.literal(true, { errorMap: () => ({ message: "You must agree to the loan terms" }) }),
  });

  app.post("/api/public/fungarium/request", async (req: any, res) => {
    try {
      const parseResult = publicSpecimenRequestSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        const errorMessage = parseResult.error.errors.map(e => e.message).join(', ');
        return res.status(400).json({ error: errorMessage });
      }
      
      const validated = parseResult.data;

      // First, check if there's a "Public Request" recipient or create one
      let [publicRecipient] = await db.select().from(specimenRecipients)
        .where(eq(specimenRecipients.name, "Public Requests"));
      
      if (!publicRecipient) {
        [publicRecipient] = await db.insert(specimenRecipients).values({
          name: "Public Requests",
          email: "pending@mycomap.org",
          notes: "Auto-created recipient for public specimen requests"
        }).returning();
      }

      // Create the request with the validated details in notes
      const requestNotes = JSON.stringify({
        requestType: validated.requestType,
        name: validated.name,
        institution: validated.institution,
        email: validated.email,
        phone: validated.phone,
        address: { 
          addressLine1: validated.addressLine1, 
          addressLine2: validated.addressLine2, 
          city: validated.city, 
          state: validated.state, 
          postalCode: validated.postalCode, 
          country: validated.country 
        },
        purpose: validated.purpose,
        projectDescription: validated.projectDescription,
        expectedReturnDate: validated.expectedReturnDate,
        submittedAt: new Date().toISOString()
      });

      const [newRequest] = await db.insert(specimenRequests).values({
        recipientId: publicRecipient.id,
        notes: requestNotes,
        otherNotes: `Specimen IDs: ${validated.specimenIds}`,
        shipmentDate: null,
      }).returning();

      res.json({ success: true, requestId: newRequest.id });
    } catch (error) {
      console.error("Error submitting specimen request:", error);
      res.status(500).json({ error: "Failed to submit request" });
    }
  });

  // =============================================
  // UNIFIED OBSERVATION CACHE - Admin Migration
  // =============================================
  
  app.post("/api/admin/observation-cache/migrate", isAdmin, async (req: any, res) => {
    try {
      const { runFullMigration } = await import("./migrateObservationCache");
      
      res.json({ message: "Migration started. Check server logs for progress." });
      
      runFullMigration()
        .then((stats) => {
          console.log("[Migration] Completed:", stats);
        })
        .catch((error) => {
          console.error("[Migration] Failed:", error);
        });
    } catch (error) {
      console.error("Error starting migration:", error);
      res.status(500).json({ error: "Failed to start migration" });
    }
  });
  
  app.get("/api/admin/observation-cache/stats", isAdmin, async (req: any, res) => {
    try {
      const [cacheStats] = await db.select({
        totalObservations: sql<number>`count(*)::int`,
        inatCount: sql<number>`count(*) filter (where source = 'inat')::int`,
        moCount: sql<number>`count(*) filter (where source = 'mo')::int`,
        mycoportalCount: sql<number>`count(*) filter (where source = 'mycoportal')::int`,
      }).from(observationCache);
      
      const [mediaStats] = await db.select({
        totalMedia: sql<number>`count(*)::int`,
      }).from(observationMedia);
      
      const [taxaStats] = await db.select({
        totalTaxa: sql<number>`count(*)::int`,
      }).from(observationTaxa);
      
      res.json({
        observationCache: cacheStats,
        media: mediaStats,
        taxa: taxaStats,
      });
    } catch (error) {
      console.error("Error getting cache stats:", error);
      res.status(500).json({ error: "Failed to get cache stats" });
    }
  });

  return httpServer;
}
