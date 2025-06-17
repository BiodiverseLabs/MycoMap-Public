#!/usr/bin/env tsx

import { pool } from './server/db.ts';

const result = await pool.query(`
  SELECT 
    COUNT(CASE WHEN matched_rank IS NOT NULL THEN 1 END) as enhanced,
    COUNT(CASE WHEN updated_at > NOW() - INTERVAL '5 minutes' THEN 1 END) as recent,
    (SELECT genus FROM inaturalist_classification_cache WHERE matched_rank IS NOT NULL ORDER BY updated_at DESC LIMIT 1) as latest_genus,
    (SELECT family FROM inaturalist_classification_cache WHERE matched_rank IS NOT NULL ORDER BY updated_at DESC LIMIT 1) as latest_family,
    ROUND(COUNT(CASE WHEN matched_rank IS NOT NULL THEN 1 END) * 100.0 / 200, 1) as batch_percent,
    ROUND(COUNT(CASE WHEN matched_rank IS NOT NULL THEN 1 END) * 100.0 / 1109, 2) as total_percent
  FROM inaturalist_classification_cache
`);

const stats = result.rows[0];
console.log(`Enhanced: ${stats.enhanced}/200 (${stats.batch_percent}% of batch, ${stats.total_percent}% total)`);
console.log(`Recent: ${stats.recent} in last 5 minutes`);
console.log(`Latest: ${stats.latest_genus} → ${stats.latest_family}`);

await pool.end();