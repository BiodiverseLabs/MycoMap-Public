import { db } from "../db";
import { specimens, observationCache } from "@shared/schema";
import { and, eq, like, or, sql } from "drizzle-orm";

const INAT_TOKEN = process.env.INATURALIST_API_TOKEN;
const RATE_LIMIT_DELAY = 350; // 350ms between requests

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function removeFieldValue(ofvId: number): Promise<boolean> {
  if (!INAT_TOKEN) {
    console.error("No INATURALIST_API_TOKEN found");
    return false;
  }

  try {
    const response = await fetch(`https://api.inaturalist.org/v1/observation_field_values/${ofvId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${INAT_TOKEN}`,
      },
    });

    if (response.ok) {
      return true;
    } else if (response.status === 429) {
      console.log("Rate limited, waiting 60 seconds...");
      await sleep(60000);
      return removeFieldValue(ofvId); // Retry
    } else {
      console.error(`Failed to delete OFV ${ofvId}: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error(`Error deleting OFV ${ofvId}:`, error);
    return false;
  }
}

async function main() {
  console.log("Finding specimens with catalog conflicts...\n");

  // Get all specimens with catalog-related conflict flags
  const records = await db.select({
    specimenId: specimens.id,
    observationId: specimens.primaryObservationId,
    conflictType: specimens.inatFieldConflict,
    herbariumCatalogNumber: observationCache.herbariumCatalogNumber,
  })
  .from(specimens)
  .leftJoin(observationCache, and(
    eq(observationCache.source, 'inat'),
    eq(observationCache.sourceObservationId, specimens.primaryObservationId)
  ))
  .where(or(
    like(specimens.inatFieldConflict, '%catalog%'),
    eq(specimens.inatFieldConflict, 'both_conflict')
  ));

  console.log(`Found ${records.length} specimens with catalog conflicts\n`);

  if (records.length === 0) {
    console.log("No records to process. Exiting.");
    return;
  }

  // DRY RUN first - just show what would be deleted
  const DRY_RUN = process.argv.includes('--dry-run');
  if (DRY_RUN) {
    console.log("=== DRY RUN MODE - No changes will be made ===\n");
  }

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  let alreadyDeletedCount = 0;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    console.log(`[${i + 1}/${records.length}] Observation ${record.observationId} (Specimen ${record.specimenId})`);
    console.log(`  Conflict: ${record.conflictType}`);
    console.log(`  Cached catalog: ${record.herbariumCatalogNumber || '(empty)'}`);

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would fetch and delete field 9540\n`);
      continue;
    }

    // Fetch the observation from iNat to get the OFV ID for field 9540
    try {
      const response = await fetch(`https://api.inaturalist.org/v1/observations/${record.observationId}`);
      if (!response.ok) {
        console.error(`  Failed to fetch observation: ${response.status}`);
        errorCount++;
        await sleep(RATE_LIMIT_DELAY);
        continue;
      }

      const data = await response.json();
      const obs = data.results?.[0];
      if (!obs) {
        console.error(`  Observation not found on iNat`);
        errorCount++;
        await sleep(RATE_LIMIT_DELAY);
        continue;
      }

      const ofvs = obs.ofvs || [];
      const herbariumCatalogOfv = ofvs.find((f: any) => f.field_id === 9540);

      if (!herbariumCatalogOfv) {
        console.log(`  Field 9540 not present (already deleted or never set)`);
        alreadyDeletedCount++;
        
        // Still clear the conflict flag since the field is gone
        await db.update(specimens)
          .set({ inatFieldConflict: null })
          .where(eq(specimens.id, record.specimenId));
        
        // Also clear cache
        if (record.observationId) {
          await db.update(observationCache)
            .set({ herbariumCatalogNumber: null })
            .where(and(
              eq(observationCache.source, 'inat'),
              eq(observationCache.sourceObservationId, record.observationId)
            ));
        }
        console.log(`  ✓ Cleared conflict flag and cache\n`);
        await sleep(RATE_LIMIT_DELAY);
        continue;
      }

      console.log(`  Found field 9540 with value: "${herbariumCatalogOfv.value}" (OFV ID: ${herbariumCatalogOfv.id})`);
      console.log(`  Deleting...`);

      const success = await removeFieldValue(herbariumCatalogOfv.id);
      
      if (success) {
        console.log(`  ✓ Deleted field 9540 from iNat`);
        
        // Clear the conflict flag
        await db.update(specimens)
          .set({ inatFieldConflict: null })
          .where(eq(specimens.id, record.specimenId));
        
        // Clear cache value
        if (record.observationId) {
          await db.update(observationCache)
            .set({ herbariumCatalogNumber: null })
            .where(and(
              eq(observationCache.source, 'inat'),
              eq(observationCache.sourceObservationId, record.observationId)
            ));
        }
        console.log(`  ✓ Cleared conflict flag and cache`);
        successCount++;
      } else {
        errorCount++;
      }

    } catch (error) {
      console.error(`  Error processing observation:`, error);
      errorCount++;
    }

    console.log('');
    await sleep(RATE_LIMIT_DELAY);
  }

  console.log(`\n========================================`);
  console.log(`Done! Processed ${records.length} observations`);
  console.log(`  Successfully deleted: ${successCount}`);
  console.log(`  Already deleted: ${alreadyDeletedCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Skipped (dry run): ${skippedCount}`);
}

main().catch(console.error).finally(() => process.exit(0));
