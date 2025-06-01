import { db } from './server/db.js';
import { observations } from './shared/schema.js';
import { eq, and, isNotNull } from 'drizzle-orm';

async function fixClassificationUpdates() {
  try {
    console.log('Starting automated classification updates...');
    
    // Get records needing classification updates
    const classificationUpdates = await db
      .select()
      .from(observations)
      .where(eq(observations.classificationUpdate, true));
    
    console.log(`Found ${classificationUpdates.length} records needing classification updates`);
    
    // Get complete taxonomy records for reference
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
    
    // Build genus lookup
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
    
    console.log(`Built genus lookup with ${genusLookup.size} reference entries`);
    
    let updatedCount = 0;
    
    // Process in smaller batches to avoid timeouts
    const batchSize = 50;
    for (let i = 0; i < classificationUpdates.length; i += batchSize) {
      const batch = classificationUpdates.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(classificationUpdates.length/batchSize)}`);
      
      for (const record of batch) {
        let genusCandidate = null;
        
        if (record.species) {
          genusCandidate = record.species.split(' ')[0].toLowerCase().trim();
        } else if (record.infraspecies) {
          genusCandidate = record.infraspecies.split(' ')[0].toLowerCase().trim();
        }
        
        if (genusCandidate && genusLookup.has(genusCandidate)) {
          const taxonomyRef = genusLookup.get(genusCandidate);
          
          await db
            .update(observations)
            .set({
              kingdom: record.kingdom || taxonomyRef.kingdom,
              phylum: record.phylum || taxonomyRef.phylum,
              class: record.class || taxonomyRef.class,
              order: record.order || taxonomyRef.order,
              family: record.family || taxonomyRef.family,
              genus: record.genus || taxonomyRef.genus,
              classificationUpdate: false
            })
            .where(eq(observations.id, record.id));
          
          updatedCount++;
        }
      }
      
      console.log(`Progress: ${updatedCount} records updated so far...`);
    }
    
    // Check final results
    const remainingUpdates = await db
      .select()
      .from(observations)
      .where(eq(observations.classificationUpdate, true));
    
    console.log(`✓ Automated classification updates completed`);
    console.log(`✓ ${updatedCount} records automatically updated`);
    console.log(`✓ ${remainingUpdates.length} records still need manual review`);
    console.log(`✓ Manual work reduced by ${((updatedCount / classificationUpdates.length) * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error('Error in automated classification updates:', error);
  } finally {
    process.exit(0);
  }
}

fixClassificationUpdates();