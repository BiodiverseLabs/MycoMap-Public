import { db } from './server/db.js';
import { observations } from './shared/schema.js';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';

async function runClassificationUpdates() {
  try {
    console.log('=== RUNNING AUTOMATED CLASSIFICATION UPDATES ===');
    
    // Get records needing classification updates
    const classificationUpdates = await db
      .select()
      .from(observations)
      .where(eq(observations.classificationUpdate, true));
    
    console.log(`Found ${classificationUpdates.length} records needing classification updates`);
    
    if (classificationUpdates.length === 0) {
      console.log('No classification updates needed');
      return;
    }
    
    // Get all observations with complete taxonomy for reference
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
    
    // Build genus lookup table
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
    
    console.log(`Built genus lookup table with ${genusLookup.size} reference entries`);
    
    let updatedCount = 0;
    const batchSize = 100;
    
    for (let i = 0; i < classificationUpdates.length; i += batchSize) {
      const batch = classificationUpdates.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(classificationUpdates.length/batchSize)}`);
      
      for (const record of batch) {
        try {
          let genusCandidate = null;
          
          if (record.species) {
            genusCandidate = record.species.split(' ')[0].toLowerCase().trim();
          } else if (record.infraspecies) {
            genusCandidate = record.infraspecies.split(' ')[0].toLowerCase().trim();
          }
          
          if (genusCandidate && genusLookup.has(genusCandidate)) {
            const taxonomyRef = genusLookup.get(genusCandidate);
            
            // Update the record
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
            
            if (updatedCount % 100 === 0) {
              console.log(`Progress: ${updatedCount} records updated...`);
            }
          }
        } catch (recordError) {
          console.error(`Error updating record ${record.id}:`, recordError.message);
        }
      }
    }
    
    console.log(`✓ Automated classification updates completed: ${updatedCount} records updated`);
    
    // Check remaining classification updates
    const remainingUpdates = await db
      .select()
      .from(observations)
      .where(eq(observations.classificationUpdate, true));
    
    console.log(`Remaining classification updates needed: ${remainingUpdates.length}`);
    console.log(`Success rate: ${((updatedCount / classificationUpdates.length) * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error('Error in automated classification updates:', error);
  } finally {
    process.exit(0);
  }
}

runClassificationUpdates();