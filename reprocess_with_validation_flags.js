import { db } from './server/db.js';
import { observations } from './shared/schema.js';
import { eq, and, isNotNull, sql } from 'drizzle-orm';

async function reprocessWithValidationFlags() {
  try {
    console.log('=== ULTRA-FAST CLASSIFICATION AUTOMATION ===');
    
    const startTime = Date.now();
    
    // Step 1: Load all needed data in single queries
    console.log('Loading data...');
    
    const [needingUpdates, referenceData] = await Promise.all([
      db.select({
        id: observations.id,
        species: observations.species,
        infraspecies: observations.infraspecies
      }).from(observations).where(eq(observations.classificationUpdate, true)),
      
      db.select({
        genus: observations.genus,
        kingdom: observations.kingdom,
        phylum: observations.phylum,
        class: observations.class,
        order: observations.order,
        family: observations.family
      }).from(observations).where(and(
        isNotNull(observations.genus),
        isNotNull(observations.kingdom),
        isNotNull(observations.phylum),
        isNotNull(observations.class),
        isNotNull(observations.order),
        isNotNull(observations.family)
      ))
    ]);
    
    console.log(`Records needing updates: ${needingUpdates.length}`);
    console.log(`Reference records: ${referenceData.length}`);
    
    // Step 2: Build genus index
    const genusIndex = new Map();
    referenceData.forEach(ref => {
      const key = ref.genus.toLowerCase().trim();
      if (!genusIndex.has(key)) {
        genusIndex.set(key, ref);
      }
    });
    
    console.log(`Genus index: ${genusIndex.size} unique genera`);
    
    // Step 3: Process matches in memory
    const updateIds = [];
    const updateData = new Map();
    
    needingUpdates.forEach(record => {
      let targetGenus = null;
      
      if (record.species) {
        targetGenus = record.species.split(' ')[0].toLowerCase().trim();
      } else if (record.infraspecies) {
        targetGenus = record.infraspecies.split(' ')[0].toLowerCase().trim();
      }
      
      if (targetGenus && genusIndex.has(targetGenus)) {
        const taxonomy = genusIndex.get(targetGenus);
        updateIds.push(record.id);
        updateData.set(record.id, taxonomy);
      }
    });
    
    console.log(`Matches found: ${updateIds.length} out of ${needingUpdates.length}`);
    console.log(`Success rate: ${(updateIds.length / needingUpdates.length * 100).toFixed(1)}%`);
    
    // Step 4: Use SQL-based bulk updates for maximum efficiency
    if (updateIds.length > 0) {
      console.log('Executing ultra-fast SQL bulk updates...');
      
      // Process in manageable chunks
      const CHUNK_SIZE = 1000;
      let totalUpdated = 0;
      
      for (let i = 0; i < updateIds.length; i += CHUNK_SIZE) {
        const chunk = updateIds.slice(i, i + CHUNK_SIZE);
        console.log(`Processing chunk ${Math.floor(i/CHUNK_SIZE) + 1}/${Math.ceil(updateIds.length/CHUNK_SIZE)} (${chunk.length} records)`);
        
        try {
          // Create a CASE statement for bulk update
          const whenClauses = chunk.map(id => {
            const data = updateData.get(id);
            return `WHEN ${id} THEN '${data.kingdom}'`;
          }).join(' ');
          
          // Execute bulk update using raw SQL for maximum performance
          await db.execute(sql`
            UPDATE observations 
            SET 
              kingdom = CASE id ${sql.raw(whenClauses)} END,
              phylum = CASE id ${sql.raw(chunk.map(id => {
                const data = updateData.get(id);
                return `WHEN ${id} THEN '${data.phylum}'`;
              }).join(' '))} END,
              class = CASE id ${sql.raw(chunk.map(id => {
                const data = updateData.get(id);
                return `WHEN ${id} THEN '${data.class}'`;
              }).join(' '))} END,
              "order" = CASE id ${sql.raw(chunk.map(id => {
                const data = updateData.get(id);
                return `WHEN ${id} THEN '${data.order}'`;
              }).join(' '))} END,
              family = CASE id ${sql.raw(chunk.map(id => {
                const data = updateData.get(id);
                return `WHEN ${id} THEN '${data.family}'`;
              }).join(' '))} END,
              genus = CASE id ${sql.raw(chunk.map(id => {
                const data = updateData.get(id);
                return `WHEN ${id} THEN '${data.genus}'`;
              }).join(' '))} END,
              classification_update = false
            WHERE id IN (${chunk.join(',')})
          `);
          
          totalUpdated += chunk.length;
          console.log(`Chunk complete: ${totalUpdated}/${updateIds.length} total updated`);
          
        } catch (chunkError) {
          console.error(`Chunk failed: ${chunkError.message}`);
          
          // Fallback to individual updates for this chunk
          console.log('Falling back to individual updates for this chunk...');
          for (const id of chunk) {
            try {
              const data = updateData.get(id);
              await db.update(observations)
                .set({
                  kingdom: data.kingdom,
                  phylum: data.phylum,
                  class: data.class,
                  order: data.order,
                  family: data.family,
                  genus: data.genus,
                  classificationUpdate: false
                })
                .where(eq(observations.id, id));
              
              totalUpdated++;
            } catch (individualError) {
              console.error(`Failed to update record ${id}: ${individualError.message}`);
            }
          }
        }
      }
      
      console.log(`Bulk updates complete: ${totalUpdated} records updated`);
    }
    
    // Final verification
    const remaining = await db.select().from(observations).where(eq(observations.classificationUpdate, true));
    const totalTime = Date.now() - startTime;
    
    console.log('=== FINAL RESULTS ===');
    console.log(`Total processing time: ${(totalTime / 1000).toFixed(1)} seconds`);
    console.log(`Records automated: ${updateIds.length}`);
    console.log(`Records still needing manual review: ${remaining.length}`);
    console.log(`Processing speed: ${(updateIds.length / (totalTime / 1000)).toFixed(0)} records/second`);
    console.log(`Manual workload reduction: ${((updateIds.length / needingUpdates.length) * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error('Error in ultra-fast classification:', error);
  } finally {
    process.exit(0);
  }
}

reprocessWithValidationFlags();