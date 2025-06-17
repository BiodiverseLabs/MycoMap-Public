#!/usr/bin/env tsx

import { db } from './server/db.ts';

async function applyCachedClassifications() {
  console.log('Applying cached classifications to observations...\n');
  
  try {
    // Find observations that can benefit from cached classifications
    const applicableResult = await db.execute(`
      SELECT 
        o.genus,
        COUNT(*) as observation_count,
        c.kingdom,
        c.phylum,
        c.class,
        c."order",
        c.family,
        c.taxon_rank
      FROM observations o
      JOIN inaturalist_classification_cache c ON LOWER(o.genus) = c.search_term
      WHERE (o.kingdom IS NULL OR o.kingdom = '')
        AND c.kingdom IS NOT NULL 
        AND c.kingdom != 'INVALID'
        AND o.genus IS NOT NULL
        AND o.genus != ''
      GROUP BY o.genus, c.kingdom, c.phylum, c.class, c."order", c.family, c.taxon_rank
      ORDER BY observation_count DESC
      LIMIT 15
    `);
    
    console.log(`Found ${applicableResult.rows.length} genera with cached classifications to apply:\n`);
    
    let totalUpdated = 0;
    
    for (const row of applicableResult.rows) {
      const genus = row.genus;
      const count = row.observation_count;
      
      console.log(`Updating ${count} observations for genus "${genus}" (${row.taxon_rank})...`);
      console.log(`  Classification: ${row.kingdom} → ${row.family || 'N/A'}`);
      
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
        row.kingdom,
        row.phylum,
        row.class,
        row.order,
        row.family,
        genus
      ]);
      
      console.log(`  ✓ Updated ${count} observations\n`);
      totalUpdated += parseInt(count);
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
    console.log('=== Classification Application Results ===');
    console.log(`Total observations updated: ${totalUpdated}`);
    console.log(`Total observations: ${stats.total_observations}`);
    console.log(`With Kingdom: ${stats.with_kingdom}`);
    console.log(`Kingdom completion: ${stats.kingdom_completion_percentage}%`);
    
    // Show breakdown by kingdom
    const kingdomResult = await db.execute(`
      SELECT kingdom, COUNT(*) as count
      FROM observations 
      WHERE kingdom IS NOT NULL AND kingdom != ''
      GROUP BY kingdom 
      ORDER BY count DESC
      LIMIT 5
    `);
    
    console.log('\nKingdom distribution:');
    for (const row of kingdomResult.rows) {
      console.log(`  ${row.kingdom}: ${row.count} observations`);
    }
    
    // Show remaining work
    const remainingResult = await db.execute(`
      SELECT COUNT(*) as remaining_missing_kingdom
      FROM observations 
      WHERE (kingdom IS NULL OR kingdom = '') AND genus IS NOT NULL AND genus != ''
    `);
    
    console.log(`\nRemaining observations needing Kingdom: ${remainingResult.rows[0].remaining_missing_kingdom}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

applyCachedClassifications();