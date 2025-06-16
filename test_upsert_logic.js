const { DatabaseStorage } = require('./server/db.js');

async function testUpsertLogic() {
  console.log('Testing upsert logic with composite key (source + observation_id)...');
  
  const db = new DatabaseStorage();
  
  // Test data: same observation ID but different sources
  const testObservations = [
    {
      observationId: 'TEST_001',
      source: 'iNaturalist',
      scientificName: 'Agaricus bisporus',
      commonName: 'Button Mushroom',
      genus: 'Agaricus',
      species: 'bisporus',
      observer: 'Test Observer 1',
      collector: 'Test Collector 1',
    },
    {
      observationId: 'TEST_001', // Same ID, different source - should be allowed
      source: 'Mushroom Observer',
      scientificName: 'Agaricus bisporus',
      commonName: 'Common Mushroom',
      genus: 'Agaricus',
      species: 'bisporus',
      observer: 'Test Observer 2',
      collector: 'Test Collector 2',
    },
    {
      observationId: 'TEST_001', // Same ID + source - should update existing
      source: 'iNaturalist',
      scientificName: 'Agaricus bisporus',
      commonName: 'Updated Button Mushroom',
      genus: 'Agaricus',
      species: 'bisporus',
      observer: 'Updated Observer',
      collector: 'Updated Collector',
    }
  ];
  
  try {
    console.log('Inserting first observation (iNaturalist, TEST_001)...');
    await db.createObservations([testObservations[0]]);
    console.log('✓ First observation inserted successfully');
    
    console.log('Inserting second observation (Mushroom Observer, TEST_001)...');
    await db.createObservations([testObservations[1]]);
    console.log('✓ Second observation inserted successfully (different source, same ID)');
    
    console.log('Updating first observation (iNaturalist, TEST_001)...');
    await db.createObservations([testObservations[2]]);
    console.log('✓ First observation updated successfully (same source + ID)');
    
    // Verify the results
    const inatObs = await db.db.select().from(db.db.query.observations).where(
      db.sql`source = 'iNaturalist' AND observation_id = 'TEST_001'`
    );
    
    const moObs = await db.db.select().from(db.db.query.observations).where(
      db.sql`source = 'Mushroom Observer' AND observation_id = 'TEST_001'`
    );
    
    console.log('\nResults:');
    console.log(`iNaturalist record: ${inatObs.length} found, common_name = "${inatObs[0]?.commonName}"`);
    console.log(`Mushroom Observer record: ${moObs.length} found, common_name = "${moObs[0]?.commonName}"`);
    
    if (inatObs[0]?.commonName === 'Updated Button Mushroom' && 
        moObs[0]?.commonName === 'Common Mushroom') {
      console.log('✓ Upsert logic working correctly!');
    } else {
      console.log('✗ Upsert logic not working as expected');
    }
    
  } catch (error) {
    console.error('Error testing upsert logic:', error);
  }
}

testUpsertLogic();