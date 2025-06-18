/**
 * Complete iNaturalist API Sync - Ad-hoc Script
 * Processes remaining iNaturalist API calls from the 61K upload
 */

import pg from 'pg';
const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

let processed = 0;
let successful = 0;
let failed = 0;

async function fetchInatAPI(inatId) {
  try {
    const response = await fetch(`https://api.inaturalist.org/v1/observations/${inatId}`, {
      headers: {
        'User-Agent': 'MycoMap/1.0 (mycomap@example.com)'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'not_found' };
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return { success: true, data: data.results[0] || null };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function updateInatRecord(observationId, apiData, error = null) {
  const client = await pool.connect();
  try {
    let updateQuery = `
      UPDATE inaturalist_data 
      SET last_synced_at = NOW(),
          sync_status = $2,
          sync_error = $3
    `;
    let params = [observationId, error ? 'failed' : 'success', error];
    let paramIndex = 4;
    
    if (apiData && !error) {
      // Add API data fields to update
      const fields = [];
      
      if (apiData.uuid) {
        fields.push(`inat_uuid = $${paramIndex++}`);
        params.push(apiData.uuid);
      }
      
      if (apiData.quality_grade) {
        fields.push(`quality = $${paramIndex++}`);
        params.push(apiData.quality_grade);
      }
      
      if (apiData.photos) {
        fields.push(`photos = $${paramIndex++}`);
        params.push(JSON.stringify(apiData.photos));
      }
      
      if (apiData.taxon) {
        fields.push(`taxon = $${paramIndex++}`);
        params.push(JSON.stringify(apiData.taxon));
      }
      
      if (apiData.user) {
        fields.push(`"user" = $${paramIndex++}`);
        params.push(JSON.stringify(apiData.user));
      }
      
      if (apiData.place_ids) {
        fields.push(`place_ids = $${paramIndex++}`);
        params.push(apiData.place_ids);
      }
      
      if (fields.length > 0) {
        updateQuery += ', ' + fields.join(', ');
      }
    }
    
    updateQuery += ' WHERE observation_id = $1';
    
    await client.query(updateQuery, params);
    
    // Update observation location if missing and available
    if (apiData && apiData.location && !error) {
      const [lat, lng] = apiData.location.split(',').map(parseFloat);
      if (!isNaN(lat) && !isNaN(lng)) {
        await client.query(`
          UPDATE observations 
          SET latitude = COALESCE(latitude, $2),
              longitude = COALESCE(longitude, $3)
          WHERE observation_id = $1
        `, [observationId, lat, lng]);
      }
    }
    
  } finally {
    client.release();
  }
}

async function getPendingRecords(limit = 100) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT observation_id, inat_id 
      FROM inaturalist_data 
      WHERE sync_status IS NULL 
      AND last_synced_at IS NULL
      LIMIT $1
    `, [limit]);
    
    return result.rows;
  } finally {
    client.release();
  }
}

async function createMissingInatDataRecords() {
  const client = await pool.connect();
  try {
    console.log('Creating missing iNaturalist data records...');
    
    const result = await client.query(`
      INSERT INTO inaturalist_data (observation_id, inat_id)
      SELECT 
        observation_id,
        CASE 
          WHEN source_id ~ '^[0-9]+$' THEN source_id
          ELSE NULL
        END as inat_id
      FROM observations 
      WHERE source = 'iNaturalist' 
      AND observation_id NOT IN (SELECT observation_id FROM inaturalist_data)
      AND source_id IS NOT NULL
      AND source_id ~ '^[0-9]+$'
    `);
    
    console.log(`Created ${result.rowCount} missing iNaturalist data records`);
    return result.rowCount;
  } finally {
    client.release();
  }
}

async function getTotalPending() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT COUNT(*) as count
      FROM inaturalist_data 
      WHERE sync_status IS NULL 
      AND last_synced_at IS NULL
      AND inat_id IS NOT NULL
    `);
    
    return parseInt(result.rows[0].count);
  } finally {
    client.release();
  }
}

async function completeInatApiSync() {
  console.log('Starting iNaturalist API sync...');
  
  const totalPending = await getTotalPending();
  console.log(`Total pending records: ${totalPending.toLocaleString()}`);
  
  if (totalPending === 0) {
    console.log('No pending records found!');
    return;
  }
  
  let batchNum = 0;
  let records = await getPendingRecords(100);
  
  while (records.length > 0) {
    batchNum++;
    console.log(`\nProcessing batch ${batchNum} (${records.length} records)`);
    console.log(`Progress: ${processed}/${totalPending} (${((processed/totalPending)*100).toFixed(1)}%)`);
    
    for (const record of records) {
      const { observation_id, inat_id } = record;
      
      console.log(`  Syncing ${observation_id} (iNat ${inat_id})`);
      
      const result = await fetchInatAPI(inat_id);
      
      if (result.success) {
        await updateInatRecord(observation_id, result.data);
        successful++;
        console.log(`  ✓ Success`);
      } else {
        await updateInatRecord(observation_id, null, result.error);
        failed++;
        console.log(`  ✗ Failed: ${result.error}`);
      }
      
      processed++;
      
      // Small delay to be respectful to API
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`Batch ${batchNum} complete. Success: ${successful}, Failed: ${failed}`);
    
    // Get next batch
    records = await getPendingRecords(100);
    
    // Longer delay between batches
    if (records.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n=== iNaturalist API Sync Complete ===');
  console.log(`Total processed: ${processed}`);
  console.log(`Successful: ${successful} (${((successful/processed)*100).toFixed(1)}%)`);
  console.log(`Failed: ${failed} (${((failed/processed)*100).toFixed(1)}%)`);
}

// Run the sync
completeInatApiSync()
  .then(() => {
    console.log('Sync completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Sync failed:', error);
    process.exit(1);
  });