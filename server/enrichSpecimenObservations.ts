import { db } from "./db";
import { specimens, observationCache, observationMedia } from "@shared/schema";
import { eq, isNull, and, inArray, sql } from "drizzle-orm";

const INAT_API_BASE = "https://api.inaturalist.org/v1";
const BULK_SIZE = 200;

interface EnrichmentStats {
  totalSpecimens: number;
  alreadyLinked: number;
  fetched: number;
  linked: number;
  notFound: number;
  errors: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchInatObservationsBulk(observationIds: string[]): Promise<Map<string, any>> {
  const results = new Map<string, any>();
  if (observationIds.length === 0) return results;
  
  const idsParam = observationIds.join(",");
  const url = `${INAT_API_BASE}/observations?id=${idsParam}&per_page=${BULK_SIZE}&order=asc`;
  
  const response = await fetch(url, {
    headers: { "User-Agent": "MycoMap/1.0 (mycology research platform)" }
  });
  
  if (response.status === 429) {
    throw new Error("Rate limited - 429");
  }
  
  if (!response.ok) {
    throw new Error(`iNat API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (data.results) {
    for (const obs of data.results) {
      results.set(obs.id.toString(), obs);
    }
  }
  
  return results;
}

function extractVoucherNumber(obs: any): string | null {
  if (!obs.ofvs) return null;
  const voucherField = obs.ofvs.find((f: any) => f.field_id === 14618);
  return voucherField?.value || null;
}

function extractDnaBarcode(obs: any): string | null {
  if (!obs.ofvs) return null;
  const dnaField = obs.ofvs.find((f: any) => f.field_id === 2330);
  return dnaField?.value || null;
}

function extractGenbankAccession(obs: any): string | null {
  if (!obs.ofvs) return null;
  const fields = [15353, 15324, 7555];
  for (const fieldId of fields) {
    const field = obs.ofvs.find((f: any) => f.field_id === fieldId);
    if (field?.value) return field.value;
  }
  return null;
}

function transformObsToCache(obs: any) {
  const taxon = obs.taxon || {};
  const ancestors = taxon.ancestors || [];
  
  let family: string | null = null;
  let genus: string | null = null;
  for (const ancestor of ancestors) {
    if (ancestor.rank === "family") family = ancestor.name;
    if (ancestor.rank === "genus") genus = ancestor.name;
  }
  if (taxon.rank === "genus") genus = taxon.name;
  
  return {
    source: "inat" as const,
    sourceObservationId: obs.id.toString(),
    sourceUuid: obs.uuid || null,
    scientificName: taxon.name || obs.species_guess,
    commonName: taxon.preferred_common_name || null,
    family,
    genus,
    species: taxon.rank === "species" ? taxon.name : null,
    taxonRank: taxon.rank || null,
    observerName: obs.user?.name || obs.user?.login,
    observerUsername: obs.user?.login,
    observerId: obs.user?.id?.toString(),
    latitude: obs.geojson?.coordinates?.[1]?.toString() || obs.location?.split(",")[0] || null,
    longitude: obs.geojson?.coordinates?.[0]?.toString() || obs.location?.split(",")[1] || null,
    coordinatesObscured: obs.obscured || false,
    positionalAccuracy: obs.positional_accuracy || null,
    placeGuess: obs.place_guess || null,
    locality: obs.place_guess || null,
    observedOn: obs.observed_on || null,
    observedOnString: obs.observed_on_string || null,
    qualityGrade: obs.quality_grade || null,
    identificationCount: obs.identifications_count || 0,
    captive: obs.captive || false,
    licenseCode: obs.license_code || null,
    dnaBarcode: extractDnaBarcode(obs),
    genbankAccession: extractGenbankAccession(obs),
    voucherNumber: extractVoucherNumber(obs),
    specimenAvailable: obs.ofvs?.some((f: any) => f.field_id === 817 && f.value === "Yes") || false,
    description: obs.description || null,
    apiResponseJson: JSON.stringify(obs),
    lastSyncedAt: new Date(),
    syncStatus: "success" as const,
  };
}

async function bulkUpsertObservations(observations: any[]): Promise<Map<string, number>> {
  const idMap = new Map<string, number>();
  if (observations.length === 0) return idMap;

  const cacheData = observations.map(transformObsToCache);
  
  await db.insert(observationCache).values(cacheData).onConflictDoUpdate({
    target: [observationCache.source, observationCache.sourceObservationId],
    set: {
      scientificName: sql`EXCLUDED.scientific_name`,
      commonName: sql`EXCLUDED.common_name`,
      family: sql`EXCLUDED.family`,
      genus: sql`EXCLUDED.genus`,
      species: sql`EXCLUDED.species`,
      taxonRank: sql`EXCLUDED.taxon_rank`,
      observerName: sql`EXCLUDED.observer_name`,
      observerUsername: sql`EXCLUDED.observer_username`,
      observerId: sql`EXCLUDED.observer_id`,
      latitude: sql`EXCLUDED.latitude`,
      longitude: sql`EXCLUDED.longitude`,
      coordinatesObscured: sql`EXCLUDED.coordinates_obscured`,
      positionalAccuracy: sql`EXCLUDED.positional_accuracy`,
      placeGuess: sql`EXCLUDED.place_guess`,
      locality: sql`EXCLUDED.locality`,
      observedOn: sql`EXCLUDED.observed_on`,
      observedOnString: sql`EXCLUDED.observed_on_string`,
      qualityGrade: sql`EXCLUDED.quality_grade`,
      identificationCount: sql`EXCLUDED.identification_count`,
      captive: sql`EXCLUDED.captive`,
      licenseCode: sql`EXCLUDED.license_code`,
      dnaBarcode: sql`EXCLUDED.dna_barcode`,
      genbankAccession: sql`EXCLUDED.genbank_accession`,
      voucherNumber: sql`EXCLUDED.voucher_number`,
      specimenAvailable: sql`EXCLUDED.specimen_available`,
      description: sql`EXCLUDED.description`,
      apiResponseJson: sql`EXCLUDED.api_response_json`,
      lastSyncedAt: sql`NOW()`,
      syncStatus: sql`EXCLUDED.sync_status`,
      updatedAt: sql`NOW()`,
    },
  });

  const obsIds = observations.map(o => o.id.toString());
  const inserted = await db.select({ 
    id: observationCache.id, 
    sourceObservationId: observationCache.sourceObservationId 
  })
    .from(observationCache)
    .where(and(
      eq(observationCache.source, "inat"),
      inArray(observationCache.sourceObservationId, obsIds)
    ));

  for (const row of inserted) {
    idMap.set(row.sourceObservationId, row.id);
  }

  const allMedia: any[] = [];
  for (const obs of observations) {
    const cacheId = idMap.get(obs.id.toString());
    if (!cacheId || !obs.photos?.length) continue;
    
    for (let idx = 0; idx < obs.photos.length; idx++) {
      const photo = obs.photos[idx];
      allMedia.push({
        observationCacheId: cacheId,
        mediaType: "photo",
        url: photo.url?.replace("square", "medium") || photo.url,
        thumbnailUrl: photo.url,
        mediumUrl: photo.url?.replace("square", "medium"),
        largeUrl: photo.url?.replace("square", "large"),
        originalUrl: photo.url?.replace("square", "original"),
        licenseCode: photo.license_code || null,
        attribution: photo.attribution || null,
        sortOrder: idx,
      });
    }
  }

  if (allMedia.length > 0) {
    const cacheIds = Array.from(idMap.values());
    await db.delete(observationMedia).where(inArray(observationMedia.observationCacheId, cacheIds));
    
    for (let i = 0; i < allMedia.length; i += 500) {
      const batch = allMedia.slice(i, i + 500);
      await db.insert(observationMedia).values(batch);
    }
  }

  return idMap;
}

export async function enrichSpecimenObservations(
  maxBatches: number = 100
): Promise<EnrichmentStats> {
  const stats: EnrichmentStats = {
    totalSpecimens: 0,
    alreadyLinked: 0,
    fetched: 0,
    linked: 0,
    notFound: 0,
    errors: [],
  };

  const totalResult = await db.select({ count: sql<number>`count(*)` })
    .from(specimens)
    .where(and(
      isNull(specimens.observationCacheId),
      sql`${specimens.primaryObservationId} IS NOT NULL`
    ));
  stats.totalSpecimens = Number(totalResult[0]?.count || 0);
  console.log(`[Enrich] Found ${stats.totalSpecimens} specimens needing enrichment`);

  const alreadyLinkedResult = await db.select({ count: sql<number>`count(*)` })
    .from(specimens)
    .where(sql`${specimens.observationCacheId} IS NOT NULL`);
  stats.alreadyLinked = Number(alreadyLinkedResult[0]?.count || 0);
  console.log(`[Enrich] ${stats.alreadyLinked} specimens already linked to cache`);

  for (let batch = 0; batch < maxBatches; batch++) {
    const specimensToEnrich = await db.select({
      id: specimens.id,
      source: specimens.primaryObservationSource,
      observationId: specimens.primaryObservationId,
    })
    .from(specimens)
    .where(and(
      isNull(specimens.observationCacheId),
      sql`${specimens.primaryObservationId} IS NOT NULL`,
      eq(specimens.primaryObservationSource, "inat")
    ))
    .limit(BULK_SIZE);

    if (specimensToEnrich.length === 0) {
      console.log(`[Enrich] No more iNat specimens to process`);
      break;
    }

    console.log(`[Enrich] Batch ${batch + 1}/${maxBatches} (${specimensToEnrich.length} specimens)`);

    const specimenMap = new Map<string, number[]>();
    for (const s of specimensToEnrich) {
      const obsId = s.observationId!;
      if (!specimenMap.has(obsId)) {
        specimenMap.set(obsId, []);
      }
      specimenMap.get(obsId)!.push(s.id);
    }

    const uniqueObsIds = Array.from(specimenMap.keys());
    
    const existingCache = await db.select({ 
      id: observationCache.id, 
      sourceObservationId: observationCache.sourceObservationId 
    })
      .from(observationCache)
      .where(and(
        eq(observationCache.source, "inat"),
        inArray(observationCache.sourceObservationId, uniqueObsIds)
      ));

    const cacheMap = new Map<string, number>();
    for (const c of existingCache) {
      cacheMap.set(c.sourceObservationId, c.id);
    }

    const idsToFetch = uniqueObsIds.filter(id => !cacheMap.has(id));

    if (idsToFetch.length > 0) {
      try {
        const fetchedObs = await fetchInatObservationsBulk(idsToFetch);
        stats.fetched += fetchedObs.size;

        const obsArray = Array.from(fetchedObs.values());
        const newIds = await bulkUpsertObservations(obsArray);
        
        newIds.forEach((cacheId, obsId) => {
          cacheMap.set(obsId, cacheId);
        });

        stats.notFound += idsToFetch.length - fetchedObs.size;
      } catch (error: any) {
        stats.errors.push(`Bulk fetch: ${error.message}`);
        if (error.message.includes("429")) {
          console.log(`[Enrich] Rate limited, sleeping 30s...`);
          await sleep(30000);
        }
        continue;
      }
    }

    const updates: { specimenIds: number[], cacheId: number }[] = [];
    specimenMap.forEach((specimenIds, obsId) => {
      const cacheId = cacheMap.get(obsId);
      if (cacheId) {
        updates.push({ specimenIds, cacheId });
      }
    });

    for (const { specimenIds, cacheId } of updates) {
      await db.update(specimens)
        .set({ observationCacheId: cacheId, updatedAt: new Date() })
        .where(inArray(specimens.id, specimenIds));
      stats.linked += specimenIds.length;
    }

    console.log(`[Enrich] Fetched: ${stats.fetched}, Linked: ${stats.linked}`);
  }

  console.log(`\n[Enrich] Complete! Fetched: ${stats.fetched}, Linked: ${stats.linked}, Not Found: ${stats.notFound}`);
  if (stats.errors.length > 0) {
    console.log(`[Enrich] Errors:`, stats.errors.slice(0, 10));
  }

  return stats;
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  const maxBatches = parseInt(process.argv[2] || "100");
  console.log(`Running bulk enrichment (${BULK_SIZE} per batch, ${maxBatches} batches max)`);
  
  enrichSpecimenObservations(maxBatches)
    .then((stats) => {
      console.log("Enrichment completed:", stats);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Enrichment failed:", err);
      process.exit(1);
    });
}
