#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function fixedClassification() {
  console.log('Starting fixed classification with proper API calls...\n');
  
  let sessionProcessed = 0;
  let sessionSuccessful = 0;
  
  try {
    // Test with known problematic genera first
    const testGenera = ['Armillaria', 'Arrhenia', 'Arachnopeziza', 'Aspergillus'];
    
    for (const genus of testGenera) {
      sessionProcessed++;
      console.log(`[${sessionProcessed}] Testing "${genus}"`);
      
      try {
        // First, search for the genus
        const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(genus)}&rank=genus&per_page=5`;
        const response = await fetch(searchUrl);
        
        if (response.ok) {
          const data = await response.json();
          let taxonomyFound = false;
          
          if (data.results && data.results.length > 0) {
            // Look for exact genus match
            for (const result of data.results) {
              if (result.rank === 'genus' && result.name.toLowerCase() === genus.toLowerCase()) {
                console.log(`    Found genus match: ${result.name} (ID: ${result.id})`);
                
                // Get detailed taxon info with ancestors
                const detailUrl = `https://api.inaturalist.org/v1/taxa/${result.id}`;
                const detailResponse = await fetch(detailUrl);
                
                if (detailResponse.ok) {
                  const detailData = await detailResponse.json();
                  const taxon = detailData.results?.[0];
                  
                  if (taxon) {
                    console.log(`    Taxon details received, ancestors: ${taxon.ancestors?.length || 0}`);
                    
                    // Extract complete taxonomy
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
                    
                    console.log(`    Taxonomy extracted:`);
                    console.log(`      Kingdom: ${taxonomy.kingdom || 'N/A'}`);
                    console.log(`      Phylum: ${taxonomy.phylum || 'N/A'}`);
                    console.log(`      Class: ${taxonomy.class || 'N/A'}`);
                    console.log(`      Order: ${taxonomy.order || 'N/A'}`);
                    console.log(`      Family: ${taxonomy.family || 'N/A'}`);
                    console.log(`      Genus: ${taxonomy.genus || 'N/A'}`);
                    
                    // Check if we have minimum required taxonomy
                    if (taxonomy.kingdom && (taxonomy.family || taxonomy.order)) {
                      // Save to database
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
                        result.rank || null,
                        genus,
                        result.name || null,
                        taxonomy.genus || null
                      ]);
                      
                      sessionSuccessful++;
                      taxonomyFound = true;
                      console.log(`    ✅ SUCCESS: ${genus} classified as ${taxonomy.kingdom} → ${taxonomy.family || taxonomy.order}`);
                      break;
                    } else {
                      console.log(`    ❌ Incomplete taxonomy - missing kingdom or family/order`);
                    }
                  }
                } else {
                  console.log(`    ❌ Detail API failed: ${detailResponse.status}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }
          }
          
          if (!taxonomyFound) {
            // Mark as invalid
            await pool.query(`
              INSERT INTO inaturalist_classification_cache (genus, kingdom, updated_at)
              VALUES ($1, 'INVALID', NOW())
              ON CONFLICT (genus) DO UPDATE SET
                kingdom = 'INVALID',
                updated_at = NOW()
            `, [genus]);
            console.log(`    ❌ No valid taxonomy found - marked invalid`);
          }
        }
        
      } catch (error) {
        console.error(`    Error processing ${genus}:`, error.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`\n📊 Test Results: ${sessionSuccessful}/${sessionProcessed} successful`);
    
    if (sessionSuccessful > 0) {
      console.log('\n✅ API fix working! Now processing more genera...\n');
      
      // Process more genera with the fixed approach
      for (let batch = 0; batch < 5; batch++) {
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

        if (result.rows.length === 0) break;

        const genera = result.rows.map(r => r.genus);
        console.log(`Batch ${batch + 1}: ${genera.join(', ')}`);

        for (const genus of genera) {
          sessionProcessed++;
          
          try {
            const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(genus)}&rank=genus&per_page=3`;
            const response = await fetch(searchUrl);
            
            if (response.ok) {
              const data = await response.json();
              let taxonomyFound = false;
              
              if (data.results && data.results.length > 0) {
                for (const searchResult of data.results) {
                  if (searchResult.rank === 'genus') {
                    const detailUrl = `https://api.inaturalist.org/v1/taxa/${searchResult.id}`;
                    const detailResponse = await fetch(detailUrl);
                    
                    if (detailResponse.ok) {
                      const detailData = await detailResponse.json();
                      const taxon = detailData.results?.[0];
                      
                      if (taxon) {
                        const taxonomy = {};
                        
                        if (taxon.rank && taxon.name) {
                          taxonomy[taxon.rank] = taxon.name;
                        }
                        
                        if (taxon.ancestors && taxon.ancestors.length > 0) {
                          taxon.ancestors.forEach(ancestor => {
                            if (ancestor.rank && ancestor.name) {
                              taxonomy[ancestor.rank] = ancestor.name;
                            }
                          });
                        }
                        
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
                          console.log(`  ✅ ${genus}: ${taxonomy.kingdom} → ${taxonomy.family || taxonomy.order}`);
                          break;
                        }
                      }
                    }
                    await new Promise(resolve => setTimeout(resolve, 400));
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
                console.log(`  ❌ ${genus}: Invalid`);
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
          }
          
          await new Promise(resolve => setTimeout(resolve, 800));
        }
        
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    
    // Final progress
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
    
    console.log(`\nFinal Session: ${sessionSuccessful}/${sessionProcessed} successful`);
    console.log(`Total Progress: ${stats.total_processed}/1087 (${percentComplete}%)`);
    console.log(`Success Rate: ${stats.successful} (${successRate}%)`);
    
  } catch (error) {
    console.error('Processing error:', error.message);
  } finally {
    await pool.end();
  }
}

fixedClassification().catch(console.error);