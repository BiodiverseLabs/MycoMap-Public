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
import { eq, sql, desc, asc } from "drizzle-orm";
import type { IStorage } from "./storage";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
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
  async getObservationMetrics(startDate?: string, endDate?: string): Promise<{
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
    
    // Execute all metric queries in parallel for better performance
    const [totalCount, speciesCount, contributorCount, stateCount] = await Promise.all([
      // Total observations count
      db.execute(sql`SELECT COUNT(*)::int as count FROM ${observations} WHERE ${whereClause}`),
      
      // Unique species count
      db.execute(sql`SELECT COUNT(DISTINCT ${observations.scientificName})::int as count FROM ${observations} WHERE ${whereClause}`),
      
      // Active contributors count
      db.execute(sql`SELECT COUNT(DISTINCT ${observations.collector})::int as count FROM ${observations} WHERE ${whereClause} AND ${observations.collector} IS NOT NULL`),
      
      // States covered count
      db.execute(sql`SELECT COUNT(DISTINCT ${observations.state})::int as count FROM ${observations} WHERE ${whereClause} AND ${observations.state} IS NOT NULL`)
    ]);
    
    return {
      totalObservations: (totalCount.rows[0] as any).count,
      uniqueSpecies: (speciesCount.rows[0] as any).count,
      activeContributors: (contributorCount.rows[0] as any).count,
      statesCovered: (stateCount.rows[0] as any).count,
    };
  }

  async getTemporalTrends(groupBy: 'month' | 'quarter' | 'year'): Promise<Array<{
    period: string;
    count: number;
  }>> {
    const formatMap = {
      month: "YYYY-MM",
      quarter: "YYYY-Q",
      year: "YYYY"
    };
    
    const format = formatMap[groupBy];
    const result = await db.execute(sql`
      SELECT 
        to_char(${observations.observedOn}::date, ${format}) as period,
        COUNT(*)::int as count
      FROM ${observations}
      WHERE ${observations.observedOn} IS NOT NULL
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
    let whereConditions = [sql`${observations.species} IS NOT NULL AND ${observations.species} != ''`];
    
    if (state) {
      whereConditions.push(sql`${observations.state} = ${state}`);
    }
    
    const whereClause = whereConditions.length > 1 
      ? sql.join(whereConditions, sql` AND `)
      : whereConditions[0];
    
    const result = await db.execute(sql`
      SELECT 
        ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) as id,
        ${observations.species} as "scientificName",
        ${observations.commonName} as "commonName",
        COUNT(*)::int as "observationCount"
      FROM ${observations}
      WHERE ${whereClause}
      GROUP BY ${observations.species}, ${observations.commonName}
      ORDER BY "observationCount" DESC
      LIMIT ${limit}
    `);
    
    return result.rows as Species[];
  }

  async getRareSpecies(maxObservations: number = 3): Promise<Species[]> {
    const result = await db.execute(sql`
      SELECT 
        ROW_NUMBER() OVER (ORDER BY COUNT(*) ASC) as id,
        ${observations.species} as "scientificName",
        ${observations.commonName} as "commonName",
        COUNT(*)::int as "observationCount"
      FROM ${observations}
      WHERE ${observations.species} IS NOT NULL AND ${observations.species} != ''
      GROUP BY ${observations.species}, ${observations.commonName}
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
        ${observations.species} as "scientificName",
        ${observations.state} as state,
        ${observations.observedOn} as "observedOn"
      FROM ${observations}
      WHERE ${observations.isFirstStateRecord} = true 
        AND ${observations.species} IS NOT NULL 
        AND ${observations.species} != ''
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

  async getRecordIndex(limit: number = 50, offset: number = 0, stateFirstsOnly: boolean = false, recent: boolean = false): Promise<Array<{
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
    const result = await db.execute(sql`
      WITH ranked_observations AS (
        SELECT 
          ${observations.id} as id,
          ${observations.species} as species,
          ${observations.state} as state,
          ${observations.observedOn} as "reportDate",
          COALESCE(${observations.source}, 'Unknown') as source,
          COALESCE(${observations.observationId}, 'N/A') as "referenceNumber",
          ROW_NUMBER() OVER (
            ORDER BY ${observations.observedOn}, ${observations.species}
          ) as "datasetRecordNumber",
          ROW_NUMBER() OVER (
            PARTITION BY ${observations.species}, ${observations.state}
            ORDER BY ${observations.observedOn}
          ) as "stateRecordNumber",
          ROW_NUMBER() OVER (
            PARTITION BY ${observations.species}
            ORDER BY ${observations.observedOn}
          ) as species_rank_global,
          ROW_NUMBER() OVER (
            PARTITION BY ${observations.species}, ${observations.state}
            ORDER BY ${observations.observedOn}
          ) as species_rank_state
        FROM ${observations}
        WHERE ${observations.species} IS NOT NULL 
          AND ${observations.species} != ''
          AND ${observations.observedOn} IS NOT NULL
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
      ${stateFirstsOnly ? sql`WHERE species_rank_state = 1` : sql``}
      ${recent ? sql`WHERE (species_rank_global = 1 OR species_rank_state = 1)` : sql``}
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
}