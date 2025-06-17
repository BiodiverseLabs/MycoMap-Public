#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function fetchTaxonomyFromAPI(searchTerm, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Search for the term across multiple ranks
      const ranks = ['genus', 'subgenus', 'section', 'family', 'subfamily', 'tribe'];
      
      for (const rank of ranks) {
        const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchTerm)}&rank=${rank}&per_page=1`;
        
        // Add retry logic for each API call
        let searchResponse;
        for (let apiAttempt = 1; apiAttempt <= 3; apiAttempt++) {
          try {
            searchResponse = await fetch(searchUrl, {
              timeout: 10000, // 10 second timeout
              headers: {
                'User-Agent': 'MycoMap-Research/1.0 (contact@mycomap.com)'
              }
            });
            
            if (searchResponse.ok) break;
            if (apiAttempt < 3) await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay before retry
          } catch (fetchError) {
            if (apiAttempt === 3) throw fetchError;
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay before retry
          }
        }
        
        if (!searchResponse || !searchResponse.ok) {
          continue; // Try next rank
        }
        
        const searchData = await searchResponse.json();
      
      if (!searchData.results || searchData.results.length === 0) {
        continue; // Try next rank
      }
      
      const taxon = searchData.results[0];
      
      // Get full taxon details for complete taxonomy with retry logic
      const detailUrl = `https://api.inaturalist.org/v1/taxa/${taxon.id}`;
      let detailResponse;
      for (let detailAttempt = 1; detailAttempt <= 3; detailAttempt++) {
        try {
          detailResponse = await fetch(detailUrl, {
            timeout: 10000,
            headers: {
              'User-Agent': 'MycoMap-Research/1.0 (contact@mycomap.com)'
            }
          });
          
          if (detailResponse.ok) break;
          if (detailAttempt < 3) await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (fetchError) {
          if (detailAttempt === 3) throw fetchError;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      if (!detailResponse || !detailResponse.ok) {
        continue; // Try next rank
      }
      
      const detailData = await detailResponse.json();
      const fullTaxon = detailData.results[0];
      
      // Extract complete taxonomy from ancestors
      const ancestors = fullTaxon.ancestors || [];
      const allTaxa = [...ancestors, fullTaxon];
      
      const taxonomy = {
        kingdom: null, phylum: null, subphylum: null, superclass: null,
        class: null, subclass: null, infraclass: null, superorder: null,
        order: null, suborder: null, infraorder: null, parvorder: null,
        superfamily: null, family: null, subfamily: null, tribe: null,
        subtribe: null, genusFromApi: null, subgenus: null, section: null,
        subsection: null, species: null, subspecies: null, variety: null, form: null
      };
      
      // Map all available ranks
      for (const ancestor of allTaxa) {
        switch (ancestor.rank) {
          case 'kingdom': taxonomy.kingdom = ancestor.name; break;
          case 'phylum': taxonomy.phylum = ancestor.name; break;
          case 'subphylum': taxonomy.subphylum = ancestor.name; break;
          case 'superclass': taxonomy.superclass = ancestor.name; break;
          case 'class': taxonomy.class = ancestor.name; break;
          case 'subclass': taxonomy.subclass = ancestor.name; break;
          case 'infraclass': taxonomy.infraclass = ancestor.name; break;
          case 'superorder': taxonomy.superorder = ancestor.name; break;
          case 'order': taxonomy.order = ancestor.name; break;
          case 'suborder': taxonomy.suborder = ancestor.name; break;
          case 'infraorder': taxonomy.infraorder = ancestor.name; break;
          case 'parvorder': taxonomy.parvorder = ancestor.name; break;
          case 'superfamily': taxonomy.superfamily = ancestor.name; break;
          case 'family': taxonomy.family = ancestor.name; break;
          case 'subfamily': taxonomy.subfamily = ancestor.name; break;
          case 'tribe': taxonomy.tribe = ancestor.name; break;
          case 'subtribe': taxonomy.subtribe = ancestor.name; break;
          case 'genus': taxonomy.genusFromApi = ancestor.name; break;
          case 'subgenus': taxonomy.subgenus = ancestor.name; break;
          case 'section': taxonomy.section = ancestor.name; break;
          case 'subsection': taxonomy.subsection = ancestor.name; break;
          case 'species': taxonomy.species = ancestor.name; break;
          case 'subspecies': taxonomy.subspecies = ancestor.name; break;
          case 'variety': taxonomy.variety = ancestor.name; break;
          case 'form': taxonomy.form = ancestor.name; break;
        }
      }
      
      return {
        ...taxonomy,
        matchedRank: taxon.rank,
        searchTerm: searchTerm,
        matchedTaxonName: taxon.name,
        inatTaxonId: taxon.id,
        observationCount: taxon.observations_count || 0,
        isActive: taxon.is_active !== false,
        apiResponse: JSON.stringify(detailData),
        success: taxonomy.kingdom && taxonomy.family // At minimum need kingdom and family
      };
    }
    
      return { error: 'No results found' };
      
    } catch (error) {
      if (attempt === maxRetries) {
        return { error: `Failed after ${maxRetries} attempts: ${error.message}` };
      }
      console.log(`  → Attempt ${attempt} failed: ${error.message}, retrying in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5s delay before full retry
    }
  }
  
  return { error: 'Max retries exceeded' };
}

function escapeSqlString(str) {
  if (!str) return 'NULL';
  return `'${str.replace(/'/g, "''")}'`;
}

async function enhancedCacheBackfill() {
  console.log('Starting enhanced cache backfill with complete taxonomy and rank matching...\n');
  
  try {
    // Don't clear existing entries, just identify what needs processing
    console.log('Identifying genera that need enhanced processing...\n');
    
    // Get ALL distinct genera that need classification from observations
    const result = await pool.query(`
      SELECT DISTINCT genus 
      FROM observations 
      WHERE genus IS NOT NULL 
        AND genus != ''
        AND genus NOT LIKE '%http%'
        AND genus NOT LIKE '%aceae'
        AND genus NOT LIKE '%ales'
        AND genus NOT LIKE '%mycota'
        AND genus NOT LIKE '%ineae'
        AND genus NOT LIKE '% %'
        AND LENGTH(genus) >= 3
        AND genus != 'fungi'
        AND genus NOT IN (
          SELECT genus FROM inaturalist_classification_cache 
          WHERE matched_rank IS NOT NULL AND kingdom IS NOT NULL AND family IS NOT NULL AND kingdom != 'INVALID'
        )
      ORDER BY genus ASC
    `);
    
    const genera = result.rows.map(row => row.genus);
    console.log(`Found ${genera.length} genera needing classification lookup (processing ALL genera)\n`);
    
    if (genera.length === 0) {
      console.log('All genera in observations already have complete classifications!');
      return;
    }
    
    let successCount = 0;
    let failCount = 0;
    let invalidCount = 0;
    
    for (let i = 0; i < genera.length; i++) {
      const genus = genera[i];
      
      console.log(`[${i + 1}/${genera.length}] Processing "${genus}"`);
      
      // Fetch enhanced taxonomy from API
      const taxonomy = await fetchTaxonomyFromAPI(genus);
      
      if (taxonomy.error) {
        console.log(`  ✗ ${taxonomy.error}`);
        failCount++;
        
        // Mark as invalid if not found
        if (taxonomy.error === 'No results found') {
          await pool.query(`
            INSERT INTO inaturalist_classification_cache 
            (genus, search_term, kingdom, family, matched_rank, lookup_count) 
            VALUES ($1, $2, 'INVALID', 'INVALID', 'none', 1)
            ON CONFLICT (genus) DO UPDATE SET
              kingdom = 'INVALID', family = 'INVALID', 
              lookup_count = inaturalist_classification_cache.lookup_count + 1, 
              updated_at = NOW()
          `, [genus, genus]);
          invalidCount++;
          console.log(`  → Marked as INVALID`);
        }
        
      } else if (taxonomy.success) {
        // Insert/update with complete enhanced taxonomy
        const sql = `
          INSERT INTO inaturalist_classification_cache 
          (genus, search_term, kingdom, phylum, subphylum, superclass, class, subclass, infraclass,
           superorder, "order", suborder, infraorder, parvorder, superfamily, family, subfamily, 
           tribe, subtribe, genus_from_api, subgenus, section, subsection, species, subspecies, 
           variety, form, matched_rank, matched_taxon_name, inat_taxon_id, observation_count, 
           is_active, api_response, lookup_count)
          VALUES ($1, $2, ${escapeSqlString(taxonomy.kingdom)}, ${escapeSqlString(taxonomy.phylum)}, 
                  ${escapeSqlString(taxonomy.subphylum)}, ${escapeSqlString(taxonomy.superclass)},
                  ${escapeSqlString(taxonomy.class)}, ${escapeSqlString(taxonomy.subclass)}, 
                  ${escapeSqlString(taxonomy.infraclass)}, ${escapeSqlString(taxonomy.superorder)},
                  ${escapeSqlString(taxonomy.order)}, ${escapeSqlString(taxonomy.suborder)}, 
                  ${escapeSqlString(taxonomy.infraorder)}, ${escapeSqlString(taxonomy.parvorder)},
                  ${escapeSqlString(taxonomy.superfamily)}, ${escapeSqlString(taxonomy.family)}, 
                  ${escapeSqlString(taxonomy.subfamily)}, ${escapeSqlString(taxonomy.tribe)},
                  ${escapeSqlString(taxonomy.subtribe)}, ${escapeSqlString(taxonomy.genusFromApi)}, 
                  ${escapeSqlString(taxonomy.subgenus)}, ${escapeSqlString(taxonomy.section)},
                  ${escapeSqlString(taxonomy.subsection)}, ${escapeSqlString(taxonomy.species)}, 
                  ${escapeSqlString(taxonomy.subspecies)}, ${escapeSqlString(taxonomy.variety)},
                  ${escapeSqlString(taxonomy.form)}, ${escapeSqlString(taxonomy.matchedRank)}, 
                  ${escapeSqlString(taxonomy.matchedTaxonName)}, $3, $4, $5, $6, 1)
          ON CONFLICT (genus) DO UPDATE SET
            kingdom = ${escapeSqlString(taxonomy.kingdom)}, 
            phylum = ${escapeSqlString(taxonomy.phylum)},
            subphylum = ${escapeSqlString(taxonomy.subphylum)},
            superclass = ${escapeSqlString(taxonomy.superclass)},
            class = ${escapeSqlString(taxonomy.class)},
            subclass = ${escapeSqlString(taxonomy.subclass)},
            infraclass = ${escapeSqlString(taxonomy.infraclass)},
            superorder = ${escapeSqlString(taxonomy.superorder)},
            "order" = ${escapeSqlString(taxonomy.order)},
            suborder = ${escapeSqlString(taxonomy.suborder)},
            infraorder = ${escapeSqlString(taxonomy.infraorder)},
            parvorder = ${escapeSqlString(taxonomy.parvorder)},
            superfamily = ${escapeSqlString(taxonomy.superfamily)},
            family = ${escapeSqlString(taxonomy.family)},
            subfamily = ${escapeSqlString(taxonomy.subfamily)},
            tribe = ${escapeSqlString(taxonomy.tribe)},
            subtribe = ${escapeSqlString(taxonomy.subtribe)},
            genus_from_api = ${escapeSqlString(taxonomy.genusFromApi)},
            subgenus = ${escapeSqlString(taxonomy.subgenus)},
            section = ${escapeSqlString(taxonomy.section)},
            subsection = ${escapeSqlString(taxonomy.subsection)},
            species = ${escapeSqlString(taxonomy.species)},
            subspecies = ${escapeSqlString(taxonomy.subspecies)},
            variety = ${escapeSqlString(taxonomy.variety)},
            form = ${escapeSqlString(taxonomy.form)},
            matched_rank = ${escapeSqlString(taxonomy.matchedRank)},
            matched_taxon_name = ${escapeSqlString(taxonomy.matchedTaxonName)},
            inat_taxon_id = $3,
            observation_count = $4,
            is_active = $5,
            api_response = $6,
            lookup_count = inaturalist_classification_cache.lookup_count + 1,
            updated_at = NOW()
        `;
        
        await pool.query(sql, [
          genus, genus, taxonomy.inatTaxonId, taxonomy.observationCount, 
          taxonomy.isActive, taxonomy.apiResponse
        ]);
        
        console.log(`  ✓ Updated: ${taxonomy.family} family, ${taxonomy.kingdom} kingdom`);
        console.log(`    → Matched at ${taxonomy.matchedRank} level: "${taxonomy.matchedTaxonName}"`);
        if (taxonomy.genusFromApi && taxonomy.genusFromApi !== genus) {
          console.log(`    → API genus: "${taxonomy.genusFromApi}" (differs from search term)`);
        }
        successCount++;
        
      } else {
        // Partial data - still update what we have
        console.log(`  ⚠ Partial data: kingdom=${taxonomy.kingdom}, family=${taxonomy.family}`);
        console.log(`    → Matched at ${taxonomy.matchedRank} level: "${taxonomy.matchedTaxonName}"`);
        failCount++;
      }
      
      // Rate limit to respect API limits (1.5 seconds between genera to account for multiple API calls per genus)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Progress update every 25 entries
      if ((i + 1) % 25 === 0) {
        console.log(`\n--- Progress Update ---`);
        console.log(`Processed: ${i + 1}/${genera.length} (${Math.round((i + 1) / genera.length * 100)}%)`);
        console.log(`✓ Complete: ${successCount}, ✗ Failed: ${failCount}, ⚠ Invalid: ${invalidCount}\n`);
      }
    }
    
    console.log(`\n=== Enhanced Backfill Results ===`);
    console.log(`Total processed: ${genera.length} genera`);
    console.log(`✓ Successfully updated: ${successCount}`);
    console.log(`✗ Failed/incomplete: ${failCount}`);
    console.log(`⚠ Marked invalid: ${invalidCount}`);
    
    // Final enhanced cache statistics
    const finalStats = await pool.query(`
      SELECT 
        COUNT(*) as total_entries,
        COUNT(CASE WHEN kingdom IS NOT NULL AND family IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as complete_entries,
        COUNT(CASE WHEN kingdom = 'INVALID' THEN 1 END) as invalid_entries,
        COUNT(CASE WHEN matched_rank IS NOT NULL THEN 1 END) as entries_with_rank_info,
        COUNT(CASE WHEN genus_from_api IS NOT NULL THEN 1 END) as entries_with_api_genus,
        COUNT(DISTINCT matched_rank) as unique_matched_ranks,
        ROUND(COUNT(CASE WHEN kingdom IS NOT NULL AND family IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) * 100.0 / COUNT(*), 1) as completion_percentage
      FROM inaturalist_classification_cache
    `);
    
    const stats = finalStats.rows[0];
    console.log(`\n=== Enhanced Cache Statistics ===`);
    console.log(`Total entries: ${stats.total_entries}`);
    console.log(`Complete entries: ${stats.complete_entries}`);
    console.log(`Invalid entries: ${stats.invalid_entries}`);
    console.log(`Entries with rank annotations: ${stats.entries_with_rank_info}`);
    console.log(`Entries with API genus names: ${stats.entries_with_api_genus}`);
    console.log(`Unique matched ranks: ${stats.unique_matched_ranks}`);
    console.log(`Completion rate: ${stats.completion_percentage}%`);
    
    // Show rank distribution
    const rankStats = await pool.query(`
      SELECT matched_rank, COUNT(*) as count
      FROM inaturalist_classification_cache 
      WHERE matched_rank IS NOT NULL 
      GROUP BY matched_rank 
      ORDER BY count DESC
    `);
    
    if (rankStats.rows.length > 0) {
      console.log(`\n=== Rank Match Distribution ===`);
      for (const row of rankStats.rows) {
        console.log(`${row.matched_rank}: ${row.count} entries`);
      }
    }
    
    if (successCount > 0) {
      console.log(`\nClassification cache now enhanced with complete taxonomy hierarchy and rank annotations!`);
      console.log(`Upload processing will now have detailed rank information and extended taxonomy data.`);
    }
    
  } catch (error) {
    console.error('Enhanced backfill error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

enhancedCacheBackfill();