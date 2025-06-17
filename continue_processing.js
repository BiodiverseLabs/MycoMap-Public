#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function continueProcessing() {
  console.log('Continuing systematic classification processing...\n');
  
  let sessionProcessed = 0;
  let sessionSuccessful = 0;
  
  try {
    // Process 15 batches of 2 genera each
    for (let batch = 0; batch < 15; batch++) {
      // Get next 2 genera
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
        LIMIT 2
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
          const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(genus)}&rank=genus,subgenus,family&per_page=3`;
          const response = await fetch(searchUrl);
          
          if (response.ok) {
            const data = await response.json();
            let taxonomyFound = false;
            
            if (data.results && data.results.length > 0) {
              for (const taxonResult of data.results) {
                if (taxonResult.ancestors && taxonResult.ancestors.length > 0) {
                  const detailUrl = `https://api.inaturalist.org/v1/taxa/${taxonResult.id}`;
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
                        
                        sessionSuccessful++;
                        taxonomyFound = true;
                        console.log(`    ✓ ${genus}: ${taxonomy.kingdom} → ${taxonomy.family}`);
                        break;
                      }
                    }
                  }
                  await new Promise(resolve => setTimeout(resolve, 300));
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
            }
          } else {
            await pool.query(`
              INSERT INTO inaturalist_classification_cache (genus, kingdom, updated_at)
              VALUES ($1, 'INVALID', NOW())
              ON CONFLICT (genus) DO UPDATE SET
                kingdom = 'INVALID',
                updated_at = NOW()
            `, [genus]);
          }
          
        } catch (error) {
          await pool.query(`
            INSERT INTO inaturalist_classification_cache (genus, kingdom, updated_at)
            VALUES ($1, 'INVALID', NOW())
            ON CONFLICT (genus) DO UPDATE SET
              kingdom = 'INVALID',
              updated_at = NOW()
          `, [genus]);
        }
        
        await new Promise(resolve => setTimeout(resolve, 900));
      }
      
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    
    // Get final progress
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
    
    console.log(`\nSession Results: ${sessionSuccessful}/${sessionProcessed} successful`);
    console.log(`Total Progress: ${stats.total_processed}/1087 (${percentComplete}%)`);
    console.log(`Success Rate: ${stats.successful} (${successRate}%)`);
    console.log(`Remaining: ${stats.remaining} genera`);
    
  } catch (error) {
    console.error('Processing error:', error.message);
  } finally {
    await pool.end();
  }
}

continueProcessing().catch(console.error);