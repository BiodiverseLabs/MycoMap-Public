#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function enhancedClassification() {
  console.log('Enhanced classification with multiple taxonomic ranks...\n');
  
  let sessionProcessed = 0;
  let sessionSuccessful = 0;
  
  try {
    // Get unprocessed genera from cache
    const result = await pool.query(`
      SELECT genus
      FROM inaturalist_classification_cache
      WHERE updated_at IS NULL
      ORDER BY genus ASC
      LIMIT 30
    `);

    console.log(`Found ${result.rows.length} unprocessed genera`);
    
    if (result.rows.length === 0) {
      console.log('All genera processed!');
      return;
    }

    for (const row of result.rows) {
      const genus = row.genus;
      sessionProcessed++;
      
      console.log(`[${sessionProcessed}] Processing "${genus}"`);
      
      try {
        let taxonomyFound = false;
        
        // Search multiple ranks: genus, subgenus, section, family
        const ranks = ['genus', 'subgenus', 'section', 'family'];
        
        for (const rank of ranks) {
          if (taxonomyFound) break;
          
          const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(genus)}&rank=${rank}&per_page=5`;
          const response = await fetch(searchUrl);
          
          if (response.ok) {
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
              // Look for exact name match or close match
              for (const searchResult of data.results) {
                if (searchResult.name.toLowerCase() === genus.toLowerCase() ||
                    (rank === 'family' && searchResult.name.toLowerCase().includes(genus.toLowerCase()))) {
                  
                  console.log(`    Found match at ${rank} level: ${searchResult.name} (ID: ${searchResult.id})`);
                  
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
                      
                      console.log(`    Extracted taxonomy:`);
                      console.log(`      Kingdom: ${taxonomy.kingdom || 'N/A'}`);
                      console.log(`      Phylum: ${taxonomy.phylum || 'N/A'}`);
                      console.log(`      Class: ${taxonomy.class || 'N/A'}`);
                      console.log(`      Order: ${taxonomy.order || 'N/A'}`);
                      console.log(`      Family: ${taxonomy.family || 'N/A'}`);
                      console.log(`      Genus: ${taxonomy.genus || 'N/A'}`);
                      
                      // Check for minimum taxonomy (kingdom + family/order)
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
                        console.log(`    ✅ SUCCESS: ${genus} classified via ${rank} → ${taxonomy.kingdom} → ${taxonomy.family || taxonomy.order}`);
                        break;
                      } else {
                        console.log(`    ❌ Incomplete taxonomy - missing kingdom or family/order`);
                      }
                    }
                  }
                  
                  await new Promise(resolve => setTimeout(resolve, 400));
                  break; // Found a match for this rank, don't check other results
                }
              }
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        if (!taxonomyFound) {
          await pool.query(`
            UPDATE inaturalist_classification_cache 
            SET kingdom = 'INVALID', updated_at = NOW()
            WHERE genus = $1
          `, [genus]);
          console.log(`    ❌ No valid taxonomy found across all ranks`);
        }
        
      } catch (error) {
        await pool.query(`
          UPDATE inaturalist_classification_cache 
          SET kingdom = 'INVALID', updated_at = NOW()
          WHERE genus = $1
        `, [genus]);
        console.log(`    ❌ Error processing ${genus}: ${error.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    
    // Check progress
    const progressResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN updated_at IS NOT NULL THEN 1 END) as processed,
        COUNT(CASE WHEN kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as successful,
        ROUND(COUNT(CASE WHEN updated_at IS NOT NULL THEN 1 END) * 100.0 / COUNT(*), 1) as percent_complete
      FROM inaturalist_classification_cache
    `);
    
    const stats = progressResult.rows[0];
    const successRate = Math.round(stats.successful / stats.processed * 100);
    
    console.log(`\nSession Results: ${sessionSuccessful}/${sessionProcessed} successful`);
    console.log(`Total Progress: ${stats.processed}/${stats.total} (${stats.percent_complete}%)`);
    console.log(`Success Rate: ${stats.successful} (${successRate}%)`);
    
  } catch (error) {
    console.error('Processing error:', error.message);
  } finally {
    await pool.end();
  }
}

enhancedClassification().catch(console.error);