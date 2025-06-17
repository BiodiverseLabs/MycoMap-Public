#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function rankAgnosticClassification() {
  console.log('Rank-agnostic classification: determining actual taxonomic ranks...\n');
  
  let sessionProcessed = 0;
  let sessionSuccessful = 0;
  
  try {
    // Get unclassified search terms from cache
    const result = await pool.query(`
      SELECT search_term
      FROM inaturalist_classification_cache
      WHERE kingdom IS NULL OR kingdom = 'INVALID'
      ORDER BY search_term ASC
      LIMIT 30
    `);

    console.log(`Found ${result.rows.length} unclassified search terms`);
    
    if (result.rows.length === 0) {
      console.log('All search terms classified!');
      return;
    }

    for (const row of result.rows) {
      const searchTerm = row.search_term;
      sessionProcessed++;
      
      console.log(`[${sessionProcessed}] Searching "${searchTerm}" across all ranks`);
      
      try {
        let taxonomyFound = false;
        
        // Search across all possible ranks without restricting
        const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchTerm)}&per_page=10`;
        const response = await fetch(searchUrl);
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.results && data.results.length > 0) {
            // Look for exact name match first
            let bestMatch = null;
            
            for (const result of data.results) {
              if (result.name.toLowerCase() === searchTerm.toLowerCase()) {
                bestMatch = result;
                break;
              }
            }
            
            // If no exact match, try partial matches for families/higher ranks
            if (!bestMatch) {
              for (const result of data.results) {
                if (result.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    searchTerm.toLowerCase().includes(result.name.toLowerCase())) {
                  bestMatch = result;
                  break;
                }
              }
            }
            
            if (bestMatch) {
              console.log(`    Found match: ${bestMatch.name} (Rank: ${bestMatch.rank}, ID: ${bestMatch.id})`);
              
              // Get detailed taxonomy
              const detailUrl = `https://api.inaturalist.org/v1/taxa/${bestMatch.id}`;
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
                  
                  console.log(`    Complete taxonomy extracted:`);
                  console.log(`      Kingdom: ${taxonomy.kingdom || 'N/A'}`);
                  console.log(`      Phylum: ${taxonomy.phylum || 'N/A'}`);
                  console.log(`      Class: ${taxonomy.class || 'N/A'}`);
                  console.log(`      Order: ${taxonomy.order || 'N/A'}`);
                  console.log(`      Family: ${taxonomy.family || 'N/A'}`);
                  console.log(`      Genus: ${taxonomy.genus || 'N/A'}`);
                  console.log(`      Species: ${taxonomy.species || 'N/A'}`);
                  
                  // Check for minimum taxonomy (kingdom + family/order)
                  if (taxonomy.kingdom && (taxonomy.family || taxonomy.order)) {
                    await pool.query(`
                      UPDATE inaturalist_classification_cache 
                      SET kingdom = $1, phylum = $2, class = $3, "order" = $4, family = $5, 
                          matched_rank = $6, search_term = $7, matched_taxon_name = $8, 
                          genus_from_api = $9, actual_rank = $10, updated_at = NOW()
                      WHERE search_term = $11
                    `, [
                      taxonomy.kingdom || null,
                      taxonomy.phylum || null,
                      taxonomy.class || null,
                      taxonomy.order || null,
                      taxonomy.family || null,
                      bestMatch.rank || null,
                      searchTerm,
                      bestMatch.name || null,
                      taxonomy.genus || null,
                      bestMatch.rank || null,  // actual_rank
                      searchTerm
                    ]);
                    
                    sessionSuccessful++;
                    taxonomyFound = true;
                    console.log(`    ✅ SUCCESS: "${searchTerm}" is a ${bestMatch.rank} → ${taxonomy.kingdom} → ${taxonomy.family || taxonomy.order}`);
                  } else {
                    console.log(`    ❌ Incomplete taxonomy - missing kingdom or family/order`);
                  }
                }
              }
              
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        }
        
        if (!taxonomyFound) {
          await pool.query(`
            UPDATE inaturalist_classification_cache 
            SET kingdom = 'INVALID', updated_at = NOW()
            WHERE search_term = $1
          `, [searchTerm]);
          console.log(`    ❌ No valid taxonomy found for "${searchTerm}"`);
        }
        
      } catch (error) {
        await pool.query(`
          UPDATE inaturalist_classification_cache 
          SET kingdom = 'INVALID', updated_at = NOW()
          WHERE search_term = $1
        `, [searchTerm]);
        console.log(`    ❌ Error processing "${searchTerm}": ${error.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Show rank distribution of successful matches
    const rankDistribution = await pool.query(`
      SELECT actual_rank, COUNT(*) as count
      FROM inaturalist_classification_cache 
      WHERE kingdom IS NOT NULL AND kingdom != 'INVALID' AND actual_rank IS NOT NULL
      GROUP BY actual_rank
      ORDER BY count DESC
    `);
    
    console.log(`\nRank Distribution of Successful Classifications:`);
    rankDistribution.rows.forEach(row => {
      console.log(`  ${row.actual_rank}: ${row.count} terms`);
    });
    
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

rankAgnosticClassification().catch(console.error);