import { db } from './server/db.js';
import { observations } from './shared/schema.js';
import { eq, and, isNotNull, inArray } from 'drizzle-orm';

async function processFullDataset() {
  try {
    console.log('=== OPTIMIZED CLASSIFICATION AUTOMATION ===');
    
    const startTime = Date.now();
    
    // Step 1: Get all records needing updates
    console.log('Loading records needing classification updates...');
    const needingUpdates = await db
      .select({
        id: observations.id,
        species: observations.species,
        infraspecies: observations.infraspecies,
        kingdom: observations.kingdom,
        phylum: observations.phylum,
        class: observations.class,
        order: observations.order,
        family: observations.family,
        genus: observations.genus
      })
      .from(observations)
      .where(eq(observations.classificationUpdate, true));
    
    console.log(`Found ${needingUpdates.length} records needing updates`);
    
    // Step 2: Build genus index once
    console.log('Building genus classification index...');
    const referenceRecords = await db
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
    
    // Create fast lookup map
    const genusIndex = new Map();
    referenceRecords.forEach(ref => {
      const key = ref.genus.toLowerCase().trim();
      if (!genusIndex.has(key)) {
        genusIndex.set(key, {
          kingdom: ref.kingdom,
          phylum: ref.phylum,
          class: ref.class,
          order: ref.order,
          family: ref.family,
          genus: ref.genus
        });
      }
    });
    
    console.log(`Genus index built: ${genusIndex.size} reference genera`);
    
    // Step 3: Process all records in memory
    console.log('Processing records in memory...');
    const updateBatches = [];
    let matchCount = 0;
    
    needingUpdates.forEach(record => {
      let targetGenus = null;
      
      if (record.species) {
        targetGenus = record.species.split(' ')[0].toLowerCase().trim();
      } else if (record.infraspecies) {
        targetGenus = record.infraspecies.split(' ')[0].toLowerCase().trim();
      }
      
      if (targetGenus && genusIndex.has(targetGenus)) {
        const taxonomy = genusIndex.get(targetGenus);
        
        updateBatches.push({
          id: record.id,
          kingdom: record.kingdom || taxonomy.kingdom,
          phylum: record.phylum || taxonomy.phylum,
          class: record.class || taxonomy.class,
          order: record.order || taxonomy.order,
          family: record.family || taxonomy.family,
          genus: record.genus || taxonomy.genus,
          classificationUpdate: false
        });
        
        matchCount++;
      }
    });
    
    console.log(`Matches found: ${matchCount} out of ${needingUpdates.length} records`);
    console.log(`Success rate: ${(matchCount / needingUpdates.length * 100).toFixed(1)}%`);
    
    // Step 4: Bulk update using efficient batching
    if (updateBatches.length > 0) {
      console.log('Starting bulk database updates...');
      
      const BATCH_SIZE = 500;
      let totalUpdated = 0;
      
      for (let i = 0; i < updateBatches.length; i += BATCH_SIZE) {
        const batch = updateBatches.slice(i, i + BATCH_SIZE);
        const batchIds = batch.map(r => r.id);
        
        console.log(`Bulk updating batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(updateBatches.length/BATCH_SIZE)} (${batch.length} records)`);
        
        try {
          // Use efficient bulk update approach
          for (const record of batch) {
            await db
              .update(observations)
              .set({
                kingdom: record.kingdom,
                phylum: record.phylum,
                class: record.class,
                order: record.order,
                family: record.family,
                genus: record.genus,
                classificationUpdate: false
              })
              .where(eq(observations.id, record.id));
          }
          
          totalUpdated += batch.length;
          console.log(`Batch complete: ${totalUpdated}/${updateBatches.length} records updated`);
          
        } catch (batchError) {
          console.error(`Batch update failed:`, batchError.message);
        }
      }
      
      console.log(`Bulk updates complete: ${totalUpdated} records updated`);
    }
    
    // Step 5: Verify results
    const remainingUpdates = await db
      .select()
      .from(observations)
      .where(eq(observations.classificationUpdate, true));
    
    const totalTime = Date.now() - startTime;
    
    console.log('=== FINAL RESULTS ===');
    console.log(`Processing time: ${(totalTime / 1000).toFixed(1)} seconds`);
    console.log(`Records processed: ${needingUpdates.length}`);
    console.log(`Successfully automated: ${matchCount}`);
    console.log(`Still need manual review: ${remainingUpdates.length}`);
    console.log(`Automation success rate: ${(matchCount / needingUpdates.length * 100).toFixed(1)}%`);
    console.log(`Processing speed: ${(needingUpdates.length / (totalTime / 1000)).toFixed(0)} records/second`);
    
  } catch (error) {
    console.error('Error in optimized classification:', error);
  } finally {
    process.exit(0);
  }
}

processFullDataset();