#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function familyFocusedClassification() {
  console.log('Family-focused classification for unclassified genera...\n');
  
  let sessionProcessed = 0;
  let sessionSuccessful = 0;
  
  try {
    // Get unclassified genera from cache
    const result = await pool.query(`
      SELECT genus
      FROM inaturalist_classification_cache
      WHERE kingdom IS NULL OR kingdom = 'INVALID'
      ORDER BY genus ASC
      LIMIT 50
    `);

    console.log(`Found ${result.rows.length} unclassified genera`);
    
    if (result.rows.length === 0) {
      console.log('All genera classified!');
      return;
    }

    for (const row of result.rows) {
      const genus = row.genus;
      sessionProcessed++;
      
      console.log(`[${sessionProcessed}] Processing "${genus}"`);
      
      try {
        let taxonomyFound = false;
        
        // Strategy 1: Search as family first (many entries might be family names)
        const familySearchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(genus)}&rank=family&per_page=5`;
        const familyResponse = await fetch(familySearchUrl);
        
        if (familyResponse.ok) {
          const familyData = await familyResponse.json();
          
          if (familyData.results && familyData.results.length > 0) {
            for (const familyResult of familyData.results) {
              if (familyResult.name.toLowerCase() === genus.toLowerCase() ||
                  familyResult.name.toLowerCase().includes(genus.toLowerCase()) ||
                  genus.toLowerCase().includes(familyResult.name.toLowerCase())) {
                
                console.log(`    Found family match: ${familyResult.name} (ID: ${familyResult.id})`);
                
                // Get detailed taxonomy
                const detailUrl = `https://api.inaturalist.org/v1/taxa/${familyResult.id}`;
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
                    
                    if (taxonomy.kingdom && taxonomy.family) {
                      await pool.query(`
                        UPDATE inaturalist_classification_cache 
                        SET kingdom = $1, phylum = $2, class = $3, "order" = $4, family = $5, 
                            matched_rank = $6, search_term = $7, matched_taxon_name = $8, 
                            genus_from_api = $9, updated_at = NOW()
                        WHERE genus = $10
                      `, [
                        taxonomy.kingdom || null,
                        taxonomy.phylum || null,
                        taxonomy.class || null,
                        taxonomy.order || null,
                        taxonomy.family || null,
                        familyResult.rank || null,
                        genus,
                        familyResult.name || null,
                        taxonomy.genus || null,
                        genus
                      ]);
                      
                      sessionSuccessful++;
                      taxonomyFound = true;
                      console.log(`    ✅ SUCCESS via FAMILY: ${genus} → ${taxonomy.kingdom} → ${taxonomy.family}`);
                      break;
                    }
                  }
                }
                
                await new Promise(resolve => setTimeout(resolve, 400));
                break;
              }
            }
          }
        }
        
        // Strategy 2: If family search failed, try broader search with multiple ranks
        if (!taxonomyFound) {
          const ranks = ['order', 'subgenus', 'section', 'tribe', 'subfamily'];
          
          for (const rank of ranks) {
            if (taxonomyFound) break;
            
            const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(genus)}&rank=${rank}&per_page=3`;
            const response = await fetch(searchUrl);
            
            if (response.ok) {
              const data = await response.json();
              
              if (data.results && data.results.length > 0) {
                for (const searchResult of data.results) {
                  if (searchResult.name.toLowerCase() === genus.toLowerCase()) {
                    
                    console.log(`    Found match at ${rank} level: ${searchResult.name}`);
                    
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
                            UPDATE inaturalist_classification_cache 
                            SET kingdom = $1, phylum = $2, class = $3, "order" = $4, family = $5, 
                                matched_rank = $6, search_term = $7, matched_taxon_name = $8, 
                                genus_from_api = $9, updated_at = NOW()
                            WHERE genus = $10
                          `, [
                            taxonomy.kingdom || null,
                            taxonomy.phylum || null,
                            taxonomy.class || null,
                            taxonomy.order || null,
                            taxonomy.family || null,
                            searchResult.rank || null,
                            genus,
                            searchResult.name || null,
                            taxonomy.genus || null,
                            genus
                          ]);
                          
                          sessionSuccessful++;
                          taxonomyFound = true;
                          console.log(`    ✅ SUCCESS via ${rank.toUpperCase()}: ${genus} → ${taxonomy.kingdom} → ${taxonomy.family || taxonomy.order}`);
                          break;
                        }
                      }
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 400));
                    break;
                  }
                }
              }
            }
            
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
        
        // Strategy 3: Fuzzy matching for partial family names
        if (!taxonomyFound) {
          // Try searching for families that contain the genus term
          const fuzzyFamilyUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(genus)}&rank=family&per_page=10`;
          const fuzzyResponse = await fetch(fuzzyFamilyUrl);
          
          if (fuzzyResponse.ok) {
            const fuzzyData = await fuzzyResponse.json();
            
            if (fuzzyData.results && fuzzyData.results.length > 0) {
              for (const result of fuzzyData.results) {
                if (result.name.toLowerCase().includes(genus.toLowerCase().substring(0, Math.min(6, genus.length)))) {
                  
                  console.log(`    Found fuzzy family match: ${result.name}`);
                  
                  const detailUrl = `https://api.inaturalist.org/v1/taxa/${result.id}`;
                  const detailResponse = await fetch(detailUrl);
                  
                  if (detailResponse.ok) {
                    const detailData = await detailResponse.json();
                    const taxon = detailData.results?.[0];
                    
                    if (taxon && taxon.ancestors) {
                      const taxonomy = {};
                      
                      if (taxon.rank && taxon.name) {
                        taxonomy[taxon.rank] = taxon.name;
                      }
                      
                      taxon.ancestors.forEach(ancestor => {
                        if (ancestor.rank && ancestor.name) {
                          taxonomy[ancestor.rank] = ancestor.name;
                        }
                      });
                      
                      if (taxonomy.kingdom && taxonomy.family) {
                        await pool.query(`
                          UPDATE inaturalist_classification_cache 
                          SET kingdom = $1, phylum = $2, class = $3, "order" = $4, family = $5, 
                              matched_rank = $6, search_term = $7, matched_taxon_name = $8, 
                              genus_from_api = $9, updated_at = NOW()
                          WHERE genus = $10
                        `, [
                          taxonomy.kingdom || null,
                          taxonomy.phylum || null,
                          taxonomy.class || null,
                          taxonomy.order || null,
                          taxonomy.family || null,
                          result.rank || null,
                          genus,
                          result.name || null,
                          taxonomy.genus || null,
                          genus
                        ]);
                        
                        sessionSuccessful++;
                        taxonomyFound = true;
                        console.log(`    ✅ SUCCESS via FUZZY FAMILY: ${genus} → ${taxonomy.kingdom} → ${taxonomy.family}`);
                        break;
                      }
                    }
                  }
                  
                  await new Promise(resolve => setTimeout(resolve, 400));
                  break;
                }
              }
            }
          }
        }
        
        if (!taxonomyFound) {
          await pool.query(`
            UPDATE inaturalist_classification_cache 
            SET kingdom = 'INVALID', updated_at = NOW()
            WHERE genus = $1
          `, [genus]);
          console.log(`    ❌ No taxonomy found across all strategies`);
        }
        
      } catch (error) {
        await pool.query(`
          UPDATE inaturalist_classification_cache 
          SET kingdom = 'INVALID', updated_at = NOW()
          WHERE genus = $1
        `, [genus]);
        console.log(`    ❌ Error: ${error.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    
    // Check final progress
    const progressResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN updated_at IS NOT NULL THEN 1 END) as processed,
        COUNT(CASE WHEN kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as successful,
        ROUND(COUNT(CASE WHEN updated_at IS NOT NULL THEN 1 END) * 100.0 / COUNT(*), 1) as percent_complete,
        ROUND(COUNT(CASE WHEN kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) * 100.0 / NULLIF(COUNT(CASE WHEN updated_at IS NOT NULL THEN 1 END), 0), 1) as success_rate
      FROM inaturalist_classification_cache
    `);
    
    const stats = progressResult.rows[0];
    
    console.log(`\nSession Results: ${sessionSuccessful}/${sessionProcessed} successful`);
    console.log(`Total Progress: ${stats.processed}/${stats.total} (${stats.percent_complete}%)`);
    console.log(`Success Rate: ${stats.successful} (${stats.success_rate}%)`);
    
  } catch (error) {
    console.error('Processing error:', error.message);
  } finally {
    await pool.end();
  }
}

familyFocusedClassification().catch(console.error);