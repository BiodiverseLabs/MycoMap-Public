import { DatabaseStorage } from './server/db.js';

async function runFixedClassificationUpdate() {
  console.log('=== Running Fixed Classification Update for Upload 60 ===\n');
  
  const storage = new DatabaseStorage();
  
  try {
    // Get upload observations and filter for classification updates
    const uploadObservations = await storage.getObservationsFromUpload(60);
    const classificationUpdates = uploadObservations.filter(obs => obs.classificationUpdate === true);
    
    console.log(`Found ${classificationUpdates.length} records from upload 60 needing classification updates`);
    
    if (classificationUpdates.length === 0) {
      console.log('No records need classification updates');
      return;
    }
    
    let updatedCount = 0;
    let inatLookupCount = 0;
    
    // Process in batches of 50
    const batchSize = 50;
    const totalBatches = Math.ceil(classificationUpdates.length / batchSize);
    
    for (let i = 0; i < totalBatches; i++) {
      const startIdx = i * batchSize;
      const endIdx = Math.min(startIdx + batchSize, classificationUpdates.length);
      const batch = classificationUpdates.slice(startIdx, endIdx);
      
      console.log(`\nProcessing batch ${i + 1}/${totalBatches} (${batch.length} records)...`);
      
      for (const record of batch) {
        try {
          const genusCandidate = record.genus?.trim();
          
          // Skip invalid genus names
          if (!genusCandidate || genusCandidate.length < 2) continue;
          if (genusCandidate.includes('http') || genusCandidate.includes('www.')) continue;
          if (/^[0-9]/.test(genusCandidate)) continue;
          
          // Try local lookup first
          let taxonomyRef = null;
          let source = 'unknown';
          
          // Get local genus data
          const localGenus = await storage.db.execute(`
            SELECT DISTINCT kingdom, phylum, class, "order", family, genus
            FROM observations 
            WHERE genus = $1 
              AND kingdom IS NOT NULL 
              AND phylum IS NOT NULL 
              AND class IS NOT NULL 
              AND "order" IS NOT NULL 
              AND family IS NOT NULL
            LIMIT 1
          `, [genusCandidate]);
          
          if (localGenus.rows.length > 0) {
            const localMatch = localGenus.rows[0];
            taxonomyRef = {
              kingdom: localMatch.kingdom,
              phylum: localMatch.phylum,
              class: localMatch.class,
              order: localMatch.order,
              family: localMatch.family,
              genus: localMatch.genus
            };
            source = 'local database';
          } else {
            // Fallback to iNaturalist API
            console.log(`  No local match for "${genusCandidate}", trying iNaturalist API...`);
            taxonomyRef = await storage.lookupGenusClassificationWithCache(genusCandidate);
            if (taxonomyRef) {
              source = 'iNaturalist API';
              inatLookupCount++;
            }
          }
          
          if (taxonomyRef) {
            // Update the record
            const updateData = {
              kingdom: record.kingdom || taxonomyRef.kingdom,
              phylum: record.phylum || taxonomyRef.phylum,
              class: record.class || taxonomyRef.class,
              order: record.order || taxonomyRef.order,
              family: record.family || taxonomyRef.family,
              genus: record.genus || taxonomyRef.genus,
              classificationUpdate: false
            };
            
            await storage.updateObservationTaxonomy(record.id, updateData);
            updatedCount++;
            
            console.log(`  ✓ Updated ${record.scientificName || record.species}: "${genusCandidate}" -> ${taxonomyRef.family} family (${source})`);
          } else {
            console.log(`  ⚠ No taxonomy found for "${genusCandidate}" in ${record.scientificName || record.species}`);
          }
        } catch (recordError) {
          console.error(`  ✗ Error updating record ${record.id}:`, recordError.message);
        }
      }
    }
    
    console.log(`\n=== Classification Update Complete ===`);
    console.log(`Records processed: ${classificationUpdates.length}`);
    console.log(`Records updated: ${updatedCount}`);
    console.log(`iNaturalist API lookups: ${inatLookupCount}`);
    
  } catch (error) {
    console.error('Classification update failed:', error);
  }
  
  process.exit(0);
}

runFixedClassificationUpdate().catch(console.error);