#!/usr/bin/env tsx

import { pool } from './server/db.ts';

async function watchBackfillProgress() {
  console.log('Watching classification backfill progress...\n');
  
  const startTime = Date.now();
  let lastProcessed = 0;
  
  const checkProgress = async () => {
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(CASE WHEN updated_at IS NOT NULL THEN 1 END) as total_processed,
          COUNT(CASE WHEN kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) as successful,
          COUNT(CASE WHEN kingdom = 'INVALID' THEN 1 END) as invalid_genera,
          COUNT(CASE WHEN updated_at > NOW() - INTERVAL '2 minutes' THEN 1 END) as recent_activity,
          (SELECT genus FROM inaturalist_classification_cache WHERE updated_at IS NOT NULL ORDER BY updated_at DESC LIMIT 1) as latest_genus,
          ROUND(COUNT(CASE WHEN kingdom IS NOT NULL AND kingdom != 'INVALID' THEN 1 END) * 100.0 / NULLIF(COUNT(CASE WHEN updated_at IS NOT NULL THEN 1 END), 0), 1) as success_rate,
          (1087 - COUNT(CASE WHEN updated_at IS NOT NULL THEN 1 END)) as remaining
        FROM inaturalist_classification_cache
      `);
      
      const stats = result.rows[0];
      const currentProcessed = parseInt(stats.total_processed);
      const progress = currentProcessed - lastProcessed;
      const isActive = parseInt(stats.recent_activity) > 0;
      const status = isActive ? 'ACTIVE' : 'STOPPED';
      const timestamp = new Date().toLocaleTimeString();
      const elapsedMinutes = Math.round((Date.now() - startTime) / 60000);
      
      const rate = elapsedMinutes > 0 ? Math.round(currentProcessed / elapsedMinutes * 60) : 0;
      const eta = rate > 0 ? Math.round(parseInt(stats.remaining) / rate) : 0;
      
      console.log(`[${timestamp}] ${status} | Progress: ${currentProcessed}/1087 (${Math.round(currentProcessed/1087*100)}%) | +${progress} | Success: ${stats.successful} (${stats.success_rate}%) | Latest: ${stats.latest_genus}`);
      console.log(`           Rate: ${rate}/hour | ETA: ${eta} hours | Remaining: ${stats.remaining}`);
      
      lastProcessed = currentProcessed;
      
      if (currentProcessed >= 1087) {
        console.log('\n🎉 Classification backfill completed!');
        process.exit(0);
      }
      
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  };
  
  // Check immediately
  await checkProgress();
  
  // Then check every 30 seconds
  const intervalId = setInterval(checkProgress, 30000);
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nStopping progress monitor...');
    clearInterval(intervalId);
    pool.end().then(() => process.exit(0));
  });
}

watchBackfillProgress().catch(console.error);