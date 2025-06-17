// Test iNaturalist API for specific observations
import fetch from 'node-fetch';

async function testInaturalistAPI(observationIds) {
  for (const id of observationIds) {
    try {
      console.log(`\n=== Testing observation ${id} ===`);
      
      const response = await fetch(`https://api.inaturalist.org/v1/observations/${id}`);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const obs = data.results[0];
        console.log(`Scientific name: ${obs.taxon?.name || 'Unknown'}`);
        console.log(`Quality grade: ${obs.quality_grade}`);
        console.log(`Photos count: ${obs.photos?.length || 0}`);
        
        if (obs.photos && obs.photos.length > 0) {
          console.log('Photo URLs:');
          obs.photos.forEach((photo, index) => {
            console.log(`  Photo ${index + 1}:`);
            console.log(`    Medium: ${photo.url.replace('square', 'medium')}`);
            console.log(`    Large: ${photo.url.replace('square', 'large')}`);
            console.log(`    Original: ${photo.url.replace('square', 'original')}`);
          });
        } else {
          console.log('No photos available in API response');
        }
      } else {
        console.log('No observation found or API returned empty results');
      }
    } catch (error) {
      console.log(`Error fetching observation ${id}:`, error.message);
    }
  }
}

// Test the specific observations that are missing thumbnails
testInaturalistAPI(['260409126', '260408798']).then(() => {
  console.log('\nAPI test completed');
}).catch(console.error);