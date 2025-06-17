// Sync specific observations with iNaturalist API to get missing photo data
import { DatabaseStorage } from './server/db.js';

const storage = new DatabaseStorage();

async function syncMissingPhotos() {
  const observationIds = ['260409126', '260408798'];
  
  console.log('Starting sync for observations with missing photo data...\n');
  
  for (const observationId of observationIds) {
    try {
      console.log(`=== Syncing observation ${observationId} ===`);
      
      // Use existing sync method
      const result = await storage.syncObservationWithInaturalist(observationId);
      
      if (result) {
        console.log(`✓ Successfully synced ${observationId}`);
        console.log(`  Scientific name: ${result.scientificName || 'Unknown'}`);
        console.log(`  Photos: ${result.photos ? result.photos.length : 0}`);
        if (result.photos && result.photos.length > 0) {
          console.log(`  First photo: ${result.photos[0]}`);
        }
      } else {
        console.log(`✗ Failed to sync ${observationId}`);
      }
    } catch (error) {
      console.log(`✗ Error syncing ${observationId}:`, error.message);
    }
    
    console.log('');
  }
  
  // Check updated thumbnail status
  console.log('Checking updated thumbnail status...');
  for (const observationId of observationIds) {
    try {
      const result = await storage.db
        .select({
          observationId: storage.schema.observations.observationId,
          scientificName: storage.schema.observations.scientificName,
          originalImageLink: storage.schema.observations.imageLink,
          apiPhotos: storage.schema.inaturalistData.photos,
          thumbnailGenerated: storage.db.raw(`
            CASE 
              WHEN inat.photos IS NOT NULL AND array_length(inat.photos, 1) > 0 
              THEN inat.photos[1]
              WHEN o.image_link IS NOT NULL AND o.image_link != ''
              THEN CASE 
                WHEN o.image_link LIKE '%static.inaturalist.org%'
                THEN REPLACE(REPLACE(REPLACE(REPLACE(o.image_link, 'static.inaturalist.org', 'inaturalist-open-data.s3.amazonaws.com'), '/large.jpeg', '/medium.jpeg'), '/large.jpg', '/medium.jpeg'), '/medium.jpeg', '/medium.jpeg')
                WHEN o.image_link LIKE '%inaturalist-open-data.s3.amazonaws.com%'
                THEN REPLACE(REPLACE(REPLACE(o.image_link, '/large.jpeg', '/medium.jpeg'), '/large.jpg', '/medium.jpeg'), '/medium.jpeg', '/medium.jpeg')
                ELSE o.image_link
              END
              ELSE NULL 
            END
          `)
        })
        .from(storage.schema.observations.as('o'))
        .leftJoin(storage.schema.inaturalistData.as('inat'), storage.db.eq(storage.schema.observations.observationId, storage.schema.inaturalistData.observationId))
        .where(storage.db.eq(storage.schema.observations.observationId, observationId));
        
      if (result.length > 0) {
        const record = result[0];
        console.log(`${observationId}: ${record.thumbnailGenerated ? 'Has thumbnail' : 'No thumbnail'}`);
      }
    } catch (error) {
      console.log(`Error checking ${observationId}:`, error.message);
    }
  }
  
  console.log('\nSync completed!');
  process.exit(0);
}

syncMissingPhotos().catch(console.error);