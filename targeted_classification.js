#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function targetedClassification() {
  console.log('Processing only genera that need classification...\n');
  
  let sessionProcessed = 0;
  let sessionSuccessful = 0;
  
  try {
    // Get genera from observations that actually need classification
    const result = await pool.query(`
      SELECT DISTINCT o.genus, COUNT(*) as observation_count
      FROM observations o
      WHERE o.genus IS NOT NULL 
        AND o.genus != ''
        AND ((o.family IS NULL OR o.family = '') OR (o."order" IS NULL OR o."order" = ''))
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
      GROUP BY o.genus
      ORDER BY observation_count DESC
      LIMIT 30
    `);

    console.log(`Found ${result.rows.length} genera that need classification`);
    
    if (result.rows.length === 0) {
      console.log('All needed genera already processed!');
      return;
    }

    for (const row of result.rows) {
      const genus = row.genus;
      const count = row.observation_count;
      
      sessionProcessed++;
      console.log(`[${sessionProcessed}] ${genus} (${count} observations)`);
      
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
                      console.log(`    ✅ ${genus}: ${taxonomy.kingdom} → ${taxonomy.family || taxonomy.order} (affects ${count} observations)`);
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
            console.log(`    ❌ ${genus}: No valid taxonomy (${count} observations remain incomplete)`);
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
        console.log(`    ❌ ${genus}: Error (${count} observations remain incomplete)`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    
    // Check how many observations this session helped classify
    const impactResult = await pool.query(`
      SELECT COUNT(*) as newly_classifiable_observations
      FROM observations o
      WHERE o.genus IN (
        SELECT genus FROM inaturalist_classification_cache 
        WHERE kingdom IS NOT NULL AND kingdom != 'INVALID'
        AND updated_at > NOW() - INTERVAL '1 hour'
      )
      AND ((o.family IS NULL OR o.family = '') OR (o."order" IS NULL OR o."order" = ''))
    `);
    
    const impact = impactResult.rows[0]?.newly_classifiable_observations || 0;
    
    console.log(`\nSession Results:`);
    console.log(`✅ ${sessionSuccessful}/${sessionProcessed} genera successfully classified`);
    console.log(`📊 ${impact} observations can now be auto-classified`);
    
  } catch (error) {
    console.error('Processing error:', error.message);
  } finally {
    await pool.end();
  }
}

targetedClassification().catch(console.error);