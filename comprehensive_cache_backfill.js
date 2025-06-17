#!/usr/bin/env tsx

import { db } from './server/db.ts';

async function comprehensiveCacheBackfill() {
  console.log('Starting comprehensive classification cache backfill...\n');
  
  try {
    // Get all cache entries that need backfilling
    const cacheEntries = await db.execute(`
      SELECT search_term, taxon_rank, taxon_id, scientific_name, 
             api_response, lookup_count
      FROM inaturalist_classification_cache 
      WHERE taxon_rank IS NULL OR taxon_rank = ''
      ORDER BY lookup_count DESC
      LIMIT 50
    `);
    
    console.log(`Found ${cacheEntries.rows.length} entries to backfill\n`);
    
    let processed = 0;
    let updated = 0;
    
    for (const entry of cacheEntries.rows) {
      const searchTerm = entry.search_term;
      console.log(`Processing "${searchTerm}" (used ${entry.lookup_count} times)...`);
      
      try {
        // Try to parse existing API response first
        let fullTaxon = null;
        if (entry.api_response) {
          try {
            fullTaxon = JSON.parse(entry.api_response);
          } catch (e) {
            console.log(`  ⚠ Cannot parse stored API response`);
          }
        }
        
        // If no valid stored response, fetch from API
        if (!fullTaxon) {
          console.log(`  → Fetching from iNaturalist API...`);
          
          const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchTerm)}&per_page=1`;
          const response = await fetch(searchUrl);
          const data = await response.json();
          
          if (!data.results || data.results.length === 0) {
            console.log(`  ✗ No results found\n`);
            processed++;
            continue;
          }
          
          const taxon = data.results[0];
          
          // Get full details
          const detailUrl = `https://api.inaturalist.org/v1/taxa/${taxon.id}`;
          const detailResponse = await fetch(detailUrl);
          const detailData = await detailResponse.json();
          fullTaxon = detailData.results[0];
          
          // Rate limit
          await new Promise(resolve => setTimeout(resolve, 1100));
        }
        
        if (!fullTaxon) {
          console.log(`  ✗ No taxon data available\n`);
          processed++;
          continue;
        }
        
        // Extract complete taxonomy from ancestors
        const ancestors = fullTaxon.ancestors || [];
        const allTaxa = [...ancestors, fullTaxon];
        
        let taxonomyData = {
          kingdom: null, subkingdom: null, phylum: null, subphylum: null,
          class: null, subclass: null, order: null, suborder: null,
          infraorder: null, superfamily: null, family: null, subfamily: null,
          tribe: null, subtribe: null, genus: null, subgenus: null,
          section: null, subsection: null, species: null, subspecies: null,
          variety: null, form: null
        };
        
        for (const ancestor of allTaxa) {
          if (taxonomyData.hasOwnProperty(ancestor.rank)) {
            taxonomyData[ancestor.rank] = ancestor.name;
          }
        }
        
        console.log(`  ✓ ${fullTaxon.rank}: ${fullTaxon.name}`);
        console.log(`    Kingdom: ${taxonomyData.kingdom}, Family: ${taxonomyData.family}`);
        
        // Update the cache entry with comprehensive data
        await db.execute(`
          UPDATE inaturalist_classification_cache 
          SET 
            taxon_rank = $1,
            taxon_id = $2,
            scientific_name = $3,
            common_name = $4,
            parent_id = $5,
            ancestry = $6,
            kingdom = $7,
            subkingdom = $8,
            phylum = $9,
            subphylum = $10,
            class = $11,
            subclass = $12,
            "order" = $13,
            suborder = $14,
            infraorder = $15,
            superfamily = $16,
            family = $17,
            subfamily = $18,
            tribe = $19,
            subtribe = $20,
            genus = $21,
            subgenus = $22,
            section = $23,
            subsection = $24,
            species = $25,
            subspecies = $26,
            variety = $27,
            form = $28,
            observations_count = $29,
            is_active = $30,
            api_response = $31,
            updated_at = NOW()
          WHERE search_term = $32
        `, [
          fullTaxon.rank,
          fullTaxon.id,
          fullTaxon.name,
          fullTaxon.preferred_common_name || null,
          fullTaxon.parent_id || null,
          fullTaxon.ancestry || null,
          taxonomyData.kingdom,
          taxonomyData.subkingdom,
          taxonomyData.phylum,
          taxonomyData.subphylum,
          taxonomyData.class,
          taxonomyData.subclass,
          taxonomyData.order,
          taxonomyData.suborder,
          taxonomyData.infraorder,
          taxonomyData.superfamily,
          taxonomyData.family,
          taxonomyData.subfamily,
          taxonomyData.tribe,
          taxonomyData.subtribe,
          taxonomyData.genus,
          taxonomyData.subgenus,
          taxonomyData.section,
          taxonomyData.subsection,
          taxonomyData.species,
          taxonomyData.subspecies,
          taxonomyData.variety,
          taxonomyData.form,
          fullTaxon.observations_count || 0,
          fullTaxon.is_active !== false,
          JSON.stringify(fullTaxon),
          searchTerm
        ]);
        
        updated++;
        console.log(`    ✓ Updated comprehensive data\n`);
        
      } catch (error) {
        console.log(`  ✗ Error: ${error.message}\n`);
      }
      
      processed++;
    }
    
    // Show final statistics
    const statsResult = await db.execute(`
      SELECT 
        COUNT(*) as total_entries,
        COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL THEN 1 END) as comprehensive_entries,
        SUM(lookup_count) as total_lookups
      FROM inaturalist_classification_cache
    `);
    
    const stats = statsResult.rows[0];
    console.log('=== Final Cache Statistics ===');
    console.log(`Total entries: ${stats.total_entries}`);
    console.log(`Comprehensive entries: ${stats.comprehensive_entries}`);
    console.log(`Total lookups: ${stats.total_lookups}`);
    console.log(`\nProcessed: ${processed} entries`);
    console.log(`Updated: ${updated} entries`);
    
    // Show rank distribution
    const rankResult = await db.execute(`
      SELECT taxon_rank, COUNT(*) as count
      FROM inaturalist_classification_cache 
      WHERE taxon_rank IS NOT NULL 
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

comprehensiveCacheBackfill();