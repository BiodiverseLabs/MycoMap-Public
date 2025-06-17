#!/usr/bin/env tsx

import { db } from './server/db.ts';

async function comprehensiveCacheBackfillFinal() {
  console.log('Starting comprehensive classification cache backfill...\n');
  
  try {
    // Get all cache entries that need backfilling, prioritizing by usage
    const cacheEntries = await db.execute(`
      SELECT search_term, lookup_count, api_response
      FROM inaturalist_classification_cache 
      WHERE (taxon_rank IS NULL OR taxon_rank = '' OR kingdom IS NULL OR kingdom = '')
      AND search_term != 'invalid'
      ORDER BY lookup_count DESC
      LIMIT 100
    `);
    
    console.log(`Found ${cacheEntries.rows.length} entries to backfill\n`);
    
    let processed = 0;
    let updated = 0;
    let failed = 0;
    const batchSize = 10;
    
    // Process in batches to respect rate limits
    for (let i = 0; i < cacheEntries.rows.length; i += batchSize) {
      const batch = cacheEntries.rows.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(cacheEntries.rows.length/batchSize)} (${batch.length} entries)...`);
      
      for (const entry of batch) {
        const searchTerm = entry.search_term;
        console.log(`  Processing "${searchTerm}" (used ${entry.lookup_count} times)...`);
        
        try {
          // Fetch from iNaturalist API
          const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchTerm)}&per_page=1`;
          const response = await fetch(searchUrl);
          
          if (!response.ok) {
            console.log(`    ✗ API error: ${response.status}`);
            failed++;
            continue;
          }
          
          const data = await response.json();
          
          if (!data.results || data.results.length === 0) {
            console.log(`    ✗ No results found`);
            // Mark as invalid to avoid repeated lookups
            await db.execute(`
              UPDATE inaturalist_classification_cache 
              SET kingdom = 'INVALID', updated_at = NOW()
              WHERE search_term = $1
            `, [searchTerm]);
            failed++;
            continue;
          }
          
          const taxon = data.results[0];
          
          // Get full details for complete taxonomy
          const detailUrl = `https://api.inaturalist.org/v1/taxa/${taxon.id}`;
          const detailResponse = await fetch(detailUrl);
          
          if (!detailResponse.ok) {
            console.log(`    ✗ Detail API error: ${detailResponse.status}`);
            failed++;
            continue;
          }
          
          const detailData = await detailResponse.json();
          const fullTaxon = detailData.results[0];
          
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
          
          console.log(`    ✓ ${fullTaxon.rank}: ${fullTaxon.name}`);
          if (taxonomyData.kingdom) console.log(`      Kingdom: ${taxonomyData.kingdom}`);
          if (taxonomyData.family) console.log(`      Family: ${taxonomyData.family}`);
          if (taxonomyData.genus) console.log(`      Genus: ${taxonomyData.genus}`);
          
          // Update the cache entry with comprehensive data using a simpler approach
          const updateResult = await db.execute(`
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
            fullTaxon.rank,                                    // $1
            fullTaxon.id,                                      // $2
            fullTaxon.name,                                    // $3
            fullTaxon.preferred_common_name || null,           // $4
            fullTaxon.parent_id || null,                       // $5
            fullTaxon.ancestry || null,                        // $6
            taxonomyData.kingdom,                              // $7
            taxonomyData.subkingdom,                           // $8
            taxonomyData.phylum,                               // $9
            taxonomyData.subphylum,                            // $10
            taxonomyData.class,                                // $11
            taxonomyData.subclass,                             // $12
            taxonomyData.order,                                // $13
            taxonomyData.suborder,                             // $14
            taxonomyData.infraorder,                           // $15
            taxonomyData.superfamily,                          // $16
            taxonomyData.family,                               // $17
            taxonomyData.subfamily,                            // $18
            taxonomyData.tribe,                                // $19
            taxonomyData.subtribe,                             // $20
            taxonomyData.genus,                                // $21
            taxonomyData.subgenus,                             // $22
            taxonomyData.section,                              // $23
            taxonomyData.subsection,                           // $24
            taxonomyData.species,                              // $25
            taxonomyData.subspecies,                           // $26
            taxonomyData.variety,                              // $27
            taxonomyData.form,                                 // $28
            fullTaxon.observations_count || 0,                 // $29
            fullTaxon.is_active !== false,                     // $30
            JSON.stringify(fullTaxon),                         // $31
            searchTerm                                         // $32
          ]);
          
          updated++;
          console.log(`    ✓ Updated comprehensive data`);
          
          // Rate limit delay
          await new Promise(resolve => setTimeout(resolve, 1100));
          
        } catch (error) {
          console.log(`    ✗ Error: ${error.message}`);
          failed++;
        }
        
        processed++;
      }
      
      console.log(`Batch completed. Updated: ${updated}, Failed: ${failed}\n`);
      
      // Longer delay between batches
      if (i + batchSize < cacheEntries.rows.length) {
        console.log('Waiting 5 seconds before next batch...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    // Show final comprehensive statistics
    const finalStatsResult = await db.execute(`
      SELECT 
        COUNT(*) as total_entries,
        COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as comprehensive_entries,
        COUNT(CASE WHEN kingdom = 'INVALID' THEN 1 END) as invalid_entries,
        COUNT(CASE WHEN taxon_rank IS NULL OR kingdom IS NULL THEN 1 END) as incomplete_entries,
        SUM(lookup_count) as total_lookups,
        ROUND(COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) * 100.0 / COUNT(*), 1) as completion_percentage
      FROM inaturalist_classification_cache
    `);
    
    const finalStats = finalStatsResult.rows[0];
    console.log('=== Final Cache Statistics ===');
    console.log(`Total entries: ${finalStats.total_entries}`);
    console.log(`Comprehensive entries: ${finalStats.comprehensive_entries}`);
    console.log(`Invalid entries: ${finalStats.invalid_entries}`);
    console.log(`Incomplete entries: ${finalStats.incomplete_entries}`);
    console.log(`Completion percentage: ${finalStats.completion_percentage}%`);
    console.log(`Total lookups recorded: ${finalStats.total_lookups}`);
    console.log(`\nProcessing summary:`);
    console.log(`  Processed: ${processed} entries`);
    console.log(`  Updated: ${updated} entries`);
    console.log(`  Failed: ${failed} entries`);
    
    // Show comprehensive rank distribution
    const rankDistResult = await db.execute(`
      SELECT taxon_rank, COUNT(*) as count
      FROM inaturalist_classification_cache 
      WHERE taxon_rank IS NOT NULL AND kingdom != 'INVALID'
      GROUP BY taxon_rank 
      ORDER BY count DESC
    `);
    
    console.log('\n=== Rank Distribution ===');
    for (const row of rankDistResult.rows) {
      console.log(`${row.taxon_rank}: ${row.count} entries`);
    }
    
    // Show examples of complete taxonomies by rank
    const exampleResult = await db.execute(`
      SELECT search_term, taxon_rank, kingdom, phylum, class, "order", suborder, family, genus, observations_count
      FROM inaturalist_classification_cache 
      WHERE taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID'
      ORDER BY observations_count DESC
      LIMIT 10
    `);
    
    console.log('\n=== Top Complete Taxonomies ===');
    for (const row of exampleResult.rows) {
      const hierarchy = [
        row.kingdom,
        row.phylum,
        row.class,
        row.order,
        row.suborder,
        row.family,
        row.genus
      ].filter(Boolean).join(' → ');
      
      console.log(`${row.search_term} (${row.taxon_rank}): ${hierarchy} [${row.observations_count} obs]`);
    }
    
    // Show missing data summary for next batch
    const remainingResult = await db.execute(`
      SELECT COUNT(*) as remaining_count
      FROM inaturalist_classification_cache 
      WHERE (taxon_rank IS NULL OR taxon_rank = '' OR kingdom IS NULL OR kingdom = '')
      AND kingdom != 'INVALID'
    `);
    
    const remaining = remainingResult.rows[0];
    console.log(`\n=== Next Steps ===`);
    if (remaining.remaining_count > 0) {
      console.log(`${remaining.remaining_count} entries still need processing`);
      console.log(`Run this script again to continue the backfill process`);
    } else {
      console.log(`✓ All cache entries have been processed!`);
      console.log(`The comprehensive classification cache is now complete`);
    }
    
  } catch (error) {
    console.error('Backfill error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

comprehensiveCacheBackfillFinal();