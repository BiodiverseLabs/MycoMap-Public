import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { 
  users, observations, uploads, contributors, species,
  type User, type InsertUser, type Observation, type InsertObservation,
  type Upload, type InsertUpload, type Contributor, type InsertContributor,
  type Species, type InsertSpecies
} from "@shared/schema";
import { eq, desc, asc, and, or, isNotNull, ne, sql, count } from 'drizzle-orm';
import type { IStorage } from "./storage";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 10, // Maximum number of connections in the pool
  statement_timeout: 60000, // 60 second timeout
  query_timeout: 60000, // 60 second query timeout
});
export const db = drizzle({ client: pool, schema });

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Observations
  async getAllObservations(): Promise<Observation[]> {
    return await db.select().from(observations).orderBy(desc(observations.observedOn));
  }

  async getObservationsByDateRange(startDate: string, endDate: string): Promise<Observation[]> {
    return await db.select().from(observations)
      .where(sql`${observations.observedOn} >= ${startDate} AND ${observations.observedOn} <= ${endDate}`)
      .orderBy(desc(observations.observedOn));
  }

  async getObservationsByState(state: string): Promise<Observation[]> {
    return await db.select().from(observations)
      .where(eq(observations.state, state))
      .orderBy(desc(observations.observedOn));
  }

  async createObservation(observation: InsertObservation): Promise<Observation> {
    const [newObs] = await db.insert(observations).values(observation).returning();
    return newObs;
  }

  async createObservations(observationList: InsertObservation[]): Promise<Observation[]> {
    if (observationList.length === 0) return [];
    const newObservations = await db.insert(observations).values(observationList).returning();
    return newObservations;
  }

  // Analytics
  async getObservationMetrics(startDate?: string, endDate?: string, state?: string): Promise<{
    totalObservations: number;
    uniqueSpecies: number;
    activeContributors: number;
    statesCovered: number;
  }> {
    // Use optimized SQL queries instead of loading all records
    let whereClause = sql`1=1`;
    
    if (startDate && endDate) {
      whereClause = sql`${observations.observedOn} >= ${startDate} AND ${observations.observedOn} <= ${endDate}`;
    }
    
    if (state) {
      if (startDate && endDate) {
        whereClause = sql`${observations.observedOn} >= ${startDate} AND ${observations.observedOn} <= ${endDate} AND ${observations.state} = ${state}`;
      } else {
        whereClause = sql`${observations.state} = ${state}`;
      }
    }
    
    // Execute all metric queries in parallel for better performance
    const [totalCount, speciesCount, contributorCount, stateCount] = await Promise.all([
      // Total observations count
      db.execute(sql`SELECT COUNT(*)::int as count FROM ${observations} WHERE ${whereClause}`),
      
      // Unique species count
      db.execute(sql`SELECT COUNT(DISTINCT ${observations.scientificName})::int as count FROM ${observations} WHERE ${whereClause}`),
      
      // Active contributors count
      db.execute(sql`SELECT COUNT(DISTINCT ${observations.collector})::int as count FROM ${observations} WHERE ${whereClause} AND ${observations.collector} IS NOT NULL`),
      
      // States covered count (always 1 when filtering by state, otherwise count distinct states)
      state ? 
        Promise.resolve({ rows: [{ count: 1 }] }) :
        db.execute(sql`SELECT COUNT(DISTINCT ${observations.state})::int as count FROM ${observations} WHERE ${whereClause} AND ${observations.state} IS NOT NULL`)
    ]);
    
    return {
      totalObservations: (totalCount.rows[0] as any).count,
      uniqueSpecies: (speciesCount.rows[0] as any).count,
      activeContributors: (contributorCount.rows[0] as any).count,
      statesCovered: (stateCount.rows[0] as any).count,
    };
  }

  async getTemporalTrends(groupBy: 'month' | 'quarter' | 'year', state?: string): Promise<Array<{
    period: string;
    count: number;
  }>> {
    const formatMap = {
      month: "YYYY-MM",
      quarter: "YYYY-Q",
      year: "YYYY"
    };
    
    const format = formatMap[groupBy];
    
    let whereConditions = [sql`${observations.observedOn} IS NOT NULL`];
    
    if (state) {
      whereConditions.push(sql`${observations.state} = ${state}`);
    }
    
    const whereClause = whereConditions.length > 1 
      ? sql.join(whereConditions, sql` AND `)
      : whereConditions[0];
    
    const result = await db.execute(sql`
      SELECT 
        to_char(${observations.observedOn}::date, ${format}) as period,
        COUNT(*)::int as count
      FROM ${observations}
      WHERE ${whereClause}
      GROUP BY period
      ORDER BY period
    `);
    
    return result.rows as Array<{ period: string; count: number }>;
  }

  async getTaxonomicDistribution(): Promise<Array<{
    phylum: string;
    count: number;
  }>> {
    const result = await db.execute(sql`
      SELECT 
        COALESCE(${observations.phylum}, 'Unknown') as phylum,
        COUNT(*)::int as count
      FROM ${observations}
      GROUP BY ${observations.phylum}
      ORDER BY count DESC
    `);
    
    return result.rows as Array<{ phylum: string; count: number }>;
  }

  async getFamilyDistribution(): Promise<Array<{
    family: string;
    count: number;
  }>> {
    const result = await db.execute(sql`
      SELECT 
        COALESCE(${observations.family}, 'Unknown') as family,
        COUNT(*)::int as count
      FROM ${observations}
      WHERE ${observations.family} IS NOT NULL AND ${observations.family} != ''
      GROUP BY ${observations.family}
      ORDER BY count DESC
    `);
    
    return result.rows as Array<{ family: string; count: number }>;
  }

  async getClassDistribution(): Promise<Array<{
    class: string;
    count: number;
  }>> {
    const result = await db.execute(sql`
      SELECT 
        COALESCE(${observations.class}, 'Unknown') as class,
        COUNT(*)::int as count
      FROM ${observations}
      WHERE ${observations.class} IS NOT NULL AND ${observations.class} != ''
      GROUP BY ${observations.class}
      ORDER BY count DESC
    `);
    
    return result.rows as Array<{ class: string; count: number }>;
  }

  async getOrderDistribution(): Promise<Array<{
    order: string;
    count: number;
  }>> {
    const result = await db.execute(sql`
      SELECT 
        COALESCE(${observations.order}, 'Unknown') as "order",
        COUNT(*)::int as count
      FROM ${observations}
      WHERE ${observations.order} IS NOT NULL AND ${observations.order} != ''
      GROUP BY ${observations.order}
      ORDER BY count DESC
    `);
    
    return result.rows as Array<{ order: string; count: number }>;
  }

  async getGenusDistribution(): Promise<Array<{ genus: string; count: number }>> {
    const result = await db.execute(sql`
      SELECT 
        COALESCE(${observations.genus}, 'Unknown') as genus,
        COUNT(*)::int as count
      FROM ${observations}
      WHERE ${observations.genus} IS NOT NULL AND ${observations.genus} != ''
      GROUP BY ${observations.genus}
      ORDER BY count DESC
    `);
    
    return result.rows as Array<{ genus: string; count: number }>;
  }

  async getSeasonalPatterns(): Promise<Array<{ season: string; count: number; percentage: number }>> {
    const result = await db.execute(sql`
      WITH seasonal_data AS (
        SELECT 
          CASE 
            WHEN EXTRACT(MONTH FROM ${observations.observedOn}::date) IN (12, 1, 2) THEN 'Winter'
            WHEN EXTRACT(MONTH FROM ${observations.observedOn}::date) IN (3, 4, 5) THEN 'Spring'
            WHEN EXTRACT(MONTH FROM ${observations.observedOn}::date) IN (6, 7, 8) THEN 'Summer'
            WHEN EXTRACT(MONTH FROM ${observations.observedOn}::date) IN (9, 10, 11) THEN 'Fall'
          END as season,
          COUNT(*) as count
        FROM ${observations}
        WHERE ${observations.observedOn} IS NOT NULL
        GROUP BY season
      ),
      total_count AS (
        SELECT SUM(count) as total FROM seasonal_data
      )
      SELECT 
        s.season,
        s.count::int,
        ROUND((s.count::numeric / t.total::numeric * 100), 1) as percentage
      FROM seasonal_data s, total_count t
      ORDER BY s.count DESC
    `);
    
    return result.rows as Array<{ season: string; count: number; percentage: number }>;
  }

  async getMonthlyStatistics(): Promise<Array<{ month: string; count: number; monthNumber: number }>> {
    const result = await db.execute(sql`
      SELECT 
        TO_CHAR(${observations.observedOn}::date, 'Month') as month,
        EXTRACT(MONTH FROM ${observations.observedOn}::date)::int as "monthNumber",
        COUNT(*)::int as count
      FROM ${observations}
      WHERE ${observations.observedOn} IS NOT NULL
      GROUP BY EXTRACT(MONTH FROM ${observations.observedOn}::date), TO_CHAR(${observations.observedOn}::date, 'Month')
      ORDER BY count DESC
      LIMIT 10
    `);
    
    return result.rows as Array<{ month: string; count: number; monthNumber: number }>;
  }

  async getTopContributors(limit: number = 10, startDate?: string, endDate?: string, state?: string): Promise<Contributor[]> {
    let whereConditions = [sql`${observations.collector} IS NOT NULL`];
    
    if (startDate && endDate) {
      whereConditions.push(sql`${observations.observedOn} >= ${startDate} AND ${observations.observedOn} <= ${endDate}`);
    }
    
    if (state) {
      whereConditions.push(sql`${observations.state} = ${state}`);
    }
    
    const whereClause = whereConditions.length > 1 
      ? sql.join(whereConditions, sql` AND `)
      : whereConditions[0];
    
    const result = await db.execute(sql`
      SELECT 
        ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) as id,
        ${observations.collector} as name,
        NULL as affiliation,
        COUNT(*)::int as "observationCount"
      FROM ${observations}
      WHERE ${whereClause}
      GROUP BY ${observations.collector}
      ORDER BY "observationCount" DESC
      LIMIT ${limit}
    `);
    
    return result.rows as Contributor[];
  }

  async getTopSpecies(limit: number = 10, state?: string): Promise<Species[]> {
    let whereConditions = [sql`${observations.scientificName} IS NOT NULL AND ${observations.scientificName} != ''`];
    
    if (state) {
      whereConditions.push(sql`${observations.state} = ${state}`);
    }
    
    const whereClause = whereConditions.length > 1 
      ? sql.join(whereConditions, sql` AND `)
      : whereConditions[0];
    
    const result = await db.execute(sql`
      SELECT 
        ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) as id,
        ${observations.scientificName} as "scientificName",
        ${observations.commonName} as "commonName",
        COUNT(*)::int as "observationCount",
        MIN(${observations.observedOn}) as "firstObserved",
        MAX(${observations.observedOn}) as "lastObserved",
        COUNT(DISTINCT ${observations.state}) as "stateCount"
      FROM ${observations}
      WHERE ${whereClause}
      GROUP BY ${observations.scientificName}, ${observations.commonName}
      ORDER BY "observationCount" DESC
      LIMIT ${limit}
    `);
    
    return result.rows as Species[];
  }

  async getRareSpecies(maxObservations: number = 3, state?: string): Promise<Species[]> {
    let whereConditions = [sql`${observations.scientificName} IS NOT NULL AND ${observations.scientificName} != ''`];
    
    if (state) {
      whereConditions.push(sql`${observations.state} = ${state}`);
    }
    
    const whereClause = whereConditions.length > 1 
      ? sql.join(whereConditions, sql` AND `)
      : whereConditions[0];
    
    const result = await db.execute(sql`
      SELECT 
        ROW_NUMBER() OVER (ORDER BY COUNT(*) ASC) as id,
        ${observations.scientificName} as "scientificName",
        ${observations.commonName} as "commonName",
        COUNT(*)::int as "observationCount"
      FROM ${observations}
      WHERE ${whereClause}
      GROUP BY ${observations.scientificName}, ${observations.commonName}
      HAVING COUNT(*) <= ${maxObservations}
      ORDER BY "observationCount" ASC
      LIMIT 10
    `);
    
    return result.rows as Species[];
  }

  async getRecentStateRecords(limit: number = 10): Promise<Observation[]> {
    const result = await db.execute(sql`
      SELECT 
        ${observations.id} as id,
        ${observations.scientificName} as "scientificName",
        ${observations.state} as state,
        ${observations.observedOn} as "observedOn"
      FROM ${observations}
      WHERE ${observations.isFirstStateRecord} = true 
        AND ${observations.scientificName} IS NOT NULL 
        AND ${observations.scientificName} != ''
      ORDER BY ${observations.observedOn} DESC
      LIMIT ${limit}
    `);
    
    return result.rows as Observation[];
  }

  // Uploads
  async createUpload(upload: InsertUpload): Promise<Upload> {
    const [newUpload] = await db.insert(uploads).values(upload).returning();
    return newUpload;
  }

  async getUploads(): Promise<Upload[]> {
    return await db.select().from(uploads).orderBy(desc(uploads.uploadedAt));
  }

  async updateUploadStatus(id: number, status: string, errorMessage?: string): Promise<void> {
    await db.update(uploads)
      .set({ status, errorMessage })
      .where(eq(uploads.id, id));
  }

  // Contributors and Species
  async upsertContributor(contributor: InsertContributor): Promise<Contributor> {
    const existing = await db.select().from(contributors).where(eq(contributors.name, contributor.name));
    
    if (existing.length > 0) {
      const [updated] = await db.update(contributors)
        .set({
          observationCount: sql`${contributors.observationCount} + 1`,
          affiliation: contributor.affiliation || existing[0].affiliation
        })
        .where(eq(contributors.name, contributor.name))
        .returning();
      return updated;
    } else {
      const [newContributor] = await db.insert(contributors).values({
        ...contributor,
        observationCount: 1
      }).returning();
      return newContributor;
    }
  }

  async upsertSpecies(speciesData: InsertSpecies): Promise<Species> {
    const existing = await db.select().from(species)
      .where(eq(species.scientificName, speciesData.scientificName));
    
    if (existing.length > 0) {
      const [updated] = await db.update(species)
        .set({
          observationCount: sql`${species.observationCount} + 1`,
          lastObserved: speciesData.lastObserved || existing[0].lastObserved
        })
        .where(eq(species.scientificName, speciesData.scientificName))
        .returning();
      return updated;
    } else {
      const [newSpecies] = await db.insert(species).values({
        ...speciesData,
        observationCount: 1
      }).returning();
      return newSpecies;
    }
  }

  async getRecordIndex(limit: number = 50, offset: number = 0, stateFirstsOnly: boolean = false, recent: boolean = false, state?: string, globalFirstsOnly: boolean = false, startDate?: string, endDate?: string, species?: string): Promise<Array<{
    id: number;
    species: string;
    state: string;
    reportDate: string;
    source: string;
    referenceNumber: string;
    datasetRecordNumber: number;
    stateRecordNumber: number;
    isFirstGlobal: boolean;
    isFirstInState: boolean;
  }>> {
    let whereConditions = [
      sql`${observations.scientificName} IS NOT NULL`,
      sql`${observations.scientificName} != ''`,
      sql`${observations.observedOn} IS NOT NULL`
    ];
    
    if (state) {
      whereConditions.push(sql`${observations.state} = ${state}`);
    }

    if (startDate) {
      whereConditions.push(sql`${observations.observedOn} >= ${startDate}`);
    }

    if (endDate) {
      whereConditions.push(sql`${observations.observedOn} <= ${endDate}`);
    }

    if (species) {
      // More precise species search - exact match or starts with the search term
      whereConditions.push(sql`(
        LOWER(${observations.scientificName}) = LOWER(${species}) OR
        LOWER(${observations.scientificName}) LIKE LOWER(${species + ' %'}) OR
        LOWER(${observations.scientificName}) LIKE LOWER(${species.replace(/['"]/g, '') + '%'})
      )`);
    }
    
    const baseWhereClause = sql.join(whereConditions, sql` AND `);
    
    const result = await db.execute(sql`
      WITH global_rankings AS (
        SELECT 
          ${observations.id} as id,
          ${observations.scientificName} as species,
          ${observations.state} as state,
          ${observations.observedOn} as "reportDate",
          COALESCE(${observations.source}, 'Unknown') as source,
          COALESCE(${observations.observationId}, 'N/A') as "referenceNumber",
          ROW_NUMBER() OVER (
            ORDER BY ${observations.observedOn}, ${observations.scientificName}
          ) as "datasetRecordNumber",
          ROW_NUMBER() OVER (
            PARTITION BY ${observations.scientificName}, ${observations.state}
            ORDER BY ${observations.observedOn}
          ) as "stateRecordNumber",
          ROW_NUMBER() OVER (
            PARTITION BY ${observations.scientificName}
            ORDER BY ${observations.observedOn}
          ) as species_rank_global,
          ROW_NUMBER() OVER (
            PARTITION BY ${observations.scientificName}, ${observations.state}
            ORDER BY ${observations.observedOn}
          ) as species_rank_state
        FROM ${observations}
        WHERE ${observations.scientificName} IS NOT NULL 
          AND ${observations.scientificName} != '' 
          AND ${observations.observedOn} IS NOT NULL
      ),
      ranked_observations AS (
        SELECT * FROM global_rankings
        WHERE ${(() => {
          const conditions = [];
          if (state) conditions.push(sql`state = ${state}`);
          if (startDate) conditions.push(sql`"reportDate" >= ${startDate}`);
          if (endDate) conditions.push(sql`"reportDate" <= ${endDate}`);
          if (species) {
            conditions.push(sql`(
              LOWER(species) = LOWER(${species}) OR
              LOWER(species) LIKE LOWER(${species + ' %'}) OR
              LOWER(species) LIKE LOWER(${species.replace(/['"]/g, '') + '%'})
            )`);
          }
          return conditions.length > 0 ? sql.join(conditions, sql` AND `) : sql`1=1`;
        })()}
      )
      SELECT 
        id,
        species,
        state,
        "reportDate",
        source,
        "referenceNumber",
        "datasetRecordNumber",
        "stateRecordNumber",
        CASE WHEN species_rank_global = 1 THEN true ELSE false END as "isFirstGlobal",
        CASE WHEN species_rank_state = 1 THEN true ELSE false END as "isFirstInState"
      FROM ranked_observations
      ${(() => {
        const conditions = [];
        if (globalFirstsOnly) conditions.push(sql`species_rank_global = 1`);
        else if (stateFirstsOnly) conditions.push(sql`species_rank_state = 1`);
        else if (recent) conditions.push(sql`(species_rank_global = 1 OR species_rank_state = 1)`);
        return conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
      })()}
      ORDER BY ${recent ? sql`"reportDate" DESC` : sql`"datasetRecordNumber"`}
      LIMIT ${limit} OFFSET ${offset}
    `);
    
    return result.rows as Array<{
      id: number;
      species: string;
      state: string;
      reportDate: string;
      source: string;
      referenceNumber: string;
      datasetRecordNumber: number;
      stateRecordNumber: number;
      isFirstGlobal: boolean;
      isFirstInState: boolean;
    }>;
  }

  async clearAllData(): Promise<void> {
    await db.execute(sql`DELETE FROM ${observations}`);
    await db.execute(sql`DELETE FROM ${contributors}`);
    await db.execute(sql`DELETE FROM ${species}`);
  }

  async getObservationSources(dateRange?: string): Promise<Array<{
    source: string;
    count: number;
    percentage: number;
  }>> {
    let whereClause = sql`WHERE 1=1`;
    
    if (dateRange && dateRange !== 'all_time') {
      const now = new Date();
      let startDate: Date;
      
      switch (dateRange) {
        case 'last_30_days':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
          break;
        case 'last_6_months':
          startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
          break;
        case 'last_year':
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        default:
          startDate = new Date(0);
      }
      
      whereClause = sql`WHERE ${observations.observedOn} >= ${startDate.toISOString().split('T')[0]}`;
    }

    const result = await db.execute(sql`
      WITH source_counts AS (
        SELECT 
          COALESCE(${observations.source}, 'Unknown') as source,
          COUNT(*) as count
        FROM ${observations}
        ${whereClause}
        GROUP BY COALESCE(${observations.source}, 'Unknown')
      ),
      total_count AS (
        SELECT SUM(count) as total FROM source_counts
      )
      SELECT 
        sc.source,
        sc.count,
        ROUND((sc.count * 100.0 / tc.total), 2) as percentage
      FROM source_counts sc
      CROSS JOIN total_count tc
      ORDER BY sc.count DESC
    `);

    return result.rows as Array<{
      source: string;
      count: number;
      percentage: number;
    }>;
  }

  async getSpeciesAccumulation(state?: string): Promise<Array<{
    observationNumber: number;
    uniqueSpeciesCount: number;
  }>> {
    let whereClause = sql`WHERE ${observations.scientificName} IS NOT NULL AND ${observations.scientificName} != ''`;
    
    if (state && state !== 'all') {
      whereClause = sql`WHERE ${observations.scientificName} IS NOT NULL AND ${observations.scientificName} != '' AND ${observations.state} = ${state}`;
    }

    const result = await db.execute(sql`
      WITH ordered_observations AS (
        SELECT 
          ${observations.scientificName} as scientific_name,
          ${observations.observedOn},
          ${observations.id},
          ROW_NUMBER() OVER (ORDER BY ${observations.observedOn}, ${observations.id}) as observation_number
        FROM ${observations}
        ${whereClause}
      ),
      species_first_appearance AS (
        SELECT 
          scientific_name,
          MIN(observation_number) as first_observation
        FROM ordered_observations
        GROUP BY scientific_name
      ),
      accumulation_points AS (
        SELECT 
          o.observation_number,
          COUNT(s.scientific_name) as new_species_count
        FROM ordered_observations o
        LEFT JOIN species_first_appearance s ON o.observation_number = s.first_observation
        GROUP BY o.observation_number
        ORDER BY o.observation_number
      )
      SELECT 
        observation_number as "observationNumber",
        SUM(new_species_count) OVER (
          ORDER BY observation_number 
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) as "uniqueSpeciesCount"
      FROM accumulation_points
      ORDER BY observation_number
    `);

    return result.rows.map(row => ({
      observationNumber: parseInt(row.observationNumber as string),
      uniqueSpeciesCount: parseInt(row.uniqueSpeciesCount as string)
    }));
  }

  // GPS Index optimization methods for faster map loading
  async buildGpsIndex(): Promise<void> {
    const { gpsIndex } = schema;
    
    // Clear existing GPS index
    await db.delete(gpsIndex);
    
    // Populate GPS index from observations with valid coordinates
    await db.execute(sql`
      INSERT INTO gps_index (observation_id, latitude, longitude, state, scientific_name, observed_on)
      SELECT 
        id,
        latitude,
        longitude,
        state,
        scientific_name,
        observed_on
      FROM observations 
      WHERE latitude IS NOT NULL 
        AND longitude IS NOT NULL 
        AND latitude != '0' 
        AND longitude != '0'
        AND CAST(latitude AS DECIMAL) BETWEEN -90 AND 90
        AND CAST(longitude AS DECIMAL) BETWEEN -180 AND 180
    `);
    
    console.log('[GPS Index] GPS index rebuilt successfully');
  }

  async getMapDataOptimized(limit: number = 75000, state?: string): Promise<Array<{
    latitude: number;
    longitude: number;
    species?: string;
    collector?: string;
  }>> {
    const { observations } = schema;
    const startTime = Date.now();
    
    try {
      // Use direct observations query with optimized filtering
      const whereConditions = [
        isNotNull(observations.latitude),
        isNotNull(observations.longitude),
        ne(observations.latitude, 0),
        ne(observations.longitude, 0),
      ];

      if (state) {
        whereConditions.push(eq(observations.state, state));
      }

      const result = await db.select({
        latitude: observations.latitude,
        longitude: observations.longitude,
        species: observations.scientificName,
        collector: observations.collector,
      })
      .from(observations)
      .where(and(...whereConditions))
      .limit(limit);

      const endTime = Date.now();
      console.log(`[Map Data] Retrieved ${result.length} coordinates in ${endTime - startTime}ms (state: ${state || 'all'})`);

      return result.map(row => ({
        latitude: parseFloat(row.latitude!.toString()),
        longitude: parseFloat(row.longitude!.toString()),
        species: row.species || undefined,
        collector: row.collector || undefined,
      }));
    } catch (error) {
      console.log('[Map Data] Error, using fallback with reduced limit');
      return this.getMapDataFallback(Math.min(limit, 20000), state);
    }
  }

  async getMapDataChunked(limit: number, state?: string): Promise<Array<{
    latitude: number;
    longitude: number;
    species?: string;
    observer?: string;
  }>> {
    const startTime = Date.now();
    const chunkSize = 20000;
    const allResults: Array<{latitude: number; longitude: number; species?: string}> = [];
    
    try {
      let offset = 0;
      let totalRetrieved = 0;
      
      while (totalRetrieved < limit) {
        const currentChunkSize = Math.min(chunkSize, limit - totalRetrieved);
        
        let sqlQuery = `
          SELECT latitude, longitude, species 
          FROM gps_index 
        `;
        
        if (state) {
          sqlQuery += ` WHERE state = '${state.replace(/'/g, "''")}'`;
        }
        
        sqlQuery += ` LIMIT ${currentChunkSize} OFFSET ${offset}`;
        
        const result = await db.execute(sql.raw(sqlQuery));
        
        if (result.rows.length === 0) {
          break; // No more data
        }
        
        const chunkData = result.rows.map((row: any) => ({
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
          species: row.species || undefined,
        }));
        
        allResults.push(...chunkData);
        totalRetrieved += result.rows.length;
        offset += chunkSize;
        
        console.log(`[GPS Index] Chunk ${Math.ceil(offset/chunkSize)}: Retrieved ${result.rows.length} coordinates (Total: ${totalRetrieved})`);
      }
      
      const endTime = Date.now();
      console.log(`[GPS Index] Retrieved ${allResults.length} coordinates in ${endTime - startTime}ms using chunked approach (state: ${state || 'all'})`);
      
      return allResults;
    } catch (error) {
      console.log('[GPS Index] Chunked approach failed, falling back');
      return this.getMapDataFallback(Math.min(limit, 7000), state);
    }
  }

  async getMapDataFallback(limit: number = 7000, state?: string): Promise<Array<{
    latitude: number;
    longitude: number;
    species?: string;
    collector?: string;
  }>> {
    const { observations } = schema;
    const startTime = Date.now();
    
    const whereConditions = [
      isNotNull(observations.latitude),
      isNotNull(observations.longitude),
      ne(observations.latitude, '0'),
      ne(observations.longitude, '0'),
    ];

    if (state) {
      whereConditions.push(eq(observations.state, state));
    }

    const result = await db.select({
      latitude: observations.latitude,
      longitude: observations.longitude,
      species: observations.scientificName,
      collector: observations.collector,
    })
    .from(observations)
    .where(and(...whereConditions))
    .limit(limit);

    const endTime = Date.now();
    console.log(`[GPS Fallback] Retrieved ${result.length} coordinates in ${endTime - startTime}ms`);

    return result.map(row => ({
      latitude: parseFloat(row.latitude!),
      longitude: parseFloat(row.longitude!),
      species: row.species || undefined,
      collector: row.collector || undefined,
    }));
  }

  async getStatesWithMostGlobalFirsts(filterState?: string): Promise<Array<{
    state: string;
    globalFirstCount: number;
    percentage: number;
  }>> {
    const { observations } = schema;
    
    try {
      let query = db
        .select({
          state: observations.state,
          globalFirstCount: sql<number>`COUNT(*)`.as('globalFirstCount')
        })
        .from(observations)
        .where(eq(observations.isFirstGlobal, true))
        .groupBy(observations.state)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(20);

      if (filterState) {
        query = query.where(eq(observations.state, filterState));
      }

      const results = await query;
      
      // Calculate total global firsts for percentage calculation
      const totalGlobalFirsts = results.reduce((sum, item) => sum + item.globalFirstCount, 0);
      
      return results.map(item => ({
        state: item.state,
        globalFirstCount: item.globalFirstCount,
        percentage: totalGlobalFirsts > 0 ? (item.globalFirstCount / totalGlobalFirsts) * 100 : 0
      }));
    } catch (error) {
      console.error('Error fetching states with most global firsts:', error);
      return [];
    }
  }

  async getContributorsWithMostGlobalFirsts(limit: number = 10, filterState?: string): Promise<Array<{
    id: string;
    name: string;
    affiliation?: string;
    globalFirstCount: number;
    percentage: number;
  }>> {
    const { observations, contributors } = schema;
    
    try {
      let query = db
        .select({
          id: contributors.id,
          name: contributors.name,
          affiliation: contributors.affiliation,
          globalFirstCount: sql<number>`COUNT(*)`.as('globalFirstCount')
        })
        .from(observations)
        .innerJoin(contributors, eq(observations.contributorId, contributors.id))
        .where(eq(observations.isFirstGlobal, true))
        .groupBy(contributors.id, contributors.name, contributors.affiliation)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(limit);

      if (filterState) {
        query = query.where(eq(observations.state, filterState));
      }

      const results = await query;
      
      // Calculate total global firsts for percentage calculation
      const totalGlobalFirsts = results.reduce((sum, item) => sum + item.globalFirstCount, 0);
      
      return results.map(item => ({
        id: item.id,
        name: item.name,
        affiliation: item.affiliation || undefined,
        globalFirstCount: item.globalFirstCount,
        percentage: totalGlobalFirsts > 0 ? (item.globalFirstCount / totalGlobalFirsts) * 100 : 0
      }));
    } catch (error) {
      console.error('Error fetching contributors with most global firsts:', error);
      return [];
    }
  }

  async clearAllData(): Promise<void> {
    const { gpsIndex, observations, contributors, species, uploads } = schema;
    await db.delete(gpsIndex);
    await db.delete(observations);
    await db.delete(contributors);
    await db.delete(species);
    await db.delete(uploads);
  }

  async getObservationsWithNameUpdates(): Promise<Observation[]> {
    const { observations } = schema;
    return await db.select()
      .from(observations)
      .where(eq(observations.nameUpdate, true))
      .orderBy(desc(observations.updatedAt));
  }

  async getObservationsWithClassificationUpdates(): Promise<Observation[]> {
    const { observations } = schema;
    return await db.select()
      .from(observations)
      .where(eq(observations.classificationUpdate, true))
      .orderBy(desc(observations.updatedAt));
  }

  async getObservationsWithEncodingIssues(): Promise<Observation[]> {
    const { observations } = schema;
    return await db.select()
      .from(observations)
      .where(or(
        like(observations.scientificName, '%â€œ%'),
        like(observations.scientificName, '%â€%'),
        like(observations.scientificName, '%â€™%'),
        like(observations.collector, '%â€œ%'),
        like(observations.collector, '%â€%'),
        like(observations.collector, '%â€™%'),
        like(observations.state, '%â€œ%'),
        like(observations.state, '%â€%'),
        like(observations.state, '%â€™%')
      ))
      .orderBy(desc(observations.updatedAt));
  }

  async updateObservationTaxonomy(id: number, taxonomyData: {
    kingdom?: string;
    phylum?: string;
    class?: string;
    order?: string;
    family?: string;
    genus?: string;
    classificationUpdate?: boolean;
  }): Promise<void> {
    await db.update(observations)
      .set(taxonomyData)
      .where(eq(observations.id, id));
  }
}