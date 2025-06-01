import { db } from './server/db.js';
import { observations } from './shared/schema.js';
import { eq, and, isNotNull } from 'drizzle-orm';

async function processLargeDataset() {
  try {
    console.log('=== LARGE DATASET CLASSIFICATION AUTOMATION ===');
    
    // Get count of records needing updates
    const needingUpdates = await db
      .select()
      .from(observations)
      .where(eq(observations.classificationUpdate, true));
    
    console.log(`Records needing classification updates: ${needingUpdates.length}`);
    
    if (needingUpdates.length === 0) {
      console.log('No classification updates needed');
      return;
    }
    
    // Get reference taxonomy data
    console.log('Loading reference taxonomy data...');
    const referenceData = await db
      .select({
        genus: observations.genus,
        kingdom: observations.kingdom,
        phylum: observations.phylum,
        class: observations.class,
        order: observations.order,
        family: observations.family
      })
      .from(observations)
      .where(and(
        isNotNull(observations.genus),
        isNotNull(observations.kingdom),
        isNotNull(observations.phylum),
        isNotNull(observations.class),
        isNotNull(observations.order),
        isNotNull(observations.family)
      ));
    
    // Build genus reference map
    const genusMap = new Map();
    referenceData.forEach(ref => {
      const key = ref.genus.toLowerCase().trim();
      if (!genusMap.has(key)) {
        genusMap.set(key, {
          kingdom: ref.kingdom,
          phylum: ref.phylum,
          class: ref.class,
          order: ref.order,
          family: ref.family,
          genus: ref.genus
        });
      }
    });
    
    console.log(`Reference genera loaded: ${genusMap.size}`);
    
    // Process all records with detailed logging
    let successCount = 0;
    let batchCount = 0;
    const BATCH_SIZE = 50; // Smaller batches for better monitoring
    const startTime = Date.now();
    
    console.log('Starting automated classification updates...');
    console.log(`Total batches to process: ${Math.ceil(needingUpdates.length / BATCH_SIZE)}`);
    
    for (let i = 0; i < needingUpdates.length; i += BATCH_SIZE) {
      const batch = needingUpdates.slice(i, i + BATCH_SIZE);
      batchCount++;
      const batchStartTime = Date.now();
      
      console.log(`\n[${new Date().toISOString()}] Batch ${batchCount}/${Math.ceil(needingUpdates.length / BATCH_SIZE)}: Processing ${batch.length} records (${i + 1}-${i + batch.length})`);
      
      let batchSuccess = 0;
      let batchMatched = 0;
      let batchNoGenus = 0;
      let batchNoMatch = 0;
      
      for (const record of batch) {
        try {
          let targetGenus = null;
          
          // Extract genus from species or infraspecies
          if (record.species) {
            targetGenus = record.species.split(' ')[0].toLowerCase().trim();
          } else if (record.infraspecies) {
            targetGenus = record.infraspecies.split(' ')[0].toLowerCase().trim();
          }
          
          if (!targetGenus) {
            batchNoGenus++;
            continue;
          }
          
          if (genusMap.has(targetGenus)) {
            batchMatched++;
            const taxonomy = genusMap.get(targetGenus);
            
            // Update the record with complete taxonomy
            const updateStart = Date.now();
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
            
            const updateTime = Date.now() - updateStart;
            if (updateTime > 1000) {
              console.log(`  Slow update: Record ${record.id} took ${updateTime}ms`);
            }
            
            batchSuccess++;
            successCount++;
          } else {
            batchNoMatch++;
          }
        } catch (recordError) {
          console.warn(`  Failed to update record ${record.id}: ${recordError.message}`);
        }
      }
      
      const batchTime = Date.now() - batchStartTime;
      const totalTime = Date.now() - startTime;
      const avgTimePerRecord = batchTime / batch.length;
      
      console.log(`Batch ${batchCount} complete in ${batchTime}ms (${avgTimePerRecord.toFixed(1)}ms/record):`);
      console.log(`  - Updated: ${batchSuccess}/${batch.length}`);
      console.log(`  - Matched genus: ${batchMatched}, No genus: ${batchNoGenus}, No match: ${batchNoMatch}`);
      console.log(`  - Total runtime: ${(totalTime / 1000).toFixed(1)}s`);
      
      // Memory check
      const memUsage = process.memoryUsage();
      console.log(`  - Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB heap, ${Math.round(memUsage.rss / 1024 / 1024)}MB RSS`);
      
      // Progress reporting
      if (batchCount % 5 === 0 || batchCount === Math.ceil(needingUpdates.length / BATCH_SIZE)) {
        const progress = ((i + batch.length) / needingUpdates.length * 100).toFixed(1);
        const estimatedTimeRemaining = (totalTime / (i + batch.length)) * (needingUpdates.length - (i + batch.length));
        console.log(`\n=== Progress: ${progress}% complete (${successCount} total updates) ===`);
        console.log(`=== Estimated time remaining: ${(estimatedTimeRemaining / 1000 / 60).toFixed(1)} minutes ===\n`);
      }
      
      // Force garbage collection if available
      if (global.gc && batchCount % 20 === 0) {
        global.gc();
        console.log(`  - Forced garbage collection`);
      }
    }
    
    // Final verification
    const remainingUpdates = await db
      .select()
      .from(observations)
      .where(eq(observations.classificationUpdate, true));
    
    console.log('=== FINAL RESULTS ===');
    console.log(`Total records processed: ${needingUpdates.length}`);
    console.log(`Successfully automated: ${successCount}`);
    console.log(`Still need manual review: ${remainingUpdates.length}`);
    console.log(`Automation success rate: ${(successCount / needingUpdates.length * 100).toFixed(1)}%`);
    console.log(`Manual workload reduction: ${successCount} fewer records to review`);
    
  } catch (error) {
    console.error('Error in automated classification:', error);
  } finally {
    process.exit(0);
  }
}

processLargeDataset();