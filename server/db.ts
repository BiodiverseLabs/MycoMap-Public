import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { 
  users, observations, uploads, contributors, species, redlistAssessments, inaturalistData, inaturalistPlaces,
  type User, type InsertUser, type Observation, type InsertObservation,
  type Upload, type InsertUpload, type Contributor, type InsertContributor,
  type Species, type InsertSpecies, type RedlistAssessment, type InsertRedlistAssessment,
  type InaturalistData, type InsertInaturalistData, type InaturalistPlace, type InsertInaturalistPlace
} from "@shared/schema";
import { eq, desc, asc, and, or, isNotNull, ne, sql, count, like, inArray } from 'drizzle-orm';
import type { IStorage } from "./storage";
import { blastDownloader } from "./blastDownloader";

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

  async getTemporalTrends(groupBy: 'month' | 'quarter' | 'year', state?: string, startDate?: string, endDate?: string, goingBackYears?: string): Promise<Array<{
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

    // Apply date filtering with "going back X years" logic
    if (goingBackYears && goingBackYears !== "0" && startDate && endDate) {
      // For "going back X years", match the same date range across multiple years
      const yearsBack = parseInt(goingBackYears);
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      
      const startMonth = startDateObj.getMonth() + 1;
      const startDay = startDateObj.getDate();
      const endMonth = endDateObj.getMonth() + 1;
      const endDay = endDateObj.getDate();
      const currentYear = endDateObj.getFullYear();
      const earliestYear = currentYear - yearsBack;
      
      // Match same date range across years
      if (startMonth === endMonth) {
        // Same month range
        whereConditions.push(sql`
          EXTRACT(YEAR FROM ${observations.observedOn}::date) >= ${earliestYear}
          AND EXTRACT(MONTH FROM ${observations.observedOn}::date) = ${startMonth}
          AND EXTRACT(DAY FROM ${observations.observedOn}::date) >= ${startDay}
          AND EXTRACT(DAY FROM ${observations.observedOn}::date) <= ${endDay}
        `);
      } else {
        // Cross-month range
        whereConditions.push(sql`
          EXTRACT(YEAR FROM ${observations.observedOn}::date) >= ${earliestYear}
          AND (
            (EXTRACT(MONTH FROM ${observations.observedOn}::date) = ${startMonth} AND EXTRACT(DAY FROM ${observations.observedOn}::date) >= ${startDay})
            OR (EXTRACT(MONTH FROM ${observations.observedOn}::date) > ${startMonth} AND EXTRACT(MONTH FROM ${observations.observedOn}::date) < ${endMonth})
            OR (EXTRACT(MONTH FROM ${observations.observedOn}::date) = ${endMonth} AND EXTRACT(DAY FROM ${observations.observedOn}::date) <= ${endDay})
          )
        `);
      }
    } else if (startDate || endDate) {
      // Regular date range filtering
      if (startDate) {
        whereConditions.push(sql`${observations.observedOn} >= ${startDate}`);
      }
      if (endDate) {
        whereConditions.push(sql`${observations.observedOn} <= ${endDate}`);
      }
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

  async getSeasonalPatterns(state?: string, startDate?: string, endDate?: string, goingBackYears?: string): Promise<Array<{ season: string; count: number; percentage: number }>> {
    let whereConditions = [sql`${observations.observedOn} IS NOT NULL`];
    
    if (state) {
      whereConditions.push(sql`${observations.state} = ${state}`);
    }

    // Apply date filtering with "going back X years" logic
    if (goingBackYears && goingBackYears !== "0" && startDate && endDate) {
      // For "going back X years", match the same date range across multiple years
      const yearsBack = parseInt(goingBackYears);
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      
      const startMonth = startDateObj.getMonth() + 1;
      const startDay = startDateObj.getDate();
      const endMonth = endDateObj.getMonth() + 1;
      const endDay = endDateObj.getDate();
      const currentYear = endDateObj.getFullYear();
      const earliestYear = currentYear - yearsBack;
      
      // Match same date range across years
      if (startMonth === endMonth) {
        // Same month range
        whereConditions.push(sql`
          EXTRACT(YEAR FROM ${observations.observedOn}::date) >= ${earliestYear}
          AND EXTRACT(MONTH FROM ${observations.observedOn}::date) = ${startMonth}
          AND EXTRACT(DAY FROM ${observations.observedOn}::date) >= ${startDay}
          AND EXTRACT(DAY FROM ${observations.observedOn}::date) <= ${endDay}
        `);
      } else {
        // Cross-month range
        whereConditions.push(sql`
          EXTRACT(YEAR FROM ${observations.observedOn}::date) >= ${earliestYear}
          AND (
            (EXTRACT(MONTH FROM ${observations.observedOn}::date) = ${startMonth} AND EXTRACT(DAY FROM ${observations.observedOn}::date) >= ${startDay})
            OR (EXTRACT(MONTH FROM ${observations.observedOn}::date) > ${startMonth} AND EXTRACT(MONTH FROM ${observations.observedOn}::date) < ${endMonth})
            OR (EXTRACT(MONTH FROM ${observations.observedOn}::date) = ${endMonth} AND EXTRACT(DAY FROM ${observations.observedOn}::date) <= ${endDay})
          )
        `);
      }
    } else if (startDate || endDate) {
      // Regular date range filtering
      if (startDate) {
        whereConditions.push(sql`${observations.observedOn} >= ${startDate}`);
      }
      if (endDate) {
        whereConditions.push(sql`${observations.observedOn} <= ${endDate}`);
      }
    }
    
    const whereClause = whereConditions.length > 1 
      ? sql.join(whereConditions, sql` AND `)
      : whereConditions[0];

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
        WHERE ${whereClause}
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

  async getMonthlyStatistics(state?: string, startDate?: string, endDate?: string, goingBackYears?: string): Promise<Array<{ month: string; count: number; monthNumber: number }>> {
    let whereConditions = [sql`${observations.observedOn} IS NOT NULL`];
    
    if (state) {
      whereConditions.push(sql`${observations.state} = ${state}`);
    }

    // Apply date filtering with "going back X years" logic
    if (goingBackYears && goingBackYears !== "0" && startDate && endDate) {
      // For "going back X years", match the same date range across multiple years
      const yearsBack = parseInt(goingBackYears);
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      
      const startMonth = startDateObj.getMonth() + 1;
      const startDay = startDateObj.getDate();
      const endMonth = endDateObj.getMonth() + 1;
      const endDay = endDateObj.getDate();
      const currentYear = endDateObj.getFullYear();
      const earliestYear = currentYear - yearsBack;
      
      // Match same date range across years
      if (startMonth === endMonth) {
        // Same month range
        whereConditions.push(sql`
          EXTRACT(YEAR FROM ${observations.observedOn}::date) >= ${earliestYear}
          AND EXTRACT(MONTH FROM ${observations.observedOn}::date) = ${startMonth}
          AND EXTRACT(DAY FROM ${observations.observedOn}::date) >= ${startDay}
          AND EXTRACT(DAY FROM ${observations.observedOn}::date) <= ${endDay}
        `);
      } else {
        // Cross-month range
        whereConditions.push(sql`
          EXTRACT(YEAR FROM ${observations.observedOn}::date) >= ${earliestYear}
          AND (
            (EXTRACT(MONTH FROM ${observations.observedOn}::date) = ${startMonth} AND EXTRACT(DAY FROM ${observations.observedOn}::date) >= ${startDay})
            OR (EXTRACT(MONTH FROM ${observations.observedOn}::date) > ${startMonth} AND EXTRACT(MONTH FROM ${observations.observedOn}::date) < ${endMonth})
            OR (EXTRACT(MONTH FROM ${observations.observedOn}::date) = ${endMonth} AND EXTRACT(DAY FROM ${observations.observedOn}::date) <= ${endDay})
          )
        `);
      }
    } else if (startDate || endDate) {
      // Regular date range filtering
      if (startDate) {
        whereConditions.push(sql`${observations.observedOn} >= ${startDate}`);
      }
      if (endDate) {
        whereConditions.push(sql`${observations.observedOn} <= ${endDate}`);
      }
    }
    
    const whereClause = whereConditions.length > 1 
      ? sql.join(whereConditions, sql` AND `)
      : whereConditions[0];

    const result = await db.execute(sql`
      SELECT 
        TO_CHAR(${observations.observedOn}::date, 'Month') as month,
        EXTRACT(MONTH FROM ${observations.observedOn}::date)::int as "monthNumber",
        COUNT(*)::int as count
      FROM ${observations}
      WHERE ${whereClause}
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

  async getRecordIndex(limit: number = 50, offset: number = 0, stateFirstsOnly: boolean = false, recent: boolean = false, state?: string, globalFirstsOnly: boolean = false, startDate?: string, endDate?: string, species?: string, collector?: string): Promise<Array<{
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
    collector: string;
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

    if (collector) {
      // Search collector field with partial matching
      whereConditions.push(sql`LOWER(${observations.collector}) LIKE LOWER(${'%' + collector + '%'})`);
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
          COALESCE(${observations.collector}, 'Unknown') as collector,
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
          if (collector) {
            conditions.push(sql`LOWER(collector) LIKE LOWER(${'%' + collector + '%'})`);
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
        collector,
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
      collector: string;
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

  async getSpeciesAccumulation(state?: string, search?: string): Promise<Array<{
    observationNumber: number;
    uniqueSpeciesCount: number;
  }>> {
    let whereClause = sql`WHERE ${observations.scientificName} IS NOT NULL AND ${observations.scientificName} != ''`;
    
    if (state && state !== 'all') {
      whereClause = sql`WHERE ${observations.scientificName} IS NOT NULL AND ${observations.scientificName} != '' AND ${observations.state} = ${state}`;
    }
    
    if (search && search.trim() !== '') {
      const searchTerm = `%${search.toLowerCase()}%`;
      if (state && state !== 'all') {
        whereClause = sql`WHERE ${observations.scientificName} IS NOT NULL AND ${observations.scientificName} != '' AND ${observations.state} = ${state} AND LOWER(${observations.scientificName}) LIKE ${searchTerm}`;
      } else {
        whereClause = sql`WHERE ${observations.scientificName} IS NOT NULL AND ${observations.scientificName} != '' AND LOWER(${observations.scientificName}) LIKE ${searchTerm}`;
      }
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

  async getGeneraAccumulation(state?: string, search?: string): Promise<Array<{
    observationNumber: number;
    uniqueSpeciesCount: number;
  }>> {
    let whereClause = sql`WHERE ${observations.genus} IS NOT NULL AND ${observations.genus} != ''`;
    
    if (state && state !== 'all') {
      whereClause = sql`WHERE ${observations.genus} IS NOT NULL AND ${observations.genus} != '' AND ${observations.state} = ${state}`;
    }
    
    if (search && search.trim() !== '') {
      const searchTerm = `%${search.toLowerCase()}%`;
      if (state && state !== 'all') {
        whereClause = sql`WHERE ${observations.genus} IS NOT NULL AND ${observations.genus} != '' AND ${observations.state} = ${state} AND LOWER(${observations.genus}) LIKE ${searchTerm}`;
      } else {
        whereClause = sql`WHERE ${observations.genus} IS NOT NULL AND ${observations.genus} != '' AND LOWER(${observations.genus}) LIKE ${searchTerm}`;
      }
    }

    const result = await db.execute(sql`
      WITH ordered_observations AS (
        SELECT 
          ${observations.genus} as genus_name,
          ${observations.observedOn},
          ${observations.id},
          ROW_NUMBER() OVER (ORDER BY ${observations.observedOn}, ${observations.id}) as observation_number
        FROM ${observations}
        ${whereClause}
      ),
      genera_first_appearance AS (
        SELECT 
          genus_name,
          MIN(observation_number) as first_observation
        FROM ordered_observations
        GROUP BY genus_name
      ),
      accumulation_points AS (
        SELECT 
          o.observation_number,
          COUNT(g.genus_name) as new_genera_count
        FROM ordered_observations o
        LEFT JOIN genera_first_appearance g ON o.observation_number = g.first_observation
        GROUP BY o.observation_number
        ORDER BY o.observation_number
      )
      SELECT 
        observation_number as "observationNumber",
        SUM(new_genera_count) OVER (
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

  async getUniqueStates(): Promise<string[]> {
    const result = await db.execute(sql`
      SELECT DISTINCT ${observations.state} as state
      FROM ${observations}
      WHERE ${observations.state} IS NOT NULL 
      AND ${observations.state} != ''
      ORDER BY ${observations.state}
    `);

    return result.rows.map(row => row.state as string);
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
    mycoMapBlastUrl?: string;
    ncbiBlastFile?: string;
    localBlastFile?: string;
    blastFilesDownloaded?: boolean;
    blastDownloadDate?: Date;
    mycoMapTraceUrl?: string;
    fastqFile?: string;
    traceFilesDownloaded?: boolean;
    traceDownloadDate?: Date;
    inatApiFile?: string;
    inatApiSaved?: boolean;
    inatApiSaveDate?: Date;
  }): Promise<void> {
    await db.update(observations)
      .set(taxonomyData)
      .where(eq(observations.id, id));
  }

  // Red List assessments methods
  async createRedlistAssessments(assessments: InsertRedlistAssessment[]): Promise<RedlistAssessment[]> {
    const results: RedlistAssessment[] = [];
    
    // Process in smaller batches to handle conflicts
    for (const assessment of assessments) {
      try {
        const [result] = await db.insert(redlistAssessments)
          .values(assessment)
          .onConflictDoUpdate({
            target: redlistAssessments.assessmentId,
            set: {
              scientificName: assessment.scientificName,
              redlistCategory: assessment.redlistCategory,
              redlistCriteria: assessment.redlistCriteria,
              yearPublished: assessment.yearPublished,
              assessmentDate: assessment.assessmentDate,
              criteriaVersion: assessment.criteriaVersion,
              language: assessment.language,
              rationale: assessment.rationale,
              habitat: assessment.habitat,
              threats: assessment.threats,
              population: assessment.population,
              populationTrend: assessment.populationTrend,
              range: assessment.range,
              useTrade: assessment.useTrade,
              systems: assessment.systems,
              conservationActions: assessment.conservationActions,
              realm: assessment.realm,
              yearLastSeen: assessment.yearLastSeen,
              possiblyExtinct: assessment.possiblyExtinct,
              possiblyExtinctInTheWild: assessment.possiblyExtinctInTheWild,
              scopes: assessment.scopes,
              updatedAt: new Date()
            }
          })
          .returning();
        results.push(result);
      } catch (error) {
        console.warn(`Skipping assessment ${assessment.assessmentId}:`, error);
      }
    }
    
    return results;
  }

  async getRedlistAssessments(): Promise<RedlistAssessment[]> {
    return await db.select()
      .from(redlistAssessments)
      .orderBy(desc(redlistAssessments.createdAt));
  }

  async getRedlistAssessmentByScientificName(scientificName: string): Promise<RedlistAssessment | undefined> {
    const [assessment] = await db.select()
      .from(redlistAssessments)
      .where(eq(redlistAssessments.scientificName, scientificName));
    return assessment || undefined;
  }

  async clearRedlistAssessments(): Promise<void> {
    await db.delete(redlistAssessments);
  }

  // iNaturalist data operations
  async getInaturalistData(observationId?: string): Promise<InaturalistData[]> {
    if (observationId) {
      const data = await db.select()
        .from(inaturalistData)
        .where(eq(inaturalistData.observationId, observationId));
      return data;
    } else {
      const data = await db.select()
        .from(inaturalistData)
        .orderBy(desc(inaturalistData.lastSyncedAt));
      return data;
    }
  }

  async createInaturalistData(data: InsertInaturalistData): Promise<InaturalistData> {
    const [created] = await db.insert(inaturalistData)
      .values(data)
      .returning();
    return created;
  }

  async updateInaturalistData(observationId: string, data: Partial<InsertInaturalistData>): Promise<void> {
    await db.update(inaturalistData)
      .set({ ...data, lastSyncedAt: new Date() })
      .where(eq(inaturalistData.observationId, observationId));
  }

  async syncObservationWithInaturalist(observationId: string): Promise<InaturalistData | null> {
    try {
      // Get the observation from our database to extract iNaturalist ID
      const [observation] = await db.select()
        .from(observations)
        .where(eq(observations.observationId, observationId));

      if (!observation) {
        console.log(`[iNaturalist] Observation ${observationId} not found`);
        return null;
      }

      // For iNaturalist observations, use the observationId directly as the iNaturalist ID
      let inatId = observation.observationId;
      
      // Handle both formats: direct ID (271525489) and prefixed (iNaturalist-271525489)
      if (observation.observationId.startsWith('iNaturalist-')) {
        inatId = observation.observationId.replace('iNaturalist-', '');
      }
      
      // Verify we have a valid numeric iNaturalist ID
      if (!inatId || !/^\d+$/.test(inatId)) {
        console.log(`[iNaturalist] Invalid iNaturalist ID format for ${observationId}: ${inatId}`);
        await this.updateInaturalistData(observationId, {
          syncStatus: 'error',
          syncError: 'Invalid iNaturalist ID format'
        });
        return null;
      }

      // Fetch data from iNaturalist API with observation field values
      console.log(`[iNaturalist] Fetching data for observation ${inatId}`);
      const response = await fetch(`https://api.inaturalist.org/v1/observations/${inatId}?include=ofvs`);
      
      if (!response.ok) {
        console.log(`[iNaturalist] API error for ${inatId}: ${response.status}`);
        await this.updateInaturalistData(observationId, {
          syncStatus: 'error',
          syncError: `API error: ${response.status}`
        });
        return null;
      }

      const apiData = await response.json();
      const inatObservation = apiData.results?.[0];

      if (!inatObservation) {
        console.log(`[iNaturalist] No data found for observation ${inatId}`);
        await this.updateInaturalistData(observationId, {
          syncStatus: 'error',
          syncError: 'No data found in iNaturalist'
        });
        return null;
      }

      // Extract observation fields data with correct field IDs
      const obsFields = inatObservation.ofvs || inatObservation.observation_field_values || [];
      const dnaBarcode = obsFields.find((f: any) => f.field_id === 2330)?.value || null; // DNA Barcode ITS
      const provisionalSpecies = obsFields.find((f: any) => f.field_id === 10675)?.value || null; // Provisional Species Name
      const mycoMapBlast = obsFields.find((f: any) => f.field_id === 9864)?.value || null; // MycoMap BLAST Results
      const traceFiles = obsFields.find((f: any) => f.field_id === 10109)?.value || null; // Trace Files (Raw DNA Data)
      
      // Extract GenBank Accession from multiple possible field IDs
      const genbankField = obsFields.find((f: any) => 
        f.field_id === 15353 || f.field_id === 15324 || f.field_id === 7555
      );
      const inatGenbankAccession = genbankField?.value || null;

      // Extract relevant data from iNaturalist response
      const inaturalistRecord: InsertInaturalistData = {
        observationId: observationId,
        inatId: inatObservation.id?.toString() || inatId,
        inatUuid: inatObservation.uuid,
        quality: inatObservation.quality_grade,
        captive: inatObservation.captive || false,
        geoprivacy: inatObservation.geoprivacy,
        taxonGeoprivacy: inatObservation.taxon_geoprivacy,
        coordinatesObscured: inatObservation.coordinates_obscured || false,
        publicPositionalAccuracy: inatObservation.public_positional_accuracy,
        licenseCode: inatObservation.license_code,
        observedOnString: inatObservation.observed_on_string,
        observedOnDetails: inatObservation.observed_on_details,
        timeObservedAt: inatObservation.time_observed_at ? new Date(inatObservation.time_observed_at) : null,
        timeZone: inatObservation.time_zone,
        description: inatObservation.description,
        tags: inatObservation.tags || [],
        species_guess: inatObservation.species_guess,
        identificationCount: inatObservation.identifications_count || 0,
        numIdentificationAgreements: inatObservation.num_identification_agreements || 0,
        numIdentificationDisagreements: inatObservation.num_identification_disagreements || 0,
        commentsCount: inatObservation.comments_count || 0,
        created_at: inatObservation.created_at ? new Date(inatObservation.created_at) : null,
        updated_at: inatObservation.updated_at ? new Date(inatObservation.updated_at) : null,
        photos: inatObservation.photos?.map((photo: any) => photo.url) || [],
        sounds: inatObservation.sounds?.map((sound: any) => sound.file_url) || [],
        taxon: inatObservation.taxon ? JSON.stringify(inatObservation.taxon) : null,
        user: inatObservation.user ? JSON.stringify(inatObservation.user) : null,
        place_ids: inatObservation.place_ids || [],
        project_ids: inatObservation.project_ids || [],
        application: inatObservation.application ? JSON.stringify(inatObservation.application) : null,
        // Observation fields data
        observationFields: obsFields.length > 0 ? JSON.stringify(obsFields) : null,
        dnaBarcode: dnaBarcode,
        provisionalSpeciesName: provisionalSpecies,
        mycoMapBlastResults: mycoMapBlast,
        traceFiles: traceFiles,
        inatGenbankAccession: inatGenbankAccession,
        syncStatus: 'success',
        syncError: null
      };

      // Check if record already exists
      const [existing] = await db.select()
        .from(inaturalistData)
        .where(eq(inaturalistData.observationId, observationId));

      let result;
      if (existing) {
        // Update existing record
        await this.updateInaturalistData(observationId, inaturalistRecord);
        const [updated] = await db.select()
          .from(inaturalistData)
          .where(eq(inaturalistData.observationId, observationId));
        result = updated;
      } else {
        // Create new record
        result = await this.createInaturalistData(inaturalistRecord);
      }

      // Automatically save API response and download BLAST and trace files if MycoMap URLs are detected
      try {
        // Save the full iNaturalist API response as a text file
        console.log(`[iNaturalist] Saving API response for ${observationId}`);
        const apiSaveResult = await blastDownloader.saveInatApiResponse(observationId, inatObservation);
        
        if (apiSaveResult.success) {
          // Update observation with API file info
          await db.update(observations)
            .set({
              inatApiSaved: true,
              inatApiFile: apiSaveResult.apiFilePath,
              inatApiSaveDate: new Date()
            })
            .where(eq(observations.observationId, observationId));
          console.log(`[iNaturalist] API response saved for ${observationId}`);
        }

        if (mycoMapBlast && mycoMapBlast.includes('mycomap.com')) {
          console.log(`[iNaturalist] Auto-downloading BLAST files for ${observationId}`);
          const blastResult = await blastDownloader.downloadBlastFiles(observationId, mycoMapBlast);
          
          if (blastResult.success) {
            // Update observation with BLAST file info
            await db.update(observations)
              .set({
                blastFilesDownloaded: true,
                ncbiBlastFile: blastResult.ncbiPath ? blastResult.ncbiPath.split('/').pop() : null,
                localBlastFile: blastResult.localPath ? blastResult.localPath.split('/').pop() : null,
                blastDownloadDate: new Date()
              })
              .where(eq(observations.observationId, observationId));
            console.log(`[iNaturalist] BLAST files downloaded for ${observationId}`);
          }
        }

        if (traceFiles && traceFiles.includes('mycomap.com')) {
          console.log(`[iNaturalist] Auto-downloading trace files for ${observationId}`);
          const traceResult = await blastDownloader.downloadTraceFiles(observationId, traceFiles);
          
          if (traceResult.success) {
            // Update observation with trace file info
            await db.update(observations)
              .set({
                traceFilesDownloaded: true,
                fastqFile: traceResult.fastqPath ? traceResult.fastqPath.split('/').pop() : null,
                mycoMapTraceUrl: traceFiles,
                traceDownloadDate: new Date()
              })
              .where(eq(observations.observationId, observationId));
            console.log(`[iNaturalist] Trace files downloaded for ${observationId}`);
          }
        }
      } catch (downloadError) {
        console.error(`[iNaturalist] Error downloading files for ${observationId}:`, downloadError);
        // Don't fail the sync if downloads fail
      }

      return result;

    } catch (error) {
      console.error(`[iNaturalist] Error syncing observation ${observationId}:`, error);
      await this.updateInaturalistData(observationId, {
        syncStatus: 'error',
        syncError: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  // Place ID lookup methods
  async getPlaceById(placeId: number): Promise<InaturalistPlace | null> {
    const [place] = await db.select().from(inaturalistPlaces).where(eq(inaturalistPlaces.placeId, placeId));
    return place || null;
  }

  async getPlacesByIds(placeIds: number[]): Promise<InaturalistPlace[]> {
    if (placeIds.length === 0) return [];
    
    // Use inArray for better compatibility with Drizzle
    const places = await db.select().from(inaturalistPlaces).where(
      inArray(inaturalistPlaces.placeId, placeIds)
    );
    return places;
  }

  async lookupAndCachePlace(placeId: number): Promise<InaturalistPlace | null> {
    // First check if we have it cached
    const cached = await this.getPlaceById(placeId);
    if (cached) return cached;

    // Look it up from iNaturalist API
    try {
      console.log(`[Places] Looking up place ID ${placeId} from iNaturalist`);
      const response = await fetch(`https://api.inaturalist.org/v1/places/${placeId}`);
      
      if (!response.ok) {
        console.log(`[Places] Failed to lookup place ${placeId}: ${response.status}`);
        return null;
      }

      const data = await response.json();
      const place = data.results?.[0];
      
      if (!place) {
        console.log(`[Places] No place data found for ID ${placeId}`);
        return null;
      }

      // Cache the place data
      const placeRecord: InsertInaturalistPlace = {
        placeId: place.id,
        name: place.name,
        displayName: place.display_name,
        adminLevel: place.admin_level,
        placeType: place.place_type,
        ancestry: place.ancestry,
        boundingBoxSwlat: place.bounding_box_geojson?.coordinates?.[0]?.[0]?.[1]?.toString(),
        boundingBoxSwlng: place.bounding_box_geojson?.coordinates?.[0]?.[0]?.[0]?.toString(),
        boundingBoxNelat: place.bounding_box_geojson?.coordinates?.[0]?.[2]?.[1]?.toString(),
        boundingBoxNelng: place.bounding_box_geojson?.coordinates?.[0]?.[2]?.[0]?.toString(),
      };

      const [insertedPlace] = await db.insert(inaturalistPlaces)
        .values(placeRecord)
        .onConflictDoUpdate({
          target: inaturalistPlaces.placeId,
          set: {
            name: placeRecord.name,
            displayName: placeRecord.displayName,
            adminLevel: placeRecord.adminLevel,
            placeType: placeRecord.placeType,
            ancestry: placeRecord.ancestry,
            updatedAt: new Date(),
          }
        })
        .returning();

      console.log(`[Places] Cached place ${placeId}: ${place.display_name} (${place.place_type})`);
      return insertedPlace;

    } catch (error) {
      console.error(`[Places] Error looking up place ${placeId}:`, error);
      return null;
    }
  }

  async resolveStateFromPlaceIds(placeIds: number[]): Promise<string | null> {
    if (!placeIds || placeIds.length === 0) return null;

    // Get all place data for the IDs
    const cachedPlaces = await this.getPlacesByIds(placeIds);
    const cachedPlaceIds = new Set(cachedPlaces.map(p => p.placeId));
    
    // First, check if we can resolve from already cached places
    // Look for US states by name pattern (more reliable than admin_level)
    const usStateFromCache = cachedPlaces.find(place => {
      const name = place.name?.toLowerCase() || '';
      const displayName = place.displayName?.toLowerCase() || '';
      
      // Common US state patterns
      return (
        (name === 'california' || displayName.includes('california, us')) ||
        (name === 'oregon' || displayName.includes('oregon, us')) ||
        (name === 'washington' || displayName.includes('washington, us')) ||
        (name === 'nevada' || displayName.includes('nevada, us')) ||
        (name === 'arizona' || displayName.includes('arizona, us')) ||
        (name === 'utah' || displayName.includes('utah, us')) ||
        (name === 'idaho' || displayName.includes('idaho, us')) ||
        (name === 'montana' || displayName.includes('montana, us')) ||
        (name === 'wyoming' || displayName.includes('wyoming, us')) ||
        (name === 'colorado' || displayName.includes('colorado, us')) ||
        (name === 'new mexico' || displayName.includes('new mexico, us')) ||
        (name === 'texas' || displayName.includes('texas, us')) ||
        (name === 'oklahoma' || displayName.includes('oklahoma, us')) ||
        (name === 'kansas' || displayName.includes('kansas, us')) ||
        (name === 'nebraska' || displayName.includes('nebraska, us')) ||
        (name === 'south dakota' || displayName.includes('south dakota, us')) ||
        (name === 'north dakota' || displayName.includes('north dakota, us')) ||
        (name === 'minnesota' || displayName.includes('minnesota, us')) ||
        (name === 'iowa' || displayName.includes('iowa, us')) ||
        (name === 'missouri' || displayName.includes('missouri, us')) ||
        (name === 'arkansas' || displayName.includes('arkansas, us')) ||
        (name === 'louisiana' || displayName.includes('louisiana, us')) ||
        (name === 'mississippi' || displayName.includes('mississippi, us')) ||
        (name === 'alabama' || displayName.includes('alabama, us')) ||
        (name === 'tennessee' || displayName.includes('tennessee, us')) ||
        (name === 'kentucky' || displayName.includes('kentucky, us')) ||
        (name === 'illinois' || displayName.includes('illinois, us')) ||
        (name === 'indiana' || displayName.includes('indiana, us')) ||
        (name === 'ohio' || displayName.includes('ohio, us')) ||
        (name === 'michigan' || displayName.includes('michigan, us')) ||
        (name === 'wisconsin' || displayName.includes('wisconsin, us')) ||
        (name === 'florida' || displayName.includes('florida, us')) ||
        (name === 'georgia' || displayName.includes('georgia, us')) ||
        (name === 'south carolina' || displayName.includes('south carolina, us')) ||
        (name === 'north carolina' || displayName.includes('north carolina, us')) ||
        (name === 'virginia' || displayName.includes('virginia, us')) ||
        (name === 'west virginia' || displayName.includes('west virginia, us')) ||
        (name === 'maryland' || displayName.includes('maryland, us')) ||
        (name === 'delaware' || displayName.includes('delaware, us')) ||
        (name === 'pennsylvania' || displayName.includes('pennsylvania, us')) ||
        (name === 'new jersey' || displayName.includes('new jersey, us')) ||
        (name === 'new york' || displayName.includes('new york, us')) ||
        (name === 'connecticut' || displayName.includes('connecticut, us')) ||
        (name === 'rhode island' || displayName.includes('rhode island, us')) ||
        (name === 'massachusetts' || displayName.includes('massachusetts, us')) ||
        (name === 'vermont' || displayName.includes('vermont, us')) ||
        (name === 'new hampshire' || displayName.includes('new hampshire, us')) ||
        (name === 'maine' || displayName.includes('maine, us')) ||
        (name === 'alaska' || displayName.includes('alaska, us')) ||
        (name === 'hawaii' || displayName.includes('hawaii, us'))
      );
    });
    
    if (usStateFromCache) {
      const stateName = usStateFromCache.name || usStateFromCache.displayName?.split(',')[0] || '';
      const capitalizedState = stateName.charAt(0).toUpperCase() + stateName.slice(1).toLowerCase();
      console.log(`[Places] Resolved state from cache: ${capitalizedState}`);
      return capitalizedState;
    }
    
    // Look up missing places (but limit to avoid rate limits)
    const missingPlaceIds = placeIds.filter(id => !cachedPlaceIds.has(id)).slice(0, 5); // Limit lookups
    const newPlaces: InaturalistPlace[] = [];
    
    for (const placeId of missingPlaceIds) {
      const place = await this.lookupAndCachePlace(placeId);
      if (place) {
        newPlaces.push(place);
        
        // Check if this new place resolves to a state immediately
        if (place.adminLevel === 1 && place.placeType === 'state') {
          console.log(`[Places] Resolved state from new lookup: ${place.name}`);
          return place.name;
        }
        
        // Check for California in the newly fetched place
        if (place.name?.toLowerCase().includes('california') || 
            place.displayName?.toLowerCase().includes('california')) {
          console.log(`[Places] Resolved California from new place: ${place.displayName}`);
          return 'California';
        }
      }
    }

    // Combine all places
    const allPlaces = [...cachedPlaces, ...newPlaces];
    
    // Find US state (admin_level 1 and place_type 'state')
    const usState = allPlaces.find(place => 
      place.adminLevel === 1 && place.placeType === 'state'
    );
    
    if (usState) {
      console.log(`[Places] Resolved state: ${usState.name} from place hierarchy`);
      return usState.name;
    }

    // If no direct state found, look for county (admin_level 2) and trace ancestry
    const county = allPlaces.find(place => 
      place.adminLevel === 2 && place.placeType === 'county'
    );
    
    if (county && county.ancestry) {
      // Parse ancestry to find parent state (but limit lookups to avoid rate limits)
      const ancestryIds = county.ancestry.split('/').map(id => parseInt(id)).slice(0, 3);
      for (const ancestorId of ancestryIds) {
        // Check cache first
        const cachedAncestor = await this.getPlaceById(ancestorId);
        if (cachedAncestor && cachedAncestor.adminLevel === 1 && cachedAncestor.placeType === 'state') {
          console.log(`[Places] Resolved state from cached ancestry: ${cachedAncestor.name}`);
          return cachedAncestor.name;
        }
      }
    }

    console.log(`[Places] Could not resolve state from place IDs: ${placeIds.join(', ')}`);
    return null;
  }
}