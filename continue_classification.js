#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function continueClassification() {
  console.log('Continuing classification cache building...\n');
  
  let totalProcessed = 0;
  let totalSuccessful = 0;
  let batchCount = 0;
  
  try {
    // Process in smaller batches to avoid memory issues
    while (batchCount < 10) { // Process 10 batches
      batchCount++;
      console.log(`\n--- Batch ${batchCount} ---`);
      
      // Get next 5 genera to process
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
        LIMIT 5
      `);

      if (result.rows.length === 0) {
        console.log('No more genera to process!');
        break;
      }

      // Process each genus in this batch
      for (const row of result.rows) {
        const genus = row.genus;
        totalProcessed++;
        console.log(`[${totalProcessed}] Processing "${genus}"`);
        
        try {
          // Search iNaturalist API
          const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(genus)}&rank=genus,subgenus,section,family&per_page=5`;
          const response = await fetch(searchUrl);
          
          if (response.ok) {
            const data = await response.json();
            let taxonomyFound = false;
            
            if (data.results && data.results.length > 0) {
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
                      
                      // Extract taxonomy from taxon and ancestors
                      [taxon, ...taxon.ancestors].forEach(ancestor => {
                        if (ancestor.rank && ancestor.name) {
                          taxonomy[ancestor.rank] = ancestor.name;
                        }
                      });
                      
                      // Only save if we have complete taxonomy
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
                        console.log(`  ✓ Found complete taxonomy: ${taxonomy.kingdom} → ${taxonomy.family}`);
                        break;
                      }
                    }
                  }
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
              console.log(`  ✗ No complete taxonomy found - marked as invalid`);
            }
          }
          
        } catch (apiError) {
          console.error(`  ✗ API error: ${apiError.message}`);
          // Mark as invalid on error
          await pool.query(`
            INSERT INTO inaturalist_classification_cache (genus, kingdom, updated_at)
            VALUES ($1, 'INVALID', NOW())
            ON CONFLICT (genus) DO UPDATE SET
              kingdom = 'INVALID',
              updated_at = NOW()
          `, [genus]);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Show batch summary
      console.log(`Batch ${batchCount} complete: ${result.rows.length} processed`);
    }
    
    // Final progress check
    const progressResult = await pool.query(`
      SELECT 
        COUNT(CASE WHEN updated_at IS NOT NULL THEN 1 END) as total_processed,
        COUNT(CASE WHEN kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as successful,
        (1087 - COUNT(CASE WHEN updated_at IS NOT NULL THEN 1 END)) as remaining,
        (SELECT genus FROM inaturalist_classification_cache WHERE updated_at IS NOT NULL ORDER BY updated_at DESC LIMIT 1) as latest
      FROM inaturalist_classification_cache
    `);
    
    const stats = progressResult.rows[0];
    const successRate = Math.round(stats.successful / stats.total_processed * 100);
    
    console.log(`\n📊 Final Progress Summary:`);
    console.log(`   Total processed: ${stats.total_processed}/1087 (${Math.round(stats.total_processed / 1087 * 100)}%)`);
    console.log(`   Successful: ${stats.successful} (${successRate}% success rate)`);
    console.log(`   Remaining: ${stats.remaining}`);
    console.log(`   Latest: ${stats.latest}`);
    
  } catch (error) {
    console.error('Classification error:', error.message);
  } finally {
    await pool.end();
  }
}

continueClassification().catch(console.error);