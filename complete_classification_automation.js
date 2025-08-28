import { db } from './server/db.js';
import { observations } from './shared/schema.js';
import { eq, and, isNotNull } from 'drizzle-orm';

async function completeClassificationAutomation() {
  try {
    console.log('=== COMPLETE CLASSIFICATION AUTOMATION ===');
    console.log('Processing ALL remaining records until completion...\n');
    
    const overallStartTime = Date.now();
    
    // Get initial count
    const initialCount = await db
      .select({ id: observations.id })
      .from(observations)
      .where(eq(observations.classificationUpdate, true));
    
    console.log(`Total records needing classification: ${initialCount.length}`);
    
    // Build comprehensive genus reference lookup
    console.log('Building comprehensive genus reference...');
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
    
    // Create genus taxonomy lookup
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
    
    console.log(`Genus lookup ready: ${genusLookup.size} unique genera\n`);
    
    // Process in continuous batches until completion
    let totalProcessed = 0;
    let totalAutomated = 0;
    let batchNumber = 0;
    const BATCH_SIZE = 200; // Larger batches for efficiency
    
    while (true) {
      batchNumber++;
      const batchStartTime = Date.now();
      
      // Get next batch
      const batch = await db
        .select()
        .from(observations)
        .where(eq(observations.classificationUpdate, true))
        .limit(BATCH_SIZE);
      
      if (batch.length === 0) {
        console.log('\n✓ ALL RECORDS PROCESSED - No more records need classification updates!');
        break;
      }
      
      console.log(`\nBatch ${batchNumber}: Processing ${batch.length} records...`);
      
      let batchAutomated = 0;
      const updates = [];
      
      // Prepare updates for this batch
      for (const record of batch) {
        let targetGenus = null;
        
        // Extract genus from species, infraspecies, or scientific_name
        if (record.species) {
          targetGenus = record.species.split(' ')[0].toLowerCase().trim();
        } else if (record.infraspecies) {
          targetGenus = record.infraspecies.split(' ')[0].toLowerCase().trim();
        } else if (record.scientificName) {
          // Fallback to scientific_name for cases like "Amanita batonrougensis"
          targetGenus = record.scientificName.split(' ')[0].toLowerCase().trim();
        }
        
        if (targetGenus && genusLookup.has(targetGenus)) {
          const taxonomy = genusLookup.get(targetGenus);
          updates.push({
            id: record.id,
            kingdom: record.kingdom || taxonomy.kingdom,
            phylum: record.phylum || taxonomy.phylum,
            class: record.class || taxonomy.class,
            order: record.order || taxonomy.order,
            family: record.family || taxonomy.family,
            genus: record.genus || taxonomy.genus
          });
          batchAutomated++;
        }
      }
      
      // Execute all updates for this batch
      for (const update of updates) {
        try {
          await db
            .update(observations)
            .set({
              kingdom: update.kingdom,
              phylum: update.phylum,
              class: update.class,
              order: update.order,
              family: update.family,
              genus: update.genus,
              classificationUpdate: false
            })
            .where(eq(observations.id, update.id));
        } catch (updateError) {
          console.warn(`  Warning: Failed to update record ${update.id}: ${updateError.message}`);
        }
      }
      
      totalProcessed += batch.length;
      totalAutomated += batchAutomated;
      
      const batchTime = Date.now() - batchStartTime;
      const batchRate = batch.length / (batchTime / 1000);
      const successRate = (batchAutomated / batch.length * 100).toFixed(1);
      
      console.log(`  ✓ Completed: ${batchAutomated}/${batch.length} automated (${successRate}% success)`);
      console.log(`  ⚡ Rate: ${batchRate.toFixed(1)} records/second`);
      console.log(`  📊 Total progress: ${totalAutomated}/${initialCount.length} automated`);
      
      // Brief progress check
      if (batchNumber % 10 === 0) {
        const remaining = await db
          .select({ id: observations.id })
          .from(observations)
          .where(eq(observations.classificationUpdate, true));
        
        const overallTime = Date.now() - overallStartTime;
        const overallRate = totalProcessed / (overallTime / 1000);
        const estimatedTimeRemaining = remaining.length / overallRate;
        
        console.log(`\n--- Progress Checkpoint (Batch ${batchNumber}) ---`);
        console.log(`Records remaining: ${remaining.length}`);
        console.log(`Overall rate: ${overallRate.toFixed(1)} records/second`);
        console.log(`Estimated time remaining: ${(estimatedTimeRemaining / 60).toFixed(1)} minutes\n`);
      }
    }
    
    // Final comprehensive results
    const finalCount = await db
      .select({ id: observations.id })
      .from(observations)
      .where(eq(observations.classificationUpdate, true));
    
    const totalTime = Date.now() - overallStartTime;
    const finalAutomated = initialCount.length - finalCount.length;
    const overallSuccessRate = (finalAutomated / initialCount.length * 100).toFixed(1);
    
    console.log('\n🎉 === COMPLETE AUTOMATION RESULTS ===');
    console.log(`Total processing time: ${(totalTime / 60000).toFixed(1)} minutes`);
    console.log(`Records automated: ${finalAutomated} out of ${initialCount.length}`);
    console.log(`Overall success rate: ${overallSuccessRate}%`);
    console.log(`Records still requiring manual review: ${finalCount.length}`);
    console.log(`Processing rate: ${(finalAutomated / (totalTime / 1000)).toFixed(1)} records/second`);
    console.log(`Manual workload reduction: ${overallSuccessRate}%`);
    
    if (finalCount.length === 0) {
      console.log('\n🏆 PERFECT AUTOMATION: All records have been successfully classified!');
    } else {
      console.log(`\n📋 ${finalCount.length} records still need manual taxonomy review`);
    }
    
  } catch (error) {
    console.error('❌ Error in complete classification automation:', error);
  } finally {
    process.exit(0);
  }
}

completeClassificationAutomation();