#!/usr/bin/env node

/**
 * iNaturalist API Sync - Ad-hoc Processing Script
 * Simple script to process remaining iNaturalist API calls
 */

const { drizzle } = require('drizzle-orm/neon-http');
const { neon } = require('@neondatabase/serverless');
const { observations, inaturalistData, inaturalistPlaces } = require('./shared/schema.ts');
const { eq, and, isNull, inArray, sql } = require('drizzle-orm');

const connection = neon(process.env.DATABASE_URL);
const db = drizzle(connection);

// Configuration
const BATCH_SIZE = 50; // Process 50 API calls per batch
const DELAY_BETWEEN_BATCHES = 2000; // 2 second delay between batches
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 10000; // 10 second timeout per API call

let totalProcessed = 0;
let totalSuccessful = 0;
let totalFailed = 0;
let currentBatch = 0;

/**
 * Fetch data from iNaturalist API with retry logic
 */
async function fetchInatAPI(inatId, retryCount = 0) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    const response = await fetch(
      `https://api.inaturalist.org/v1/observations/${inatId}`,
      { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'MycoMap/1.0 (mycomap@example.com)'
        }
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`  ❌ iNaturalist ID ${inatId} not found (404)`);
        return { success: false, error: 'not_found', data: null };
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return { success: true, data: data.results[0] || null };
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`  ⏱️ Timeout for iNaturalist ID ${inatId}`);
      if (retryCount < MAX_RETRIES) {
        console.log(`  🔄 Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return fetchInatAPI(inatId, retryCount + 1);
      }
      return { success: false, error: 'timeout', data: null };
    }
    
    console.log(`  ❌ API error for ${inatId}: ${error.message}`);
    if (retryCount < MAX_RETRIES) {
      console.log(`  🔄 Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
      return fetchInatAPI(inatId, retryCount + 1);
    }
    
    return { success: false, error: error.message, data: null };
  }
}

/**
 * Extract state from place_ids using existing places data
 */
async function extractStateFromPlaceIds(placeIds) {
  if (!placeIds || placeIds.length === 0) return null;
  
  try {
    const places = await db
      .select({ name: inaturalistPlaces.name })
      .from(inaturalistPlaces)
      .where(and(
        inArray(inaturalistPlaces.placeId, placeIds),
        eq(inaturalistPlaces.adminLevel, 10),
        eq(inaturalistPlaces.placeType, '8')
      ))
      .limit(1);
    
    if (places.length > 0 && places[0].name) {
      return places[0].name;
    }
  } catch (error) {
    console.log(`  ⚠️ Error extracting state from place_ids: ${error.message}`);
  }
  
  return null;
}

/**
 * Update observation location data if missing
 */
async function updateObservationLocation(observationId, inatData) {
  try {
    const observation = await db
      .select({ state: observations.state, latitude: observations.latitude, longitude: observations.longitude })
      .from(observations)
      .where(eq(observations.observationId, observationId))
      .limit(1);
    
    if (observation.length === 0) return;
    
    const obs = observation[0];
    const updates = {};
    
    // Update state if missing and we can extract it
    if (!obs.state && inatData.place_ids) {
      const state = await extractStateFromPlaceIds(inatData.place_ids);
      if (state) {
        updates.state = state;
      }
    }
    
    // Update coordinates if missing
    if ((!obs.latitude || !obs.longitude) && inatData.location) {
      const [lat, lng] = inatData.location.split(',').map(parseFloat);
      if (!isNaN(lat) && !isNaN(lng)) {
        updates.latitude = lat;
        updates.longitude = lng;
      }
    }
    
    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await db
        .update(observations)
        .set(updates)
        .where(eq(observations.observationId, observationId));
      
      console.log(`  📍 Updated location data for ${observationId}: ${Object.keys(updates).join(', ')}`);
    }
    
  } catch (error) {
    console.log(`  ⚠️ Error updating location for ${observationId}: ${error.message}`);
  }
}

/**
 * Process a single iNaturalist record
 */
async function processInatRecord(record) {
  const { observationId, inatId } = record;
  
  console.log(`  📡 Fetching API data for ${observationId} (iNat ID: ${inatId})`);
  
  const result = await fetchInatAPI(inatId);
  
  const updateData = {
    lastSyncedAt: new Date(),
    syncStatus: result.success ? 'success' : 'failed',
    syncError: result.success ? null : result.error
  };
  
  if (result.success && result.data) {
    const inatApiData = result.data;
    
    // Update the iNaturalist data record with API response
    Object.assign(updateData, {
      inatUuid: inatApiData.uuid || null,
      quality: inatApiData.quality_grade || null,
      captive: inatApiData.captive || false,
      geoprivacy: inatApiData.geoprivacy || null,
      taxonGeoprivacy: inatApiData.taxon_geoprivacy || null,
      coordinatesObscured: inatApiData.coordinates_obscured || false,
      publicPositionalAccuracy: inatApiData.public_positional_accuracy || null,
      licenseCode: inatApiData.license_code || null,
      photos: inatApiData.photos ? JSON.stringify(inatApiData.photos) : null,
      sounds: inatApiData.sounds ? JSON.stringify(inatApiData.sounds) : null,
      observationFields: inatApiData.ofvs ? JSON.stringify(inatApiData.ofvs) : null,
      projectIds: inatApiData.project_ids || null,
      placeIds: inatApiData.place_ids || null,
      taxon: inatApiData.taxon ? JSON.stringify(inatApiData.taxon) : null,
      user: inatApiData.user ? JSON.stringify(inatApiData.user) : null,
      identificationCount: inatApiData.identifications_count || 0,
      numIdentificationAgreements: inatApiData.num_identification_agreements || 0,
      numIdentificationDisagreements: inatApiData.num_identification_disagreements || 0,
      commentsCount: inatApiData.comments_count || 0,
      createdAtInat: inatApiData.created_at ? new Date(inatApiData.created_at) : null,
      updatedAtInat: inatApiData.updated_at ? new Date(inatApiData.updated_at) : null,
      timeObservedAt: inatApiData.time_observed_at ? new Date(inatApiData.time_observed_at) : null,
      timeZone: inatApiData.time_zone || null,
      observedOnDetails: inatApiData.observed_on_details ? JSON.stringify(inatApiData.observed_on_details) : null,
      speciesGuess: inatApiData.species_guess || null,
      tags: inatApiData.tags ? JSON.stringify(inatApiData.tags) : null,
      description: inatApiData.description || null,
      application: inatApiData.application ? JSON.stringify(inatApiData.application) : null
    });
    
    // Update location data in observations table if missing
    await updateObservationLocation(observationId, inatApiData);
    
    console.log(`  ✅ Successfully synced ${observationId}`);
    totalSuccessful++;
  } else {
    console.log(`  ❌ Failed to sync ${observationId}: ${result.error}`);
    totalFailed++;
  }
  
  // Update the iNaturalist data record
  await db
    .update(inaturalistData)
    .set(updateData)
    .where(eq(inaturalistData.observationId, observationId));
  
  totalProcessed++;
}

/**
 * Get pending iNaturalist records that need API sync
 */
async function getPendingRecords(limit = BATCH_SIZE) {
  try {
    const records = await db
      .select({
        observationId: inaturalistData.observationId,
        inatId: inaturalistData.inatId
      })
      .from(inaturalistData)
      .where(
        and(
          isNull(inaturalistData.syncStatus),
          isNull(inaturalistData.lastSyncedAt)
        )
      )
      .limit(limit);
    
    return records;
  } catch (error) {
    console.error(`❌ Error fetching pending records: ${error.message}`);
    return [];
  }
}

/**
 * Get total count of pending records
 */
async function getTotalPendingCount() {
  try {
    const result = await db
      .select({ count: sql`count(*)::int` })
      .from(inaturalistData)
      .where(
        and(
          isNull(inaturalistData.syncStatus),
          isNull(inaturalistData.lastSyncedAt)
        )
      );
    
    return result[0]?.count || 0;
  } catch (error) {
    console.error(`❌ Error getting pending count: ${error.message}`);
    return 0;
  }
}

/**
 * Main processing function
 */
async function systematicInatApiSync() {
  console.log('🚀 Starting Systematic iNaturalist API Sync');
  console.log('='.repeat(50));
  
  const startTime = Date.now();
  const totalPending = await getTotalPendingCount();
  
  console.log(`📊 Total pending API calls: ${totalPending.toLocaleString()}`);
  console.log(`⚙️ Batch size: ${BATCH_SIZE}`);
  console.log(`⏱️ Delay between batches: ${DELAY_BETWEEN_BATCHES}ms`);
  console.log(`🔄 Max retries per call: ${MAX_RETRIES}`);
  console.log('');
  
  if (totalPending === 0) {
    console.log('✅ No pending API calls found. All records are already synced!');
    return;
  }
  
  let pendingRecords = await getPendingRecords(BATCH_SIZE);
  
  while (pendingRecords.length > 0) {
    currentBatch++;
    const remaining = totalPending - totalProcessed;
    
    console.log(`🔄 Processing Batch ${currentBatch} (${pendingRecords.length} records)`);
    console.log(`📈 Progress: ${totalProcessed}/${totalPending} (${((totalProcessed / totalPending) * 100).toFixed(1)}%)`);
    console.log(`⏳ Remaining: ${remaining.toLocaleString()} records`);
    console.log('-'.repeat(30));
    
    // Process current batch
    for (const record of pendingRecords) {
      await processInatRecord(record);
    }
    
    // Progress summary for this batch
    const successRate = totalProcessed > 0 ? ((totalSuccessful / totalProcessed) * 100).toFixed(1) : '0.0';
    console.log(`📊 Batch ${currentBatch} Complete: ${pendingRecords.length} processed`);
    console.log(`✅ Overall Success Rate: ${successRate}% (${totalSuccessful}/${totalProcessed})`);
    console.log(`❌ Total Failed: ${totalFailed}`);
    
    // Get next batch
    pendingRecords = await getPendingRecords(BATCH_SIZE);
    
    if (pendingRecords.length > 0) {
      console.log(`⏸️ Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
      console.log('');
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000 / 60).toFixed(1);
  const finalSuccessRate = totalProcessed > 0 ? ((totalSuccessful / totalProcessed) * 100).toFixed(1) : '0.0';
  
  console.log('');
  console.log('🎉 Systematic iNaturalist API Sync Complete!');
  console.log('='.repeat(50));
  console.log(`⏱️ Total Duration: ${duration} minutes`);
  console.log(`📊 Total Processed: ${totalProcessed.toLocaleString()}`);
  console.log(`✅ Successful: ${totalSuccessful.toLocaleString()} (${finalSuccessRate}%)`);
  console.log(`❌ Failed: ${totalFailed.toLocaleString()}`);
  console.log(`🔄 Batches Processed: ${currentBatch}`);
  
  if (totalSuccessful > 0) {
    const avgTimePerRecord = (endTime - startTime) / totalSuccessful;
    console.log(`⚡ Average Time per Successful API Call: ${avgTimePerRecord.toFixed(0)}ms`);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received interrupt signal. Gracefully shutting down...');
  console.log(`📊 Final Stats: ${totalProcessed} processed, ${totalSuccessful} successful, ${totalFailed} failed`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received termination signal. Gracefully shutting down...');
  console.log(`📊 Final Stats: ${totalProcessed} processed, ${totalSuccessful} successful, ${totalFailed} failed`);
  process.exit(0);
});

// Start the sync process
systematicInatApiSync().catch(error => {
  console.error('💥 Fatal error in systematic API sync:', error);
  process.exit(1);
});