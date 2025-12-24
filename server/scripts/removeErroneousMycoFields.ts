import { db } from "../db";
import { specimens, observationCache } from "@shared/schema";
import { and, eq, like } from "drizzle-orm";

const INAT_TOKEN = process.env.INATURALIST_API_TOKEN;
const RATE_LIMIT_DELAY = 1100; // 1.1 seconds between requests to avoid rate limiting

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
  console.log("Finding observations with MYCO-2025- catalog numbers...");

  // Get all observation IDs with MYCO-2025- in their catalog number
  const records = await db.select({
    specimenId: specimens.id,
    observationId: specimens.primaryObservationId,
    herbariumCatalogNumber: observationCache.herbariumCatalogNumber,
    herbariumName: observationCache.herbariumName,
  })
  .from(specimens)
  .innerJoin(observationCache, and(
    eq(observationCache.source, 'inat'),
    eq(observationCache.sourceObservationId, specimens.primaryObservationId)
  ))
  .where(like(observationCache.herbariumCatalogNumber, 'MYCO-2025-%'));

  console.log(`Found ${records.length} observations to process`);

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    console.log(`\n[${i + 1}/${records.length}] Processing observation ${record.observationId}`);
    console.log(`  Current catalog: ${record.herbariumCatalogNumber}`);
    console.log(`  Current name: ${record.herbariumName || '(empty)'}`);

    // Fetch the observation from iNat to get the OFV IDs
    try {
      const response = await fetch(`https://api.inaturalist.org/v1/observations/${record.observationId}`);
      if (!response.ok) {
        console.error(`  Failed to fetch observation: ${response.status}`);
        errorCount++;
        continue;
      }

      const data = await response.json();
      const obs = data.results?.[0];
      if (!obs) {
        console.error(`  Observation not found`);
        errorCount++;
        continue;
      }

      const ofvs = obs.ofvs || [];
      const herbariumNameOfv = ofvs.find((f: any) => f.field_id === 9539);
      const herbariumCatalogOfv = ofvs.find((f: any) => f.field_id === 9540);

      let deletedAny = false;

      // Delete Herbarium Name (9539) if present
      if (herbariumNameOfv) {
        console.log(`  Deleting Herbarium Name (OFV ID: ${herbariumNameOfv.id})`);
        const success = await removeFieldValue(herbariumNameOfv.id);
        if (success) {
          console.log(`  ✓ Deleted Herbarium Name`);
          deletedAny = true;
        } else {
          errorCount++;
        }
        await sleep(RATE_LIMIT_DELAY);
      }

      // Delete Herbarium Catalog Number (9540) if present
      if (herbariumCatalogOfv) {
        console.log(`  Deleting Herbarium Catalog Number (OFV ID: ${herbariumCatalogOfv.id})`);
        const success = await removeFieldValue(herbariumCatalogOfv.id);
        if (success) {
          console.log(`  ✓ Deleted Herbarium Catalog Number`);
          deletedAny = true;
        } else {
          errorCount++;
        }
        await sleep(RATE_LIMIT_DELAY);
      }

      if (deletedAny) {
        // Clear the cache values too
        await db.update(observationCache)
          .set({ 
            herbariumCatalogNumber: null, 
            herbariumName: null 
          })
          .where(and(
            eq(observationCache.source, 'inat'),
            eq(observationCache.sourceObservationId, record.observationId!)
          ));
        console.log(`  ✓ Cleared cache values`);
        successCount++;
      } else if (!herbariumNameOfv && !herbariumCatalogOfv) {
        console.log(`  No fields to delete (already removed)`);
        skippedCount++;
      }

    } catch (error) {
      console.error(`  Error processing observation:`, error);
      errorCount++;
    }

    // Rate limit between observations
    await sleep(RATE_LIMIT_DELAY);
  }

  console.log(`\n========================================`);
  console.log(`Done! Processed ${records.length} observations`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Skipped: ${skippedCount}`);
}

main().catch(console.error).finally(() => process.exit(0));
