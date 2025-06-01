import fetch from 'node-fetch';

async function testClassificationUpdates() {
  try {
    console.log('Testing automated classification updates...');
    
    // Get current classification updates count
    console.log('Fetching current classification updates...');
    const response = await fetch('http://localhost:5000/api/observations/classification-updates');
    const updates = await response.json();
    
    console.log(`Found ${updates.length} records needing classification updates`);
    
    if (updates.length > 0) {
      // Show sample records that need updates
      console.log('\nSample records needing classification:');
      updates.slice(0, 5).forEach(record => {
        console.log(`ID ${record.id}: Species="${record.species}", Variety="${record.infraspecies}", Missing: ${!record.kingdom ? 'Kingdom' : ''} ${!record.phylum ? 'Phylum' : ''} ${!record.class ? 'Class' : ''} ${!record.order ? 'Order' : ''} ${!record.family ? 'Family' : ''} ${!record.genus ? 'Genus' : ''}`);
      });
      
      // Test genus extraction logic
      console.log('\nTesting genus extraction from first 10 records:');
      updates.slice(0, 10).forEach(record => {
        let genusCandidate = null;
        
        if (record.species) {
          genusCandidate = record.species.split(' ')[0];
        } else if (record.infraspecies) {
          genusCandidate = record.infraspecies.split(' ')[0];
        }
        
        if (genusCandidate) {
          console.log(`Record ${record.id}: Extracted genus candidate "${genusCandidate}" from ${record.species ? 'species' : 'variety'}: "${record.species || record.infraspecies}"`);
        }
      });
    }
    
    // Check how many records have complete taxonomy that could serve as reference
    console.log('\nFetching all observations to check reference data...');
    const allResponse = await fetch('http://localhost:5000/api/observations');
    const allObservations = await allResponse.json();
    
    const completeRecords = allObservations.filter(obs => 
      obs.genus && obs.kingdom && obs.phylum && obs.class && obs.order && obs.family
    );
    
    console.log(`Found ${completeRecords.length} records with complete taxonomy (out of ${allObservations.length} total)`);
    
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
    
    console.log(`Built genus lookup table with ${genusLookup.size} unique genera`);
    
    // Test potential matches
    let potentialMatches = 0;
    if (updates.length > 0) {
      console.log('\nTesting potential matches for first 20 classification updates:');
      updates.slice(0, 20).forEach(record => {
        let genusCandidate = null;
        
        if (record.species) {
          genusCandidate = record.species.split(' ')[0].toLowerCase().trim();
        } else if (record.infraspecies) {
          genusCandidate = record.infraspecies.split(' ')[0].toLowerCase().trim();
        }
        
        if (genusCandidate && genusLookup.has(genusCandidate)) {
          const taxonomyRef = genusLookup.get(genusCandidate);
          console.log(`✓ MATCH found for record ${record.id}: "${genusCandidate}" -> ${taxonomyRef.family} family`);
          potentialMatches++;
        } else if (genusCandidate) {
          console.log(`✗ No match for record ${record.id}: "${genusCandidate}"`);
        }
      });
      
      console.log(`\nPotential matches in sample: ${potentialMatches}/20`);
      console.log(`Estimated total matches: ~${Math.round((potentialMatches/20) * updates.length)}`);
    }
    
  } catch (error) {
    console.error('Error testing classification updates:', error);
  }
}

testClassificationUpdates();