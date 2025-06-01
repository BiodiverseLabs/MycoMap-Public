import { db } from './server/db.js';
import { observations } from './shared/schema.js';
import { eq, and, isNotNull } from 'drizzle-orm';

async function reprocessVarietyData() {
  try {
    console.log('=== CLASSIFICATION AUTOMATION WITH MONITORING ===');
    
    const startTime = Date.now();
    
    // Get current count
    const initialCount = await db
      .select()
      .from(observations)
      .where(eq(observations.classificationUpdate, true));
    
    console.log(`Starting with ${initialCount.length} records needing classification updates`);
    
    // Load reference taxonomy
    console.log('Building reference taxonomy...');
    const referenceRecords = await db
      .select()
      .from(observations)
      .where(and(
        isNotNull(observations.genus),
        isNotNull(observations.kingdom),
        isNotNull(observations.phylum),
        isNotNull(observations.class),
        isNotNull(observations.order),
        isNotNull(observations.family)
      ));
    
    // Build genus lookup
    const genusLookup = new Map();
    referenceRecords.forEach(record => {
      const key = record.genus.toLowerCase().trim();
      if (!genusLookup.has(key)) {
        genusLookup.set(key, {
          kingdom: record.kingdom,
          phylum: record.phylum,
          class: record.class,
          order: record.order,
          family: record.family,
          genus: record.genus
        });
      }
    });
    
    console.log(`Reference lookup built: ${genusLookup.size} genera available`);
    
    // Process records in small batches for reliability
    let totalUpdated = 0;
    const BATCH_SIZE = 100;
    
    while (true) {
      // Get next batch of records needing updates
      const batch = await db
        .select()
        .from(observations)
        .where(eq(observations.classificationUpdate, true))
        .limit(BATCH_SIZE);
      
      if (batch.length === 0) {
        console.log('No more records to process');
        break;
      }
      
      console.log(`\nProcessing batch of ${batch.length} records...`);
      let batchUpdated = 0;
      
      for (const record of batch) {
        try {
          let targetGenus = null;
          
          // Extract genus from species or infraspecies
          if (record.species) {
            targetGenus = record.species.split(' ')[0].toLowerCase().trim();
          } else if (record.infraspecies) {
            targetGenus = record.infraspecies.split(' ')[0].toLowerCase().trim();
          }
          
          if (targetGenus && genusLookup.has(targetGenus)) {
            const taxonomy = genusLookup.get(targetGenus);
            
            // Update the record
            await db
              .update(observations)
              .set({
                kingdom: record.kingdom || taxonomy.kingdom,
                phylum: record.phylum || taxonomy.phylum,
                class: record.class || taxonomy.class,
                order: record.order || taxonomy.order,
                family: record.family || taxonomy.family,
                genus: record.genus || taxonomy.genus,
                classificationUpdate: false
              })
              .where(eq(observations.id, record.id));
            
            batchUpdated++;
            totalUpdated++;
          }
        } catch (recordError) {
          console.warn(`Failed to update record ${record.id}: ${recordError.message}`);
        }
      }
      
      console.log(`Batch complete: ${batchUpdated}/${batch.length} updated`);
      console.log(`Total updated so far: ${totalUpdated}`);
      
      // Progress check
      const remaining = await db
        .select()
        .from(observations)
        .where(eq(observations.classificationUpdate, true));
      
      console.log(`Records still needing updates: ${remaining.length}`);
      
      // Stop after reasonable number to avoid timeouts
      if (totalUpdated >= 1000) {
        console.log('Stopping at 1000 updates to prevent timeout');
        break;
      }
    }
    
    // Final status
    const finalCount = await db
      .select()
      .from(observations)
      .where(eq(observations.classificationUpdate, true));
    
    const totalTime = Date.now() - startTime;
    const recordsAutomated = initialCount.length - finalCount.length;
    
    console.log('\n=== FINAL RESULTS ===');
    console.log(`Processing time: ${(totalTime / 1000).toFixed(1)} seconds`);
    console.log(`Records automated: ${recordsAutomated}`);
    console.log(`Records still needing manual review: ${finalCount.length}`);
    console.log(`Processing rate: ${(recordsAutomated / (totalTime / 1000)).toFixed(1)} records/second`);
    
  } catch (error) {
    console.error('Error in classification automation:', error);
  } finally {
    process.exit(0);
  }
}

reprocessVarietyData();