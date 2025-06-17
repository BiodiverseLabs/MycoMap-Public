#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function verifyClassifications() {
  console.log('Verifying classification accuracy for all search terms...\n');
  
  let verified = 0;
  let errors = 0;
  let corrections = 0;
  
  try {
    // Get all classified terms
    const result = await pool.query(`
      SELECT 
        search_term,
        matched_rank,
        matched_taxon_name,
        kingdom,
        family,
        genus_from_api
      FROM inaturalist_classification_cache 
      WHERE kingdom IS NOT NULL AND kingdom != 'INVALID'
      ORDER BY search_term
    `);

    console.log(`Verifying ${result.rows.length} classifications...\n`);
    
    for (const row of result.rows) {
      const { search_term, matched_rank, matched_taxon_name, kingdom, family, genus_from_api } = row;
      
      console.log(`[${verified + errors + 1}] Verifying "${search_term}"`);
      console.log(`   Cached: ${matched_rank} → ${matched_taxon_name} (${kingdom} → ${family})`);
      
      try {
        // Re-verify with iNaturalist API
        const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(search_term)}&per_page=5`;
        const response = await fetch(searchUrl);
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.results && data.results.length > 0) {
            // Look for exact match
            let apiMatch = null;
            for (const result of data.results) {
              if (result.name.toLowerCase() === search_term.toLowerCase()) {
                apiMatch = result;
                break;
              }
            }
            
            if (apiMatch) {
              // Get detailed taxonomy
              const detailUrl = `https://api.inaturalist.org/v1/taxa/${apiMatch.id}`;
              const detailResponse = await fetch(detailUrl);
              
              if (detailResponse.ok) {
                const detailData = await detailResponse.json();
                const taxon = detailData.results?.[0];
                
                if (taxon && taxon.ancestors) {
                  const apiTaxonomy = {};
                  
                  if (taxon.rank && taxon.name) {
                    apiTaxonomy[taxon.rank] = taxon.name;
                  }
                  
                  taxon.ancestors.forEach(ancestor => {
                    if (ancestor.rank && ancestor.name) {
                      apiTaxonomy[ancestor.rank] = ancestor.name;
                    }
                  });
                  
                  // Compare cached vs live API data
                  const cachedCorrect = (
                    apiMatch.rank === matched_rank &&
                    apiMatch.name === matched_taxon_name &&
                    apiTaxonomy.kingdom === kingdom &&
                    apiTaxonomy.family === family
                  );
                  
                  if (cachedCorrect) {
                    console.log(`   ✅ VERIFIED: Cached data matches live API`);
                    verified++;
                  } else {
                    console.log(`   ❌ MISMATCH DETECTED:`);
                    console.log(`      API: ${apiMatch.rank} → ${apiMatch.name} (${apiTaxonomy.kingdom} → ${apiTaxonomy.family})`);
                    console.log(`      Cache: ${matched_rank} → ${matched_taxon_name} (${kingdom} → ${family})`);
                    
                    // Update cache with correct data
                    await pool.query(`
                      UPDATE inaturalist_classification_cache 
                      SET kingdom = $1, phylum = $2, class = $3, "order" = $4, family = $5, 
                          matched_rank = $6, matched_taxon_name = $7, genus_from_api = $8, 
                          updated_at = NOW()
                      WHERE search_term = $9
                    `, [
                      apiTaxonomy.kingdom || null,
                      apiTaxonomy.phylum || null,
                      apiTaxonomy.class || null,
                      apiTaxonomy.order || null,
                      apiTaxonomy.family || null,
                      apiMatch.rank || null,
                      apiMatch.name || null,
                      apiTaxonomy.genus || null,
                      search_term
                    ]);
                    
                    console.log(`   🔧 CORRECTED: Updated cache with live API data`);
                    corrections++;
                  }
                }
              }
            } else {
              console.log(`   ⚠️  WARNING: No exact match found in current API results`);
              errors++;
            }
          } else {
            console.log(`   ❌ ERROR: No API results found`);
            errors++;
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 600));
        
      } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        errors++;
      }
    }
    
    console.log(`\n=== VERIFICATION SUMMARY ===`);
    console.log(`✅ Verified Correct: ${verified}`);
    console.log(`🔧 Corrected: ${corrections}`);
    console.log(`❌ Errors/Issues: ${errors}`);
    console.log(`📊 Accuracy Rate: ${Math.round(verified / (verified + corrections + errors) * 100)}%`);
    
  } catch (error) {
    console.error('Verification error:', error.message);
  } finally {
    await pool.end();
  }
}

verifyClassifications().catch(console.error);