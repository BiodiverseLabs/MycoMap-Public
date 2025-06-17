#!/usr/bin/env tsx

import { db } from './server/db.ts';

async function fixNameMismatches() {
  console.log('Fixing name mismatches in classification cache...\n');
  
  try {
    // Find entries where search term doesn't match scientific name
    const mismatches = await db.execute(`
      SELECT search_term, scientific_name, taxon_rank, family, id
      FROM inaturalist_classification_cache 
      WHERE taxon_rank IS NOT NULL 
      AND kingdom != 'INVALID'
      AND LOWER(search_term) != LOWER(scientific_name)
      AND search_term NOT LIKE '%''%'
      ORDER BY search_term
    `);
    
    console.log(`Found ${mismatches.rows.length} name mismatches to fix...\n`);
    
    let processed = 0;
    let updated = 0;
    let invalid = 0;
    let failed = 0;
    
    // Function to check if search term is contained in scientific name or vice versa
    function isReasonableMatch(searchTerm, scientificName) {
      const search = searchTerm.toLowerCase();
      const scientific = scientificName.toLowerCase();
      
      // Check if one is contained in the other (for partial matches)
      if (search.includes(scientific) || scientific.includes(search)) {
        return true;
      }
      
      // Check if they share a significant portion (for genus/section relationships)
      if (search.length >= 6 && scientific.length >= 6) {
        const shorterLength = Math.min(search.length, scientific.length);
        const longerString = search.length > scientific.length ? search : scientific;
        const shorterString = search.length <= scientific.length ? search : scientific;
        
        if (longerString.includes(shorterString.substring(0, Math.floor(shorterLength * 0.7)))) {
          return true;
        }
      }
      
      return false;
    }
    
    for (const entry of mismatches.rows) {
      const searchTerm = entry.search_term;
      const scientificName = entry.scientific_name;
      
      console.log(`Checking "${searchTerm}" → "${scientificName}" (${entry.taxon_rank})`);
      
      // Check if this is a reasonable match
      if (!isReasonableMatch(searchTerm, scientificName)) {
        console.log(`  ✗ Name mismatch - resetting for reprocessing`);
        
        // Reset this entry for reprocessing
        await db.execute(`
          UPDATE inaturalist_classification_cache 
          SET 
            taxon_rank = NULL,
            taxon_id = NULL,
            scientific_name = NULL,
            common_name = NULL,
            kingdom = NULL,
            phylum = NULL,
            class = NULL,
            "order" = NULL,
            family = NULL,
            genus = NULL,
            section = NULL,
            species = NULL,
            subspecies = NULL,
            variety = NULL,
            form = NULL,
            observations_count = NULL,
            is_active = NULL,
            api_response = NULL,
            updated_at = NOW()
          WHERE search_term = '${searchTerm.replace(/'/g, "''")}'
        `);
        
        // Now try to reprocess with stricter matching
        try {
          const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchTerm)}&per_page=10`;
          const response = await fetch(searchUrl);
          
          if (!response.ok) {
            console.log(`    ✗ API error: ${response.status}`);
            failed++;
            continue;
          }
          
          const data = await response.json();
          
          if (!data.results || data.results.length === 0) {
            console.log(`    ✗ No results found - marking as invalid`);
            await db.execute(`UPDATE inaturalist_classification_cache SET kingdom = 'INVALID', updated_at = NOW() WHERE search_term = '${searchTerm.replace(/'/g, "''")}'`);
            invalid++;
            continue;
          }
          
          // Find exact or close match, excluding species-level ranks
          const excludedRanks = ['species', 'subspecies', 'variety', 'form'];
          let selectedTaxon = null;
          
          for (const taxon of data.results) {
            if (excludedRanks.includes(taxon.rank)) continue;
            
            // Check for exact match first
            if (taxon.name.toLowerCase() === searchTerm.toLowerCase()) {
              selectedTaxon = taxon;
              break;
            }
            
            // Check for reasonable partial match
            if (isReasonableMatch(searchTerm, taxon.name)) {
              selectedTaxon = taxon;
              break;
            }
          }
          
          if (!selectedTaxon) {
            console.log(`    ✗ No suitable matches found - marking as invalid`);
            await db.execute(`UPDATE inaturalist_classification_cache SET kingdom = 'INVALID', updated_at = NOW() WHERE search_term = '${searchTerm.replace(/'/g, "''")}'`);
            invalid++;
            continue;
          }
          
          // Get full details
          const detailUrl = `https://api.inaturalist.org/v1/taxa/${selectedTaxon.id}`;
          const detailResponse = await fetch(detailUrl);
          
          if (!detailResponse.ok) {
            console.log(`    ✗ Detail API error: ${detailResponse.status}`);
            failed++;
            continue;
          }
          
          const detailData = await detailResponse.json();
          const fullTaxon = detailData.results[0];
          
          // Extract complete taxonomy
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
          
          console.log(`    ✓ Fixed: ${fullTaxon.rank}: ${fullTaxon.name}`);
          if (taxonomyData.kingdom) console.log(`      Kingdom: ${taxonomyData.kingdom}`);
          if (taxonomyData.family) console.log(`      Family: ${taxonomyData.family}`);
          
          // Update with corrected data
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
          
          // Update taxonomy fields
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
          
          // Rate limit
          await new Promise(resolve => setTimeout(resolve, 1100));
          
        } catch (error) {
          console.log(`    ✗ Reprocessing error: ${error.message}`);
          failed++;
        }
        
      } else {
        console.log(`  ✓ Reasonable match - keeping`);
      }
      
      processed++;
    }
    
    console.log('\n=== NAME MISMATCH FIXING COMPLETE ===');
    console.log(`Processed: ${processed}`);
    console.log(`Fixed/Updated: ${updated}`);
    console.log(`Marked invalid: ${invalid}`);
    console.log(`Failed: ${failed}`);
    
  } catch (error) {
    console.error('Name mismatch fixing error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

fixNameMismatches();