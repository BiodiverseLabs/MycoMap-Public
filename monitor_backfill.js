#!/usr/bin/env tsx

import { pool } from './server/db.ts';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function monitorBackfillProgress() {
  console.log('Starting backfill monitor with auto-restart...\n');
  
  let lastCount = 0;
  let restartCount = 0;
  
  const checkAndRestart = async () => {
    try {
      // Check current progress
      const result = await pool.query(`
        SELECT 
          COUNT(CASE WHEN matched_rank IS NOT NULL THEN 1 END) as enhanced,
          COUNT(CASE WHEN updated_at > NOW() - INTERVAL '2 minutes' THEN 1 END) as recent,
          (SELECT genus FROM inaturalist_classification_cache WHERE matched_rank IS NOT NULL ORDER BY updated_at DESC LIMIT 1) as latest
        FROM inaturalist_classification_cache
      `);
      
      const stats = result.rows[0];
      const currentCount = parseInt(stats.enhanced);
      const recentActivity = parseInt(stats.recent);
      
      // Check if process is running
      let isRunning = false;
      try {
        const { stdout } = await execAsync('ps aux | grep "enhanced_cache_backfill" | grep -v grep');
        isRunning = stdout.trim().length > 0;
      } catch (error) {
        isRunning = false;
      }
      
      const progress = currentCount - lastCount;
      const status = isRunning && recentActivity > 0 ? 'ACTIVE' : 'STOPPED';
      const timestamp = new Date().toLocaleTimeString();
      
      console.log(`[${timestamp}] ${status} | Enhanced: ${currentCount}/1087 (${(currentCount/1087*100).toFixed(1)}%) | Progress: +${progress} | Latest: ${stats.latest}`);
      
      // Restart if needed
      if (!isRunning || recentActivity === 0) {
        console.log('  → Restarting backfill process...');
        try {
          await execAsync('pkill -f "enhanced_cache_backfill"');
          await new Promise(resolve => setTimeout(resolve, 2000));
          await execAsync('cd /home/runner/workspace && nohup npx tsx enhanced_cache_backfill.js > backfill.log 2>&1 &');
          restartCount++;
          console.log(`  ✓ Process restarted (restart #${restartCount})`);
        } catch (error) {
          console.log(`  ✗ Restart failed: ${error.message}`);
        }
      }
      
      lastCount = currentCount;
      
      // Check for completion
      if (currentCount >= 1087) {
        console.log('\n🎉 Backfill completed! All genera processed.');
        process.exit(0);
      }
      
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  };
  
  // Initial check
  await checkAndRestart();
  
  // Check every 2 minutes
  const intervalId = setInterval(checkAndRestart, 120000);
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nStopping monitor...');
    clearInterval(intervalId);
    pool.end().then(() => process.exit(0));
  });
}

monitorBackfillProgress().catch(console.error);