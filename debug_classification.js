#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function debugClassification() {
  console.log('Debugging classification process...\n');
  
  try {
    // Test database connection
    console.log('1. Testing database connection...');
    const dbTest = await pool.query('SELECT NOW() as current_time');
    console.log(`   ✓ Database connected: ${dbTest.rows[0].current_time}`);
    
    // Check current progress
    console.log('\n2. Checking current progress...');
    const progress = await pool.query(`
      SELECT 
        COUNT(CASE WHEN updated_at IS NOT NULL THEN 1 END) as processed,
        COUNT(CASE WHEN kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as successful,
        (SELECT genus FROM inaturalist_classification_cache WHERE updated_at IS NOT NULL ORDER BY updated_at DESC LIMIT 1) as latest
      FROM inaturalist_classification_cache
    `);
    console.log(`   Processed: ${progress.rows[0].processed}/1087`);
    console.log(`   Successful: ${progress.rows[0].successful}`);
    console.log(`   Latest: ${progress.rows[0].latest}`);
    
    // Get next genus to process
    console.log('\n3. Finding next genus to process...');
    const nextGenus = await pool.query(`
      SELECT DISTINCT o.genus
      FROM observations o
      WHERE o.genus IS NOT NULL 
        AND o.genus != ''
        AND o.genus NOT LIKE '%http%'
        AND o.genus NOT LIKE '%aceae'
        AND o.genus NOT LIKE '%ales'
        AND o.genus NOT LIKE '%mycota'
        AND o.genus NOT LIKE '%ineae'
        AND o.genus NOT LIKE '% %'
        AND LENGTH(o.genus) >= 3
        AND o.genus != 'fungi'
        AND o.genus NOT IN (
          SELECT genus FROM inaturalist_classification_cache 
          WHERE updated_at IS NOT NULL
        )
      ORDER BY o.genus ASC
      LIMIT 3
    `);
    
    if (nextGenus.rows.length > 0) {
      console.log(`   Next to process: ${nextGenus.rows.map(r => r.genus).join(', ')}`);
    } else {
      console.log('   No more genera to process!');
    }
    
    // Test API connectivity
    console.log('\n4. Testing iNaturalist API...');
    try {
      const testGenus = nextGenus.rows[0]?.genus || 'Agaricus';
      const apiUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(testGenus)}&rank=genus&per_page=1`;
      console.log(`   Testing with: ${testGenus}`);
      
      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✓ API response: ${data.results?.length || 0} results`);
      } else {
        console.log(`   ✗ API error: ${response.status} ${response.statusText}`);
      }
    } catch (apiError) {
      console.log(`   ✗ API connection failed: ${apiError.message}`);
    }
    
    // Check memory and resource usage
    console.log('\n5. Checking system resources...');
    const memUsage = process.memoryUsage();
    console.log(`   Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB used`);
    console.log(`   Process uptime: ${Math.round(process.uptime())}s`);
    
  } catch (error) {
    console.error(`Debug error: ${error.message}`);
  } finally {
    await pool.end();
  }
}

debugClassification().catch(console.error);