// Quick sync for specific broken thumbnail record
import fetch from 'node-fetch';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './shared/schema.js';

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

async function syncRecord(observationId) {
  try {
    console.log(`Syncing observation ${observationId}...`);
    
    const response = await fetch(`https://api.inaturalist.org/v1/observations/${observationId}`);
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const obs = data.results[0];
      console.log(`Found observation: ${obs.taxon?.name || 'Unknown'}`);
      
      const photos = obs.photos ? obs.photos.map(p => p.url.replace('square', 'medium')) : [];
      console.log(`Photos found: ${photos.length}`);
      
      if (photos.length > 0) {
        await db.insert(schema.inaturalistData).values({
          observationId: observationId,
          inatId: obs.id.toString(),
          photos: photos,
          quality: obs.quality_grade,
          syncStatus: 'synced',
          lastSyncedAt: new Date()
        }).onConflictDoUpdate({
          target: schema.inaturalistData.observationId,
          set: {
            photos: photos,
            quality: obs.quality_grade,
            syncStatus: 'synced',
            lastSyncedAt: new Date()
          }
        });
        
        console.log(`✓ Successfully synced ${observationId} with ${photos.length} photos`);
        console.log(`First photo: ${photos[0]}`);
        return true;
      } else {
        console.log(`No photos found for ${observationId}`);
        return false;
      }
    } else {
      console.log(`No results found for ${observationId}`);
      return false;
    }
  } catch (error) {
    console.log(`Error syncing ${observationId}: ${error.message}`);
    return false;
  }
}

// Sync the specific broken record
syncRecord('260030810').then(() => {
  console.log('Sync complete');
  process.exit(0);
});