#!/usr/bin/env tsx

import { db } from './server/db.ts';

async function fetchTaxonomyFromAPI(genus) {
  try {
    // Search for genus on iNaturalist
    const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(genus)}&rank=genus&per_page=1`;
    const searchResponse = await fetch(searchUrl);
    
    if (!searchResponse.ok) {
      return { error: `Search failed: ${searchResponse.status}` };
    }
    
    const searchData = await searchResponse.json();
    
    if (!searchData.results || searchData.results.length === 0) {
      return { error: 'No results found' };
    }
    
    const taxon = searchData.results[0];
    
    // Get full taxon details for complete taxonomy
    const detailUrl = `https://api.inaturalist.org/v1/taxa/${taxon.id}`;
    const detailResponse = await fetch(detailUrl);
    
    if (!detailResponse.ok) {
      return { error: `Detail fetch failed: ${detailResponse.status}` };
    }
    
    const detailData = await detailResponse.json();
    const fullTaxon = detailData.results[0];
    
    // Extract taxonomy from ancestors
    const ancestors = fullTaxon.ancestors || [];
    const allTaxa = [...ancestors, fullTaxon];
    
    let kingdom = null, phylum = null, taxonClass = null, order = null, family = null;
    
    for (const ancestor of allTaxa) {
      switch (ancestor.rank) {
        case 'kingdom': kingdom = ancestor.name; break;
        case 'phylum': phylum = ancestor.name; break;
        case 'class': taxonClass = ancestor.name; break;
        case 'order': order = ancestor.name; break;
        case 'family': family = ancestor.name; break;
      }
    }
    
    return {
      kingdom,
      phylum,
      class: taxonClass,
      order,
      family,
      success: kingdom && family
    };
    
  } catch (error) {
    return { error: error.message };
  }
}

async function completeBackfillAllCache() {
  console.log('Starting complete cache backfill for ALL incomplete entries...\n');
  
  try {
    // Get ALL incomplete cache entries (excluding obviously invalid ones)
    const result = await db.execute(`
      SELECT genus, lookup_count 
      FROM inaturalist_classification_cache 
      WHERE (family IS NULL OR kingdom IS NULL OR kingdom = '') 
        AND genus IS NOT NULL 
        AND genus NOT LIKE '%http%'
        AND genus NOT LIKE '%aceae'
        AND genus NOT LIKE '%ales'
        AND genus NOT LIKE '%mycota'
        AND genus NOT LIKE '%ineae'
        AND genus NOT LIKE '% %'
        AND LENGTH(genus) >= 3
        AND genus != 'fungi'
      ORDER BY lookup_count DESC, genus ASC
    `);
    
    const entries = result.rows;
    console.log(`Found ${entries.length} cache entries to process\n`);
    
    if (entries.length === 0) {
      console.log('No entries need backfilling!');
      return;
    }
    
    let successCount = 0;
    let failCount = 0;
    let invalidCount = 0;
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const genus = entry.genus;
      const lookupCount = entry.lookup_count;
      
      console.log(`[${i + 1}/${entries.length}] Processing "${genus}" (${lookupCount} lookups)`);
      
      // Fetch taxonomy from API
      const taxonomy = await fetchTaxonomyFromAPI(genus);
      
      if (taxonomy.error) {
        console.log(`  ✗ ${taxonomy.error}`);
        failCount++;
        
        // Mark as invalid if not found
        if (taxonomy.error === 'No results found') {
          await db.execute(`
            UPDATE inaturalist_classification_cache 
            SET kingdom = 'INVALID', family = 'INVALID', 
                lookup_count = lookup_count + 1, updated_at = NOW()
            WHERE genus = ?
          `, [genus]);
          invalidCount++;
          console.log(`  → Marked as INVALID`);
        }
        
      } else if (taxonomy.success) {
        // Update with complete taxonomy
        const updateResult = await db.execute(`
          UPDATE inaturalist_classification_cache 
          SET kingdom = ?, phylum = ?, class = ?, "order" = ?, family = ?,
              lookup_count = lookup_count + 1, updated_at = NOW()
          WHERE genus = ?
        `, [taxonomy.kingdom, taxonomy.phylum, taxonomy.class, taxonomy.order, taxonomy.family, genus]);
        
        console.log(`  ✓ Updated: ${taxonomy.family} family, ${taxonomy.kingdom} kingdom`);
        successCount++;
        
      } else {
        // Partial data - still update what we have
        await db.execute(`
          UPDATE inaturalist_classification_cache 
          SET kingdom = ?, phylum = ?, class = ?, "order" = ?, family = ?,
              lookup_count = lookup_count + 1, updated_at = NOW()
          WHERE genus = ?
        `, [taxonomy.kingdom, taxonomy.phylum, taxonomy.class, taxonomy.order, taxonomy.family, genus]);
        
        console.log(`  ⚠ Partial: kingdom=${taxonomy.kingdom}, family=${taxonomy.family}`);
        failCount++;
      }
      
      // Rate limit to respect API limits (1 request per second)
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Progress update every 25 entries
      if ((i + 1) % 25 === 0) {
        console.log(`\n--- Progress Update ---`);
        console.log(`Processed: ${i + 1}/${entries.length} (${Math.round((i + 1) / entries.length * 100)}%)`);
        console.log(`✓ Complete: ${successCount}, ✗ Failed: ${failCount}, ⚠ Invalid: ${invalidCount}\n`);
      }
    }
    
    console.log(`\n=== Complete Backfill Results ===`);
    console.log(`Total processed: ${entries.length} entries`);
    console.log(`✓ Successfully updated: ${successCount}`);
    console.log(`✗ Failed/incomplete: ${failCount}`);
    console.log(`⚠ Marked invalid: ${invalidCount}`);
    
    // Final cache statistics
    const finalStats = await db.execute(`
      SELECT 
        COUNT(*) as total_entries,
        COUNT(CASE WHEN kingdom IS NOT NULL AND family IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as complete_entries,
        COUNT(CASE WHEN kingdom = 'INVALID' THEN 1 END) as invalid_entries,
        ROUND(COUNT(CASE WHEN kingdom IS NOT NULL AND family IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) * 100.0 / COUNT(*), 1) as completion_percentage
      FROM inaturalist_classification_cache
    `);
    
    const stats = finalStats.rows[0];
    console.log(`\n=== Final Cache Statistics ===`);
    console.log(`Total entries: ${stats.total_entries}`);
    console.log(`Complete entries: ${stats.complete_entries}`);
    console.log(`Invalid entries: ${stats.invalid_entries}`);
    console.log(`Completion rate: ${stats.completion_percentage}%`);
    
    if (successCount > 0) {
      console.log(`\n🎉 Classification cache now has ${successCount} additional complete entries!`);
      console.log(`Your upload processing should now show significantly improved API lookup success rates.`);
    }
    
  } catch (error) {
    console.error('Backfill error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

completeBackfillAllCache();