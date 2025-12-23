import { db } from "./db";
import { 
  observationCache, observationMedia, observationTaxa,
  inatObservationsCache, moObservationsCache, 
  inaturalistData, mushroomObserverData
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";

interface MigrationStats {
  inatCacheProcessed: number;
  inatDataProcessed: number;
  moProcessed: number;
  mediaCreated: number;
  taxaCreated: number;
  errors: string[];
}

function extractVoucherNumber(data: any): string | null {
  if (!data) return null;
  
  const observationFields = typeof data === 'string' ? 
    JSON.parse(data) : data;
  
  if (Array.isArray(observationFields)) {
    for (const field of observationFields) {
      if (field.field_id === 14618 || field.name?.toLowerCase().includes('voucher')) {
        return field.value;
      }
    }
  }
  return null;
}

function extractDnaBarcode(data: any): string | null {
  if (!data) return null;
  
  const observationFields = typeof data === 'string' ? 
    JSON.parse(data) : data;
  
  if (Array.isArray(observationFields)) {
    for (const field of observationFields) {
      if (field.field_id === 2330 || field.name?.toLowerCase().includes('dna barcode')) {
        return field.value;
      }
    }
  }
  return null;
}

export async function migrateInatObservationsCache(stats: MigrationStats): Promise<void> {
  console.log("[Migration] Starting iNat observations cache migration...");
  
  const batchSize = 500;
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const batch = await db.select()
      .from(inatObservationsCache)
      .limit(batchSize)
      .offset(offset);
    
    if (batch.length === 0) {
      hasMore = false;
      break;
    }
    
    for (const obs of batch) {
      try {
        let userData: any = null;
        try {
          userData = obs.userData ? JSON.parse(obs.userData) : null;
        } catch {}
        
        let taxonData: any = null;
        try {
          taxonData = obs.taxonData ? JSON.parse(obs.taxonData) : null;
        } catch {}
        
        const existing = await db.select()
          .from(observationCache)
          .where(eq(observationCache.sourceObservationId, String(obs.inatId)))
          .limit(1);
        
        if (existing.length > 0) {
          offset++;
          continue;
        }
        
        await db.insert(observationCache).values({
          source: 'inat',
          sourceObservationId: String(obs.inatId),
          scientificName: obs.scientificName,
          commonName: obs.commonName,
          family: obs.family || taxonData?.family,
          genus: taxonData?.genus,
          species: taxonData?.species,
          taxonRank: obs.rank,
          observerName: obs.userName,
          observerUsername: obs.userLogin,
          observerId: userData?.id ? String(userData.id) : null,
          latitude: obs.latitude,
          longitude: obs.longitude,
          placeGuess: obs.placeGuess,
          observedOn: obs.observedOn,
          qualityGrade: obs.qualityGrade,
          apiResponseJson: obs.taxonData,
          lastSyncedAt: obs.updatedAt || new Date(),
          syncStatus: 'success',
        });
        
        stats.inatCacheProcessed++;
        
        if (obs.photos && obs.photos.length > 0) {
          const [inserted] = await db.select()
            .from(observationCache)
            .where(eq(observationCache.sourceObservationId, String(obs.inatId)))
            .limit(1);
          
          if (inserted) {
            for (let i = 0; i < obs.photos.length; i++) {
              await db.insert(observationMedia).values({
                observationCacheId: inserted.id,
                mediaType: 'photo',
                url: obs.photos[i],
                sortOrder: i,
              });
              stats.mediaCreated++;
            }
          }
        }
      } catch (error: any) {
        stats.errors.push(`iNat cache ${obs.inatId}: ${error.message}`);
      }
    }
    
    offset += batch.length;
    console.log(`[Migration] iNat cache: processed ${offset} records`);
  }
}

export async function migrateInaturalistData(stats: MigrationStats): Promise<void> {
  console.log("[Migration] Starting iNaturalist detailed data migration...");
  
  const batchSize = 500;
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const batch = await db.select()
      .from(inaturalistData)
      .limit(batchSize)
      .offset(offset);
    
    if (batch.length === 0) {
      hasMore = false;
      break;
    }
    
    for (const obs of batch) {
      try {
        const existing = await db.select()
          .from(observationCache)
          .where(eq(observationCache.sourceObservationId, obs.inatId))
          .limit(1);
        
        let taxonData: any = null;
        try {
          taxonData = obs.taxon ? JSON.parse(obs.taxon) : null;
        } catch {}
        
        let userData: any = null;
        try {
          userData = obs.user ? JSON.parse(obs.user) : null;
        } catch {}
        
        const voucherNumber = extractVoucherNumber(obs.observationFields) || 
          (obs.observationFields ? extractVoucherNumber(obs.observationFields) : null);
        
        const cacheData = {
          source: 'inat' as const,
          sourceObservationId: obs.inatId,
          sourceUuid: obs.inatUuid,
          scientificName: taxonData?.name,
          commonName: taxonData?.preferred_common_name,
          family: taxonData?.ancestors?.find((a: any) => a.rank === 'family')?.name,
          genus: taxonData?.ancestors?.find((a: any) => a.rank === 'genus')?.name || taxonData?.genus_taxon_id ? taxonData?.name?.split(' ')[0] : null,
          species: taxonData?.name,
          taxonRank: taxonData?.rank,
          observerName: userData?.name || userData?.login,
          observerUsername: userData?.login,
          observerId: userData?.id ? String(userData.id) : null,
          coordinatesObscured: obs.coordinatesObscured || false,
          positionalAccuracy: obs.publicPositionalAccuracy,
          description: obs.description,
          observedOnString: obs.observedOnString,
          timeObservedAt: obs.timeObservedAt,
          qualityGrade: obs.quality,
          identificationCount: obs.identificationCount || 0,
          captive: obs.captive || false,
          licenseCode: obs.licenseCode,
          dnaBarcode: obs.dnaBarcode,
          genbankAccession: obs.inatGenbankAccession,
          provisionalSpeciesName: obs.provisionalSpeciesName,
          voucherNumber: voucherNumber,
          apiResponseJson: obs.taxon,
          lastSyncedAt: obs.lastSyncedAt || new Date(),
          syncStatus: obs.syncStatus || 'success',
          syncError: obs.syncError,
        };
        
        if (existing.length > 0) {
          await db.update(observationCache)
            .set({ ...cacheData, updatedAt: new Date() })
            .where(eq(observationCache.id, existing[0].id));
        } else {
          await db.insert(observationCache).values(cacheData);
        }
        
        stats.inatDataProcessed++;
        
        const [inserted] = await db.select()
          .from(observationCache)
          .where(eq(observationCache.sourceObservationId, obs.inatId))
          .limit(1);
        
        if (inserted && obs.photos && obs.photos.length > 0) {
          const existingMedia = await db.select()
            .from(observationMedia)
            .where(eq(observationMedia.observationCacheId, inserted.id))
            .limit(1);
          
          if (existingMedia.length === 0) {
            for (let i = 0; i < obs.photos.length; i++) {
              await db.insert(observationMedia).values({
                observationCacheId: inserted.id,
                mediaType: 'photo',
                url: obs.photos[i],
                sortOrder: i,
              });
              stats.mediaCreated++;
            }
          }
        }
      } catch (error: any) {
        stats.errors.push(`iNat data ${obs.inatId}: ${error.message}`);
      }
    }
    
    offset += batch.length;
    console.log(`[Migration] iNat data: processed ${offset} records`);
  }
}

export async function migrateMoObservationsCache(stats: MigrationStats): Promise<void> {
  console.log("[Migration] Starting MO observations cache migration...");
  
  const batchSize = 500;
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const batch = await db.select()
      .from(moObservationsCache)
      .limit(batchSize)
      .offset(offset);
    
    if (batch.length === 0) {
      hasMore = false;
      break;
    }
    
    for (const obs of batch) {
      try {
        const existing = await db.select()
          .from(observationCache)
          .where(eq(observationCache.sourceObservationId, String(obs.moId)))
          .limit(1);
        
        if (existing.length > 0) {
          offset++;
          continue;
        }
        
        await db.insert(observationCache).values({
          source: 'mo',
          sourceObservationId: String(obs.moId),
          scientificName: obs.scientificName,
          commonName: obs.commonName,
          family: obs.family,
          observerName: obs.userName,
          observerUsername: obs.userLogin,
          latitude: obs.latitude,
          longitude: obs.longitude,
          placeGuess: obs.placeName,
          observedOn: obs.observedOn,
          notes: obs.notes,
          apiResponseJson: obs.apiResponse,
          lastSyncedAt: obs.updatedAt || new Date(),
          syncStatus: 'success',
        });
        
        stats.moProcessed++;
      } catch (error: any) {
        stats.errors.push(`MO cache ${obs.moId}: ${error.message}`);
      }
    }
    
    offset += batch.length;
    console.log(`[Migration] MO cache: processed ${offset} records`);
  }
}

export async function migrateMushroomObserverData(stats: MigrationStats): Promise<void> {
  console.log("[Migration] Starting Mushroom Observer detailed data migration...");
  
  const batchSize = 500;
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const batch = await db.select()
      .from(mushroomObserverData)
      .limit(batchSize)
      .offset(offset);
    
    if (batch.length === 0) {
      hasMore = false;
      break;
    }
    
    for (const obs of batch) {
      try {
        const existing = await db.select()
          .from(observationCache)
          .where(eq(observationCache.sourceObservationId, obs.moId))
          .limit(1);
        
        const cacheData = {
          source: 'mo' as const,
          sourceObservationId: obs.moId,
          sourceUuid: obs.moUuid,
          scientificName: obs.scientificName,
          commonName: obs.commonName,
          observerName: obs.observer,
          latitude: obs.latitude ? String(obs.latitude) : null,
          longitude: obs.longitude ? String(obs.longitude) : null,
          locality: obs.location,
          state: obs.state,
          country: obs.country,
          observedOnString: obs.observedOn,
          qualityGrade: obs.quality,
          notes: obs.notes,
          dnaBarcode: obs.dnaBarcode,
          specimenAvailable: obs.specimenAvailable || false,
          lastSyncedAt: obs.lastSyncedAt || new Date(),
          syncStatus: obs.syncStatus || 'success',
          syncError: obs.syncError,
        };
        
        if (existing.length > 0) {
          await db.update(observationCache)
            .set({ ...cacheData, updatedAt: new Date() })
            .where(eq(observationCache.id, existing[0].id));
        } else {
          await db.insert(observationCache).values(cacheData);
        }
        
        stats.moProcessed++;
        
        if (obs.photos && obs.photos.length > 0) {
          const [inserted] = await db.select()
            .from(observationCache)
            .where(eq(observationCache.sourceObservationId, obs.moId))
            .limit(1);
          
          if (inserted) {
            const existingMedia = await db.select()
              .from(observationMedia)
              .where(eq(observationMedia.observationCacheId, inserted.id))
              .limit(1);
            
            if (existingMedia.length === 0) {
              for (let i = 0; i < obs.photos.length; i++) {
                await db.insert(observationMedia).values({
                  observationCacheId: inserted.id,
                  mediaType: 'photo',
                  url: obs.photos[i],
                  sortOrder: i,
                });
                stats.mediaCreated++;
              }
            }
          }
        }
      } catch (error: any) {
        stats.errors.push(`MO data ${obs.moId}: ${error.message}`);
      }
    }
    
    offset += batch.length;
    console.log(`[Migration] MO data: processed ${offset} records`);
  }
}

export async function runFullMigration(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    inatCacheProcessed: 0,
    inatDataProcessed: 0,
    moProcessed: 0,
    mediaCreated: 0,
    taxaCreated: 0,
    errors: [],
  };
  
  console.log("[Migration] Starting full observation cache migration...");
  const startTime = Date.now();
  
  try {
    await migrateInatObservationsCache(stats);
    await migrateInaturalistData(stats);
    await migrateMoObservationsCache(stats);
    await migrateMushroomObserverData(stats);
  } catch (error: any) {
    console.error("[Migration] Fatal error:", error);
    stats.errors.push(`Fatal: ${error.message}`);
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Migration] Complete in ${duration}s`);
  console.log(`[Migration] Stats:`, {
    inatCacheProcessed: stats.inatCacheProcessed,
    inatDataProcessed: stats.inatDataProcessed,
    moProcessed: stats.moProcessed,
    mediaCreated: stats.mediaCreated,
    errorCount: stats.errors.length,
  });
  
  if (stats.errors.length > 0) {
    console.log(`[Migration] First 10 errors:`, stats.errors.slice(0, 10));
  }
  
  return stats;
}

if (require.main === module) {
  runFullMigration()
    .then((stats) => {
      console.log("Migration completed:", stats);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
