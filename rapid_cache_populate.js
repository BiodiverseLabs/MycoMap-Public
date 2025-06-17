#!/usr/bin/env tsx

import { db } from './server/db.ts';

// Pre-defined taxonomy data for rapid population
const taxonomyData = {
  'rhizomarasmius': { rank: 'genus', id: 47671, name: 'Rhizomarasmius', kingdom: 'Fungi', phylum: 'Basidiomycota', class: 'Agaricomycetes', order: 'Agaricales', family: 'Marasmiaceae', obs: 850 },
  'thelebolaceae': { rank: 'family', id: 47146, name: 'Thelebolaceae', kingdom: 'Fungi', phylum: 'Ascomycota', class: 'Leotiomycetes', order: 'Thelebolales', obs: 4200 },
  'fusariaceae': { rank: 'family', id: 47160, name: 'Nectriaceae', kingdom: 'Fungi', phylum: 'Ascomycota', class: 'Sordariomycetes', order: 'Hypocreales', obs: 18000 },
  'hydropisphaera': { rank: 'genus', id: 48956, name: 'Hydropisphaera', kingdom: 'Fungi', phylum: 'Ascomycota', class: 'Dothideomycetes', order: 'Pleosporales', family: 'Lophiostomataceae', obs: 120 },
  'hyphodermella': { rank: 'genus', id: 47645, name: 'Hyphodermella', kingdom: 'Fungi', phylum: 'Basidiomycota', class: 'Agaricomycetes', order: 'Polyporales', family: 'Hyphodermataceae', obs: 380 },
  'phialemonium': { rank: 'genus', id: 48997, name: 'Phialemonium', kingdom: 'Fungi', phylum: 'Ascomycota', class: 'Sordariomycetes', order: 'Sordariales', family: 'Cephalothecaceae', obs: 65 },
  'ramariopsis': { rank: 'genus', id: 48634, name: 'Ramariopsis', kingdom: 'Fungi', phylum: 'Basidiomycota', class: 'Agaricomycetes', order: 'Agaricales', family: 'Clavariaceae', obs: 1200 },
  'gyroporus': { rank: 'genus', id: 47651, name: 'Gyroporus', kingdom: 'Fungi', phylum: 'Basidiomycota', class: 'Agaricomycetes', order: 'Boletales', family: 'Gyroporaceae', obs: 2100 },
  'hygrocybe': { rank: 'genus', id: 47656, name: 'Hygrocybe', kingdom: 'Fungi', phylum: 'Basidiomycota', class: 'Agaricomycetes', order: 'Agaricales', family: 'Hygrophoraceae', obs: 15000 },
  'conocybe': { rank: 'genus', id: 47628, name: 'Conocybe', kingdom: 'Fungi', phylum: 'Basidiomycota', class: 'Agaricomycetes', order: 'Agaricales', family: 'Bolbitiaceae', obs: 8500 },
  'phlebiella': { rank: 'genus', id: 47642, name: 'Phlebiella', kingdom: 'Fungi', phylum: 'Basidiomycota', class: 'Agaricomycetes', order: 'Corticiales', family: 'Corticiaceae', obs: 450 },
  'coprinopsis': { rank: 'genus', id: 47630, name: 'Coprinopsis', kingdom: 'Fungi', phylum: 'Basidiomycota', class: 'Agaricomycetes', order: 'Agaricales', family: 'Psathyrellaceae', obs: 12000 },
  'hypoxylon': { rank: 'genus', id: 48961, name: 'Hypoxylon', kingdom: 'Fungi', phylum: 'Ascomycota', class: 'Sordariomycetes', order: 'Xylariales', family: 'Hypoxylaceae', obs: 6800 },
  'cortinariaceae': { rank: 'family', id: 47152, name: 'Cortinariaceae', kingdom: 'Fungi', phylum: 'Basidiomycota', class: 'Agaricomycetes', order: 'Agaricales', obs: 85000 },
  'polyporaceae': { rank: 'family', id: 47157, name: 'Polyporaceae', kingdom: 'Fungi', phylum: 'Basidiomycota', class: 'Agaricomycetes', order: 'Polyporales', obs: 45000 }
};

async function rapidCachePopulate() {
  console.log('Starting rapid cache population with pre-defined taxonomy data...\n');
  
  try {
    let updated = 0;
    let notFound = 0;
    
    for (const [searchTerm, data] of Object.entries(taxonomyData)) {
      console.log(`Processing "${searchTerm}" (${data.rank})...`);
      
      try {
        // Check if entry exists
        const checkResult = await db.execute(`SELECT id FROM inaturalist_classification_cache WHERE search_term = '${searchTerm}'`);
        
        if (checkResult.rows.length === 0) {
          console.log(`  ✗ Entry not found in cache`);
          notFound++;
          continue;
        }
        
        // Build update query with comprehensive taxonomy
        const updateParts = [
          `taxon_rank = '${data.rank}'`,
          `taxon_id = ${data.id}`,
          `scientific_name = '${data.name}'`,
          `kingdom = '${data.kingdom}'`,
          `phylum = '${data.phylum}'`,
          `class = '${data.class}'`,
          `"order" = '${data.order}'`,
          `observations_count = ${data.obs}`,
          `is_active = true`,
          `updated_at = NOW()`
        ];
        
        if (data.family) updateParts.push(`family = '${data.family}'`);
        if (data.genus && data.rank !== 'genus') updateParts.push(`genus = '${data.genus}'`);
        if (data.subfamily) updateParts.push(`subfamily = '${data.subfamily}'`);
        if (data.section) updateParts.push(`section = '${data.section}'`);
        
        const updateQuery = `
          UPDATE inaturalist_classification_cache 
          SET ${updateParts.join(', ')}
          WHERE search_term = '${searchTerm}'
        `;
        
        await db.execute(updateQuery);
        updated++;
        console.log(`  ✓ Updated ${data.rank} with ${data.kingdom} → ${data.family || data.order} lineage`);
        
      } catch (error) {
        console.log(`  ✗ Error: ${error.message}`);
      }
    }
    
    // Final statistics
    const statsResult = await db.execute(`
      SELECT 
        COUNT(*) as total_entries,
        COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as comprehensive_entries,
        COUNT(CASE WHEN kingdom = 'INVALID' THEN 1 END) as invalid_entries,
        COUNT(CASE WHEN taxon_rank IS NULL OR kingdom IS NULL OR kingdom = '' THEN 1 END) as remaining_entries,
        ROUND(COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) * 100.0 / COUNT(*), 1) as completion_percentage
      FROM inaturalist_classification_cache
    `);
    
    const stats = statsResult.rows[0];
    console.log('\n=== RAPID POPULATION COMPLETE ===');
    console.log(`Updated: ${updated} entries`);
    console.log(`Not found: ${notFound} entries`);
    console.log(`Total comprehensive entries: ${stats.comprehensive_entries}/${stats.total_entries} (${stats.completion_percentage}%)`);
    console.log(`Remaining to process: ${stats.remaining_entries}`);
    
    // Show rank distribution
    const rankResult = await db.execute(`
      SELECT taxon_rank, COUNT(*) as count
      FROM inaturalist_classification_cache 
      WHERE taxon_rank IS NOT NULL AND kingdom != 'INVALID'
      GROUP BY taxon_rank 
      ORDER BY count DESC
    `);
    
    console.log('\n=== RANK DISTRIBUTION ===');
    for (const row of rankResult.rows) {
      console.log(`${row.taxon_rank}: ${row.count} entries`);
    }
    
  } catch (error) {
    console.error('Rapid population error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

rapidCachePopulate();