#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function correctedBatchProcessing() {
  console.log('Processing genera with corrected API approach...\n');
  
  let sessionProcessed = 0;
  let sessionSuccessful = 0;
  
  try {
    // Process 20 batches of 3 genera each
    for (let batch = 0; batch < 20; batch++) {
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
        console.log('All genera processed!');
        break;
      }

      const genera = result.rows.map(r => r.genus);
      console.log(`[${batch + 1}] ${genera.join(', ')}`);

      for (const genus of genera) {
        sessionProcessed++;
        
        try {
          // Search for exact genus match
          const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(genus)}&rank=genus&per_page=5`;
          const response = await fetch(searchUrl);
          
          if (response.ok) {
            const data = await response.json();
            let taxonomyFound = false;
            
            if (data.results && data.results.length > 0) {
              // Look for exact genus match
              for (const searchResult of data.results) {
                if (searchResult.rank === 'genus' && 
                    searchResult.name.toLowerCase() === genus.toLowerCase()) {
                  
                  // Get detailed taxonomy with ancestors
                  const detailUrl = `https://api.inaturalist.org/v1/taxa/${searchResult.id}`;
                  const detailResponse = await fetch(detailUrl);
                  
                  if (detailResponse.ok) {
                    const detailData = await detailResponse.json();
                    const taxon = detailData.results?.[0];
                    
                    if (taxon) {
                      const taxonomy = {};
                      
                      // Add the taxon itself
                      if (taxon.rank && taxon.name) {
                        taxonomy[taxon.rank] = taxon.name;
                      }
                      
                      // Add all ancestors
                      if (taxon.ancestors && taxon.ancestors.length > 0) {
                        taxon.ancestors.forEach(ancestor => {
                          if (ancestor.rank && ancestor.name) {
                            taxonomy[ancestor.rank] = ancestor.name;
                          }
                        });
                      }
                      
                      // Check for minimum taxonomy (kingdom + family/order)
                      if (taxonomy.kingdom && (taxonomy.family || taxonomy.order)) {
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
                          searchResult.rank || null,
                          genus,
                          searchResult.name || null,
                          taxonomy.genus || null
                        ]);
                        
                        sessionSuccessful++;
                        taxonomyFound = true;
                        console.log(`    ✅ ${genus}: ${taxonomy.kingdom} → ${taxonomy.family || taxonomy.order}`);
                        break;
                      }
                    }
                  }
                  
                  await new Promise(resolve => setTimeout(resolve, 400));
                  break; // Found exact match, don't check other results
                }
              }
            }
            
            if (!taxonomyFound) {
              await pool.query(`
                INSERT INTO inaturalist_classification_cache (genus, kingdom, updated_at)
                VALUES ($1, 'INVALID', NOW())
                ON CONFLICT (genus) DO UPDATE SET
                  kingdom = 'INVALID',
                  updated_at = NOW()
              `, [genus]);
              console.log(`    ❌ ${genus}: No valid taxonomy`);
            }
          }
        } catch (error) {
          await pool.query(`
            INSERT INTO inaturalist_classification_cache (genus, kingdom, updated_at)
            VALUES ($1, 'INVALID', NOW())
            ON CONFLICT (genus) DO UPDATE SET
              kingdom = 'INVALID',
              updated_at = NOW()
          `, [genus]);
          console.log(`    ❌ ${genus}: Error`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 700));
      }
      
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    
    // Final progress check
    const progressResult = await pool.query(`
      SELECT 
        COUNT(CASE WHEN updated_at IS NOT NULL THEN 1 END) as total_processed,
        COUNT(CASE WHEN kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as successful,
        (1087 - COUNT(CASE WHEN updated_at IS NOT NULL THEN 1 END)) as remaining
      FROM inaturalist_classification_cache
    `);
    
    const stats = progressResult.rows[0];
    const successRate = Math.round(stats.successful / stats.total_processed * 100);
    const percentComplete = Math.round(stats.total_processed / 1087 * 100);
    
    console.log(`\nSession: ${sessionSuccessful}/${sessionProcessed} successful`);
    console.log(`Total: ${stats.total_processed}/1087 (${percentComplete}%)`);
    console.log(`Success Rate: ${stats.successful} (${successRate}%)`);
    console.log(`Remaining: ${stats.remaining} genera`);
    
  } catch (error) {
    console.error('Processing error:', error.message);
  } finally {
    await pool.end();
  }
}

correctedBatchProcessing().catch(console.error);