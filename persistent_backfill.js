#!/usr/bin/env tsx

import { pool } from './server/db.ts';

let isRunning = false;

async function fetchTaxonomyFromAPI(searchTerm, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchTerm)}&rank=genus,subgenus,section,family&per_page=5`;
      const response = await fetch(searchUrl);
      
      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        for (const result of data.results) {
          if (result.ancestors && result.ancestors.length > 0) {
            const detailUrl = `https://api.inaturalist.org/v1/taxa/${result.id}`;
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
                  return {
                    ...taxonomy,
                    matched_rank: result.rank,
                    search_term: searchTerm,
                    matched_taxon_name: result.name,
                    genus_from_api: taxonomy.genus || null
                  };
                }
              }
            }
          }
        }
      }
      
      return null;
      
    } catch (error) {
      console.log(`    API attempt ${attempt} failed: ${error.message}`);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  return null;
}

async function processNextGenus() {
  try {
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
          WHERE matched_rank IS NOT NULL AND kingdom IS NOT NULL AND family IS NOT NULL AND kingdom != 'INVALID'
        )
      ORDER BY o.genus ASC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      console.log('All genera have been processed!');
      return false;
    }

    const genus = result.rows[0].genus;
    console.log(`Processing "${genus}"`);

    const taxonomyData = await fetchTaxonomyFromAPI(genus);
    
    if (taxonomyData) {
      await pool.query(`
        INSERT INTO inaturalist_classification_cache (
          genus, kingdom, phylum, subphylum, superclass, class, subclass, infraclass, superorder, "order", suborder, infraorder, parvorder, zoosection, zoosubsection, superfamily, family, subfamily, supertribe, tribe, subtribe, genus_cache, subgenus, section, subsection, species_group, species_subgroup, species, subspecies, variety, forma, matched_rank, search_term, matched_taxon_name, genus_from_api, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, NOW()
        )
        ON CONFLICT (genus) DO UPDATE SET
          kingdom = EXCLUDED.kingdom,
          phylum = EXCLUDED.phylum,
          subphylum = EXCLUDED.subphylum,
          superclass = EXCLUDED.superclass,
          class = EXCLUDED.class,
          subclass = EXCLUDED.subclass,
          infraclass = EXCLUDED.infraclass,
          superorder = EXCLUDED.superorder,
          "order" = EXCLUDED."order",
          suborder = EXCLUDED.suborder,
          infraorder = EXCLUDED.infraorder,
          parvorder = EXCLUDED.parvorder,
          zoosection = EXCLUDED.zoosection,
          zoosubsection = EXCLUDED.zoosubsection,
          superfamily = EXCLUDED.superfamily,
          family = EXCLUDED.family,
          subfamily = EXCLUDED.subfamily,
          supertribe = EXCLUDED.supertribe,
          tribe = EXCLUDED.tribe,
          subtribe = EXCLUDED.subtribe,
          genus_cache = EXCLUDED.genus_cache,
          subgenus = EXCLUDED.subgenus,
          section = EXCLUDED.section,
          subsection = EXCLUDED.subsection,
          species_group = EXCLUDED.species_group,
          species_subgroup = EXCLUDED.species_subgroup,
          species = EXCLUDED.species,
          subspecies = EXCLUDED.subspecies,
          variety = EXCLUDED.variety,
          forma = EXCLUDED.forma,
          matched_rank = EXCLUDED.matched_rank,
          search_term = EXCLUDED.search_term,
          matched_taxon_name = EXCLUDED.matched_taxon_name,
          genus_from_api = EXCLUDED.genus_from_api,
          updated_at = NOW()
      `, [
        genus,
        taxonomyData.kingdom || null,
        taxonomyData.phylum || null,
        taxonomyData.subphylum || null,
        taxonomyData.superclass || null,
        taxonomyData.class || null,
        taxonomyData.subclass || null,
        taxonomyData.infraclass || null,
        taxonomyData.superorder || null,
        taxonomyData.order || null,
        taxonomyData.suborder || null,
        taxonomyData.infraorder || null,
        taxonomyData.parvorder || null,
        taxonomyData.zoosection || null,
        taxonomyData.zoosubsection || null,
        taxonomyData.superfamily || null,
        taxonomyData.family || null,
        taxonomyData.subfamily || null,
        taxonomyData.supertribe || null,
        taxonomyData.tribe || null,
        taxonomyData.subtribe || null,
        taxonomyData.genus || null,
        taxonomyData.subgenus || null,
        taxonomyData.section || null,
        taxonomyData.subsection || null,
        taxonomyData.species_group || null,
        taxonomyData.species_subgroup || null,
        taxonomyData.species || null,
        taxonomyData.subspecies || null,
        taxonomyData.variety || null,
        taxonomyData.forma || null,
        taxonomyData.matched_rank || null,
        taxonomyData.search_term || null,
        taxonomyData.matched_taxon_name || null,
        taxonomyData.genus_from_api || null
      ]);

      console.log(`  ✓ Updated: ${taxonomyData.family} family, ${taxonomyData.kingdom} kingdom`);
    } else {
      console.log(`  ✗ No taxonomy found`);
      // Mark as processed to avoid infinite loop
      await pool.query(`
        INSERT INTO inaturalist_classification_cache (genus, kingdom, updated_at)
        VALUES ($1, 'INVALID', NOW())
        ON CONFLICT (genus) DO UPDATE SET
          kingdom = 'INVALID',
          updated_at = NOW()
      `, [genus]);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1500));
    return true;

  } catch (error) {
    console.error(`Error processing genus: ${error.message}`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    return true;
  }
}

async function runPersistentBackfill() {
  if (isRunning) return;
  
  isRunning = true;
  console.log('Starting persistent backfill process...');
  
  try {
    while (isRunning) {
      const hasMore = await processNextGenus();
      if (!hasMore) {
        console.log('Backfill completed successfully!');
        break;
      }
    }
  } catch (error) {
    console.error('Persistent backfill error:', error);
  } finally {
    isRunning = false;
  }
}

// Start the process
runPersistentBackfill();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Stopping persistent backfill...');
  isRunning = false;
  pool.end().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('Stopping persistent backfill...');
  isRunning = false;
  pool.end().then(() => process.exit(0));
});