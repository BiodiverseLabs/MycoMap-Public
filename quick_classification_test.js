import fetch from 'node-fetch';

async function quickClassificationTest() {
  try {
    console.log('=== QUICK CLASSIFICATION UPDATE TEST ===');
    
    // Get sample of classification updates (first 10)
    const updatesResponse = await fetch('http://localhost:5000/api/observations/classification-updates');
    const allUpdates = await updatesResponse.json();
    const sampleUpdates = allUpdates.slice(0, 10);
    
    console.log(`Total classification updates needed: ${allUpdates.length}`);
    console.log(`Testing on sample of ${sampleUpdates.length} records:`);
    
    // Get complete records for reference (limit to first 5000 for speed)
    const obsResponse = await fetch('http://localhost:5000/api/observations');
    const allObs = await obsResponse.json();
    const completeObs = allObs.filter(obs => 
      obs.genus && obs.kingdom && obs.phylum && obs.class && obs.order && obs.family
    ).slice(0, 5000); // Use first 5000 complete records for speed
    
    // Build genus lookup
    const genusLookup = new Map();
    completeObs.forEach(obs => {
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
    console.log('');
    
    // Test each sample record
    let matches = 0;
    sampleUpdates.forEach((record, i) => {
      let genusCandidate = null;
      
      if (record.species) {
        genusCandidate = record.species.split(' ')[0].toLowerCase().trim();
      } else if (record.infraspecies) {
        genusCandidate = record.infraspecies.split(' ')[0].toLowerCase().trim();
      }
      
      if (genusCandidate && genusLookup.has(genusCandidate)) {
        const ref = genusLookup.get(genusCandidate);
        console.log(`✓ ${i+1}. Record ${record.id}: "${genusCandidate}" → ${ref.family} family`);
        matches++;
      } else if (genusCandidate) {
        console.log(`✗ ${i+1}. Record ${record.id}: "${genusCandidate}" (no match)`);
      } else {
        console.log(`? ${i+1}. Record ${record.id}: No species name available`);
      }
    });
    
    const successRate = (matches / sampleUpdates.length * 100).toFixed(1);
    const estimatedFixes = Math.round((matches / sampleUpdates.length) * allUpdates.length);
    
    console.log('');
    console.log(`RESULTS: ${matches}/${sampleUpdates.length} successful matches (${successRate}%)`);
    console.log(`ESTIMATED: ~${estimatedFixes} out of ${allUpdates.length} records can be auto-fixed`);
    console.log(`MANUAL WORK REDUCTION: ~${successRate}%`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

quickClassificationTest();