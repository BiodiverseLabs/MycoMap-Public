#!/usr/bin/env tsx

import { db } from './server/db.ts';

async function testComprehensiveSimple() {
  console.log('Testing comprehensive classification system with direct SQL...\n');
  
  try {
    // Test one term using direct SQL execution
    const term = 'Amanita';
    console.log(`Testing "${term}"...`);
    
    // Search iNaturalist API for the term
    const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(term)}&per_page=1`;
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const taxon = data.results[0];
      
      // Get full details for complete taxonomy
      const detailUrl = `https://api.inaturalist.org/v1/taxa/${taxon.id}`;
      const detailResponse = await fetch(detailUrl);
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
      console.log(`    Kingdom: ${taxonomyData.kingdom}, Family: ${taxonomyData.family}`);
      console.log(`    Order: ${taxonomyData.order}, Genus: ${taxonomyData.genus}`);
      if (taxonomyData.suborder) console.log(`    Suborder: ${taxonomyData.suborder}`);
      console.log(`    Observations: ${fullTaxon.observations_count || 0}`);
      
      // Use direct SQL update instead of parameterized query
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
          updated_at = NOW()
        WHERE search_term = '${term.toLowerCase()}'
      `;
      
      await db.execute(updateQuery);
      console.log(`    ✓ Updated comprehensive data with all ranks\n`);
      
    } else {
      console.log(`  ✗ No results found\n`);
    }
    
    // Show updated cache statistics
    const statsResult = await db.execute(`
      SELECT 
        COUNT(*) as total_entries,
        COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as comprehensive_entries,
        SUM(lookup_count) as total_lookups
      FROM inaturalist_classification_cache
    `);
    
    const stats = statsResult.rows[0];
    console.log('=== Updated Cache Statistics ===');
    console.log(`Total entries: ${stats.total_entries}`);
    console.log(`Comprehensive entries: ${stats.comprehensive_entries}`);
    console.log(`Total lookups: ${stats.total_lookups}`);
    
    // Show rank distribution including all new ranks
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
    
    // Show example with complete taxonomy hierarchy
    const exampleResult = await db.execute(`
      SELECT search_term, taxon_rank, kingdom, "order", suborder, family, genus 
      FROM inaturalist_classification_cache 
      WHERE search_term = '${term.toLowerCase()}'
    `);
    
    if (exampleResult.rows.length > 0) {
      const row = exampleResult.rows[0];
      console.log('\nComplete taxonomy example:');
      console.log(`  ${row.search_term} (${row.taxon_rank}): ${row.kingdom} → ${row.order || 'N/A'} → ${row.suborder || 'N/A'} → ${row.family || 'N/A'} → ${row.genus || 'N/A'}`);
    }
    
  } catch (error) {
    console.error('Test error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

testComprehensiveSimple();