#!/usr/bin/env tsx

import { pool } from './server/db.ts';

const result = await pool.query(`
  SELECT 
    COUNT(CASE WHEN matched_rank IS NOT NULL THEN 1 END) as enhanced,
    COUNT(CASE WHEN updated_at > NOW() - INTERVAL '2 minutes' THEN 1 END) as recent,
    (SELECT genus FROM inaturalist_classification_cache WHERE matched_rank IS NOT NULL ORDER BY updated_at DESC LIMIT 1) as latest,
    ROUND(COUNT(CASE WHEN matched_rank IS NOT NULL THEN 1 END) * 100.0 / 1087, 1) as percent
  FROM inaturalist_classification_cache
`);

const stats = result.rows[0];
const isActive = parseInt(stats.recent) > 0 ? '🟢 ACTIVE' : '🔴 STOPPED';

console.log(`${isActive} | Enhanced: ${stats.enhanced}/1087 (${stats.percent}%) | Latest: ${stats.latest}`);

await pool.end();