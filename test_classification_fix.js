import { storage } from './server/db.js';

async function testClassificationFix() {
  try {
    console.log('Testing classification fix logic...');
    
    // Get all observations to build reference lookup
    const allObservations = await storage.getAllObservations();
    console.log(`Total observations: ${allObservations.length}`);
    
    // Build genus lookup (case-insensitive)
    const genusLookup = new Map();
    let referenceCount = 0;
    
    allObservations.forEach(obs => {
      if (obs.genus && obs.kingdom && obs.phylum && obs.class && 
          obs.order && obs.family) {
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
          referenceCount++;
        }
      }
    });
    
    console.log(`Built genus lookup with ${genusLookup.size} unique genera`);
    console.log(`Reference records: ${referenceCount}`);
    
    // Test specific genera
    const testGenera = ['boletus', 'cantharellus', 'amanita'];
    testGenera.forEach(genus => {
      if (genusLookup.has(genus)) {
        const ref = genusLookup.get(genus);
        console.log(`✓ ${genus}: ${ref.phylum} > ${ref.class} > ${ref.order} > ${ref.family}`);
      } else {
        console.log(`✗ ${genus}: No reference found`);
      }
    });
    
    // Test on actual records needing classification
    const needsClassification = await storage.getObservationsWithClassificationUpdates();
    console.log(`Records needing classification: ${needsClassification.length}`);
    
    // Check first 10 records
    const testRecords = needsClassification.slice(0, 10);
    let fixableCount = 0;
    
    testRecords.forEach(record => {
      let genusCandidate = null;
      
      if (record.species) {
        genusCandidate = record.species.split(' ')[0].toLowerCase().trim();
      } else if (record.infraspecies) {
        genusCandidate = record.infraspecies.split(' ')[0].toLowerCase().trim();
      }
      
      if (genusCandidate && genusLookup.has(genusCandidate)) {
        fixableCount++;
        console.log(`✓ Record ${record.id}: "${record.species}" → genus "${genusCandidate}" (fixable)`);
      } else {
        console.log(`⚠ Record ${record.id}: "${record.species}" → genus "${genusCandidate}" (no reference)`);
      }
    });
    
    console.log(`\nSummary: ${fixableCount}/${testRecords.length} test records can be auto-fixed`);
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

testClassificationFix();