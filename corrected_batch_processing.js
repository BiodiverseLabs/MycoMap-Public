#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function correctedBatchProcessing() {
  console.log('Correcting non-fungal classifications and incomplete entries...\n');
  
  let corrected = 0;
  let removed = 0;
  let verified = 0;
  
  try {
    // 1. Handle non-fungal entries that shouldn't be in fungal database
    console.log('=== Reviewing Non-Fungal Classifications ===');
    
    const nonFungalResult = await pool.query(`
      SELECT search_term, kingdom, matched_taxon_name, family
      FROM inaturalist_classification_cache 
      WHERE kingdom != 'Fungi' AND kingdom != 'INVALID'
      ORDER BY search_term
    `);
    
    console.log(`Found ${nonFungalResult.rows.length} non-fungal entries`);
    
    for (const row of nonFungalResult.rows) {
      const { search_term, kingdom, matched_taxon_name, family } = row;
      
      console.log(`\nReviewing "${search_term}" → ${kingdom} (${matched_taxon_name})`);
      
      // Check if this might actually be a fungal genus with similar name
      const fungalSearchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(search_term)}&iconic_taxa=fungi&per_page=5`;
      const response = await fetch(fungalSearchUrl);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
          // Look for exact fungal match
          const fungalMatch = data.results.find(result => 
            result.name.toLowerCase() === search_term.toLowerCase() && 
            result.iconic_taxon_name === 'Fungi'
          );
          
          if (fungalMatch) {
            console.log(`  Found fungal version: ${fungalMatch.name} (ID: ${fungalMatch.id})`);
            
            // Get detailed taxonomy for fungal version
            const detailUrl = `https://api.inaturalist.org/v1/taxa/${fungalMatch.id}`;
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
                
                if (taxonomy.kingdom === 'Fungi' && taxonomy.family) {
                  // Update with correct fungal classification
                  await pool.query(`
                    UPDATE inaturalist_classification_cache 
                    SET kingdom = $1, phylum = $2, class = $3, "order" = $4, family = $5, 
                        matched_rank = $6, matched_taxon_name = $7, genus_from_api = $8, 
                        updated_at = NOW()
                    WHERE search_term = $9
                  `, [
                    taxonomy.kingdom,
                    taxonomy.phylum || null,
                    taxonomy.class || null,
                    taxonomy.order || null,
                    taxonomy.family,
                    fungalMatch.rank,
                    fungalMatch.name,
                    taxonomy.genus || null,
                    search_term
                  ]);
                  
                  console.log(`  ✅ CORRECTED: Updated to fungal classification → ${taxonomy.family}`);
                  corrected++;
                } else {
                  console.log(`  ❌ Fungal match lacks complete taxonomy`);
                }
              }
            }
          } else {
            console.log(`  ℹ️ No exact fungal match found - likely correct non-fungal classification`);
            
            // Remove non-fungal entries from fungal database
            await pool.query(`
              DELETE FROM inaturalist_classification_cache 
              WHERE search_term = $1 AND kingdom != 'Fungi'
            `, [search_term]);
            
            console.log(`  🗑️ REMOVED: Non-fungal entry removed from fungal cache`);
            removed++;
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 2. Handle entries with missing family information
    console.log('\n=== Reviewing Incomplete Fungal Classifications ===');
    
    const incompleteResult = await pool.query(`
      SELECT search_term, matched_rank, matched_taxon_name, "order"
      FROM inaturalist_classification_cache 
      WHERE kingdom = 'Fungi' AND family IS NULL
      ORDER BY search_term
    `);
    
    console.log(`Found ${incompleteResult.rows.length} incomplete entries`);
    
    for (const row of incompleteResult.rows) {
      const { search_term, matched_rank, matched_taxon_name, order } = row;
      
      console.log(`\nRe-checking "${search_term}" for family classification`);
      
      // Re-search with broader scope
      const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(search_term)}&iconic_taxa=fungi&per_page=10`;
      const response = await fetch(searchUrl);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
          // Look for exact match or best match
          let bestMatch = data.results.find(result => 
            result.name.toLowerCase() === search_term.toLowerCase()
          );
          
          if (!bestMatch && data.results.length > 0) {
            bestMatch = data.results[0]; // Take first result as fallback
          }
          
          if (bestMatch) {
            const detailUrl = `https://api.inaturalist.org/v1/taxa/${bestMatch.id}`;
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
                
                if (taxonomy.family) {
                  // Update with family information
                  await pool.query(`
                    UPDATE inaturalist_classification_cache 
                    SET family = $1, phylum = $2, class = $3, "order" = $4,
                        matched_rank = $5, matched_taxon_name = $6, genus_from_api = $7,
                        updated_at = NOW()
                    WHERE search_term = $8
                  `, [
                    taxonomy.family,
                    taxonomy.phylum || null,
                    taxonomy.class || null,
                    taxonomy.order || null,
                    bestMatch.rank,
                    bestMatch.name,
                    taxonomy.genus || null,
                    search_term
                  ]);
                  
                  console.log(`  ✅ COMPLETED: Added family ${taxonomy.family}`);
                  corrected++;
                } else {
                  console.log(`  ⚠️ Still no family found - may be valid higher rank`);
                  verified++;
                }
              }
            }
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 3. Final verification statistics
    const finalStats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN kingdom = 'Fungi' THEN 1 END) as fungi_entries,
        COUNT(CASE WHEN kingdom = 'Fungi' AND family IS NOT NULL THEN 1 END) as complete_fungi,
        COUNT(CASE WHEN kingdom != 'Fungi' AND kingdom != 'INVALID' THEN 1 END) as non_fungi,
        ROUND(COUNT(CASE WHEN kingdom = 'Fungi' AND family IS NOT NULL THEN 1 END) * 100.0 / 
              COUNT(CASE WHEN kingdom = 'Fungi' THEN 1 END), 1) as completion_rate
      FROM inaturalist_classification_cache
    `);
    
    const stats = finalStats.rows[0];
    
    console.log(`\n=== CORRECTION SUMMARY ===`);
    console.log(`🔧 Entries Corrected: ${corrected}`);
    console.log(`🗑️ Non-fungal Entries Removed: ${removed}`);
    console.log(`✅ Entries Verified: ${verified}`);
    console.log(`📊 Final Statistics:`);
    console.log(`   Total Entries: ${stats.total}`);
    console.log(`   Fungal Entries: ${stats.fungi_entries}`);
    console.log(`   Complete Classifications: ${stats.complete_fungi}`);
    console.log(`   Non-fungal Entries: ${stats.non_fungi}`);
    console.log(`   Completion Rate: ${stats.completion_rate}%`);
    
  } catch (error) {
    console.error('Processing error:', error.message);
  } finally {
    await pool.end();
  }
}

correctedBatchProcessing().catch(console.error);