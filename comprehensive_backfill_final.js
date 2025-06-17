#!/usr/bin/env tsx

import { db } from './server/db.ts';

async function comprehensiveBackfillFinal() {
  console.log('Starting comprehensive classification cache backfill for all remaining entries...\n');
  
  try {
    // Get ALL remaining entries that need processing, ordered by usage
    const cacheEntries = await db.execute(`
      SELECT search_term, lookup_count
      FROM inaturalist_classification_cache 
      WHERE (taxon_rank IS NULL OR kingdom IS NULL OR kingdom = '')
      AND search_term != 'invalid'
      ORDER BY lookup_count DESC
    `);
    
    console.log(`Found ${cacheEntries.rows.length} entries to process\n`);
    
    let processed = 0;
    let updated = 0;
    let invalid = 0;
    let failed = 0;
    const batchSize = 10;
    
    // Process in batches with rate limiting
    for (let i = 0; i < cacheEntries.rows.length; i += batchSize) {
      const batch = cacheEntries.rows.slice(i, i + batchSize);
      console.log(`\n=== Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(cacheEntries.rows.length/batchSize)} (${batch.length} entries) ===`);
      
      for (const entry of batch) {
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
            console.log(`  ✗ No results found - marking as invalid`);
            const sanitizedTerm = searchTerm.replace(/'/g, "''");
            await db.execute(`UPDATE inaturalist_classification_cache SET kingdom = 'INVALID', updated_at = NOW() WHERE search_term = '${sanitizedTerm}'`);
            invalid++;
            continue;
          }
          
          const taxon = data.results[0];
          
          // Get full details for complete taxonomy
          const detailUrl = `https://api.inaturalist.org/v1/taxa/${taxon.id}`;
          const detailResponse = await fetch(detailUrl);
          
          if (!detailResponse.ok) {
            console.log(`  ✗ Detail API error: ${detailResponse.status}`);
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
          
          console.log(`  ✓ ${fullTaxon.rank}: ${fullTaxon.name}`);
          if (taxonomyData.kingdom) console.log(`    Kingdom: ${taxonomyData.kingdom}`);
          if (taxonomyData.family) console.log(`    Family: ${taxonomyData.family}`);
          if (taxonomyData.suborder) console.log(`    Suborder: ${taxonomyData.suborder}`);
          if (taxonomyData.section) console.log(`    Section: ${taxonomyData.section}`);
          
          // Use direct SQL execution to avoid parameter issues
          const sanitizedTerm = searchTerm.replace(/'/g, "''");
          const sanitizedName = fullTaxon.name.replace(/'/g, "''");
          
          await db.execute(`UPDATE inaturalist_classification_cache SET taxon_rank = '${fullTaxon.rank}', updated_at = NOW() WHERE search_term = '${sanitizedTerm}'`);
          await db.execute(`UPDATE inaturalist_classification_cache SET taxon_id = ${fullTaxon.id} WHERE search_term = '${sanitizedTerm}'`);
          await db.execute(`UPDATE inaturalist_classification_cache SET scientific_name = '${sanitizedName}' WHERE search_term = '${sanitizedTerm}'`);
          await db.execute(`UPDATE inaturalist_classification_cache SET observations_count = ${fullTaxon.observations_count || 0} WHERE search_term = '${sanitizedTerm}'`);
          await db.execute(`UPDATE inaturalist_classification_cache SET is_active = ${fullTaxon.is_active !== false} WHERE search_term = '${sanitizedTerm}'`);
          
          if (fullTaxon.preferred_common_name) {
            const sanitizedCommon = fullTaxon.preferred_common_name.replace(/'/g, "''");
            await db.execute(`UPDATE inaturalist_classification_cache SET common_name = '${sanitizedCommon}' WHERE search_term = '${sanitizedTerm}'`);
          }
          
          // Update all taxonomy fields that have values
          const taxonomyFields = [
            'kingdom', 'subkingdom', 'phylum', 'subphylum', 'class', 'subclass', 
            'order', 'suborder', 'infraorder', 'superfamily', 'family', 'subfamily',
            'tribe', 'subtribe', 'genus', 'subgenus', 'section', 'subsection',
            'species', 'subspecies', 'variety', 'form'
          ];
          
          for (const field of taxonomyFields) {
            if (taxonomyData[field]) {
              const sanitizedValue = taxonomyData[field].replace(/'/g, "''");
              const columnName = field === 'order' ? '"order"' : field;
              await db.execute(`UPDATE inaturalist_classification_cache SET ${columnName} = '${sanitizedValue}' WHERE search_term = '${sanitizedTerm}'`);
            }
          }
          
          // Store API response
          const sanitizedResponse = JSON.stringify(fullTaxon).replace(/'/g, "''");
          await db.execute(`UPDATE inaturalist_classification_cache SET api_response = '${sanitizedResponse}' WHERE search_term = '${sanitizedTerm}'`);
          
          updated++;
          console.log(`    ✓ Updated complete taxonomy with ${Object.values(taxonomyData).filter(Boolean).length} ranks`);
          
          // Rate limit between API calls
          await new Promise(resolve => setTimeout(resolve, 1100));
          
        } catch (error) {
          console.log(`    ✗ Error: ${error.message}`);
          failed++;
        }
        
        processed++;
      }
      
      console.log(`Batch ${Math.floor(i/batchSize) + 1} completed. Updated: ${updated}, Invalid: ${invalid}, Failed: ${failed}`);
      
      // Progress report every 5 batches
      if ((Math.floor(i/batchSize) + 1) % 5 === 0) {
        const statsResult = await db.execute(`
          SELECT 
            COUNT(*) as total_entries,
            COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as comprehensive_entries,
            COUNT(CASE WHEN kingdom = 'INVALID' THEN 1 END) as invalid_entries,
            COUNT(CASE WHEN taxon_rank IS NULL OR kingdom IS NULL OR kingdom = '' THEN 1 END) as remaining_entries
          FROM inaturalist_classification_cache
        `);
        
        const stats = statsResult.rows[0];
        console.log(`\n--- Progress Report ---`);
        console.log(`Comprehensive entries: ${stats.comprehensive_entries}/${stats.total_entries} (${Math.round(stats.comprehensive_entries/stats.total_entries*100)}%)`);
        console.log(`Invalid entries: ${stats.invalid_entries}`);
        console.log(`Remaining entries: ${stats.remaining_entries}`);
        console.log(`----------------------\n`);
      }
      
      // Longer delay between batches
      if (i + batchSize < cacheEntries.rows.length) {
        console.log('Waiting 3 seconds before next batch...\n');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // Final comprehensive statistics
    const finalStatsResult = await db.execute(`
      SELECT 
        COUNT(*) as total_entries,
        COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as comprehensive_entries,
        COUNT(CASE WHEN kingdom = 'INVALID' THEN 1 END) as invalid_entries,
        COUNT(CASE WHEN taxon_rank IS NULL OR kingdom IS NULL OR kingdom = '' THEN 1 END) as remaining_entries,
        SUM(lookup_count) as total_lookups,
        ROUND(COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) * 100.0 / COUNT(*), 1) as completion_percentage
      FROM inaturalist_classification_cache
    `);
    
    const finalStats = finalStatsResult.rows[0];
    console.log('\n=== FINAL COMPREHENSIVE STATISTICS ===');
    console.log(`Total entries: ${finalStats.total_entries}`);
    console.log(`Comprehensive entries: ${finalStats.comprehensive_entries}`);
    console.log(`Invalid entries: ${finalStats.invalid_entries}`);
    console.log(`Remaining entries: ${finalStats.remaining_entries}`);
    console.log(`Completion percentage: ${finalStats.completion_percentage}%`);
    console.log(`Total lookups represented: ${finalStats.total_lookups}`);
    console.log(`\nThis session: Processed ${processed}, Updated ${updated}, Invalid ${invalid}, Failed ${failed}`);
    
    // Show final rank distribution
    const rankDistResult = await db.execute(`
      SELECT taxon_rank, COUNT(*) as count
      FROM inaturalist_classification_cache 
      WHERE taxon_rank IS NOT NULL AND kingdom != 'INVALID'
      GROUP BY taxon_rank 
      ORDER BY count DESC
    `);
    
    console.log('\n=== COMPREHENSIVE RANK DISTRIBUTION ===');
    for (const row of rankDistResult.rows) {
      console.log(`${row.taxon_rank}: ${row.count} entries`);
    }
    
    // Show examples with intermediate ranks
    const intermediateRankResult = await db.execute(`
      SELECT search_term, taxon_rank, suborder, subfamily, section, subsection, tribe, subtribe, observations_count
      FROM inaturalist_classification_cache 
      WHERE (suborder IS NOT NULL OR subfamily IS NOT NULL OR section IS NOT NULL OR 
             subsection IS NOT NULL OR tribe IS NOT NULL OR subtribe IS NOT NULL)
      AND kingdom != 'INVALID'
      ORDER BY observations_count DESC
      LIMIT 10
    `);
    
    if (intermediateRankResult.rows.length > 0) {
      console.log('\n=== EXAMPLES WITH INTERMEDIATE RANKS ===');
      for (const row of intermediateRankResult.rows) {
        const intermediateRanks = [
          row.suborder && `Suborder: ${row.suborder}`,
          row.subfamily && `Subfamily: ${row.subfamily}`,
          row.section && `Section: ${row.section}`,
          row.subsection && `Subsection: ${row.subsection}`,
          row.tribe && `Tribe: ${row.tribe}`,
          row.subtribe && `Subtribe: ${row.subtribe}`
        ].filter(Boolean).join(', ');
        
        console.log(`${row.search_term} (${row.taxon_rank}): ${intermediateRanks} [${row.observations_count} obs]`);
      }
    }
    
    if (finalStats.remaining_entries > 0) {
      console.log(`\n=== NEXT STEPS ===`);
      console.log(`${finalStats.remaining_entries} entries still need processing.`);
      console.log(`Run this script again to continue until 100% completion.`);
    } else {
      console.log(`\n🎉 CONGRATULATIONS! 🎉`);
      console.log(`The comprehensive classification cache is now 100% complete!`);
      console.log(`All ${finalStats.total_entries} entries have been processed with full taxonomic hierarchies.`);
    }
    
  } catch (error) {
    console.error('Comprehensive backfill error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

comprehensiveBackfillFinal();