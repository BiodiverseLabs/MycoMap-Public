#!/usr/bin/env tsx

import { db } from './server/db.ts';

async function simpleCacheBackfill() {
  console.log('Starting simplified classification cache backfill...\n');
  
  try {
    // Get entries that need backfilling, starting with most used
    const cacheEntries = await db.execute(`
      SELECT search_term, lookup_count
      FROM inaturalist_classification_cache 
      WHERE (taxon_rank IS NULL OR kingdom IS NULL OR kingdom = '')
      AND search_term != 'invalid'
      ORDER BY lookup_count DESC
      LIMIT 50
    `);
    
    console.log(`Found ${cacheEntries.rows.length} entries to backfill\n`);
    
    let processed = 0;
    let updated = 0;
    let failed = 0;
    
    for (const entry of cacheEntries.rows) {
      const searchTerm = entry.search_term;
      console.log(`Processing "${searchTerm}" (used ${entry.lookup_count} times)...`);
      
      try {
        // Search iNaturalist API
        const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchTerm)}&per_page=1`;
        const response = await fetch(searchUrl);
        
        if (!response.ok) {
          console.log(`  ✗ API error: ${response.status}`);
          failed++;
          continue;
        }
        
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
          console.log(`  ✗ No results found`);
          // Mark as invalid
          await db.execute(`UPDATE inaturalist_classification_cache SET kingdom = 'INVALID' WHERE search_term = $1`, [searchTerm]);
          failed++;
          continue;
        }
        
        const taxon = data.results[0];
        
        // Get full details
        const detailUrl = `https://api.inaturalist.org/v1/taxa/${taxon.id}`;
        const detailResponse = await fetch(detailUrl);
        const detailData = await detailResponse.json();
        const fullTaxon = detailData.results[0];
        
        // Extract taxonomy from ancestors
        const ancestors = fullTaxon.ancestors || [];
        const allTaxa = [...ancestors, fullTaxon];
        
        let taxonomyData = {
          kingdom: null, phylum: null, class: null, order: null, family: null, genus: null,
          subkingdom: null, subphylum: null, subclass: null, suborder: null, infraorder: null,
          superfamily: null, subfamily: null, tribe: null, subtribe: null, subgenus: null,
          section: null, subsection: null, species: null, subspecies: null, variety: null, form: null
        };
        
        for (const ancestor of allTaxa) {
          if (taxonomyData.hasOwnProperty(ancestor.rank)) {
            taxonomyData[ancestor.rank] = ancestor.name;
          }
        }
        
        console.log(`  ✓ ${fullTaxon.rank}: ${fullTaxon.name}`);
        if (taxonomyData.kingdom) console.log(`    Kingdom: ${taxonomyData.kingdom}`);
        if (taxonomyData.family) console.log(`    Family: ${taxonomyData.family}`);
        
        // Update using individual SQL statements to avoid parameter issues
        await db.execute(`UPDATE inaturalist_classification_cache SET taxon_rank = $1 WHERE search_term = $2`, [fullTaxon.rank, searchTerm]);
        await db.execute(`UPDATE inaturalist_classification_cache SET taxon_id = $1 WHERE search_term = $2`, [fullTaxon.id, searchTerm]);
        await db.execute(`UPDATE inaturalist_classification_cache SET scientific_name = $1 WHERE search_term = $2`, [fullTaxon.name, searchTerm]);
        
        if (fullTaxon.preferred_common_name) {
          await db.execute(`UPDATE inaturalist_classification_cache SET common_name = $1 WHERE search_term = $2`, [fullTaxon.preferred_common_name, searchTerm]);
        }
        
        // Update taxonomy fields
        if (taxonomyData.kingdom) await db.execute(`UPDATE inaturalist_classification_cache SET kingdom = $1 WHERE search_term = $2`, [taxonomyData.kingdom, searchTerm]);
        if (taxonomyData.phylum) await db.execute(`UPDATE inaturalist_classification_cache SET phylum = $1 WHERE search_term = $2`, [taxonomyData.phylum, searchTerm]);
        if (taxonomyData.class) await db.execute(`UPDATE inaturalist_classification_cache SET class = $1 WHERE search_term = $2`, [taxonomyData.class, searchTerm]);
        if (taxonomyData.order) await db.execute(`UPDATE inaturalist_classification_cache SET "order" = $1 WHERE search_term = $2`, [taxonomyData.order, searchTerm]);
        if (taxonomyData.family) await db.execute(`UPDATE inaturalist_classification_cache SET family = $1 WHERE search_term = $2`, [taxonomyData.family, searchTerm]);
        if (taxonomyData.genus) await db.execute(`UPDATE inaturalist_classification_cache SET genus = $1 WHERE search_term = $2`, [taxonomyData.genus, searchTerm]);
        
        // Update intermediate ranks
        if (taxonomyData.subkingdom) await db.execute(`UPDATE inaturalist_classification_cache SET subkingdom = $1 WHERE search_term = $2`, [taxonomyData.subkingdom, searchTerm]);
        if (taxonomyData.subphylum) await db.execute(`UPDATE inaturalist_classification_cache SET subphylum = $1 WHERE search_term = $2`, [taxonomyData.subphylum, searchTerm]);
        if (taxonomyData.subclass) await db.execute(`UPDATE inaturalist_classification_cache SET subclass = $1 WHERE search_term = $2`, [taxonomyData.subclass, searchTerm]);
        if (taxonomyData.suborder) await db.execute(`UPDATE inaturalist_classification_cache SET suborder = $1 WHERE search_term = $2`, [taxonomyData.suborder, searchTerm]);
        if (taxonomyData.infraorder) await db.execute(`UPDATE inaturalist_classification_cache SET infraorder = $1 WHERE search_term = $2`, [taxonomyData.infraorder, searchTerm]);
        if (taxonomyData.superfamily) await db.execute(`UPDATE inaturalist_classification_cache SET superfamily = $1 WHERE search_term = $2`, [taxonomyData.superfamily, searchTerm]);
        if (taxonomyData.subfamily) await db.execute(`UPDATE inaturalist_classification_cache SET subfamily = $1 WHERE search_term = $2`, [taxonomyData.subfamily, searchTerm]);
        if (taxonomyData.tribe) await db.execute(`UPDATE inaturalist_classification_cache SET tribe = $1 WHERE search_term = $2`, [taxonomyData.tribe, searchTerm]);
        if (taxonomyData.subtribe) await db.execute(`UPDATE inaturalist_classification_cache SET subtribe = $1 WHERE search_term = $2`, [taxonomyData.subtribe, searchTerm]);
        if (taxonomyData.subgenus) await db.execute(`UPDATE inaturalist_classification_cache SET subgenus = $1 WHERE search_term = $2`, [taxonomyData.subgenus, searchTerm]);
        if (taxonomyData.section) await db.execute(`UPDATE inaturalist_classification_cache SET section = $1 WHERE search_term = $2`, [taxonomyData.section, searchTerm]);
        if (taxonomyData.subsection) await db.execute(`UPDATE inaturalist_classification_cache SET subsection = $1 WHERE search_term = $2`, [taxonomyData.subsection, searchTerm]);
        if (taxonomyData.species) await db.execute(`UPDATE inaturalist_classification_cache SET species = $1 WHERE search_term = $2`, [taxonomyData.species, searchTerm]);
        if (taxonomyData.subspecies) await db.execute(`UPDATE inaturalist_classification_cache SET subspecies = $1 WHERE search_term = $2`, [taxonomyData.subspecies, searchTerm]);
        if (taxonomyData.variety) await db.execute(`UPDATE inaturalist_classification_cache SET variety = $1 WHERE search_term = $2`, [taxonomyData.variety, searchTerm]);
        if (taxonomyData.form) await db.execute(`UPDATE inaturalist_classification_cache SET form = $1 WHERE search_term = $2`, [taxonomyData.form, searchTerm]);
        
        // Update metadata
        await db.execute(`UPDATE inaturalist_classification_cache SET observations_count = $1 WHERE search_term = $2`, [fullTaxon.observations_count || 0, searchTerm]);
        await db.execute(`UPDATE inaturalist_classification_cache SET is_active = $1 WHERE search_term = $2`, [fullTaxon.is_active !== false, searchTerm]);
        await db.execute(`UPDATE inaturalist_classification_cache SET api_response = $1 WHERE search_term = $2`, [JSON.stringify(fullTaxon), searchTerm]);
        await db.execute(`UPDATE inaturalist_classification_cache SET updated_at = NOW() WHERE search_term = $1`, [searchTerm]);
        
        updated++;
        console.log(`    ✓ Updated comprehensive data`);
        
        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 1100));
        
      } catch (error) {
        console.log(`    ✗ Error: ${error.message}`);
        failed++;
      }
      
      processed++;
    }
    
    // Show final statistics
    const statsResult = await db.execute(`
      SELECT 
        COUNT(*) as total_entries,
        COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as comprehensive_entries,
        COUNT(CASE WHEN kingdom = 'INVALID' THEN 1 END) as invalid_entries
      FROM inaturalist_classification_cache
    `);
    
    const stats = statsResult.rows[0];
    console.log('\n=== Final Statistics ===');
    console.log(`Total entries: ${stats.total_entries}`);
    console.log(`Comprehensive entries: ${stats.comprehensive_entries}`);
    console.log(`Invalid entries: ${stats.invalid_entries}`);
    console.log(`Processed: ${processed}, Updated: ${updated}, Failed: ${failed}`);
    
    // Show rank distribution
    const rankResult = await db.execute(`
      SELECT taxon_rank, COUNT(*) as count
      FROM inaturalist_classification_cache 
      WHERE taxon_rank IS NOT NULL AND kingdom != 'INVALID'
      GROUP BY taxon_rank 
      ORDER BY count DESC
    `);
    
    console.log('\nRank distribution:');
    for (const row of rankResult.rows) {
      console.log(`  ${row.taxon_rank}: ${row.count} entries`);
    }
    
  } catch (error) {
    console.error('Backfill error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

simpleCacheBackfill();