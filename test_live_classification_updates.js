import fetch from 'node-fetch';

async function testLiveClassificationUpdates() {
  try {
    console.log('=== TESTING AUTOMATED CLASSIFICATION UPDATES ON LIVE DATA ===');
    
    // Get current classification updates
    const response = await fetch('http://localhost:5000/api/observations/classification-updates');
    const classificationUpdates = await response.json();
    console.log(`Found ${classificationUpdates.length} records needing classification updates`);
    
    if (classificationUpdates.length === 0) {
      console.log('No classification updates needed');
      return;
    }
    
    // Get all observations for reference
    console.log('Building genus lookup table...');
    const allResponse = await fetch('http://localhost:5000/api/observations');
    const allObservations = await allResponse.json();
    
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
    
    console.log(`Built genus lookup with ${genusLookup.size} reference entries`);
    
    // Show sample matches
    console.log('\nSample potential matches:');
    let matchCount = 0;
    classificationUpdates.slice(0, 10).forEach(record => {
      let genusCandidate = null;
      if (record.species) {
        genusCandidate = record.species.split(' ')[0].toLowerCase().trim();
      } else if (record.infraspecies) {
        genusCandidate = record.infraspecies.split(' ')[0].toLowerCase().trim();
      }
      
      if (genusCandidate) {
        if (genusLookup.has(genusCandidate)) {
          const taxonomyRef = genusLookup.get(genusCandidate);
          console.log(`✓ Record ${record.id}: "${genusCandidate}" -> ${taxonomyRef.family} family`);
          matchCount++;
        } else {
          console.log(`✗ Record ${record.id}: "${genusCandidate}" (no match found)`);
        }
      }
    });
    
    const estimatedMatches = Math.round((matchCount / 10) * classificationUpdates.length);
    console.log(`\nEstimated matches: ~${estimatedMatches}/${classificationUpdates.length} (${(estimatedMatches/classificationUpdates.length*100).toFixed(1)}%)`);
    
    console.log('\n=== SUMMARY ===');
    console.log(`Current dataset: ${allObservations.length} total observations`);
    console.log(`Reference genera available: ${genusLookup.size}`);
    console.log(`Classification updates needed: ${classificationUpdates.length}`);
    console.log(`Expected automatic fixes: ~${estimatedMatches}`);
    
    // Note about the automated process
    console.log('\n=== AUTOMATED CLASSIFICATION UPDATE PROCESS ===');
    console.log('This process would run automatically at the end of each upload:');
    console.log('1. Extract first word from Species/Variety names');
    console.log('2. Match against existing complete taxonomy records');
    console.log('3. Auto-populate missing Kingdom, Phylum, Class, Order, Family, Genus');
    console.log('4. Remove classification update flags');
    console.log('\nThe system is ready to automatically reduce manual classification work.');
    
  } catch (error) {
    console.error('Error testing classification updates:', error);
  }
}

testLiveClassificationUpdates();