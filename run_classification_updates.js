#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function fetchTaxonomyFromAPI(searchTerm) {
  try {
    const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchTerm)}&rank=genus,subgenus,section,family&per_page=5`;
    const response = await fetch(searchUrl);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      for (const result of data.results) {
        if (result.ancestors && result.ancestors.length > 0) {
          const detailUrl = `https://api.inaturalist.org/v1/taxa/${result.id}`;
          const detailResponse = await fetch(detailUrl);
          
          if (detailResponse.ok) {
            const detailData = await detailResponse.json();
            const taxon = detailData.results?.[0];
            
            if (taxon && taxon.ancestors) {
              const taxonomy = {};
              
              [taxon, ...taxon.ancestors].forEach(ancestor => {
                if (ancestor.rank && ancestor.name) {
                  taxonomy[ancestor.rank] = ancestor.name;
                }
              });
              
              if (taxonomy.kingdom && taxonomy.family) {
                return {
                  ...taxonomy,
                  matched_rank: result.rank,
                  search_term: searchTerm,
                  matched_taxon_name: result.name,
                  genus_from_api: taxonomy.genus || null
                };
              }
            }
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.log(`    API error: ${error.message}`);
    return null;
  }
}

async function runClassificationUpdates() {
  console.log('Running classification updates for next 50 genera...\n');
  
  let processedCount = 0;
  let successCount = 0;
  
  for (let i = 0; i < 50; i++) {
    try {
      // Get next genus to process
      const result = await pool.query(`
        SELECT DISTINCT o.genus
        FROM observations o
        WHERE o.genus IS NOT NULL 
          AND o.genus != ''
          AND o.genus NOT LIKE '%http%'
          AND o.genus NOT LIKE '%aceae'
          AND o.genus NOT LIKE '%ales'
          AND o.genus NOT LIKE '%mycota'
          AND o.genus NOT LIKE '%ineae'
          AND o.genus NOT LIKE '% %'
          AND LENGTH(o.genus) >= 3
          AND o.genus != 'fungi'
          AND o.genus NOT IN (
            SELECT genus FROM inaturalist_classification_cache 
            WHERE updated_at IS NOT NULL
          )
        ORDER BY o.genus ASC
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        console.log(`\nAll genera processed! Completed ${processedCount} in this batch (${successCount} successful)`);
        break;
      }

      const genus = result.rows[0].genus;
      processedCount++;
      
      console.log(`[${processedCount}/50] Processing "${genus}"`);

      const taxonomyData = await fetchTaxonomyFromAPI(genus);
      
      if (taxonomyData) {
        await pool.query(`
          INSERT INTO inaturalist_classification_cache (
            genus, kingdom, phylum, class, "order", family, matched_rank, search_term, matched_taxon_name, genus_from_api, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (genus) DO UPDATE SET
            kingdom = EXCLUDED.kingdom,
            phylum = EXCLUDED.phylum,
            class = EXCLUDED.class,
            "order" = EXCLUDED."order",
            family = EXCLUDED.family,
            matched_rank = EXCLUDED.matched_rank,
            search_term = EXCLUDED.search_term,
            matched_taxon_name = EXCLUDED.matched_taxon_name,
            genus_from_api = EXCLUDED.genus_from_api,
            updated_at = NOW()
        `, [
          genus,
          taxonomyData.kingdom || null,
          taxonomyData.phylum || null,
          taxonomyData.class || null,
          taxonomyData.order || null,
          taxonomyData.family || null,
          taxonomyData.matched_rank || null,
          taxonomyData.search_term || null,
          taxonomyData.matched_taxon_name || null,
          taxonomyData.genus_from_api || null
        ]);

        successCount++;
        console.log(`  ✓ ${taxonomyData.family} family, ${taxonomyData.kingdom} kingdom`);
      } else {
        // Mark as processed but no taxonomy found
        await pool.query(`
          INSERT INTO inaturalist_classification_cache (genus, kingdom, updated_at)
          VALUES ($1, 'INVALID', NOW())
          ON CONFLICT (genus) DO UPDATE SET
            kingdom = 'INVALID',
            updated_at = NOW()
        `, [genus]);
        
        console.log(`  ✗ No taxonomy found - marked as invalid`);
      }

      // Rate limiting - 1.5 seconds between requests
      await new Promise(resolve => setTimeout(resolve, 1500));

    } catch (error) {
      console.error(`Error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  // Final status
  const statusResult = await pool.query(`
    SELECT 
      COUNT(CASE WHEN updated_at IS NOT NULL THEN 1 END) as total_processed,
      COUNT(CASE WHEN kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as successful,
      (1087 - COUNT(CASE WHEN updated_at IS NOT NULL THEN 1 END)) as remaining
    FROM inaturalist_classification_cache
  `);
  
  const stats = statusResult.rows[0];
  console.log(`\n📊 Overall Progress:`);
  console.log(`   Total processed: ${stats.total_processed}/1087 (${Math.round(stats.total_processed/1087*100)}%)`);
  console.log(`   Successful: ${stats.successful} genera with complete taxonomy`);
  console.log(`   Remaining: ${stats.remaining} genera`);
  console.log(`   Success rate: ${Math.round(stats.successful/stats.total_processed*100)}%`);
  
  await pool.end();
}

runClassificationUpdates().catch(console.error);