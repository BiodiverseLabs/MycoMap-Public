import { DatabaseStorage } from './server/db.js';

async function testUploadClassificationFix() {
  console.log('=== Testing Upload 60 Classification Fix ===\n');
  
  const storage = new DatabaseStorage();
  
  // Test getObservationsFromUpload with the fix
  console.log('1. Testing getObservationsFromUpload for upload 60:');
  const uploadObservations = await storage.getObservationsFromUpload(60);
  console.log(`   Found ${uploadObservations.length} total observations from upload 60`);
  
  // Filter for classification updates
  const needingClassification = uploadObservations.filter(obs => obs.classificationUpdate === true);
  console.log(`   Found ${needingClassification.length} records needing classification updates`);
  
  // Find Inocybe PNW59 specifically
  const inocybePNW59 = needingClassification.find(obs => 
    obs.scientificName?.includes('Inocybe PNW59') || 
    obs.species?.includes('Inocybe PNW59')
  );
  
  if (inocybePNW59) {
    console.log(`   ✓ Found Inocybe PNW59: ID ${inocybePNW59.id}, genus: "${inocybePNW59.genus}"`);
    
    // Test classification lookup for Inocybe
    console.log('\n2. Testing Inocybe classification lookup:');
    const inocebyClassification = await storage.lookupGenusClassificationWithCache('Inocybe');
    
    if (inocebyClassification) {
      console.log(`   ✓ Inocybe classification found: ${inocebyClassification.phylum} > ${inocebyClassification.class} > ${inocebyClassification.order} > ${inocebyClassification.family}`);
    } else {
      console.log('   ✗ Inocybe classification not found');
    }
  } else {
    console.log('   ⚠ Inocybe PNW59 not found in upload records needing classification');
  }
  
  // Show sample records needing classification
  if (needingClassification.length > 0) {
    console.log('\n3. Sample records needing classification:');
    needingClassification.slice(0, 5).forEach(obs => {
      console.log(`   - ${obs.scientificName || obs.species} (genus: "${obs.genus || 'null'}")`);
    });
  }
  
  console.log('\n=== Test Complete ===');
  process.exit(0);
}

testUploadClassificationFix().catch(console.error);