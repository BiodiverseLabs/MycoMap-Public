import { db } from "./db";
import { fitnessObservationCache, fitnessUserObservations, observationCache, observationMedia } from "@shared/schema";
import { eq, sql, and, isNull, inArray } from "drizzle-orm";

const BATCH_SIZE = 500;

async function migrateFitnessToUnifiedCache() {
  console.log("Starting fitness observation migration to unified cache...\n");
  
  // Get total count of fitness observations
  const totalResult = await db.select({ count: sql<number>`count(*)` })
    .from(fitnessObservationCache)
    .where(isNull(fitnessObservationCache.deletedAt));
  
  const totalCount = Number(totalResult[0].count);
  console.log(`Total fitness observations to migrate: ${totalCount}\n`);
  
  // Check how many are already linked
  const existingLinks = await db.select({ count: sql<number>`count(*)` })
    .from(fitnessUserObservations);
  console.log(`Existing links in fitness_user_observations: ${existingLinks[0].count}\n`);
  
  let processed = 0;
  let created = 0;
  let linked = 0;
  let offset = 0;
  
  while (offset < totalCount) {
    // Fetch batch of fitness observations
    const batch = await db.select()
      .from(fitnessObservationCache)
      .where(isNull(fitnessObservationCache.deletedAt))
      .orderBy(fitnessObservationCache.id)
      .limit(BATCH_SIZE)
      .offset(offset);
    
    if (batch.length === 0) break;
    
    // Get all observation IDs in this batch
    const obsIds = batch.map(o => String(o.observationId));
    
    // Check which already exist in unified cache
    const existingCache = await db.select({
      id: observationCache.id,
      sourceObservationId: observationCache.sourceObservationId,
    })
      .from(observationCache)
      .where(and(
        eq(observationCache.source, "inat"),
        inArray(observationCache.sourceObservationId, obsIds)
      ));
    
    const existingCacheMap = new Map(existingCache.map(e => [e.sourceObservationId, e.id]));
    
    // Collect observations to insert into cache
    const toInsert = batch.filter(o => !existingCacheMap.has(String(o.observationId)));
    
    if (toInsert.length > 0) {
      // Bulk insert new observation cache records
      const insertedCache = await db.insert(observationCache).values(
        toInsert.map(obs => ({
          source: "inat" as const,
          sourceObservationId: String(obs.observationId),
          scientificName: obs.scientificName || null,
          commonName: obs.commonName || null,
          observedOn: obs.observedOn || null,
          latitude: obs.latitude || null,
          longitude: obs.longitude || null,
          placeGuess: obs.placeGuess || null,
          qualityGrade: null,
          captive: false,
          numIdentificationAgreements: null,
          numIdentificationDisagreements: null,
          inatUpdatedAt: obs.inatUpdatedAt || null,
        }))
      ).returning({ id: observationCache.id, sourceObservationId: observationCache.sourceObservationId });
      
      // Add to map
      for (const rec of insertedCache) {
        existingCacheMap.set(rec.sourceObservationId, rec.id);
      }
      created += insertedCache.length;
      
      // Also insert photos
      const photosToInsert = toInsert
        .filter(o => o.photoUrl)
        .map(o => ({
          observationCacheId: existingCacheMap.get(String(o.observationId))!,
          mediaType: "photo" as const,
          url: o.photoUrl!,
          position: 0,
        }));
      
      if (photosToInsert.length > 0) {
        await db.insert(observationMedia).values(photosToInsert).onConflictDoNothing();
      }
    }
    
    // Check which user-observation links already exist
    const batchUsernames = [...new Set(batch.map(o => o.username))];
    const existingUserLinks = await db.select({
      username: fitnessUserObservations.username,
      sourceObservationId: fitnessUserObservations.sourceObservationId,
    })
      .from(fitnessUserObservations)
      .where(and(
        inArray(fitnessUserObservations.username, batchUsernames),
        inArray(fitnessUserObservations.sourceObservationId, obsIds)
      ));
    
    const existingLinkSet = new Set(existingUserLinks.map(l => `${l.username}:${l.sourceObservationId}`));
    
    // Create links for observations that don't have them
    const linksToInsert = batch
      .filter(o => !existingLinkSet.has(`${o.username}:${String(o.observationId)}`))
      .map(o => ({
        username: o.username,
        observationCacheId: existingCacheMap.get(String(o.observationId))!,
        sourceObservationId: String(o.observationId),
        observedOn: o.observedOn || null,
        inatUpdatedAt: o.inatUpdatedAt || null,
        deletedAt: o.deletedAt || null,
      }));
    
    if (linksToInsert.length > 0) {
      await db.insert(fitnessUserObservations).values(linksToInsert).onConflictDoNothing();
      linked += linksToInsert.length;
    }
    
    processed += batch.length;
    offset += BATCH_SIZE;
    console.log(`Processed ${processed}/${totalCount} (${Math.round(processed/totalCount*100)}%) - Created: ${created}, Linked: ${linked}`);
  }
  
  console.log(`\nMigration complete!`);
  console.log(`Total processed: ${processed}`);
  console.log(`New observation_cache records: ${created}`);
  console.log(`New fitness_user_observations links: ${linked}`);
  
  // Show final counts
  const finalCacheCount = await db.select({ count: sql<number>`count(*)` })
    .from(observationCache);
  const finalLinkCount = await db.select({ count: sql<number>`count(*)` })
    .from(fitnessUserObservations);
  
  console.log(`\nFinal counts:`);
  console.log(`observation_cache: ${finalCacheCount[0].count}`);
  console.log(`fitness_user_observations: ${finalLinkCount[0].count}`);
}

migrateFitnessToUnifiedCache()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
