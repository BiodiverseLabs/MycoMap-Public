#!/usr/bin/env tsx

import { db } from './server/db.ts';

async function testComprehensiveClassification() {
  console.log('Testing comprehensive classification system...\n');
  
  try {
    // Test a few search terms with comprehensive API lookup
    const testTerms = ['Amanita', 'Russula', 'Boletus', 'Cortinarius'];
    
    for (const term of testTerms) {
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
        console.log(`    Observations: ${fullTaxon.observations_count || 0}`);
        
        // Update or insert comprehensive cache entry
        await db.execute(`
          INSERT INTO inaturalist_classification_cache 
          (search_term, taxon_rank, taxon_id, scientific_name, common_name, 
           parent_id, ancestry, kingdom, subkingdom, phylum, subphylum, 
           class, subclass, "order", suborder, infraorder, superfamily, 
           family, subfamily, tribe, subtribe, genus, subgenus, section, 
           subsection, species, subspecies, variety, form, 
           observations_count, is_active, api_response, lookup_count, 
           created_at, updated_at, last_used_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW(), NOW())
          ON CONFLICT (search_term) 
          DO UPDATE SET
            taxon_rank = EXCLUDED.taxon_rank,
            taxon_id = EXCLUDED.taxon_id,
            scientific_name = EXCLUDED.scientific_name,
            common_name = EXCLUDED.common_name,
            parent_id = EXCLUDED.parent_id,
            ancestry = EXCLUDED.ancestry,
            kingdom = EXCLUDED.kingdom,
            subkingdom = EXCLUDED.subkingdom,
            phylum = EXCLUDED.phylum,
            subphylum = EXCLUDED.subphylum,
            class = EXCLUDED.class,
            subclass = EXCLUDED.subclass,
            "order" = EXCLUDED."order",
            suborder = EXCLUDED.suborder,
            infraorder = EXCLUDED.infraorder,
            superfamily = EXCLUDED.superfamily,
            family = EXCLUDED.family,
            subfamily = EXCLUDED.subfamily,
            tribe = EXCLUDED.tribe,
            subtribe = EXCLUDED.subtribe,
            genus = EXCLUDED.genus,
            subgenus = EXCLUDED.subgenus,
            section = EXCLUDED.section,
            subsection = EXCLUDED.subsection,
            species = EXCLUDED.species,
            subspecies = EXCLUDED.subspecies,
            variety = EXCLUDED.variety,
            form = EXCLUDED.form,
            observations_count = EXCLUDED.observations_count,
            is_active = EXCLUDED.is_active,
            api_response = EXCLUDED.api_response,
            lookup_count = inaturalist_classification_cache.lookup_count + 1,
            updated_at = NOW(),
            last_used_at = NOW()
        `, [
          term.toLowerCase(),
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
          JSON.stringify(fullTaxon)
        ]);
        
        console.log(`    ✓ Cached comprehensive data\n`);
        
      } else {
        console.log(`  ✗ No results found\n`);
      }
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
    
    // Show updated cache statistics
    const statsResult = await db.execute(`
      SELECT 
        COUNT(*) as total_entries,
        COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as comprehensive_entries,
        COUNT(CASE WHEN kingdom = 'INVALID' THEN 1 END) as invalid_entries,
        SUM(lookup_count) as total_lookups
      FROM inaturalist_classification_cache
    `);
    
    const stats = statsResult.rows[0];
    console.log('=== Updated Cache Statistics ===');
    console.log(`Total entries: ${stats.total_entries}`);
    console.log(`Comprehensive entries: ${stats.comprehensive_entries}`);
    console.log(`Invalid entries: ${stats.invalid_entries}`);
    console.log(`Total lookups: ${stats.total_lookups}`);
    
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
    console.error('Test error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

testComprehensiveClassification();