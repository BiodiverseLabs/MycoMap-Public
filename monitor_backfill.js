#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function monitorBackfillProgress() {
  console.log('🔍 Enhanced Classification Cache Backfill Monitor\n');
  
  try {
    // Check if process is running
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    let isRunning = false;
    try {
      const { stdout } = await execAsync('ps aux | grep "enhanced_cache_backfill" | grep -v grep');
      isRunning = stdout.trim().length > 0;
    } catch (error) {
      isRunning = false;
    }
    
    console.log(`Process Status: ${isRunning ? '🟢 RUNNING' : '🔴 STOPPED'}\n`);
    
    // Get current progress statistics
    const progressResult = await pool.query(`
      SELECT 
        COUNT(*) as total_cache_entries,
        COUNT(CASE WHEN matched_rank IS NOT NULL THEN 1 END) as enhanced_entries,
        COUNT(CASE WHEN kingdom IS NOT NULL AND family IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as complete_entries,
        COUNT(CASE WHEN updated_at > NOW() - INTERVAL '5 minutes' THEN 1 END) as very_recent_updates,
        COUNT(CASE WHEN updated_at > NOW() - INTERVAL '30 minutes' THEN 1 END) as recent_updates,
        ROUND(COUNT(CASE WHEN matched_rank IS NOT NULL THEN 1 END) * 100.0 / 200, 1) as batch_completion_percentage
      FROM inaturalist_classification_cache
    `);
    
    const stats = progressResult.rows[0];
    
    console.log('📊 Current Progress:');
    console.log(`   Total Cache Entries: ${stats.total_cache_entries}`);
    console.log(`   Enhanced Entries: ${stats.enhanced_entries}/200 (${stats.batch_completion_percentage}%)`);
    console.log(`   Complete Taxonomy: ${stats.complete_entries}`);
    console.log(`   Updated (5 min): ${stats.very_recent_updates}`);
    console.log(`   Updated (30 min): ${stats.recent_updates}\n`);
    
    // Show most recent processing activity
    const recentResult = await pool.query(`
      SELECT 
        genus, 
        family, 
        matched_rank,
        updated_at,
        EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 as minutes_ago
      FROM inaturalist_classification_cache 
      WHERE matched_rank IS NOT NULL 
      ORDER BY updated_at DESC 
      LIMIT 10
    `);
    
    console.log('🕒 Recent Processing Activity:');
    if (recentResult.rows.length === 0) {
      console.log('   No enhanced entries found yet');
    } else {
      recentResult.rows.forEach((row, index) => {
        const timeAgo = Math.floor(row.minutes_ago);
        console.log(`   ${index + 1}. ${row.genus} → ${row.family} (${timeAgo}m ago)`);
      });
    }
    
    // Show observation coverage
    const coverageResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT o.genus) as total_observation_genera,
        COUNT(DISTINCT CASE WHEN c.matched_rank IS NOT NULL AND c.kingdom IS NOT NULL AND c.family IS NOT NULL THEN o.genus END) as enhanced_coverage,
        1109 - COUNT(DISTINCT CASE WHEN c.matched_rank IS NOT NULL AND c.kingdom IS NOT NULL AND c.family IS NOT NULL THEN o.genus END) as remaining_genera,
        ROUND(COUNT(DISTINCT CASE WHEN c.matched_rank IS NOT NULL AND c.kingdom IS NOT NULL AND c.family IS NOT NULL THEN o.genus END) * 100.0 / COUNT(DISTINCT o.genus), 2) as coverage_percentage
      FROM observations o
      LEFT JOIN inaturalist_classification_cache c ON o.genus = c.genus
      WHERE o.genus IS NOT NULL 
        AND o.genus != ''
        AND o.genus NOT LIKE '%http%'
        AND o.genus NOT LIKE '%aceae'
        AND LENGTH(o.genus) >= 3
    `);
    
    const coverage = coverageResult.rows[0];
    
    console.log('\n🎯 Observation Coverage:');
    console.log(`   Total Genera in DB: ${coverage.total_observation_genera}`);
    console.log(`   Enhanced Coverage: ${coverage.enhanced_coverage} genera (${coverage.coverage_percentage}%)`);
    console.log(`   Remaining Work: ${coverage.remaining_genera} genera`);
    
    // Processing rate calculation
    if (stats.recent_updates > 0) {
      const processingRate = stats.recent_updates / 30; // per minute
      const estimatedCompletion = Math.ceil(coverage.remaining_genera / processingRate);
      console.log(`   Processing Rate: ~${processingRate.toFixed(2)} genera/minute`);
      console.log(`   Estimated Completion: ~${Math.floor(estimatedCompletion / 60)}h ${estimatedCompletion % 60}m`);
    }
    
    // Error detection
    const errorResult = await pool.query(`
      SELECT COUNT(*) as error_count
      FROM inaturalist_classification_cache 
      WHERE kingdom = 'INVALID' AND updated_at > NOW() - INTERVAL '1 hour'
    `);
    
    const errorCount = parseInt(errorResult.rows[0].error_count);
    if (errorCount > 0) {
      console.log(`\n⚠️  Errors in last hour: ${errorCount}`);
    }
    
    console.log(`\n⏱️  Last checked: ${new Date().toLocaleTimeString()}`);
    
  } catch (error) {
    console.error('❌ Monitor Error:', error.message);
  } finally {
    await pool.end();
  }
}

// Run the monitor
monitorBackfillProgress().catch(console.error);