#!/usr/bin/env tsx

import { db } from './server/db.ts';

async function backfillClassificationCache() {
  console.log('Starting classification cache backfill...\n');
  
  try {
    // Get all cache entries that are missing taxonomy data
    const incompleteEntries = await db.execute(`
      SELECT genus, lookup_count, created_at 
      FROM inaturalist_classification_cache 
      WHERE (family IS NULL OR kingdom IS NULL) 
        AND genus IS NOT NULL
      ORDER BY lookup_count DESC, created_at ASC
    `);
    
    console.log(`Found ${incompleteEntries.rows.length} cache entries with incomplete taxonomy data\n`);
    
    if (incompleteEntries.rows.length === 0) {
      console.log('No entries need backfilling!');
      process.exit(0);
    }
    
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < incompleteEntries.rows.length; i++) {
      const entry = incompleteEntries.rows[i];
      const genus = entry.genus;
      const lookupCount = entry.lookup_count;
      
      console.log(`\n[${i + 1}/${incompleteEntries.rows.length}] Processing "${genus}" (${lookupCount} previous lookups)`);
      
      // Skip obviously invalid genus names
      if (genus.includes('http') || genus.includes('www') || genus.includes('.com') || 
          genus.includes('aceae') || genus.includes('ales') || genus.includes('mycota') ||
          genus.length < 3 || genus.includes(' ')) {
        console.log(`  ⚠ Skipping invalid genus name: "${genus}"`);
        skippedCount++;
        continue;
      }
      
      try {
        // Clear the existing incomplete cache entry  
        await db.execute(`DELETE FROM inaturalist_classification_cache WHERE LOWER(genus) = LOWER($1)`, [genus]);
        console.log(`  ✓ Cleared existing cache entry for "${genus}"`);
        
        // Perform fresh API lookup
        const result = await performInaturalistLookup(genus);
        
        if (result && result.kingdom && result.family) {
          console.log(`  ✓ Successfully updated "${genus}": ${result.family} family`);
          successCount++;
        } else {
          console.log(`  ✗ API lookup still returned incomplete data for "${genus}"`);
          failCount++;
        }
        
        // Rate limiting - wait 1 second between API calls
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`  ✗ Error processing "${genus}":`, error.message);
        failCount++;
      }
    }
    
    console.log(`\n=== Backfill Complete ===`);
    console.log(`Total entries processed: ${incompleteEntries.rows.length}`);
    console.log(`✓ Successfully updated: ${successCount}`);
    console.log(`✗ Failed to update: ${failCount}`);
    console.log(`⚠ Skipped invalid names: ${skippedCount}`);
    
    if (successCount > 0) {
      console.log(`\nCache now contains ${successCount} additional complete taxonomy entries!`);
    }
    
  } catch (error) {
    console.error('Error during cache backfill:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

// Allow running with limited mode for testing
const args = process.argv.slice(2);
const testMode = args.includes('--test');
const limit = testMode ? 5 : null;

if (testMode) {
  console.log('Running in test mode - processing only 5 entries\n');
}

// Enhanced iNaturalist API lookup function
async function performInaturalistLookup(genus) {
  try {
    const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(genus)}&rank=genus&per_page=1`;
    const searchResponse = await fetch(searchUrl);
    
    if (!searchResponse.ok) {
      throw new Error(`API request failed: ${searchResponse.status}`);
    }
    
    const searchData = await searchResponse.json();
    
    if (!searchData.results || searchData.results.length === 0) {
      // Cache the failure to avoid repeated lookups
      await db.execute(`
        INSERT INTO inaturalist_classification_cache (genus, lookup_count, created_at, updated_at)
        VALUES ($1, 1, NOW(), NOW())
        ON CONFLICT (genus) DO UPDATE SET 
          lookup_count = innaturalist_classification_cache.lookup_count + 1,
          updated_at = NOW()
      `, [genus.toLowerCase()]);
      return null;
    }
    
    const taxon = searchData.results[0];
    
    // Fetch full taxon details to get complete ancestor hierarchy
    const detailUrl = `https://api.inaturalist.org/v1/taxa/${taxon.id}`;
    const detailResponse = await fetch(detailUrl);
    
    if (!detailResponse.ok) {
      throw new Error(`Detail API request failed: ${detailResponse.status}`);
    }
    
    const detailData = await detailResponse.json();
    const fullTaxon = detailData.results[0];
    
    // Extract taxonomy from ancestor hierarchy
    const ancestors = fullTaxon.ancestors || [];
    const allTaxa = [...ancestors, fullTaxon];
    
    let kingdom = null, phylum = null, taxonClass = null, order = null, family = null;
    
    for (const ancestor of allTaxa) {
      if (ancestor.rank === 'kingdom') kingdom = ancestor.name;
      else if (ancestor.rank === 'phylum') phylum = ancestor.name;
      else if (ancestor.rank === 'class') taxonClass = ancestor.name;
      else if (ancestor.rank === 'order') order = ancestor.name;
      else if (ancestor.rank === 'family') family = ancestor.name;
    }
    
    // Cache the complete result
    await db.execute(`
      INSERT INTO inaturalist_classification_cache 
      (genus, kingdom, phylum, class, "order", family, lookup_count, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 1, NOW(), NOW())
      ON CONFLICT (genus) DO UPDATE SET 
        kingdom = EXCLUDED.kingdom,
        phylum = EXCLUDED.phylum,
        class = EXCLUDED.class,
        "order" = EXCLUDED."order",
        family = EXCLUDED.family,
        lookup_count = inaturalist_classification_cache.lookup_count + 1,
        updated_at = NOW()
    `, [genus.toLowerCase(), kingdom, phylum, taxonClass, order, family]);
    
    return { kingdom, phylum, class: taxonClass, order, family };
    
  } catch (error) {
    console.error(`API lookup error for ${genus}:`, error.message);
    return null;
  }
}

backfillClassificationCache();