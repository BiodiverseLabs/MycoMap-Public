import { db } from './server/db.js';
import { observations } from './shared/schema.js';
import { eq, and, isNotNull } from 'drizzle-orm';

async function processLargeExcelRobust() {
  try {
    console.log('Starting robust batch classification processing...');
    
    // Get total count first
    const totalCount = await db
      .select({ count: observations.id })
      .from(observations)
      .where(eq(observations.classificationUpdate, true));
    
    console.log(`Total records needing updates: ${totalCount.length}`);
    
    // Build reference lookup once
    console.log('Building reference taxonomy lookup...');
    const completeRecords = await db
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
    
    const genusLookup = new Map();
    completeRecords.forEach(obs => {
      const genusKey = obs.genus.toLowerCase().trim();
      if (!genusLookup.has(genusKey)) {
        genusLookup.set(genusKey, {
          kingdom: obs.kingdom,
          phylum: obs.phylum,
          class: obs.class,
          order: obs.order,
          family: obs.family,
          genus: obs.genus
        });
      }
    });
    
    console.log(`Reference genera available: ${genusLookup.size}`);
    
    // Process in chunks
    let totalUpdated = 0;
    const chunkSize = 200;
    let offset = 0;
    
    while (true) {
      const batch = await db
        .select()
        .from(observations)
        .where(eq(observations.classificationUpdate, true))
        .limit(chunkSize)
        .offset(offset);
      
      if (batch.length === 0) break;
      
      console.log(`Processing chunk: ${batch.length} records (offset ${offset})`);
      
      let chunkUpdated = 0;
      
      for (const record of batch) {
        let genusCandidate = null;
        
        if (record.species) {
          genusCandidate = record.species.split(' ')[0].toLowerCase().trim();
        } else if (record.infraspecies) {
          genusCandidate = record.infraspecies.split(' ')[0].toLowerCase().trim();
        }
        
        if (genusCandidate && genusLookup.has(genusCandidate)) {
          const ref = genusLookup.get(genusCandidate);
          
          await db
            .update(observations)
            .set({
              kingdom: record.kingdom || ref.kingdom,
              phylum: record.phylum || ref.phylum,
              class: record.class || ref.class,
              order: record.order || ref.order,
              family: record.family || ref.family,
              genus: record.genus || ref.genus,
              classificationUpdate: false
            })
            .where(eq(observations.id, record.id));
          
          chunkUpdated++;
        }
      }
      
      totalUpdated += chunkUpdated;
      console.log(`Chunk complete: ${chunkUpdated}/${batch.length} updated. Total: ${totalUpdated}`);
      
      // If no updates in this chunk, move offset to avoid infinite loop
      if (chunkUpdated === 0) {
        offset += chunkSize;
      }
      
      // Stop after processing a reasonable amount to avoid timeouts
      if (totalUpdated >= 2000) {
        console.log('Stopping at 2000 updates to avoid timeout');
        break;
      }
    }
    
    console.log(`Batch processing complete: ${totalUpdated} records automated`);
    
  } catch (error) {
    console.error('Error in processing:', error);
  } finally {
    process.exit(0);
  }
}

processLargeExcelRobust();