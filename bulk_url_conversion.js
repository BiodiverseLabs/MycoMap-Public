// Systematic URL conversion for all static.inaturalist.org URLs
// This converts URLs in bulk without requiring API calls
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './shared/schema.js';

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

async function bulkConvertUrls() {
  console.log('Starting systematic URL conversion...');
  
  try {
    // Convert all static.inaturalist.org URLs to working S3 URLs
    const result = await db.execute(`
      INSERT INTO inaturalist_data (
        observation_id,
        inat_id,
        photos,
        sync_status,
        last_synced_at
      )
      SELECT 
        o.observation_id,
        o.observation_id,
        ARRAY[REPLACE(
          REPLACE(o.image_link, 'static.inaturalist.org', 'inaturalist-open-data.s3.amazonaws.com'),
          '/large.',
          '/medium.'
        )],
        'url_converted',
        NOW()
      FROM observations o
      LEFT JOIN inaturalist_data inat ON o.observation_id = inat.observation_id
      WHERE o.source = 'iNaturalist'
        AND o.image_link LIKE 'https://static.inaturalist.org/photos/%'
        AND inat.observation_id IS NULL
      LIMIT 1000;
    `);
    
    console.log(`✓ Converted ${result.rowCount} URLs systematically`);
    
    // Show summary
    const summary = await db.execute(`
      SELECT 
        COUNT(*) FILTER (WHERE sync_status = 'url_converted') as converted_count,
        COUNT(*) FILTER (WHERE sync_status = 'synced') as api_synced_count,
        COUNT(*) as total_with_data
      FROM inaturalist_data;
    `);
    
    console.log('\nSystematic Conversion Summary:');
    console.log(`URL converted: ${summary.rows[0].converted_count}`);
    console.log(`API synced: ${summary.rows[0].api_synced_count}`);
    console.log(`Total with thumbnail data: ${summary.rows[0].total_with_data}`);
    
  } catch (error) {
    console.error('Conversion error:', error.message);
  }
}

bulkConvertUrls().then(() => {
  console.log('\nBulk URL conversion complete');
  process.exit(0);
});