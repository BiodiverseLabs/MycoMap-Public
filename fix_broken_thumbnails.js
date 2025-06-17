// Systematically fix broken thumbnails by testing URLs and syncing only failed ones
import fetch from 'node-fetch';

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

// Simple API sync function
async function syncWithInaturalist(observationId) {
  try {
    const response = await fetch(`https://api.inaturalist.org/v1/observations/${observationId}`);
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const obs = data.results[0];
      const photos = obs.photos ? obs.photos.map(p => p.url.replace('square', 'medium')) : [];
      
      if (photos.length > 0) {
        // Insert/update iNaturalist data
        await db.insert(schema.inaturalistData).values({
          observationId: observationId,
          inatId: obs.id.toString(),
          scientificName: obs.taxon?.name || null,
          photos: photos,
          quality: obs.quality_grade,
          syncStatus: 'synced',
          lastSyncedAt: new Date()
        }).onConflictDoUpdate({
          target: schema.inaturalistData.observationId,
          set: {
            photos: photos,
            scientificName: obs.taxon?.name || null,
            quality: obs.quality_grade,
            syncStatus: 'synced',
            lastSyncedAt: new Date()
          }
        });
        
        return { photos, scientificName: obs.taxon?.name };
      }
    }
    return null;
  } catch (error) {
    console.log(`API error for ${observationId}: ${error.message}`);
    return null;
  }
}

async function testUrlAccessibility(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

async function fixBrokenThumbnails() {
  console.log('🔍 Identifying records with broken thumbnail URLs...\n');
  
  // Get records that need testing
  const recordsToTest = await storage.db
    .select({
      observationId: storage.schema.observations.observationId,
      scientificName: storage.schema.observations.scientificName,
      originalUrl: storage.schema.observations.imageLink,
      convertedUrl: storage.db.raw(`
        REPLACE(REPLACE(REPLACE(REPLACE(o.image_link, 'static.inaturalist.org', 'inaturalist-open-data.s3.amazonaws.com'), '/large.jpeg', '/medium.jpeg'), '/large.jpg', '/medium.jpeg'), '/medium.jpeg', '/medium.jpeg')
      `)
    })
    .from(storage.schema.observations.as('o'))
    .leftJoin(storage.schema.inaturalistData.as('inat'), storage.db.eq(storage.schema.observations.observationId, storage.schema.inaturalistData.observationId))
    .where(storage.db.and(
      storage.db.eq(storage.schema.observations.source, 'iNaturalist'),
      storage.db.isNull(storage.schema.inaturalistData.observationId),
      storage.db.like(storage.schema.observations.imageLink, '%static.inaturalist.org%')
    ))
    .limit(20); // Small demo batch to test the approach

  console.log(`📊 Testing ${recordsToTest.length} records for URL accessibility...`);
  
  const brokenRecords = [];
  let tested = 0;
  
  for (const record of recordsToTest) {
    tested++;
    console.log(`Testing ${tested}/${recordsToTest.length}: ${record.observationId}`);
    
    const isAccessible = await testUrlAccessibility(record.convertedUrl);
    
    if (!isAccessible) {
      brokenRecords.push(record);
      console.log(`  ❌ URL broken: ${record.scientificName}`);
    } else {
      console.log(`  ✅ URL working: ${record.scientificName}`);
    }
    
    // Rate limit: 1 request per second
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n📋 Summary:`);
  console.log(`  Total tested: ${recordsToTest.length}`);
  console.log(`  Working URLs: ${recordsToTest.length - brokenRecords.length}`);
  console.log(`  Broken URLs needing API sync: ${brokenRecords.length}`);
  
  if (brokenRecords.length === 0) {
    console.log('\n🎉 No broken thumbnails found in this batch!');
    return;
  }
  
  console.log(`\n🔧 Syncing ${brokenRecords.length} records with iNaturalist API...`);
  
  let synced = 0;
  let syncErrors = 0;
  
  for (const record of brokenRecords) {
    try {
      console.log(`Syncing ${synced + 1}/${brokenRecords.length}: ${record.observationId}`);
      
      const result = await storage.syncObservationWithInaturalist(record.observationId);
      
      if (result && result.photos && result.photos.length > 0) {
        synced++;
        console.log(`  ✅ Synced ${result.photos.length} photos`);
      } else {
        console.log(`  ⚠️ No photos available in API`);
      }
    } catch (error) {
      syncErrors++;
      console.log(`  ❌ Sync failed: ${error.message}`);
    }
    
    // Rate limit: 1 API call per 1.1 seconds
    await new Promise(resolve => setTimeout(resolve, 1100));
  }
  
  console.log(`\n✨ Complete!`);
  console.log(`  Successfully synced: ${synced}`);
  console.log(`  Sync errors: ${syncErrors}`);
  console.log(`  Records now have authentic photos: ${synced}`);
  
  process.exit(0);
}

fixBrokenThumbnails().catch(console.error);