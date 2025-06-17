#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function batchClassification() {
  console.log('Starting batch classification processing...\n');
  
  let batchNumber = 0;
  let totalProcessed = 0;
  let totalSuccessful = 0;
  
  try {
    // Process 5 small batches of 3 genera each
    for (let batch = 0; batch < 5; batch++) {
      batchNumber++;
      console.log(`--- Batch ${batchNumber} ---`);
      
      // Get next 3 genera to process
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
        LIMIT 3
      `);

      if (result.rows.length === 0) {
        console.log('No more genera to process!');
        break;
      }

      console.log(`Processing ${result.rows.length} genera: ${result.rows.map(r => r.genus).join(', ')}`);

      // Process each genus in this batch
      for (const row of result.rows) {
        const genus = row.genus;
        totalProcessed++;
        
        try {
          console.log(`[${totalProcessed}] "${genus}"`);
          
          // Search iNaturalist API with retry logic
          const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(genus)}&rank=genus,subgenus,section,family&per_page=3`;
          const response = await fetch(searchUrl);
          
          if (response.ok) {
            const data = await response.json();
            let taxonomyFound = false;
            
            if (data.results && data.results.length > 0) {
              // Try each result until we find complete taxonomy
              for (const taxonResult of data.results) {
                if (taxonResult.ancestors && taxonResult.ancestors.length > 0) {
                  // Get detailed taxonomy
                  const detailUrl = `https://api.inaturalist.org/v1/taxa/${taxonResult.id}`;
                  const detailResponse = await fetch(detailUrl);
                  
                  if (detailResponse.ok) {
                    const detailData = await detailResponse.json();
                    const taxon = detailData.results?.[0];
                    
                    if (taxon && taxon.ancestors) {
                      const taxonomy = {};
                      
                      // Extract complete taxonomy hierarchy
                      [taxon, ...taxon.ancestors].forEach(ancestor => {
                        if (ancestor.rank && ancestor.name) {
                          taxonomy[ancestor.rank] = ancestor.name;
                        }
                      });
                      
                      // Only save if we have kingdom and family (complete taxonomy)
                      if (taxonomy.kingdom && taxonomy.family) {
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
                          taxonomy.kingdom || null,
                          taxonomy.phylum || null,
                          taxonomy.class || null,
                          taxonomy.order || null,
                          taxonomy.family || null,
                          taxonResult.rank || null,
                          genus,
                          taxonResult.name || null,
                          taxonomy.genus || null
                        ]);
                        
                        totalSuccessful++;
                        taxonomyFound = true;
                        console.log(`    ✓ Complete taxonomy: ${taxonomy.kingdom} → ${taxonomy.family}`);
                        break;
                      }
                    }
                  }
                  
                  // Short delay between detail requests
                  await new Promise(resolve => setTimeout(resolve, 500));
                }
              }
            }
            
            // Mark as invalid if no complete taxonomy found
            if (!taxonomyFound) {
              await pool.query(`
                INSERT INTO inaturalist_classification_cache (genus, kingdom, updated_at)
                VALUES ($1, 'INVALID', NOW())
                ON CONFLICT (genus) DO UPDATE SET
                  kingdom = 'INVALID',
                  updated_at = NOW()
              `, [genus]);
              console.log(`    ✗ No complete taxonomy - marked invalid`);
            }
          } else {
            console.log(`    ✗ API error: ${response.status}`);
            // Mark as invalid on API error
            await pool.query(`
              INSERT INTO inaturalist_classification_cache (genus, kingdom, updated_at)
              VALUES ($1, 'INVALID', NOW())
              ON CONFLICT (genus) DO UPDATE SET
                kingdom = 'INVALID',
                updated_at = NOW()
            `, [genus]);
          }
          
        } catch (error) {
          console.error(`    ✗ Error: ${error.message}`);
          // Mark as invalid on any error
          try {
            await pool.query(`
              INSERT INTO inaturalist_classification_cache (genus, kingdom, updated_at)
              VALUES ($1, 'INVALID', NOW())
              ON CONFLICT (genus) DO UPDATE SET
                kingdom = 'INVALID',
                updated_at = NOW()
            `, [genus]);
          } catch (dbError) {
            console.error(`    Database error: ${dbError.message}`);
          }
        }
        
        // Rate limiting between genera
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
      
      console.log(`Batch ${batchNumber} complete: ${result.rows.length} processed\n`);
      
      // Longer pause between batches
      if (batch < 4) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Get updated progress stats
    const progressResult = await pool.query(`
      SELECT 
        COUNT(CASE WHEN updated_at IS NOT NULL THEN 1 END) as total_processed,
        COUNT(CASE WHEN kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as successful,
        COUNT(CASE WHEN kingdom = 'INVALID' THEN 1 END) as invalid,
        (1087 - COUNT(CASE WHEN updated_at IS NOT NULL THEN 1 END)) as remaining,
        (SELECT genus FROM inaturalist_classification_cache WHERE updated_at IS NOT NULL ORDER BY updated_at DESC LIMIT 1) as latest
      FROM inaturalist_classification_cache
    `);
    
    const stats = progressResult.rows[0];
    const successRate = Math.round(stats.successful / stats.total_processed * 100);
    const percentComplete = Math.round(stats.total_processed / 1087 * 100);
    
    console.log(`📊 Updated Progress Summary:`);
    console.log(`   Total processed: ${stats.total_processed}/1087 (${percentComplete}%)`);
    console.log(`   Successful: ${stats.successful} (${successRate}% success rate)`);
    console.log(`   Invalid: ${stats.invalid}`);
    console.log(`   Remaining: ${stats.remaining}`);
    console.log(`   Latest: ${stats.latest}`);
    console.log(`\n✅ Batch processing complete. ${totalSuccessful}/${totalProcessed} successful in this session.`);
    
  } catch (error) {
    console.error('\n❌ Batch processing error:', error.message);
  } finally {
    try {
      await pool.end();
    } catch (closeError) {
      console.error('Pool close error:', closeError.message);
    }
  }
}

batchClassification().catch(console.error);