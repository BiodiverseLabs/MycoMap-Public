#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function fixNectriaceae() {
  console.log('Fixing Nectriaceae family classification...\n');
  
  try {
    // Check current state
    const currentResult = await pool.query(`
      SELECT * FROM inaturalist_classification_cache 
      WHERE search_term ILIKE '%nectriaceae%'
    `);
    
    if (currentResult.rows.length > 0) {
      const current = currentResult.rows[0];
      console.log('Current state:', JSON.stringify(current, null, 2));
    }
    
    // Search for Nectriaceae family in iNaturalist
    const searchUrl = `https://api.inaturalist.org/v1/taxa?q=Nectriaceae&rank=family&per_page=5`;
    console.log(`Searching: ${searchUrl}`);
    
    const response = await fetch(searchUrl);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`Found ${data.results?.length || 0} results`);
      
      if (data.results && data.results.length > 0) {
        // Look for exact match
        const exactMatch = data.results.find(result => 
          result.name.toLowerCase() === 'nectriaceae'
        );
        
        if (exactMatch) {
          console.log(`Found exact match: ${exactMatch.name} (ID: ${exactMatch.id})`);
          
          // Get detailed taxonomy
          const detailUrl = `https://api.inaturalist.org/v1/taxa/${exactMatch.id}`;
          const detailResponse = await fetch(detailUrl);
          
          if (detailResponse.ok) {
            const detailData = await detailResponse.json();
            const taxon = detailData.results?.[0];
            
            if (taxon) {
              console.log('Taxon details:', JSON.stringify(taxon, null, 2));
              
              const taxonomy = {};
              
              // Add the taxon itself
              if (taxon.rank && taxon.name) {
                taxonomy[taxon.rank] = taxon.name;
              }
              
              // Add ancestors
              if (taxon.ancestors && taxon.ancestors.length > 0) {
                taxon.ancestors.forEach(ancestor => {
                  if (ancestor.rank && ancestor.name) {
                    taxonomy[ancestor.rank] = ancestor.name;
                  }
                });
              }
              
              console.log('Extracted taxonomy:');
              console.log(`  Kingdom: ${taxonomy.kingdom || 'N/A'}`);
              console.log(`  Phylum: ${taxonomy.phylum || 'N/A'}`);
              console.log(`  Class: ${taxonomy.class || 'N/A'}`);
              console.log(`  Order: ${taxonomy.order || 'N/A'}`);
              console.log(`  Family: ${taxonomy.family || 'N/A'}`);
              console.log(`  Genus: ${taxonomy.genus || 'N/A'}`);
              
              if (taxonomy.kingdom && taxonomy.family) {
                // Update or insert the correct classification
                const upsertResult = await pool.query(`
                  INSERT INTO inaturalist_classification_cache 
                  (search_term, kingdom, phylum, class, "order", family, matched_rank, matched_taxon_name, genus_from_api, updated_at)
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                  ON CONFLICT (search_term) 
                  DO UPDATE SET 
                    kingdom = EXCLUDED.kingdom,
                    phylum = EXCLUDED.phylum,
                    class = EXCLUDED.class,
                    "order" = EXCLUDED."order",
                    family = EXCLUDED.family,
                    matched_rank = EXCLUDED.matched_rank,
                    matched_taxon_name = EXCLUDED.matched_taxon_name,
                    genus_from_api = EXCLUDED.genus_from_api,
                    updated_at = NOW()
                `, [
                  'nectriaceae',
                  taxonomy.kingdom,
                  taxonomy.phylum || null,
                  taxonomy.class || null,
                  taxonomy.order || null,
                  taxonomy.family,
                  exactMatch.rank,
                  exactMatch.name,
                  taxonomy.genus || null
                ]);
                
                console.log(`✅ SUCCESS: Updated Nectriaceae classification`);
                console.log(`   ${taxonomy.kingdom} → ${taxonomy.order} → ${taxonomy.family}`);
              } else {
                console.log(`❌ ERROR: Incomplete taxonomy data`);
              }
            }
          }
        } else {
          console.log(`❌ ERROR: No exact match found for Nectriaceae`);
          // Show what was found
          data.results.forEach((result, index) => {
            console.log(`[${index + 1}] ${result.name} (${result.rank})`);
          });
        }
      }
    } else {
      console.log(`❌ ERROR: API request failed (${response.status})`);
    }
    
    // Check final state
    const finalResult = await pool.query(`
      SELECT * FROM inaturalist_classification_cache 
      WHERE search_term ILIKE '%nectriaceae%'
    `);
    
    if (finalResult.rows.length > 0) {
      console.log('\nFinal state:');
      const final = finalResult.rows[0];
      console.log(`Search term: ${final.search_term}`);
      console.log(`Classification: ${final.kingdom} → ${final.family}`);
      console.log(`Rank: ${final.matched_rank}`);
      console.log(`Name: ${final.matched_taxon_name}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixNectriaceae().catch(console.error);