#!/usr/bin/env tsx

import { db } from './server/db.ts';

async function enhancedMismatchDetection() {
  console.log('Enhanced mismatch detection for classification cache...\n');
  
  try {
    // Get all processed entries for analysis
    const entries = await db.execute(`
      SELECT search_term, scientific_name, taxon_rank, family, id
      FROM inaturalist_classification_cache 
      WHERE taxon_rank IS NOT NULL 
      AND kingdom != 'INVALID'
      AND search_term NOT LIKE '%''%'
      ORDER BY search_term
    `);
    
    console.log(`Analyzing ${entries.rows.length} processed entries for mismatches...\n`);
    
    let checked = 0;
    let mismatches = 0;
    
    // Enhanced matching function
    function isValidMatch(searchTerm, scientificName) {
      const search = searchTerm.toLowerCase();
      const scientific = scientificName.toLowerCase();
      
      // Exact match (case insensitive)
      if (search === scientific) return true;
      
      // Family name extension (genus → family with -aceae, -idae, etc.)
      if (scientific.startsWith(search) && 
          (scientific.endsWith('aceae') || scientific.endsWith('idae') || 
           scientific.endsWith('eae') || scientific.endsWith('ineae'))) {
        return true;
      }
      
      // One contains the other (partial matches)
      if (search.includes(scientific) || scientific.includes(search)) {
        return true;
      }
      
      // Check for reasonable root similarity (at least 60% of shorter string)
      const minLength = Math.min(search.length, scientific.length);
      if (minLength >= 5) {
        const threshold = Math.floor(minLength * 0.6);
        let commonChars = 0;
        
        for (let i = 0; i < Math.min(search.length, scientific.length); i++) {
          if (search[i] === scientific[i]) {
            commonChars++;
          } else {
            break;
          }
        }
        
        if (commonChars >= threshold) return true;
      }
      
      // Special cases for complex names (e.g., "rhombisporum" → "Entoloma rhombisporum")
      if (scientific.includes(search) || search.includes(scientific.split(' ')[0])) {
        return true;
      }
      
      return false;
    }
    
    for (const entry of entries.rows) {
      const searchTerm = entry.search_term;
      const scientificName = entry.scientific_name;
      
      checked++;
      
      if (!isValidMatch(searchTerm, scientificName)) {
        console.log(`❌ MISMATCH: "${searchTerm}" → "${scientificName}" (${entry.taxon_rank})`);
        
        // Reset this entry for reprocessing
        await db.execute(`
          UPDATE inaturalist_classification_cache 
          SET 
            taxon_rank = NULL,
            taxon_id = NULL,
            scientific_name = NULL,
            common_name = NULL,
            kingdom = NULL,
            phylum = NULL,
            class = NULL,
            "order" = NULL,
            family = NULL,
            genus = NULL,
            section = NULL,
            species = NULL,
            subspecies = NULL,
            variety = NULL,
            form = NULL,
            observations_count = NULL,
            is_active = NULL,
            api_response = NULL,
            updated_at = NOW()
          WHERE search_term = '${searchTerm.replace(/'/g, "''")}'
        `);
        
        mismatches++;
      } else {
        console.log(`✓ Valid: "${searchTerm}" → "${scientificName}"`);
      }
    }
    
    console.log(`\n=== ENHANCED MISMATCH DETECTION COMPLETE ===`);
    console.log(`Checked: ${checked} entries`);
    console.log(`Mismatches found and reset: ${mismatches}`);
    
    // Show updated completion status
    const statsResult = await db.execute(`
      SELECT 
        COUNT(*) as total_entries,
        COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as comprehensive_entries,
        COUNT(CASE WHEN taxon_rank IS NULL OR kingdom IS NULL OR kingdom = '' THEN 1 END) as remaining_entries,
        ROUND(COUNT(CASE WHEN taxon_rank IS NOT NULL AND kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) * 100.0 / COUNT(*), 1) as completion_percentage
      FROM inaturalist_classification_cache
    `);
    
    const stats = statsResult.rows[0];
    console.log(`\nUpdated completion: ${stats.comprehensive_entries}/${stats.total_entries} (${stats.completion_percentage}%)`);
    console.log(`Remaining to process: ${stats.remaining_entries}`);
    
  } catch (error) {
    console.error('Enhanced mismatch detection error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

enhancedMismatchDetection();