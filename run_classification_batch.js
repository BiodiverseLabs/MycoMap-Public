#!/usr/bin/env tsx

import { db } from './server/db.ts';

async function runClassificationBatch() {
  console.log('Running smaller classification batch (20 entries)...\n');
  
  try {
    // Get next 20 search terms that need processing
    const searchTermsResult = await db.execute(`
      SELECT search_term, lookup_count
      FROM inaturalist_classification_cache 
      WHERE (taxon_rank IS NULL OR kingdom = 'INVALID' OR kingdom IS NULL)
      ORDER BY lookup_count DESC
      LIMIT 20
    `);
    
    const searchTerms = searchTermsResult.rows;
    console.log(`Processing ${searchTerms.length} entries...\n`);
    
    let processed = 0;
    let successful = 0;
    let failed = 0;
    
    for (const row of searchTerms) {
      const searchTerm = row.search_term;
      const usageCount = row.lookup_count;
      
      console.log(`[${processed + 1}/${searchTerms.length}] Processing "${searchTerm}" (used ${usageCount} times)...`);
      
      try {
        // Search iNaturalist API for the term
        const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchTerm)}&per_page=1`;
        const response = await fetch(searchUrl);
        
        if (!response.ok) {
          console.log(`  ✗ API error: ${response.status}`);
          failed++;
          processed++;
          continue;
        }
        
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
          console.log(`  ✗ No results found`);
          // Mark as invalid to avoid repeated lookups
          await db.execute(`
            UPDATE inaturalist_classification_cache 
            SET kingdom = 'INVALID', updated_at = NOW()
            WHERE search_term = $1
          `, [searchTerm]);
          failed++;
          processed++;
          continue;
        }
        
        const taxon = data.results[0];
        
        // Get full details for complete taxonomy
        const detailUrl = `https://api.inaturalist.org/v1/taxa/${taxon.id}`;
        const detailResponse = await fetch(detailUrl);
        
        if (!detailResponse.ok) {
          console.log(`  ✗ Detail API error: ${detailResponse.status}`);
          failed++;
          processed++;
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
        
        console.log(`  ✓ ${fullTaxon.rank}: ${fullTaxon.name} (${taxonomyData.kingdom})`);
        
        // Build safe SQL update using direct string interpolation with proper escaping
        const updateQuery = `
          UPDATE inaturalist_classification_cache 
          SET 
            taxon_rank = '${fullTaxon.rank}',
            taxon_id = ${fullTaxon.id},
            scientific_name = '${fullTaxon.name.replace(/'/g, "''")}',
            common_name = ${fullTaxon.preferred_common_name ? `'${fullTaxon.preferred_common_name.replace(/'/g, "''")}'` : 'NULL'},
            parent_id = ${fullTaxon.parent_id || 'NULL'},
            ancestry = ${fullTaxon.ancestry ? `'${fullTaxon.ancestry}'` : 'NULL'},
            kingdom = ${taxonomyData.kingdom ? `'${taxonomyData.kingdom}'` : 'NULL'},
            subkingdom = ${taxonomyData.subkingdom ? `'${taxonomyData.subkingdom}'` : 'NULL'},
            phylum = ${taxonomyData.phylum ? `'${taxonomyData.phylum}'` : 'NULL'},
            subphylum = ${taxonomyData.subphylum ? `'${taxonomyData.subphylum}'` : 'NULL'},
            class = ${taxonomyData.class ? `'${taxonomyData.class}'` : 'NULL'},
            subclass = ${taxonomyData.subclass ? `'${taxonomyData.subclass}'` : 'NULL'},
            "order" = ${taxonomyData.order ? `'${taxonomyData.order}'` : 'NULL'},
            suborder = ${taxonomyData.suborder ? `'${taxonomyData.suborder}'` : 'NULL'},
            infraorder = ${taxonomyData.infraorder ? `'${taxonomyData.infraorder}'` : 'NULL'},
            superfamily = ${taxonomyData.superfamily ? `'${taxonomyData.superfamily}'` : 'NULL'},
            family = ${taxonomyData.family ? `'${taxonomyData.family}'` : 'NULL'},
            subfamily = ${taxonomyData.subfamily ? `'${taxonomyData.subfamily}'` : 'NULL'},
            tribe = ${taxonomyData.tribe ? `'${taxonomyData.tribe}'` : 'NULL'},
            subtribe = ${taxonomyData.subtribe ? `'${taxonomyData.subtribe}'` : 'NULL'},
            genus = ${taxonomyData.genus ? `'${taxonomyData.genus}'` : 'NULL'},
            subgenus = ${taxonomyData.subgenus ? `'${taxonomyData.subgenus}'` : 'NULL'},
            section = ${taxonomyData.section ? `'${taxonomyData.section}'` : 'NULL'},
            subsection = ${taxonomyData.subsection ? `'${taxonomyData.subsection}'` : 'NULL'},
            species = ${taxonomyData.species ? `'${taxonomyData.species}'` : 'NULL'},
            subspecies = ${taxonomyData.subspecies ? `'${taxonomyData.subspecies}'` : 'NULL'},
            variety = ${taxonomyData.variety ? `'${taxonomyData.variety}'` : 'NULL'},
            form = ${taxonomyData.form ? `'${taxonomyData.form}'` : 'NULL'},
            observations_count = ${fullTaxon.observations_count || 0},
            is_active = ${fullTaxon.is_active !== false},
            api_response = '${JSON.stringify(fullTaxon).replace(/'/g, "''")}',
            lookup_count = lookup_count + 1,
            updated_at = NOW(),
            last_used_at = NOW()
          WHERE search_term = '${searchTerm}'
        `;
        
        await db.execute(updateQuery);
        successful++;
        
      } catch (error) {
        console.log(`  ✗ Error: ${error.message}`);
        failed++;
      }
      
      processed++;
      
      // Rate limiting - 1.1 second delay between requests
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
    
    // Final statistics
    console.log(`\n=== Batch Complete ===`);
    console.log(`Processed: ${processed}, Successful: ${successful}, Failed: ${failed}`);
    
    // Show updated cache statistics
    const statsResult = await db.execute(`
      SELECT 
        COUNT(*) as total_entries,
        COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as comprehensive_entries,
        ROUND(COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) * 100.0 / COUNT(*), 1) as completion_percentage
      FROM inaturalist_classification_cache
    `);
    
    const stats = statsResult.rows[0];
    console.log(`\nCache status: ${stats.comprehensive_entries}/${stats.total_entries} comprehensive (${stats.completion_percentage}%)`);
    
  } catch (error) {
    console.error('Batch error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

runClassificationBatch();