import { db } from './server/db.js';
import { observations } from './shared/schema.js';
import { eq, and, isNotNull } from 'drizzle-orm';

async function testExcelReading() {
  try {
    console.log('Running focused classification update...');
    
    // Get first 500 records needing updates
    const classificationUpdates = await db
      .select()
      .from(observations)
      .where(eq(observations.classificationUpdate, true))
      .limit(500);
    
    console.log(`Processing ${classificationUpdates.length} records`);
    
    // Get reference data
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
      ))
      .limit(5000);
    
    // Build lookup
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
    
    console.log(`Reference genera: ${genusLookup.size}`);
    
    let updated = 0;
    
    for (const record of classificationUpdates) {
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
        
        updated++;
        
        if (updated % 25 === 0) {
          console.log(`Progress: ${updated} updated`);
        }
      }
    }
    
    console.log(`Complete: ${updated} records automated`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

testExcelReading();