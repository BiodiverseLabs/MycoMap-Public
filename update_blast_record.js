import { Pool } from '@neondatabase/serverless';

async function updateBlastRecord() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    const result = await pool.query(`
      UPDATE observations 
      SET 
        mycomap_blast_url = $1,
        ncbi_blast_file = $2,
        local_blast_file = $3,
        blast_files_downloaded = true,
        blast_download_date = NOW()
      WHERE observation_id = $4
      RETURNING id, observation_id, ncbi_blast_file, local_blast_file, blast_files_downloaded
    `, [
      'https://mycomap.com/genetics/blast-search/hfsont34_its4-5_90-fds-pl-rs02-hs13-fds-ca-08759-inat271525867-x-1-ric482-359548-r285317/',
      'iNat271525489-NCBI-BLAST.xml',
      'iNat271525489-Local-BLAST.xml',
      '271525489'
    ]);
    
    console.log('Updated observation record:', result.rows[0]);
    
    if (result.rows.length === 0) {
      console.log('No rows updated - checking if observation exists...');
      const check = await pool.query(`
        SELECT id, observation_id, mycomap_blast_url 
        FROM observations 
        WHERE observation_id = $1
      `, ['271525489']);
      console.log('Found observations:', check.rows);
    }
  } catch (error) {
    console.error('Update failed:', error);
  } finally {
    await pool.end();
  }
}

updateBlastRecord();