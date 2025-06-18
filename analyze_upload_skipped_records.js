#!/usr/bin/env node

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

/**
 * Comprehensive analysis of records skipped during upload process
 * Identifies and categorizes all records that would be filtered out
 */

// Character encoding fix function (matches upload logic)
function fixEncoding(text) {
  if (!text || typeof text !== 'string') return text || null;
  
  return text
    .replace(/â€œ/g, '"')     // Opening smart quote
    .replace(/â€/g, '"')      // Closing smart quote  
    .replace(/â€™/g, "'")     // Smart apostrophe/closing single quote
    .replace(/â€˜/g, "'")     // Opening smart apostrophe
    .replace(/â€"/g, '–')     // En dash
    .replace(/â€"/g, '—')     // Em dash
    .replace(/â€¦/g, '…')     // Ellipsis
    .replace(/Ã¡/g, 'á')     // á with acute accent
    .replace(/Ã©/g, 'é')     // é with acute accent
    .replace(/Ã­/g, 'í')     // í with acute accent
    .replace(/Ã³/g, 'ó')     // ó with acute accent
    .replace(/Ãº/g, 'ú')     // ú with acute accent
    .replace(/Ã±/g, 'ñ')     // ñ with tilde
    .replace(/Ã§/g, 'ç')     // ç with cedilla
    .replace(/Ã¼/g, 'ü')     // ü with diaeresis
    .replace(/Ã¨/g, 'è')     // è with grave accent
    .replace(/Ã /g, 'à')     // à with grave accent
    .trim();
}

async function analyzeSkippedRecords() {
  console.log('=== UPLOAD RECORD SKIP ANALYSIS ===\n');
  
  // Find the most recent Excel file in uploads directory
  const uploadsDir = './uploads';
  if (!fs.existsSync(uploadsDir)) {
    console.error('Uploads directory not found');
    return;
  }
  
  const files = fs.readdirSync(uploadsDir)
    .filter(file => file.endsWith('.xlsx'))
    .map(file => ({
      name: file,
      path: path.join(uploadsDir, file),
      stats: fs.statSync(path.join(uploadsDir, file))
    }))
    .sort((a, b) => b.stats.mtime - a.stats.mtime);
  
  if (files.length === 0) {
    console.error('No Excel files found in uploads directory');
    return;
  }
  
  const filePath = files[0].path;
  console.log(`Analyzing file: ${files[0].name}`);
  console.log(`File size: ${(files[0].stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Last modified: ${files[0].stats.mtime.toISOString()}\n`);
  
  // Read Excel file (matches upload logic)
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames.find(name => 
    name.toLowerCase().includes('validated') || 
    name.toLowerCase().includes('observation')
  ) || workbook.SheetNames[0];
  
  const worksheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(worksheet);
  
  console.log(`Sheet analyzed: "${sheetName}"`);
  console.log(`Total raw records: ${rawData.length.toLocaleString()}\n`);
  
  if (rawData.length === 0) {
    console.log('No data found in sheet');
    return;
  }
  
  // Analyze records using the same logic as upload process
  const skippedRecords = [];
  const validRecords = [];
  const skipReasons = new Map();
  
  rawData.forEach((row, index) => {
    const rowNumber = index + 2; // Excel row number (accounting for header)
    
    // Construct scientific name following upload logic priority
    let scientificName = '';
    if (row['Variety']) {
      scientificName = fixEncoding(row['Variety']) || '';
    } else if (row['Species']) {
      scientificName = fixEncoding(row['Species']) || '';
    } else if (row['Genus']) {
      scientificName = fixEncoding(row['Genus']) || '';
    } else if (row['Family']) {
      scientificName = fixEncoding(row['Family']) || '';
    } else if (row['Order']) {
      scientificName = fixEncoding(row['Order']) || '';
    } else if (row['Class']) {
      scientificName = fixEncoding(row['Class']) || '';
    } else if (row['Phylum']) {
      scientificName = fixEncoding(row['Phylum']) || '';
    } else if (row['Kingdom']) {
      scientificName = fixEncoding(row['Kingdom']) || '';
    } else {
      scientificName = 'Unknown';
    }
    
    const recordInfo = {
      rowNumber,
      referenceNumber: fixEncoding(row['Reference Number']),
      variety: fixEncoding(row['Variety']),
      species: fixEncoding(row['Species']),
      genus: fixEncoding(row['Genus']),
      family: fixEncoding(row['Family']),
      order: fixEncoding(row['Order']),
      class: fixEncoding(row['Class']),
      phylum: fixEncoding(row['Phylum']),
      kingdom: fixEncoding(row['Kingdom']),
      collector: fixEncoding(row['Collector']),
      source: row['Source Database'] || row['Source'] || 'Unknown',
      scientificName
    };
    
    // Check if record would be skipped (matches upload filter logic)
    if (!scientificName || scientificName === 'Unknown') {
      const reason = 'No scientific name (all taxonomic fields empty)';
      skippedRecords.push({ ...recordInfo, skipReason: reason });
      skipReasons.set(reason, (skipReasons.get(reason) || 0) + 1);
    } else {
      validRecords.push(recordInfo);
    }
  });
  
  // Additional analysis for problematic patterns
  const analysisResults = {
    totalRecords: rawData.length,
    validRecords: validRecords.length,
    skippedRecords: skippedRecords.length,
    skipPercentage: ((skippedRecords.length / rawData.length) * 100).toFixed(2)
  };
  
  console.log('=== SKIP ANALYSIS RESULTS ===');
  console.log(`Total records processed: ${analysisResults.totalRecords.toLocaleString()}`);
  console.log(`Valid records (would be uploaded): ${analysisResults.validRecords.toLocaleString()}`);
  console.log(`Skipped records: ${analysisResults.skippedRecords.toLocaleString()}`);
  console.log(`Skip percentage: ${analysisResults.skipPercentage}%\n`);
  
  if (skippedRecords.length > 0) {
    console.log('=== SKIP REASONS BREAKDOWN ===');
    skipReasons.forEach((count, reason) => {
      console.log(`${reason}: ${count.toLocaleString()} records`);
    });
    console.log();
    
    console.log('=== SAMPLE SKIPPED RECORDS ===');
    console.log('First 10 skipped records:');
    skippedRecords.slice(0, 10).forEach(record => {
      console.log(`Row ${record.rowNumber}: "${record.referenceNumber || 'No Reference'}" - ${record.skipReason}`);
      console.log(`  Variety: ${record.variety || 'null'}`);
      console.log(`  Species: ${record.species || 'null'}`);
      console.log(`  Genus: ${record.genus || 'null'}`);
      console.log(`  Family: ${record.family || 'null'}`);
      console.log(`  Source: ${record.source}`);
      console.log();
    });
  }
  
  // Analyze taxonomy completeness for valid records
  console.log('=== VALID RECORDS TAXONOMY ANALYSIS ===');
  const taxonomyStats = {
    hasVariety: 0,
    hasSpecies: 0,
    hasGenus: 0,
    hasFamily: 0,
    hasOrder: 0,
    hasClass: 0,
    hasPhylum: 0,
    hasKingdom: 0
  };
  
  validRecords.forEach(record => {
    if (record.variety) taxonomyStats.hasVariety++;
    if (record.species) taxonomyStats.hasSpecies++;
    if (record.genus) taxonomyStats.hasGenus++;
    if (record.family) taxonomyStats.hasFamily++;
    if (record.order) taxonomyStats.hasOrder++;
    if (record.class) taxonomyStats.hasClass++;
    if (record.phylum) taxonomyStats.hasPhylum++;
    if (record.kingdom) taxonomyStats.hasKingdom++;
  });
  
  const total = validRecords.length;
  console.log(`Records with Variety: ${taxonomyStats.hasVariety.toLocaleString()} (${(taxonomyStats.hasVariety/total*100).toFixed(1)}%)`);
  console.log(`Records with Species: ${taxonomyStats.hasSpecies.toLocaleString()} (${(taxonomyStats.hasSpecies/total*100).toFixed(1)}%)`);
  console.log(`Records with Genus: ${taxonomyStats.hasGenus.toLocaleString()} (${(taxonomyStats.hasGenus/total*100).toFixed(1)}%)`);
  console.log(`Records with Family: ${taxonomyStats.hasFamily.toLocaleString()} (${(taxonomyStats.hasFamily/total*100).toFixed(1)}%)`);
  console.log(`Records with Order: ${taxonomyStats.hasOrder.toLocaleString()} (${(taxonomyStats.hasOrder/total*100).toFixed(1)}%)`);
  console.log(`Records with Class: ${taxonomyStats.hasClass.toLocaleString()} (${(taxonomyStats.hasClass/total*100).toFixed(1)}%)`);
  console.log(`Records with Phylum: ${taxonomyStats.hasPhylum.toLocaleString()} (${(taxonomyStats.hasPhylum/total*100).toFixed(1)}%)`);
  console.log(`Records with Kingdom: ${taxonomyStats.hasKingdom.toLocaleString()} (${(taxonomyStats.hasKingdom/total*100).toFixed(1)}%)`);
  
  // Source distribution analysis
  console.log('\n=== SOURCE DISTRIBUTION ===');
  const sourceStats = new Map();
  validRecords.forEach(record => {
    sourceStats.set(record.source, (sourceStats.get(record.source) || 0) + 1);
  });
  
  [...sourceStats.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([source, count]) => {
      console.log(`${source}: ${count.toLocaleString()} records (${(count/total*100).toFixed(1)}%)`);
    });
  
  // Generate detailed report file
  const reportPath = `./upload_skip_analysis_${new Date().toISOString().split('T')[0]}.json`;
  const report = {
    analysis: analysisResults,
    skipReasons: Object.fromEntries(skipReasons),
    taxonomyStats,
    sourceStats: Object.fromEntries(sourceStats),
    sampleSkippedRecords: skippedRecords.slice(0, 50),
    timestamp: new Date().toISOString()
  };
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n=== DETAILED REPORT SAVED ===`);
  console.log(`Report saved to: ${reportPath}`);
  console.log('This file contains complete analysis data including sample skipped records.');
}

// Run analysis
analyzeSkippedRecords().catch(console.error);