#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function watchBackfillProgress() {
  console.log('🔄 Starting continuous backfill monitor...\n');
  
  let lastEnhancedCount = 0;
  let startTime = Date.now();
  
  const monitor = async () => {
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
      
      // Get current stats
      const result = await pool.query(`
        SELECT 
          COUNT(CASE WHEN matched_rank IS NOT NULL THEN 1 END) as enhanced_entries,
          COUNT(CASE WHEN updated_at > NOW() - INTERVAL '2 minutes' THEN 1 END) as very_recent_updates,
          MAX(updated_at) as last_update
        FROM inaturalist_classification_cache
      `);
      
      const stats = result.rows[0];
      const currentCount = parseInt(stats.enhanced_entries);
      const recentActivity = parseInt(stats.very_recent_updates);
      
      // Calculate progress
      const newGenera = currentCount - lastEnhancedCount;
      const elapsedMinutes = (Date.now() - startTime) / 60000;
      const avgRate = currentCount / Math.max(elapsedMinutes, 1);
      
      // Status update
      const timestamp = new Date().toLocaleTimeString();
      const statusIcon = isRunning ? '🟢' : '🔴';
      const activityIcon = recentActivity > 0 ? '⚡' : '💤';
      
      console.log(`[${timestamp}] ${statusIcon} Process: ${isRunning ? 'RUNNING' : 'STOPPED'} | ${activityIcon} Enhanced: ${currentCount}/200 (+${newGenera}) | Rate: ${avgRate.toFixed(2)}/min | Recent: ${recentActivity}`);
      
      // Show latest genus if new activity
      if (newGenera > 0) {
        const latestResult = await pool.query(`
          SELECT genus, family, updated_at
          FROM inaturalist_classification_cache 
          WHERE matched_rank IS NOT NULL 
          ORDER BY updated_at DESC 
          LIMIT 1
        `);
        
        if (latestResult.rows.length > 0) {
          const latest = latestResult.rows[0];
          console.log(`   ✓ Latest: ${latest.genus} → ${latest.family}`);
        }
      }
      
      // Restart if stopped but should be running
      if (!isRunning && currentCount < 200) {
        console.log('   🔄 Restarting stopped process...');
        try {
          await execAsync('cd /home/runner/workspace && nohup npx tsx enhanced_cache_backfill.js > backfill.log 2>&1 &');
          console.log('   ✓ Process restarted');
        } catch (error) {
          console.log('   ❌ Restart failed:', error.message);
        }
      }
      
      lastEnhancedCount = currentCount;
      
      // Check for completion
      if (currentCount >= 200) {
        console.log('\n🎉 Backfill batch completed! Processing 200/200 genera.');
        clearInterval(intervalId);
        process.exit(0);
      }
      
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] ❌ Monitor error:`, error.message);
    }
  };
  
  // Initial check
  await monitor();
  
  // Set up continuous monitoring every 30 seconds
  const intervalId = setInterval(monitor, 30000);
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Stopping monitor...');
    clearInterval(intervalId);
    pool.end().then(() => process.exit(0));
  });
}

// Start watching
watchBackfillProgress().catch(console.error);