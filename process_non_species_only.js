#!/usr/bin/env tsx

import { db } from './server/db.ts';

async function processNonSpeciesOnly() {
  console.log('Processing cache entries for NON-SPECIES taxonomic ranks only...\n');
  
  try {
    // Get only entries that are NOT yet processed and need to be reprocessed
    const remainingEntries = await db.execute(`
      SELECT search_term, lookup_count, id
      FROM inaturalist_classification_cache 
      WHERE (taxon_rank IS NULL OR taxon_rank = '') 
      AND (kingdom IS NULL OR kingdom = '' OR kingdom != 'INVALID')
      ORDER BY lookup_count DESC, search_term
    `);
    
    console.log(`Found ${remainingEntries.rows.length} entries to process for non-species ranks...\n`);
    
    let processed = 0;
    let updated = 0;
    let invalid = 0;
    let skippedSpecies = 0;
    let failed = 0;
    
    // Excluded ranks - only want higher taxonomic levels
    const excludedRanks = ['species', 'subspecies', 'variety', 'form'];
    
    for (const entry of remainingEntries.rows) {
      const searchTerm = entry.search_term;
      
      console.log(`Processing "${searchTerm}" (used ${entry.lookup_count} times)...`);
      
      try {
        // Search iNaturalist API
        const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchTerm)}&per_page=5`;
        const response = await fetch(searchUrl);
        
        if (!response.ok) {
          console.log(`  ✗ API error: ${response.status}`);
          failed++;
          continue;
        }
        
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
          console.log(`  ✗ No results found - marking as invalid`);
          await db.execute(`UPDATE inaturalist_classification_cache SET kingdom = 'INVALID', updated_at = NOW() WHERE search_term = '${searchTerm.replace(/'/g, "''")}'`);
          invalid++;
          continue;
        }
        
        // Find first result that is NOT a species-level rank
        let selectedTaxon = null;
        for (const taxon of data.results) {
          if (!excludedRanks.includes(taxon.rank)) {
            selectedTaxon = taxon;
            break;
          }
        }
        
        // If all results are species-level, skip this entry
        if (!selectedTaxon) {
          console.log(`  ⚠ All results are species-level ranks - skipping`);
          await db.execute(`UPDATE inaturalist_classification_cache SET kingdom = 'INVALID', updated_at = NOW() WHERE search_term = '${searchTerm.replace(/'/g, "''")}'`);
          skippedSpecies++;
          continue;
        }
        
        // Get full details for complete taxonomy
        const detailUrl = `https://api.inaturalist.org/v1/taxa/${selectedTaxon.id}`;
        const detailResponse = await fetch(detailUrl);
        
        if (!detailResponse.ok) {
          console.log(`  ✗ Detail API error: ${detailResponse.status}`);
          failed++;
          continue;
        }
        
        const detailData = await detailResponse.json();
        const fullTaxon = detailData.results[0];
        
        // Double check the rank is acceptable
        if (excludedRanks.includes(fullTaxon.rank)) {
          console.log(`  ⚠ Selected taxon is ${fullTaxon.rank} - skipping`);
          await db.execute(`UPDATE inaturalist_classification_cache SET kingdom = 'INVALID', updated_at = NOW() WHERE search_term = '${searchTerm.replace(/'/g, "''")}'`);
          skippedSpecies++;
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
          section: null, subsection: null
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
        
        // Use direct SQL execution for updates
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
        
        // Update taxonomy fields (excluding species-level fields)
        const taxonomyFields = [
          'kingdom', 'subkingdom', 'phylum', 'subphylum', 'class', 'subclass', 
          'order', 'suborder', 'infraorder', 'superfamily', 'family', 'subfamily',
          'tribe', 'subtribe', 'genus', 'subgenus', 'section', 'subsection'
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
        const rankCount = Object.values(taxonomyData).filter(Boolean).length;
        console.log(`    ✓ Updated complete taxonomy with ${rankCount} ranks`);
        
        // Rate limit between API calls
        await new Promise(resolve => setTimeout(resolve, 1100));
        
      } catch (error) {
        console.log(`    ✗ Error: ${error.message}`);
        failed++;
      }
      
      processed++;
      
      // Progress report every 15 entries
      if (processed % 15 === 0) {
        const statsResult = await db.execute(`
          SELECT 
            COUNT(*) as total_entries,
            COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as comprehensive_entries,
            ROUND(COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) * 100.0 / COUNT(*), 1) as completion_percentage
          FROM inaturalist_classification_cache
        `);
        
        const stats = statsResult.rows[0];
        console.log(`\n--- Progress Report (${processed}/${remainingEntries.rows.length} processed) ---`);
        console.log(`Cache completion: ${stats.comprehensive_entries}/${stats.total_entries} (${stats.completion_percentage}%)`);
        console.log(`This session: Updated ${updated}, Invalid ${invalid}, Skipped species ${skippedSpecies}, Failed ${failed}`);
        console.log(`-----------------------------------------\n`);
      }
    }
    
    // Final comprehensive statistics
    const finalStatsResult = await db.execute(`
      SELECT 
        COUNT(*) as total_entries,
        COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as comprehensive_entries,
        COUNT(CASE WHEN kingdom = 'INVALID' THEN 1 END) as invalid_entries,
        COUNT(CASE WHEN taxon_rank IS NULL OR kingdom IS NULL OR kingdom = '' THEN 1 END) as remaining_entries,
        ROUND(COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) * 100.0 / COUNT(*), 1) as completion_percentage
      FROM inaturalist_classification_cache
    `);
    
    const finalStats = finalStatsResult.rows[0];
    console.log('\n=== NON-SPECIES PROCESSING COMPLETE ===');
    console.log(`Total entries: ${finalStats.total_entries}`);
    console.log(`Successfully updated: ${updated}`);
    console.log(`Marked invalid: ${invalid}`);
    console.log(`Skipped species-level: ${skippedSpecies}`);
    console.log(`Failed: ${failed}`);
    console.log(`Final completion: ${finalStats.comprehensive_entries}/${finalStats.total_entries} (${finalStats.completion_percentage}%)`);
    console.log(`Remaining unprocessed: ${finalStats.remaining_entries}`);
    
    if (finalStats.remaining_entries === 0) {
      console.log('\n🎉 ALL NON-SPECIES CACHE ENTRIES PROCESSED! 🎉');
      console.log('The comprehensive taxonomic hierarchy system excludes species-level entries as requested.');
    }
    
    // Show final rank distribution (should exclude species ranks)
    const rankDistResult = await db.execute(`
      SELECT taxon_rank, COUNT(*) as count
      FROM inaturalist_classification_cache 
      WHERE taxon_rank IS NOT NULL AND kingdom != 'INVALID'
      GROUP BY taxon_rank 
      ORDER BY count DESC
    `);
    
    console.log('\n=== FINAL NON-SPECIES RANK DISTRIBUTION ===');
    for (const row of rankDistResult.rows) {
      console.log(`${row.taxon_rank}: ${row.count} entries`);
    }
    
  } catch (error) {
    console.error('Non-species processing error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

processNonSpeciesOnly();