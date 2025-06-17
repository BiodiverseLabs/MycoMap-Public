#!/usr/bin/env tsx

import { db } from './server/db.ts';

async function fixMissingKingdoms() {
  console.log('Identifying and fixing observations with missing Kingdom classification...\n');
  
  try {
    // Find observations that need kingdom classification
    const missingKingdomResult = await db.execute(`
      SELECT DISTINCT genus, COUNT(*) as observation_count
      FROM observations 
      WHERE (kingdom IS NULL OR kingdom = '') 
        AND genus IS NOT NULL 
        AND genus != ''
        AND genus NOT IN ('Unknown', 'unidentified', 'sp.', 'spp.')
      GROUP BY genus
      ORDER BY observation_count DESC
      LIMIT 20
    `);
    
    console.log(`Found ${missingKingdomResult.rows.length} genera needing kingdom classification:\n`);
    
    for (const row of missingKingdomResult.rows) {
      const genus = row.genus;
      const count = row.observation_count;
      
      console.log(`Processing genus "${genus}" (${count} observations)...`);
      
      // Check if we have cached classification for this genus
      const cacheResult = await db.execute(`
        SELECT kingdom, phylum, class, "order", family, genus as cached_genus
        FROM inaturalist_classification_cache 
        WHERE search_term = $1 AND kingdom IS NOT NULL AND kingdom != 'INVALID'
      `, [genus.toLowerCase()]);
      
      if (cacheResult.rows.length > 0) {
        const cached = cacheResult.rows[0];
        console.log(`  ✓ Found cached: ${cached.kingdom} → ${cached.family || 'N/A'}`);
        
        // Update observations with this genus
        const updateResult = await db.execute(`
          UPDATE observations 
          SET 
            kingdom = $1,
            phylum = $2,
            class = $3,
            "order" = $4,
            family = $5
          WHERE genus = $6 AND (kingdom IS NULL OR kingdom = '')
        `, [
          cached.kingdom,
          cached.phylum,
          cached.class,
          cached.order,
          cached.family,
          genus
        ]);
        
        console.log(`    → Updated ${count} observations\n`);
      } else {
        console.log(`  → No cached classification found\n`);
      }
    }
    
    // Check overall improvement
    const statsResult = await db.execute(`
      SELECT 
        COUNT(*) as total_observations,
        COUNT(CASE WHEN kingdom IS NOT NULL AND kingdom != '' THEN 1 END) as with_kingdom,
        ROUND(COUNT(CASE WHEN kingdom IS NOT NULL AND kingdom != '' THEN 1 END) * 100.0 / COUNT(*), 1) as kingdom_completion_percentage
      FROM observations
    `);
    
    const stats = statsResult.rows[0];
    console.log('=== Updated Kingdom Statistics ===');
    console.log(`Total observations: ${stats.total_observations}`);
    console.log(`With Kingdom: ${stats.with_kingdom}`);
    console.log(`Kingdom completion: ${stats.kingdom_completion_percentage}%`);
    
    // Show top kingdoms
    const kingdomResult = await db.execute(`
      SELECT kingdom, COUNT(*) as count
      FROM observations 
      WHERE kingdom IS NOT NULL AND kingdom != ''
      GROUP BY kingdom 
      ORDER BY count DESC
      LIMIT 5
    `);
    
    console.log('\nTop kingdoms:');
    for (const row of kingdomResult.rows) {
      console.log(`  ${row.kingdom}: ${row.count} observations`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

fixMissingKingdoms();