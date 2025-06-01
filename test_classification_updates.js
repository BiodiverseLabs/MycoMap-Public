import fetch from 'node-fetch';

async function testClassificationUpdates() {
  try {
    console.log('=== TESTING AUTOMATED CLASSIFICATION UPDATES ===\n');
    
    // Get current classification updates needed
    const updatesResponse = await fetch('http://localhost:5000/api/observations/classification-updates');
    const classificationUpdates = await updatesResponse.json();
    console.log(`Current classification updates needed: ${classificationUpdates.length}`);
    
    // Get all observations for building reference data
    const allResponse = await fetch('http://localhost:5000/api/observations');
    const allObservations = await allResponse.json();
    console.log(`Total observations in dataset: ${allObservations.length}`);
    
    // Build genus lookup from complete records
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
    
    console.log(`Reference genera available: ${genusLookup.size}\n`);
    
    // Test matching on a sample of records
    let matchCount = 0;
    let noMatchCount = 0;
    const sampleSize = Math.min(100, classificationUpdates.length);
    
    console.log(`Testing genus matching on ${sampleSize} sample records:\n`);
    
    for (let i = 0; i < sampleSize; i++) {
      const record = classificationUpdates[i];
      let genusCandidate = null;
      
      if (record.species) {
        genusCandidate = record.species.split(' ')[0].toLowerCase().trim();
      } else if (record.infraspecies) {
        genusCandidate = record.infraspecies.split(' ')[0].toLowerCase().trim();
      }
      
      if (genusCandidate && genusLookup.has(genusCandidate)) {
        const taxonomyRef = genusLookup.get(genusCandidate);
        console.log(`✓ Record ${record.id}: "${genusCandidate}" → ${taxonomyRef.family} family`);
        matchCount++;
      } else if (genusCandidate) {
        console.log(`✗ Record ${record.id}: "${genusCandidate}" (no reference found)`);
        noMatchCount++;
      } else {
        console.log(`? Record ${record.id}: No species/variety name available`);
        noMatchCount++;
      }
    }
    
    const successRate = (matchCount / sampleSize * 100).toFixed(1);
    const estimatedFixes = Math.round((matchCount / sampleSize) * classificationUpdates.length);
    
    console.log(`\n=== SAMPLE RESULTS ===`);
    console.log(`Successful matches: ${matchCount}/${sampleSize} (${successRate}%)`);
    console.log(`Estimated fixes for full dataset: ~${estimatedFixes} out of ${classificationUpdates.length}`);
    console.log(`Manual work reduction: ~${successRate}%`);
    
    console.log(`\n=== AUTOMATED CLASSIFICATION SYSTEM ===`);
    console.log(`Current status: Ready to run (system contains reference data)`);
    console.log(`Process: Extract genus from Species/Variety → Match against ${genusLookup.size} reference genera → Auto-populate taxonomy`);
    console.log(`Expected outcome: Reduce ${classificationUpdates.length} manual updates to ~${classificationUpdates.length - estimatedFixes}`);
    
  } catch (error) {
    console.error('Error testing classification updates:', error.message);
  }
}

testClassificationUpdates();