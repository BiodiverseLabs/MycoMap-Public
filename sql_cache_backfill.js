#!/usr/bin/env tsx

async function sqlCacheBackfill() {
  console.log('Starting SQL-based classification cache backfill...\n');
  
  try {
    // Get entries that need backfilling
    const response = await fetch('http://localhost:5000/api/execute-sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          SELECT search_term, lookup_count
          FROM inaturalist_classification_cache 
          WHERE (taxon_rank IS NULL OR kingdom IS NULL OR kingdom = '')
          AND search_term != 'invalid'
          ORDER BY lookup_count DESC
          LIMIT 20
        `
      })
    });
    
    const data = await response.json();
    const cacheEntries = data.rows || [];
    
    console.log(`Found ${cacheEntries.length} entries to backfill\n`);
    
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
          console.log(`  ✗ No results found`);
          // Mark as invalid
          await fetch('http://localhost:5000/api/execute-sql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `UPDATE inaturalist_classification_cache SET kingdom = 'INVALID' WHERE search_term = '${searchTerm}'`
            })
          });
          failed++;
          continue;
        }
        
        const taxon = apiData.results[0];
        
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
        
        // Build comprehensive update query
        const sanitizedSearchTerm = searchTerm.replace(/'/g, "''");
        const sanitizedScientificName = fullTaxon.name.replace(/'/g, "''");
        const sanitizedCommonName = fullTaxon.preferred_common_name ? fullTaxon.preferred_common_name.replace(/'/g, "''") : null;
        const sanitizedApiResponse = JSON.stringify(fullTaxon).replace(/'/g, "''");
        
        const updateFields = [
          `taxon_rank = '${fullTaxon.rank}'`,
          `taxon_id = ${fullTaxon.id}`,
          `scientific_name = '${sanitizedScientificName}'`,
          `observations_count = ${fullTaxon.observations_count || 0}`,
          `is_active = ${fullTaxon.is_active !== false}`,
          `api_response = '${sanitizedApiResponse}'`,
          `updated_at = NOW()`
        ];
        
        if (sanitizedCommonName) {
          updateFields.push(`common_name = '${sanitizedCommonName}'`);
        }
        
        // Add taxonomy fields
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
          WHERE search_term = '${sanitizedSearchTerm}'
        `;
        
        await fetch('http://localhost:5000/api/execute-sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: updateQuery })
        });
        
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
    const statsResponse = await fetch('http://localhost:5000/api/execute-sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          SELECT 
            COUNT(*) as total_entries,
            COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as comprehensive_entries,
            COUNT(CASE WHEN kingdom = 'INVALID' THEN 1 END) as invalid_entries
          FROM inaturalist_classification_cache
        `
      })
    });
    
    const statsData = await statsResponse.json();
    const stats = statsData.rows[0];
    
    console.log('\n=== Final Statistics ===');
    console.log(`Total entries: ${stats.total_entries}`);
    console.log(`Comprehensive entries: ${stats.comprehensive_entries}`);
    console.log(`Invalid entries: ${stats.invalid_entries}`);
    console.log(`Processed: ${processed}, Updated: ${updated}, Failed: ${failed}`);
    
    // Show rank distribution
    const rankResponse = await fetch('http://localhost:5000/api/execute-sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          SELECT taxon_rank, COUNT(*) as count
          FROM inaturalist_classification_cache 
          WHERE taxon_rank IS NOT NULL AND kingdom != 'INVALID'
          GROUP BY taxon_rank 
          ORDER BY count DESC
        `
      })
    });
    
    const rankData = await rankResponse.json();
    
    console.log('\nRank distribution:');
    for (const row of rankData.rows) {
      console.log(`  ${row.taxon_rank}: ${row.count} entries`);
    }
    
    // Show remaining work
    const remainingResponse = await fetch('http://localhost:5000/api/execute-sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          SELECT COUNT(*) as remaining_count
          FROM inaturalist_classification_cache 
          WHERE (taxon_rank IS NULL OR kingdom IS NULL OR kingdom = '')
          AND kingdom != 'INVALID'
        `
      })
    });
    
    const remainingData = await remainingResponse.json();
    const remaining = remainingData.rows[0];
    
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

sqlCacheBackfill();