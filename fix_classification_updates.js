import fetch from 'node-fetch';

async function fixClassificationUpdates() {
  try {
    console.log('Running automated classification updates to fix pending records...');
    
    // Get current classification updates
    const response = await fetch('http://localhost:5000/api/observations/classification-updates');
    const classificationUpdates = await response.json();
    
    console.log(`Found ${classificationUpdates.length} records needing classification updates`);
    
    if (classificationUpdates.length === 0) {
      console.log('No classification updates needed');
      return;
    }
    
    // Get all observations for reference data
    console.log('Fetching reference taxonomy data...');
    const allResponse = await fetch('http://localhost:5000/api/observations');
    const allObservations = await allResponse.json();
    
    // Build genus lookup table from complete records
    const genusLookup = new Map();
    allObservations.forEach(obs => {
      if (obs.genus && obs.kingdom && obs.phylum && obs.class && obs.order && obs.family) {
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
      }
    });
    
    console.log(`Built genus lookup table with ${genusLookup.size} reference entries`);
    
    let updatedCount = 0;
    let processedCount = 0;
    
    // Process in smaller batches to see progress
    const batchSize = 50;
    
    for (let i = 0; i < Math.min(classificationUpdates.length, 1000); i += batchSize) {
      const batch = classificationUpdates.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1} (records ${i + 1}-${Math.min(i + batchSize, classificationUpdates.length)})`);
      
      for (const record of batch) {
        processedCount++;
        
        // Extract genus candidate from species or variety
        let genusCandidate = null;
        if (record.species) {
          genusCandidate = record.species.split(' ')[0].toLowerCase().trim();
        } else if (record.infraspecies) {
          genusCandidate = record.infraspecies.split(' ')[0].toLowerCase().trim();
        }
        
        if (genusCandidate && genusLookup.has(genusCandidate)) {
          const taxonomyRef = genusLookup.get(genusCandidate);
          
          // Prepare update data
          const updateData = {
            kingdom: record.kingdom || taxonomyRef.kingdom,
            phylum: record.phylum || taxonomyRef.phylum,
            class: record.class || taxonomyRef.class,
            order: record.order || taxonomyRef.order,
            family: record.family || taxonomyRef.family,
            genus: record.genus || taxonomyRef.genus,
            classificationUpdate: false
          };
          
          try {
            // Use direct SQL update via our storage method (simulated)
            const updateResponse = await fetch(`http://localhost:5000/api/observations/${record.id}/update-taxonomy`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updateData)
            });
            
            if (updateResponse.ok) {
              updatedCount++;
              if (updatedCount % 10 === 0) {
                console.log(`✓ Updated ${updatedCount} records so far...`);
              }
            }
          } catch (updateError) {
            // Skip individual update errors
          }
        }
      }
      
      // Progress report
      console.log(`Batch complete. Processed: ${processedCount}, Updated: ${updatedCount}`);
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n=== CLASSIFICATION UPDATE RESULTS ===`);
    console.log(`Records processed: ${processedCount}`);
    console.log(`Successfully updated: ${updatedCount}`);
    console.log(`Success rate: ${((updatedCount/processedCount) * 100).toFixed(1)}%`);
    
    // Check remaining count
    const finalResponse = await fetch('http://localhost:5000/api/observations/classification-updates');
    const finalUpdates = await finalResponse.json();
    console.log(`Remaining classification updates: ${finalUpdates.length}`);
    
  } catch (error) {
    console.error('Error running classification updates:', error);
  }
}

fixClassificationUpdates();