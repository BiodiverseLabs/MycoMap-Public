#!/usr/bin/env tsx

async function batchCacheBackfill() {
  console.log('Starting batch classification cache backfill...\n');
  
  try {
    // Get remaining entries that need processing - smaller batch
    const remainingResponse = await fetch('http://localhost:5000/api/execute-sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          SELECT search_term, lookup_count
          FROM inaturalist_classification_cache 
          WHERE (taxon_rank IS NULL OR kingdom IS NULL OR kingdom = '')
          AND search_term != 'invalid'
          ORDER BY lookup_count DESC
          LIMIT 10
        `
      })
    });
    
    const remainingData = await remainingResponse.json();
    const cacheEntries = remainingData.rows || [];
    
    console.log(`Found ${cacheEntries.length} entries to process\n`);
    
    let processed = 0;
    let updated = 0;
    let failed = 0;
    
    for (const entry of cacheEntries) {
      const searchTerm = entry.search_term;
      console.log(`Processing "${searchTerm}" (used ${entry.lookup_count} times)...`);
      
      try {
        // Search iNaturalist API
        const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchTerm)}&per_page=1`;
        const apiResponse = await fetch(searchUrl);
        
        if (!apiResponse.ok) {
          console.log(`  ✗ API error: ${apiResponse.status}`);
          failed++;
          continue;
        }
        
        const apiData = await apiResponse.json();
        
        if (!apiData.results || apiData.results.length === 0) {
          console.log(`  ✗ No results found - marking as invalid`);
          await fetch('http://localhost:5000/api/execute-sql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `UPDATE inaturalist_classification_cache SET kingdom = 'INVALID' WHERE search_term = '${searchTerm.replace(/'/g, "''")}'`
            })
          });
          failed++;
          continue;
        }
        
        const taxon = apiData.results[0];
        
        // Get full details for complete taxonomy
        const detailUrl = `https://api.inaturalist.org/v1/taxa/${taxon.id}`;
        const detailResponse = await fetch(detailUrl);
        const detailData = await detailResponse.json();
        const fullTaxon = detailData.results[0];
        
        // Extract complete taxonomy from ancestors
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
        if (taxonomyData.suborder) console.log(`    Suborder: ${taxonomyData.suborder}`);
        
        // Build update fields array
        const updateFields = [
          `taxon_rank = '${fullTaxon.rank}'`,
          `taxon_id = ${fullTaxon.id}`,
          `scientific_name = '${fullTaxon.name.replace(/'/g, "''")}'`,
          `observations_count = ${fullTaxon.observations_count || 0}`,
          `is_active = ${fullTaxon.is_active !== false}`,
          `updated_at = NOW()`
        ];
        
        if (fullTaxon.preferred_common_name) {
          updateFields.push(`common_name = '${fullTaxon.preferred_common_name.replace(/'/g, "''")}'`);
        }
        
        // Add taxonomy fields that have values
        Object.entries(taxonomyData).forEach(([rank, value]) => {
          if (value) {
            const sanitizedValue = value.replace(/'/g, "''");
            if (rank === 'order') {
              updateFields.push(`"order" = '${sanitizedValue}'`);
            } else {
              updateFields.push(`${rank} = '${sanitizedValue}'`);
            }
          }
        });
        
        const updateQuery = `
          UPDATE inaturalist_classification_cache 
          SET ${updateFields.join(', ')}
          WHERE search_term = '${searchTerm.replace(/'/g, "''")}'
        `;
        
        // Execute update
        await fetch('http://localhost:5000/api/execute-sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: updateQuery })
        });
        
        updated++;
        console.log(`    ✓ Updated comprehensive taxonomy data`);
        
        // Rate limit between API calls
        await new Promise(resolve => setTimeout(resolve, 1100));
        
      } catch (error) {
        console.log(`    ✗ Error: ${error.message}`);
        failed++;
      }
      
      processed++;
    }
    
    // Show final statistics
    const statsResponse = await fetch('http://localhost:5000/api/execute-sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          SELECT 
            COUNT(*) as total_entries,
            COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as comprehensive_entries,
            COUNT(CASE WHEN kingdom = 'INVALID' THEN 1 END) as invalid_entries,
            COUNT(CASE WHEN taxon_rank IS NULL OR kingdom IS NULL OR kingdom = '' THEN 1 END) as incomplete_entries,
            ROUND(COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) * 100.0 / COUNT(*), 1) as completion_percentage
          FROM inaturalist_classification_cache
        `
      })
    });
    
    const statsData = await statsResponse.json();
    const stats = statsData.rows[0];
    
    console.log('\n=== Classification Cache Statistics ===');
    console.log(`Total entries: ${stats.total_entries}`);
    console.log(`Comprehensive entries: ${stats.comprehensive_entries}`);
    console.log(`Invalid entries: ${stats.invalid_entries}`);
    console.log(`Incomplete entries: ${stats.incomplete_entries}`);
    console.log(`Completion percentage: ${stats.completion_percentage}%`);
    console.log(`\nThis batch: Processed ${processed}, Updated ${updated}, Failed ${failed}`);
    
    if (stats.incomplete_entries > 0) {
      console.log(`\n${stats.incomplete_entries} entries still need processing. Run this script again to continue.`);
    } else {
      console.log('\n✓ All cache entries have been processed! The comprehensive classification cache is complete.');
    }
    
  } catch (error) {
    console.error('Batch backfill error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

batchCacheBackfill();