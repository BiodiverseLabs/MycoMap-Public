import fetch from 'node-fetch';

async function runClassificationUpdates() {
  try {
    console.log('Running automated classification updates on existing data...');
    
    // Get all observations with classification update flags
    console.log('Fetching records needing classification updates...');
    const response = await fetch('http://localhost:5000/api/observations/classification-updates');
    const classificationUpdates = await response.json();
    
    console.log(`Found ${classificationUpdates.length} records needing classification updates`);
    
    if (classificationUpdates.length === 0) {
      console.log('No classification updates needed');
      return;
    }
    
    // Get all observations that have complete taxonomy (to use as reference)
    console.log('Building genus lookup table...');
    const allResponse = await fetch('http://localhost:5000/api/observations');
    const allObservations = await allResponse.json();
    
    // Create a genus lookup map from complete taxonomy records
    const genusLookup = new Map();
    
    allObservations.forEach(obs => {
      if (obs.genus && obs.kingdom && obs.phylum && obs.class && 
          obs.order && obs.family) {
        // Only use records with complete taxonomy as reference
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
    
    console.log(`Built genus lookup table with ${genusLookup.size} complete taxonomy references`);
    
    let updatedCount = 0;
    let processedCount = 0;
    const batchSize = 20;
    
    // Process classification updates in batches
    for (let i = 0; i < classificationUpdates.length; i += batchSize) {
      const batch = classificationUpdates.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(classificationUpdates.length/batchSize)}`);
      
      for (const record of batch) {
        try {
          processedCount++;
          
          // Extract first word from Species or Variety
          let genusCandidate = null;
          
          if (record.species) {
            genusCandidate = record.species.split(' ')[0].toLowerCase().trim();
          } else if (record.infraspecies) { // Variety field
            genusCandidate = record.infraspecies.split(' ')[0].toLowerCase().trim();
          }
          
          if (genusCandidate && genusLookup.has(genusCandidate)) {
            const taxonomyRef = genusLookup.get(genusCandidate);
            
            // Update the record with missing taxonomy via API
            const updateData = {
              kingdom: record.kingdom || taxonomyRef.kingdom,
              phylum: record.phylum || taxonomyRef.phylum,
              class: record.class || taxonomyRef.class,
              order: record.order || taxonomyRef.order,
              family: record.family || taxonomyRef.family,
              genus: record.genus || taxonomyRef.genus,
              classificationUpdate: false // Remove the flag
            };
            
            // Use direct database update
            const updateResponse = await fetch(`http://localhost:5000/api/observations/${record.id}/taxonomy`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(updateData)
            });
            
            if (updateResponse.ok) {
              updatedCount++;
              console.log(`✓ Updated record ${record.id}: "${genusCandidate}" matched to ${taxonomyRef.family} family`);
            } else {
              console.log(`✗ Failed to update record ${record.id}`);
            }
          }
          
          // Progress report every 100 records
          if (processedCount % 100 === 0) {
            console.log(`Progress: ${processedCount}/${classificationUpdates.length} processed, ${updatedCount} updated`);
          }
          
        } catch (recordError) {
          console.error(`Error updating record ${record.id}:`, recordError.message);
        }
      }
      
      // Small delay between batches to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n=== AUTOMATED CLASSIFICATION UPDATES COMPLETED ===`);
    console.log(`Total processed: ${processedCount}`);
    console.log(`Successfully updated: ${updatedCount}`);
    console.log(`Success rate: ${((updatedCount/processedCount) * 100).toFixed(1)}%`);
    console.log(`Remaining classification updates: ${classificationUpdates.length - updatedCount}`);
    
  } catch (error) {
    console.error('Error running automated classification updates:', error);
  }
}

runClassificationUpdates();