import { db } from "./db";
import { specimens, observationCache, observationMedia } from "@shared/schema";
import { eq, isNull, and, inArray, sql } from "drizzle-orm";

const INAT_API_BASE = "https://api.inaturalist.org/v1";
const MO_API_BASE = "https://mushroomobserver.org/api2";
const RATE_LIMIT_MS = 1100;
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

async function fetchMoObservation(observationId: string): Promise<any> {
  const url = `${MO_API_BASE}/observations/${observationId}?detail=high`;
  const response = await fetch(url, {
    headers: { "User-Agent": "MycoMap/1.0 (mycology research platform)" }
  });
  
  if (!response.ok) {
    throw new Error(`MO API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    throw new Error(`MO Observation ${observationId} not found`);
  }
  
  return data.results[0];
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

async function upsertInatObservation(obs: any): Promise<number> {
  const taxon = obs.taxon || {};
  const ancestors = taxon.ancestors || [];
  
  let family: string | null = null;
  let genus: string | null = null;
  for (const ancestor of ancestors) {
    if (ancestor.rank === "family") family = ancestor.name;
    if (ancestor.rank === "genus") genus = ancestor.name;
  }
  if (taxon.rank === "genus") genus = taxon.name;
  
  const cacheData = {
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
    state: null,
    country: null,
    observedOn: obs.observed_on || null,
    observedOnString: obs.observed_on_string || null,
    timeObservedAt: obs.time_observed_at ? new Date(obs.time_observed_at) : null,
    qualityGrade: obs.quality_grade || null,
    identificationCount: obs.identifications_count || 0,
    captive: obs.captive || false,
    licenseCode: obs.license_code || null,
    dnaBarcode: extractDnaBarcode(obs),
    genbankAccession: extractGenbankAccession(obs),
    voucherNumber: extractVoucherNumber(obs),
    specimenAvailable: obs.ofvs?.some((f: any) => f.field_id === 817 && f.value === "Yes") || false,
    description: obs.description || null,
    notes: null,
    apiResponseJson: JSON.stringify(obs),
    lastSyncedAt: new Date(),
    syncStatus: "success" as const,
    updatedAt: new Date(),
  };

  const existing = await db.select({ id: observationCache.id })
    .from(observationCache)
    .where(and(
      eq(observationCache.source, "inat"),
      eq(observationCache.sourceObservationId, obs.id.toString())
    ))
    .limit(1);

  let cacheId: number;
  
  if (existing.length > 0) {
    cacheId = existing[0].id;
    await db.update(observationCache)
      .set(cacheData)
      .where(eq(observationCache.id, cacheId));
  } else {
    const [inserted] = await db.insert(observationCache)
      .values(cacheData)
      .returning({ id: observationCache.id });
    cacheId = inserted.id;
  }

  await db.delete(observationMedia)
    .where(eq(observationMedia.observationCacheId, cacheId));
  
  if (obs.photos && obs.photos.length > 0) {
    const mediaValues = obs.photos.map((photo: any, idx: number) => ({
      observationCacheId: cacheId,
      mediaType: "photo" as const,
      url: photo.url?.replace("square", "medium") || photo.url,
      thumbnailUrl: photo.url,
      mediumUrl: photo.url?.replace("square", "medium"),
      largeUrl: photo.url?.replace("square", "large"),
      originalUrl: photo.url?.replace("square", "original"),
      licenseCode: photo.license_code || null,
      attribution: photo.attribution || null,
      sortOrder: idx,
    }));
    
    await db.insert(observationMedia).values(mediaValues);
  }

  return cacheId;
}

async function upsertMoObservation(obs: any): Promise<number> {
  const cacheData = {
    source: "mo" as const,
    sourceObservationId: obs.id.toString(),
    sourceUuid: null,
    scientificName: obs.consensus?.name || obs.name?.text_name || null,
    commonName: null,
    family: null,
    genus: obs.consensus?.name?.split(" ")[0] || null,
    species: obs.consensus?.name || null,
    taxonRank: obs.consensus?.rank || null,
    observerName: obs.owner?.name || obs.owner?.login,
    observerUsername: obs.owner?.login,
    observerId: obs.owner?.id?.toString(),
    latitude: obs.location?.latitude?.toString() || null,
    longitude: obs.location?.longitude?.toString() || null,
    coordinatesObscured: obs.location?.gps_hidden || false,
    positionalAccuracy: null,
    placeGuess: obs.location?.where || null,
    locality: obs.location?.where || null,
    state: null,
    country: null,
    observedOn: obs.date || null,
    observedOnString: obs.date || null,
    timeObservedAt: null,
    qualityGrade: obs.confidence?.toString() || null,
    identificationCount: obs.namings?.length || 0,
    captive: false,
    licenseCode: obs.copyright_holder ? "c" : null,
    dnaBarcode: null,
    genbankAccession: null,
    voucherNumber: obs.specimen?.herbarium_label || null,
    specimenAvailable: obs.specimen?.available || false,
    description: obs.notes || null,
    notes: null,
    apiResponseJson: JSON.stringify(obs),
    lastSyncedAt: new Date(),
    syncStatus: "success" as const,
    updatedAt: new Date(),
  };

  const existing = await db.select({ id: observationCache.id })
    .from(observationCache)
    .where(and(
      eq(observationCache.source, "mo"),
      eq(observationCache.sourceObservationId, obs.id.toString())
    ))
    .limit(1);

  let cacheId: number;
  
  if (existing.length > 0) {
    cacheId = existing[0].id;
    await db.update(observationCache)
      .set(cacheData)
      .where(eq(observationCache.id, cacheId));
  } else {
    const [inserted] = await db.insert(observationCache)
      .values(cacheData)
      .returning({ id: observationCache.id });
    cacheId = inserted.id;
  }

  await db.delete(observationMedia)
    .where(eq(observationMedia.observationCacheId, cacheId));
  
  if (obs.primary_image) {
    await db.insert(observationMedia).values({
      observationCacheId: cacheId,
      mediaType: "photo",
      url: obs.primary_image.url || `https://mushroomobserver.org/images/640/${obs.primary_image.id}.jpg`,
      thumbnailUrl: `https://mushroomobserver.org/images/320/${obs.primary_image.id}.jpg`,
      mediumUrl: `https://mushroomobserver.org/images/640/${obs.primary_image.id}.jpg`,
      largeUrl: `https://mushroomobserver.org/images/960/${obs.primary_image.id}.jpg`,
      originalUrl: `https://mushroomobserver.org/images/orig/${obs.primary_image.id}.jpg`,
      licenseCode: null,
      attribution: obs.copyright_holder || null,
      sortOrder: 0,
    });
  }

  return cacheId;
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

    console.log(`[Enrich] Processing batch ${batch + 1}/${maxBatches} (${specimensToEnrich.length} specimens)`);

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

    const existingCacheMap = new Map<string, number>();
    for (const c of existingCache) {
      existingCacheMap.set(c.sourceObservationId, c.id);
    }

    const idsToFetch = uniqueObsIds.filter(id => !existingCacheMap.has(id));
    
    console.log(`[Enrich] ${existingCache.length} already cached, ${idsToFetch.length} to fetch`);

    if (idsToFetch.length > 0) {
      try {
        const fetchedObs = await fetchInatObservationsBulk(idsToFetch);
        console.log(`[Enrich] Fetched ${fetchedObs.size} observations from API`);
        stats.fetched += fetchedObs.size;

        for (const [obsId, obs] of fetchedObs) {
          try {
            const cacheId = await upsertInatObservation(obs);
            existingCacheMap.set(obsId, cacheId);
          } catch (error: any) {
            stats.errors.push(`Upsert ${obsId}: ${error.message}`);
          }
        }

        for (const obsId of idsToFetch) {
          if (!fetchedObs.has(obsId)) {
            stats.notFound++;
          }
        }

        await sleep(RATE_LIMIT_MS);
      } catch (error: any) {
        stats.errors.push(`Bulk fetch: ${error.message}`);
        if (error.message.includes("429")) {
          console.log(`[Enrich] Rate limited, sleeping 60s...`);
          await sleep(60000);
        }
        continue;
      }
    }

    for (const [obsId, specimenIds] of specimenMap) {
      const cacheId = existingCacheMap.get(obsId);
      if (cacheId) {
        await db.update(specimens)
          .set({ 
            observationCacheId: cacheId,
            updatedAt: new Date() 
          })
          .where(inArray(specimens.id, specimenIds));
        stats.linked += specimenIds.length;
      }
    }

    console.log(`[Enrich] Batch complete: ${stats.fetched} fetched, ${stats.linked} linked, ${stats.notFound} not found`);
  }

  console.log(`\n[Enrich] Complete!`);
  console.log(`[Enrich] Fetched: ${stats.fetched}, Linked: ${stats.linked}, Not Found: ${stats.notFound}`);
  console.log(`[Enrich] Errors: ${stats.errors.length}`);
  
  if (stats.errors.length > 0 && stats.errors.length <= 10) {
    console.log(`[Enrich] Errors:`, stats.errors);
  } else if (stats.errors.length > 10) {
    console.log(`[Enrich] First 10 errors:`, stats.errors.slice(0, 10));
  }

  return stats;
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  const maxBatches = parseInt(process.argv[2] || "100");
  
  console.log(`Running bulk enrichment with maxBatches=${maxBatches} (${BULK_SIZE} obs per batch)`);
  
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
