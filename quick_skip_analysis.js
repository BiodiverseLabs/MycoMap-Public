#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

// Quick analysis using existing database to understand skip patterns
async function quickSkipAnalysis() {
  try {
    console.log('=== UPLOAD SKIP ANALYSIS ===\n');
    
    // Check if we have the latest Excel file
    const uploadsDir = './uploads';
    const files = fs.readdirSync(uploadsDir)
      .filter(file => file.endsWith('.xlsx'))
      .map(file => ({
        name: file,
        stats: fs.statSync(path.join(uploadsDir, file))
      }))
      .sort((a, b) => b.stats.mtime - a.stats.mtime);
    
    if (files.length === 0) {
      console.log('No Excel files found. Using database analysis instead.');
      return;
    }
    
    console.log(`Latest file: ${files[0].name}`);
    console.log(`File size: ${(files[0].stats.size / 1024 / 1024).toFixed(2)} MB\n`);
    
    // Based on upload logic analysis, records are skipped if:
    console.log('=== RECORD SKIP CRITERIA (from upload code analysis) ===');
    console.log('Records are skipped during upload if:');
    console.log('1. Missing ALL taxonomic fields (Variety, Species, Genus, Family, Order, Class, Phylum, Kingdom)');
    console.log('2. All taxonomic fields are empty strings or null values');
    console.log('3. Scientific name construction results in empty string or "Unknown"');
    console.log();
    
    console.log('=== UPLOAD LOGIC PRIORITY ===');
    console.log('Scientific name construction follows this priority:');
    console.log('1. Variety (highest priority)');
    console.log('2. Species');
    console.log('3. Genus');
    console.log('4. Family');
    console.log('5. Order');
    console.log('6. Class');
    console.log('7. Phylum');
    console.log('8. Kingdom (lowest priority)');
    console.log();
    
    console.log('=== KEY FILTER IN UPLOAD CODE ===');
    console.log('Line 1758 in server/routes.ts:');
    console.log('.filter(obs => obs.scientificName)');
    console.log('This removes any record where scientificName is falsy (empty, null, undefined)');
    console.log();
    
    console.log('=== CHARACTER ENCODING FIXES ===');
    console.log('Upload process applies encoding fixes for:');
    console.log('- Smart quotes (â€œ, â€, â€™)');
    console.log('- Accented characters (Ã¡→á, Ã©→é, etc.)');
    console.log('- En/Em dashes (â€", â€")');
    console.log('- Other UTF-8 corruption patterns');
    console.log();
    
    // Make a request to check current database state
    console.log('=== CURRENT DATABASE STATUS ===');
    const response = await fetch('http://localhost:5000/api/observations');
    if (response.ok) {
      const data = await response.json();
      console.log(`Total observations in database: ${data.length.toLocaleString()}`);
      
      // Check for records with minimal taxonomy
      const minimalTaxonomy = data.filter(obs => 
        !obs.species && !obs.variety && !obs.genus
      );
      console.log(`Records with no Species/Variety/Genus: ${minimalTaxonomy.length.toLocaleString()}`);
      
      // Source distribution
      const sourceStats = {};
      data.forEach(obs => {
        sourceStats[obs.source || 'Unknown'] = (sourceStats[obs.source || 'Unknown'] || 0) + 1;
      });
      
      console.log('\nSource distribution in database:');
      Object.entries(sourceStats)
        .sort((a, b) => b[1] - a[1])
        .forEach(([source, count]) => {
          console.log(`${source}: ${count.toLocaleString()}`);
        });
    } else {
      console.log('Could not fetch current database status');
    }
    
    console.log('\n=== RECOMMENDATIONS ===');
    console.log('To reduce skipped records:');
    console.log('1. Ensure at least one taxonomic field is populated for each record');
    console.log('2. Check for completely empty rows in Excel files');
    console.log('3. Verify Reference Number field is populated (used as observationId)');
    console.log('4. Consider pre-processing Excel files to fill missing taxonomy');
    
  } catch (error) {
    console.error('Analysis error:', error.message);
  }
}

quickSkipAnalysis();