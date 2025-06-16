import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { 
  users, observations, uploads, contributors, species, redlistAssessments, inaturalistData, inaturalistPlaces, mushroomObserverData, mycoportalData, biorecords,
  type User, type InsertUser, type Observation, type InsertObservation,
  type Upload, type InsertUpload, type Contributor, type InsertContributor,
  type Species, type InsertSpecies, type RedlistAssessment, type InsertRedlistAssessment,
  type InaturalistData, type InsertInaturalistData, type InaturalistPlace, type InsertInaturalistPlace,
  type MushroomObserverData, type InsertMushroomObserverData, type Biorecord, type InsertBiorecord
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
    fullyValidated: number;
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
    const [totalCount, speciesCount, contributorCount, stateCount, fullyValidatedCount] = await Promise.all([
      // Total observations count
      db.execute(sql`SELECT COUNT(*)::int as count FROM ${observations} WHERE ${whereClause}`),
      
      // Unique species count
      db.execute(sql`SELECT COUNT(DISTINCT ${observations.scientificName})::int as count FROM ${observations} WHERE ${whereClause}`),
      
      // Active contributors count
      db.execute(sql`SELECT COUNT(DISTINCT ${observations.collector})::int as count FROM ${observations} WHERE ${whereClause} AND ${observations.collector} IS NOT NULL`),
      
      // States covered count (always 1 when filtering by state, otherwise count distinct states)
      state ? 
        Promise.resolve({ rows: [{ count: 1 }] }) :
        db.execute(sql`SELECT COUNT(DISTINCT ${observations.state})::int as count FROM ${observations} WHERE ${whereClause} AND ${observations.state} IS NOT NULL`),

      // Fully validated observations count - species-level identification with complete data sync
      db.execute(sql`
        SELECT COUNT(*)::int as count 
        FROM ${observations} o
        LEFT JOIN ${inaturalistData} i ON o.observation_id = i.observation_id
        WHERE ${whereClause}
        AND o.source = 'iNaturalist'
        AND o.scientific_name IS NOT NULL 
        AND LENGTH(TRIM(o.scientific_name)) > 0
        AND ARRAY_LENGTH(STRING_TO_ARRAY(TRIM(o.scientific_name), ' '), 1) >= 2
        AND i.sync_status = 'success'
        AND o.inat_api_saved = true
        AND (
          o.mycomap_blast_url IS NULL 
          OR (o.mycomap_blast_url IS NOT NULL AND o.blast_files_downloaded = true)
        )
      `)
    ]);
    
    return {
      totalObservations: (totalCount.rows[0] as any).count,
      uniqueSpecies: (speciesCount.rows[0] as any).count,
      activeContributors: (contributorCount.rows[0] as any).count,
      statesCovered: (stateCount.rows[0] as any).count,
      fullyValidated: (fullyValidatedCount.rows[0] as any).count,
    };
  }

  async getTemporalTrends(groupBy: 'month' | 'quarter' | 'year', state?: string, startDate?: string, endDate?: string, goingBackYears?: string, collector?: string): Promise<Array<{
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

    if (collector) {
      whereConditions.push(sql`${observations.collector} ILIKE ${`%${collector}%`}`);
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

  async getTaxonomicDistribution(state?: string, startDate?: string, endDate?: string, goingBackYears?: string, collector?: string): Promise<Array<{
    phylum: string;
    count: number;
  }>> {
    let whereConditions = [];
    
    if (state) {
      whereConditions.push(sql`${observations.state} = ${state}`);
    }
    
    if (collector) {
      whereConditions.push(sql`${observations.collector} ILIKE ${`%${collector}%`}`);
    }
    
    if (startDate && endDate) {
      whereConditions.push(sql`${observations.observedOn} >= ${startDate}`);
      whereConditions.push(sql`${observations.observedOn} <= ${endDate}`);
    } else if (goingBackYears && goingBackYears !== '0') {
      const yearsBack = parseInt(goingBackYears);
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsBack);
      whereConditions.push(sql`${observations.observedOn} >= ${cutoffDate.toISOString().split('T')[0]}`);
    }
    
    const whereClause = whereConditions.length > 0 
      ? sql`WHERE ${sql.join(whereConditions, sql` AND `)}`
      : sql``;
    
    const result = await db.execute(sql`
      SELECT 
        COALESCE(${observations.phylum}, 'Unknown') as phylum,
        COUNT(*)::int as count
      FROM ${observations}
      ${whereClause}
      GROUP BY ${observations.phylum}
      ORDER BY count DESC
    `);
    
    return result.rows as Array<{ phylum: string; count: number }>;
  }

  async getFamilyDistribution(state?: string, startDate?: string, endDate?: string, goingBackYears?: string, collector?: string): Promise<Array<{
    family: string;
    count: number;
  }>> {
    let whereConditions = [
      sql`${observations.family} IS NOT NULL AND ${observations.family} != ''`
    ];
    
    if (state) {
      whereConditions.push(sql`${observations.state} = ${state}`);
    }
    
    if (collector) {
      whereConditions.push(sql`${observations.collector} ILIKE ${`%${collector}%`}`);
    }
    
    if (startDate && endDate) {
      whereConditions.push(sql`${observations.observedOn} >= ${startDate}`);
      whereConditions.push(sql`${observations.observedOn} <= ${endDate}`);
    } else if (goingBackYears && goingBackYears !== '0') {
      const yearsBack = parseInt(goingBackYears);
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsBack);
      whereConditions.push(sql`${observations.observedOn} >= ${cutoffDate.toISOString().split('T')[0]}`);
    }
    
    const whereClause = sql`WHERE ${sql.join(whereConditions, sql` AND `)}`;
    
    const result = await db.execute(sql`
      SELECT 
        COALESCE(${observations.family}, 'Unknown') as family,
        COUNT(*)::int as count
      FROM ${observations}
      ${whereClause}
      GROUP BY ${observations.family}
      ORDER BY count DESC
    `);
    
    return result.rows as Array<{ family: string; count: number }>;
  }

  async getClassDistribution(state?: string, startDate?: string, endDate?: string, goingBackYears?: string, collector?: string): Promise<Array<{
    class: string;
    count: number;
  }>> {
    let whereConditions = [
      sql`${observations.class} IS NOT NULL AND ${observations.class} != ''`
    ];
    
    if (state) {
      whereConditions.push(sql`${observations.state} = ${state}`);
    }
    
    if (collector) {
      whereConditions.push(sql`${observations.collector} ILIKE ${`%${collector}%`}`);
    }
    
    if (startDate && endDate) {
      whereConditions.push(sql`${observations.observedOn} >= ${startDate}`);
      whereConditions.push(sql`${observations.observedOn} <= ${endDate}`);
    } else if (goingBackYears && goingBackYears !== '0') {
      const yearsBack = parseInt(goingBackYears);
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsBack);
      whereConditions.push(sql`${observations.observedOn} >= ${cutoffDate.toISOString().split('T')[0]}`);
    }
    
    const whereClause = sql`WHERE ${sql.join(whereConditions, sql` AND `)}`;
    
    const result = await db.execute(sql`
      SELECT 
        COALESCE(${observations.class}, 'Unknown') as class,
        COUNT(*)::int as count
      FROM ${observations}
      ${whereClause}
      GROUP BY ${observations.class}
      ORDER BY count DESC
    `);
    
    return result.rows as Array<{ class: string; count: number }>;
  }

  async getOrderDistribution(state?: string, startDate?: string, endDate?: string, goingBackYears?: string, collector?: string): Promise<Array<{
    order: string;
    count: number;
  }>> {
    let whereConditions = [
      sql`${observations.order} IS NOT NULL AND ${observations.order} != ''`
    ];
    
    if (state) {
      whereConditions.push(sql`${observations.state} = ${state}`);
    }
    
    if (collector) {
      whereConditions.push(sql`${observations.collector} ILIKE ${`%${collector}%`}`);
    }
    
    if (startDate && endDate) {
      whereConditions.push(sql`${observations.observedOn} >= ${startDate}`);
      whereConditions.push(sql`${observations.observedOn} <= ${endDate}`);
    } else if (goingBackYears && goingBackYears !== '0') {
      const yearsBack = parseInt(goingBackYears);
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsBack);
      whereConditions.push(sql`${observations.observedOn} >= ${cutoffDate.toISOString().split('T')[0]}`);
    }
    
    const whereClause = sql`WHERE ${sql.join(whereConditions, sql` AND `)}`;
    
    const result = await db.execute(sql`
      SELECT 
        COALESCE(${observations.order}, 'Unknown') as "order",
        COUNT(*)::int as count
      FROM ${observations}
      ${whereClause}
      GROUP BY ${observations.order}
      ORDER BY count DESC
    `);
    
    return result.rows as Array<{ order: string; count: number }>;
  }

  async getGenusDistribution(state?: string, startDate?: string, endDate?: string, goingBackYears?: string, collector?: string): Promise<Array<{ genus: string; count: number }>> {
    let whereConditions = [
      sql`${observations.genus} IS NOT NULL AND ${observations.genus} != ''`
    ];
    
    if (state) {
      whereConditions.push(sql`${observations.state} = ${state}`);
    }
    
    if (collector) {
      whereConditions.push(sql`${observations.collector} ILIKE ${`%${collector}%`}`);
    }
    
    if (startDate && endDate) {
      whereConditions.push(sql`${observations.observedOn} >= ${startDate}`);
      whereConditions.push(sql`${observations.observedOn} <= ${endDate}`);
    } else if (goingBackYears && goingBackYears !== '0') {
      const yearsBack = parseInt(goingBackYears);
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsBack);
      whereConditions.push(sql`${observations.observedOn} >= ${cutoffDate.toISOString().split('T')[0]}`);
    }
    
    const whereClause = sql`WHERE ${sql.join(whereConditions, sql` AND `)}`;
    
    const result = await db.execute(sql`
      SELECT 
        COALESCE(${observations.genus}, 'Unknown') as genus,
        COUNT(*)::int as count
      FROM ${observations}
      ${whereClause}
      GROUP BY ${observations.genus}
      ORDER BY count DESC
    `);
    
    return result.rows as Array<{ genus: string; count: number }>;
  }

  async getSeasonalPatterns(state?: string, startDate?: string, endDate?: string, goingBackYears?: string, collector?: string): Promise<Array<{ season: string; count: number; percentage: number }>> {
    let whereConditions = [sql`${observations.observedOn} IS NOT NULL`];
    
    if (state) {
      whereConditions.push(sql`${observations.state} = ${state}`);
    }

    if (collector) {
      whereConditions.push(sql`${observations.collector} ILIKE ${`%${collector}%`}`);
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

  async getMonthlyStatistics(state?: string, startDate?: string, endDate?: string, goingBackYears?: string, collector?: string): Promise<Array<{ month: string; count: number; monthNumber: number }>> {
    let whereConditions = [sql`${observations.observedOn} IS NOT NULL`];
    
    if (state) {
      whereConditions.push(sql`${observations.state} = ${state}`);
    }

    if (collector) {
      whereConditions.push(sql`${observations.collector} ILIKE ${`%${collector}%`}`);
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
    thumbnailUrl?: string;
  }>> {
    // Since we're using raw SQL, we need to handle where conditions differently
    let filterConditions = [];
    
    if (state) {
      filterConditions.push(`state = '${state}'`);
    }

    if (startDate) {
      filterConditions.push(`"reportDate" >= '${startDate}'`);
    }

    if (endDate) {
      filterConditions.push(`"reportDate" <= '${endDate}'`);
    }

    if (species) {
      filterConditions.push(`(
        LOWER(species) = LOWER('${species}') OR
        LOWER(species) LIKE LOWER('${species} %') OR
        LOWER(species) LIKE LOWER('${species.replace(/['"]/g, '')}%')
      )`);
    }

    if (collector) {
      filterConditions.push(`LOWER(collector) LIKE LOWER('%${collector}%')`);
    }
    
    // Build the complete SQL query as a string to avoid mixing Drizzle and raw SQL
    let whereClause = '';
    let finalWhereClause = '';
    
    if (filterConditions.length > 0) {
      whereClause = `WHERE ${filterConditions.join(' AND ')}`;
    }
    
    if (globalFirstsOnly) {
      finalWhereClause = 'WHERE species_rank_global = 1';
    } else if (stateFirstsOnly) {
      finalWhereClause = 'WHERE species_rank_state = 1';
    } else if (recent) {
      finalWhereClause = 'WHERE (species_rank_global = 1 OR species_rank_state = 1)';
    }
    
    const orderBy = recent ? 'ORDER BY "reportDate" DESC' : 'ORDER BY "datasetRecordNumber"';
    
    const result = await db.execute(sql.raw(`
      WITH global_rankings AS (
        SELECT 
          o.id as id,
          o.scientific_name as species,
          o.state as state,
          o.observed_on as "reportDate",
          COALESCE(o.source, 'Unknown') as source,
          COALESCE(o.observation_id, 'N/A') as "referenceNumber",
          COALESCE(o.collector, 'Unknown') as collector,
          CASE 
            WHEN inat.photos IS NOT NULL AND array_length(inat.photos, 1) > 0 
            THEN inat.photos[1]
            ELSE NULL 
          END as thumbnail_url,
          ROW_NUMBER() OVER (
            ORDER BY o.observed_on, o.scientific_name
          ) as "datasetRecordNumber",
          ROW_NUMBER() OVER (
            PARTITION BY o.scientific_name, o.state
            ORDER BY o.observed_on
          ) as "stateRecordNumber",
          ROW_NUMBER() OVER (
            PARTITION BY o.scientific_name
            ORDER BY o.observed_on
          ) as species_rank_global,
          ROW_NUMBER() OVER (
            PARTITION BY o.scientific_name, o.state
            ORDER BY o.observed_on
          ) as species_rank_state
        FROM observations o
        LEFT JOIN inaturalist_data inat ON o.observation_id = inat.observation_id
        WHERE o.scientific_name IS NOT NULL 
          AND o.scientific_name != '' 
          AND o.observed_on IS NOT NULL
      ),
      ranked_observations AS (
        SELECT * FROM global_rankings
        ${whereClause}
      )
      SELECT 
        id,
        species,
        state,
        "reportDate",
        source,
        "referenceNumber",
        collector,
        thumbnail_url as "thumbnailUrl",
        "datasetRecordNumber",
        "stateRecordNumber",
        CASE WHEN species_rank_global = 1 THEN true ELSE false END as "isFirstGlobal",
        CASE WHEN species_rank_state = 1 THEN true ELSE false END as "isFirstInState"
      FROM ranked_observations
      ${finalWhereClause}
      ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `));
    
    return result.rows as Array<{
      id: number;
      species: string;
      state: string;
      reportDate: string;
      source: string;
      referenceNumber: string;
      collector: string;
      thumbnailUrl?: string;
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

  async getStateSummary(dateRange?: string): Promise<Array<{
    state: string;
    count: number;
  }>> {
    let whereClause = sql`WHERE ${observations.state} IS NOT NULL AND ${observations.state} != ''`;
    
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
          startDate = new Date(0); // All time
      }
      
      if (dateRange !== 'all_time') {
        whereClause = sql`${whereClause} AND ${observations.observedOn} >= ${startDate.toISOString().split('T')[0]}`;
      }
    }

    const result = await db.execute(sql`
      SELECT 
        ${observations.state} as state,
        COUNT(*)::int as count
      FROM ${observations}
      ${whereClause}
      GROUP BY ${observations.state}
      ORDER BY count DESC
    `);

    return result.rows as Array<{ state: string; count: number; }>;
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

  async getUniqueCollectors(search?: string): Promise<string[]> {
    let whereClause = sql`${observations.collector} IS NOT NULL AND ${observations.collector} != ''`;
    
    if (search && search.trim()) {
      whereClause = sql`${whereClause} AND ${observations.collector} ILIKE ${`%${search.trim()}%`}`;
    }
    
    const result = await db.execute(sql`
      SELECT DISTINCT ${observations.collector} as collector
      FROM ${observations}
      WHERE ${whereClause}
      ORDER BY ${observations.collector}
      LIMIT 50
    `);

    return result.rows.map(row => row.collector as string);
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
    const startTime = Date.now();
    
    try {
      // Use raw SQL with proper indexing for maximum performance
      let sqlQuery = `
        SELECT 
          CAST(latitude AS FLOAT) as latitude,
          CAST(longitude AS FLOAT) as longitude,
          scientific_name as species,
          collector
        FROM observations 
        WHERE latitude IS NOT NULL 
          AND longitude IS NOT NULL 
          AND latitude != '0' 
          AND longitude != '0'
          AND CAST(latitude AS DECIMAL) BETWEEN -90 AND 90
          AND CAST(longitude AS DECIMAL) BETWEEN -180 AND 180
      `;
      
      if (state) {
        sqlQuery += ` AND state = $1`;
      }
      
      // Add ordering for consistent results and limit
      sqlQuery += ` ORDER BY id LIMIT ${limit}`;
      
      const result = state 
        ? await db.execute(sql.raw(sqlQuery, [state]))
        : await db.execute(sql.raw(sqlQuery));

      const endTime = Date.now();
      console.log(`[Map Data] Retrieved ${result.rows.length} coordinates in ${endTime - startTime}ms (state: ${state || 'all'})`);

      return result.rows.map((row: any) => ({
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        species: row.species || undefined,
        collector: row.collector || undefined,
      }));
    } catch (error) {
      console.log('[Map Data] Error with optimized query, using fallback:', error);
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
    try {
      let sqlQuery = `
        SELECT 
          state,
          COUNT(*) as global_first_count
        FROM observations 
        WHERE is_first_global = true
      `;
      
      const params: any[] = [];
      if (filterState) {
        sqlQuery += ` AND state = $${params.length + 1}`;
        params.push(filterState);
      }
      
      sqlQuery += `
        GROUP BY state
        ORDER BY COUNT(*) DESC
        LIMIT 20
      `;

      const results = await pool.query(sqlQuery, params);
      const rows = results.rows;
      
      // Calculate total global firsts for percentage calculation
      const totalGlobalFirsts = rows.reduce((sum: number, item: any) => sum + parseInt(item.global_first_count), 0);
      
      return rows.map((item: any) => ({
        state: item.state,
        globalFirstCount: parseInt(item.global_first_count),
        percentage: totalGlobalFirsts > 0 ? (parseInt(item.global_first_count) / totalGlobalFirsts) * 100 : 0
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
    try {
      let sqlQuery = `
        SELECT 
          c.id,
          c.name,
          c.affiliation,
          COUNT(*) as global_first_count
        FROM observations o
        INNER JOIN contributors c ON o.contributor_id = c.id
        WHERE o.is_first_global = true
      `;
      
      const params: any[] = [];
      if (filterState) {
        sqlQuery += ` AND o.state = $${params.length + 1}`;
        params.push(filterState);
      }
      
      sqlQuery += `
        GROUP BY c.id, c.name, c.affiliation
        ORDER BY COUNT(*) DESC
        LIMIT $${params.length + 1}
      `;
      params.push(limit);

      const results = await pool.query(sqlQuery, params);
      const rows = results.rows;
      
      // Calculate total global firsts for percentage calculation
      const totalGlobalFirsts = rows.reduce((sum: number, item: any) => sum + parseInt(item.global_first_count), 0);
      
      return rows.map((item: any) => ({
        id: item.id.toString(),
        name: item.name,
        affiliation: item.affiliation || undefined,
        globalFirstCount: parseInt(item.global_first_count),
        percentage: totalGlobalFirsts > 0 ? (parseInt(item.global_first_count) / totalGlobalFirsts) * 100 : 0
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
        // Smart quotes and apostrophes
        like(observations.scientificName, '%â€œ%'),
        like(observations.scientificName, '%â€%'),
        like(observations.scientificName, '%â€™%'),
        like(observations.collector, '%â€œ%'),
        like(observations.collector, '%â€%'),
        like(observations.collector, '%â€™%'),
        like(observations.state, '%â€œ%'),
        like(observations.state, '%â€%'),
        like(observations.state, '%â€™%'),
        // Accented character encoding issues
        like(observations.state, '%Ã¡%'),      // á corruption
        like(observations.state, '%Ã©%'),      // é corruption
        like(observations.state, '%Ã­%'),      // í corruption
        like(observations.state, '%Ã³%'),      // ó corruption
        like(observations.state, '%Ãº%'),      // ú corruption
        like(observations.state, '%Ã±%'),      // ñ corruption
        like(observations.state, '%Ã§%'),      // ç corruption
        like(observations.state, '%Ã¼%'),      // ü corruption
        like(observations.state, '%Ã¨%'),      // è corruption
        like(observations.state, '%Ã %'),      // à corruption
        like(observations.placeGuess, '%Ã¡%'), // á corruption in place
        like(observations.placeGuess, '%Ã©%'), // é corruption in place
        like(observations.placeGuess, '%Ã­%'), // í corruption in place
        like(observations.placeGuess, '%Ã³%'), // ó corruption in place
        like(observations.placeGuess, '%Ãº%'), // ú corruption in place
        like(observations.placeGuess, '%Ã±%'), // ñ corruption in place
        like(observations.placeGuess, '%Ã§%'), // ç corruption in place
        like(observations.placeGuess, '%Ã¼%'), // ü corruption in place
        like(observations.placeGuess, '%Ã¨%'), // è corruption in place
        like(observations.placeGuess, '%Ã %'), // à corruption in place
        like(observations.country, '%Ã¡%'),    // á corruption in country
        like(observations.country, '%Ã©%'),    // é corruption in country
        like(observations.country, '%Ã­%'),    // í corruption in country
        like(observations.country, '%Ã³%'),    // ó corruption in country
        like(observations.country, '%Ãº%'),    // ú corruption in country
        like(observations.country, '%Ã±%'),    // ñ corruption in country
        like(observations.country, '%Ã§%'),    // ç corruption in country
        like(observations.country, '%Ã¼%'),    // ü corruption in country
        like(observations.country, '%Ã¨%'),    // è corruption in country
        like(observations.country, '%Ã %')     // à corruption in country
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

  // Optimized validation data query
  async getValidationData(params: {
    limit: number;
    source: string;
    syncStatus: string;
    validationStatus: string;
    search?: string;
    fullyValidated?: boolean;
  }): Promise<Array<any>> {
    const { limit, source, syncStatus, validationStatus, search, fullyValidated } = params;
    
    // Use raw SQL for more complex queries with search
    let sqlQuery = `
      SELECT 
        o.id,
        o.observation_id as "observationId",
        o.scientific_name as "scientificName",
        o.common_name as "commonName",
        o.observer,
        o.observed_on as "observedOn",
        o.state,
        o.source,
        o.collector,
        o.genbank_accession as "genbankAccession",
        CASE 
          WHEN i.dna_barcode IS NOT NULL AND LENGTH(i.dna_barcode) > 10 THEN 
            CONCAT(LEFT(i.dna_barcode, 10), '...')
          ELSE i.dna_barcode
        END as "dnaBarcode",
        o.mycomap_blast_url as "mycoMapBlastResults",
        o.mycomap_blast_url as "mycoMapBlastUrl",
        o.ncbi_blast_file as "ncbiBlastFile", 
        o.local_blast_file as "localBlastFile",
        o.blast_files_downloaded as "blastFilesDownloaded",
        o.blast_download_date as "blastDownloadDate",
        o.mycomap_trace_url as "mycoMapTraceUrl",
        o.fastq_file as "fastqFile",
        o.trace_files_downloaded as "traceFilesDownloaded", 
        o.trace_download_date as "traceDownloadDate",
        o.mycomap_trace_url as "traceFiles",
        o.inat_api_saved as "inatApiSaved",
        o.inat_api_file as "inatApiFile",
        o.inat_api_save_date as "inatApiSaveDate",
        CASE WHEN i.observation_id IS NOT NULL THEN true ELSE false END as "hasInatData",
        i.sync_status as "inatSyncStatus",
        i.last_synced_at as "inatLastSynced",
        i.sync_error as "inatSyncError",
        i.species_guess as "inatScientificName",
        CASE 
          WHEN i.user IS NOT NULL AND i.user != '' THEN 
            COALESCE((i.user::json->>'name'), (i.user::json->>'login'), i.user::text)
          ELSE NULL 
        END as "inatObserver",
        i.observed_on_string as "inatObservedOn",
        i.provisional_species_name as "provisionalSpeciesName",
        i.inat_genbank_accession as "inatGenbankAccession",
        CASE 
          WHEN i.place_ids IS NOT NULL AND array_length(i.place_ids, 1) > 0 THEN
            (SELECT p.name FROM inaturalist_places p 
             WHERE p.place_id = ANY(i.place_ids) 
             AND p.admin_level = 10 AND p.place_type::integer = 8
             AND p.display_name LIKE '%, US'
             LIMIT 1)
          ELSE NULL
        END as "inatState",
        CASE WHEN m.observation_id IS NOT NULL THEN true ELSE false END as "hasMoData",
        m.mo_id as "moId",
        m.sync_status as "moSyncStatus",
        m.last_synced_at as "moLastSynced",
        m.sync_error as "moSyncError",
        m.scientific_name as "moScientificName",
        m.observer as "moObserver",
        m.observed_on as "moObservedOn",
        m.state as "moState",
        m.dna_barcode as "moDnaBarcode",
        m.sequence_notes as "moSequenceNotes",
        CASE WHEN m.api_file IS NOT NULL THEN true ELSE false END as "moApiSaved",
        m.api_file as "moApiFile",
        m.api_save_date as "moApiSaveDate",
        CASE WHEN mc.observation_id IS NOT NULL THEN true ELSE false END as "hasMycoportalData",
        mc.catalog_number as "mycoportalCatalogNumber",
        mc.sync_status as "mycoportalSyncStatus",
        mc.last_synced_at as "mycoportalLastSynced",
        mc.sync_error as "mycoportalSyncError",
        mc.scientific_name as "mycoportalScientificName",
        mc.recorded_by as "mycoportalRecordedBy",
        mc.event_date as "mycoportalEventDate",
        mc.state_province as "mycoportalState",
        CASE WHEN mc.api_file IS NOT NULL THEN true ELSE false END as "mycoportalApiSaved",
        mc.api_file as "mycoportalApiFile",
        mc.api_save_date as "mycoportalApiSaveDate",
        -- Biorecord/NFT minting status
        b.id as "biorecordId",
        b.nft_minted as "nftMinted",
        b.nft_token_id as "nftTokenId",
        b.nft_minted_at as "nftMintedAt"
      FROM observations o
      LEFT JOIN inaturalist_data i ON o.observation_id = i.observation_id
      LEFT JOIN mushroom_observer_data m ON o.observation_id = m.observation_id
      LEFT JOIN mycoportal_data mc ON o.observation_id = mc.observation_id
      LEFT JOIN biorecords b ON o.observation_id = b.observation_id
    `;

    const queryParams: any[] = [];
    const whereConditions: string[] = [];

    // Apply search filter for ID-based searches
    if (search && search.trim()) {
      const searchTerm = search.trim();
      whereConditions.push(`(
        o.observation_id ILIKE $${queryParams.length + 1} OR
        i.inat_id = $${queryParams.length + 2} OR
        m.mo_id = $${queryParams.length + 3}
      )`);
      queryParams.push(`%${searchTerm}%`, searchTerm, searchTerm);
    }

    // Apply source filter
    if (source === 'inaturalist') {
      whereConditions.push(`o.source = $${queryParams.length + 1}`);
      queryParams.push('iNaturalist');
    } else if (source === 'mo') {
      whereConditions.push(`o.source = $${queryParams.length + 1}`);
      queryParams.push('MO Observations');
    } else if (source === 'mycoportal') {
      whereConditions.push(`o.source = $${queryParams.length + 1}`);
      queryParams.push('MycoPortal');
    }

    // Apply sync status filter
    if (syncStatus === 'synced') {
      whereConditions.push(`(
        (o.source = 'iNaturalist' AND i.sync_status = 'success') OR
        (o.source = 'MO Observations' AND m.sync_status = 'success') OR
        (o.source = 'MycoPortal' AND mc.sync_status = 'success')
      )`);
    } else if (syncStatus === 'not_synced') {
      whereConditions.push(`(
        (o.source = 'iNaturalist' AND (i.sync_status IS NULL OR i.sync_status != 'success')) OR
        (o.source = 'MO Observations' AND (m.sync_status IS NULL OR m.sync_status != 'success')) OR
        (o.source = 'MycoPortal' AND (mc.sync_status IS NULL OR mc.sync_status != 'success'))
      )`);
    }

    // Apply fully validated filter (must have species-level identification, sync success, API files, and BLAST files when applicable)
    if (fullyValidated) {
      whereConditions.push(`(
        -- Species-level identification (at least 2 words in scientific name)
        array_length(string_to_array(trim(o.scientific_name), ' '), 1) >= 2
        AND
        -- Has iNaturalist data with successful sync
        i.observation_id IS NOT NULL 
        AND i.sync_status = 'success'
        AND
        -- Has iNaturalist API file saved
        o.inat_api_saved = true
        AND
        -- Has BLAST files downloaded when BLAST URL exists (or no BLAST URL required)
        (o.mycomap_blast_url IS NULL OR o.blast_files_downloaded = true)
        AND
        -- Has trace files downloaded when trace URL exists (or no trace URL required)
        (o.mycomap_trace_url IS NULL OR o.trace_files_downloaded = true)
      )`);
    }

    // Add WHERE clause if we have conditions
    if (whereConditions.length > 0) {
      sqlQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    // Add ordering and limit
    sqlQuery += ` ORDER BY o.id DESC LIMIT $${queryParams.length + 1}`;
    queryParams.push(limit);

    console.log('[DEBUG] Validation SQL Query:', sqlQuery);
    console.log('[DEBUG] Query Parameters:', queryParams);
    
    const result = await pool.query(sqlQuery, queryParams);
    console.log('[DEBUG] Query returned', result.rows.length, 'rows');
    
    return result.rows;
  }

  // Method to find observations with missing photos
  async getObservationsWithMissingPhotos(limit: number = 100): Promise<Array<{
    observationId: string;
    scientificName: string;
    hasInatData: boolean;
    photoCount: number;
    lastSyncedAt: Date | null;
  }>> {
    // Get observations from iNaturalist source that either:
    // 1. Have no iNaturalist data record at all, or
    // 2. Have iNaturalist data but no photos, or
    // 3. Haven't been synced recently
    
    const query = `
      SELECT 
        o.observation_id,
        o.scientific_name,
        CASE WHEN inat.observation_id IS NOT NULL THEN true ELSE false END as has_inat_data,
        CASE 
          WHEN inat.photos IS NULL THEN 0
          ELSE json_array_length(inat.photos)
        END as photo_count,
        inat.last_synced_at
      FROM observations o
      LEFT JOIN inaturalist_data inat ON o.observation_id = inat.observation_id
      WHERE o.source = 'iNaturalist'
        AND (
          inat.observation_id IS NULL OR 
          inat.photos IS NULL OR 
          json_array_length(inat.photos) = 0 OR
          inat.last_synced_at IS NULL OR
          inat.last_synced_at < NOW() - INTERVAL '30 days'
        )
      ORDER BY 
        CASE WHEN inat.observation_id IS NULL THEN 1 ELSE 2 END,
        CASE WHEN inat.photos IS NULL OR json_array_length(inat.photos) = 0 THEN 1 ELSE 2 END,
        o.observation_id
      LIMIT ${limit}
    `;

    const result = await pool.query(query);
    return result.rows.map(row => ({
      observationId: row.observation_id,
      scientificName: row.scientific_name,
      hasInatData: row.has_inat_data,
      photoCount: parseInt(row.photo_count) || 0,
      lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at) : null
    }));
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

      // Check if we already have this record and whether it needs photo update
      const [existing] = await db.select()
        .from(inaturalistData)
        .where(eq(inaturalistData.observationId, observationId));

      // Check if main observations table has BLAST URL
      const [obsRecord] = await db.select()
        .from(observations)
        .where(eq(observations.observationId, observationId));

      const hasPhotos = existing?.photos && existing.photos.length > 0;
      const hasBlastUrl = obsRecord?.mycoMapBlastUrl && obsRecord.mycoMapBlastUrl.length > 0;
      
      // If we have existing data with photos and BLAST URL and it's recent, skip unless forced
      if (existing && hasPhotos && hasBlastUrl && existing.lastSyncedAt) {
        const daysSinceSync = (Date.now() - existing.lastSyncedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceSync < 7) { // Skip if synced within last week and has photos and BLAST URL
          console.log(`[iNaturalist] Skipping ${observationId} - recent sync with photos and BLAST URL`);
          return existing;
        }
      }

      // Fetch data from iNaturalist API with observation field values
      console.log(`[iNaturalist] Fetching data for observation ${inatId} ${!hasPhotos ? '(missing photos)' : ''}`);
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

      // Extract photos with better fallback handling
      let photos: string[] = [];
      if (inatObservation.photos && Array.isArray(inatObservation.photos)) {
        photos = inatObservation.photos.map((photo: any) => {
          // Try different URL fields in order of preference
          return photo.url_original || photo.url_large || photo.url_medium || photo.url_small || photo.url;
        }).filter(Boolean); // Remove any undefined/null URLs
      }

      if (photos.length > 0) {
        console.log(`[iNaturalist] Found ${photos.length} photos for observation ${inatId}`);
      } else if (!hasPhotos) {
        console.log(`[iNaturalist] No photos found for observation ${inatId}`);
      }

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
        photos: photos,
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
        syncError: null,
        lastSyncedAt: new Date()
      };

      // Check if record already exists (reuse existing variable from above)
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
            // Update observation with BLAST file info and URL
            await db.update(observations)
              .set({
                mycoMapBlastUrl: mycoMapBlast,
                blastFilesDownloaded: true,
                ncbiBlastFile: blastResult.ncbiPath ? blastResult.ncbiPath.split('/').pop() : null,
                localBlastFile: blastResult.localPath ? blastResult.localPath.split('/').pop() : null,
                blastDownloadDate: new Date()
              })
              .where(eq(observations.observationId, observationId));
            console.log(`[iNaturalist] BLAST files downloaded for ${observationId}`);
          } else {
            // Even if download fails, store the URL for manual access
            await db.update(observations)
              .set({
                mycoMapBlastUrl: mycoMapBlast
              })
              .where(eq(observations.observationId, observationId));
            console.log(`[iNaturalist] BLAST URL stored for ${observationId}`);
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

  // Mushroom Observer API methods
  async getMushroomObserverData(observationId?: string): Promise<MushroomObserverData[]> {
    if (observationId) {
      const results = await db.select()
        .from(mushroomObserverData)
        .where(eq(mushroomObserverData.observationId, observationId));
      return results;
    }
    
    return await db.select().from(mushroomObserverData);
  }

  async createMushroomObserverData(data: InsertMushroomObserverData): Promise<MushroomObserverData> {
    const [result] = await db.insert(mushroomObserverData).values(data).returning();
    return result;
  }

  async updateMushroomObserverData(observationId: string, data: Partial<InsertMushroomObserverData>): Promise<void> {
    await db.update(mushroomObserverData)
      .set(data)
      .where(eq(mushroomObserverData.observationId, observationId));
  }

  async syncObservationWithMushroomObserver(observationId: string): Promise<MushroomObserverData | null> {
    try {
      // Extract MO ID from observation ID
      const moId = observationId.replace(/^MO_/, '');
      
      // Check if we already have data for this observation
      const existing = await this.getMushroomObserverData(observationId);
      
      console.log(`[MushroomObserver] Fetching data for observation ${observationId}, MO ID: ${moId}`);
      
      // Fetch from Mushroom Observer API with detail=high to get full observation data
      const moApiUrl = `https://mushroomobserver.org/api2/observations/${moId}?detail=high`;
      console.log(`[MushroomObserver] Attempting to fetch from: ${moApiUrl}`);
      
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'MycoMap-DataValidator/1.0'
      };
      
      // Add API key authentication if available
      if (process.env.MUSHROOM_OBSERVER_API_KEY) {
        headers['X-API-Key'] = process.env.MUSHROOM_OBSERVER_API_KEY;
        headers['Authorization'] = `Bearer ${process.env.MUSHROOM_OBSERVER_API_KEY}`;
      }
      
      const response = await fetch(moApiUrl, {
        headers,
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });
      
      if (!response.ok) {
        const errorMsg = `Mushroom Observer API returned status ${response.status}`;
        console.log(`[MushroomObserver] ${errorMsg} for observation ${observationId}`);
        
        const moRecord: InsertMushroomObserverData = {
          observationId,
          moId,
          syncStatus: 'error',
          syncError: errorMsg
        };

        if (existing.length > 0) {
          await this.updateMushroomObserverData(observationId, moRecord);
          const [updated] = await db.select()
            .from(mushroomObserverData)
            .where(eq(mushroomObserverData.observationId, observationId));
          return updated;
        } else {
          return await this.createMushroomObserverData(moRecord);
        }
      }

      const data = await response.json();
      
      if (!data.results || data.results.length === 0) {
        const errorMsg = 'No observation data found in Mushroom Observer API response';
        console.log(`[MushroomObserver] ${errorMsg} for observation ${observationId}`);
        
        const moRecord: InsertMushroomObserverData = {
          observationId,
          moId,
          syncStatus: 'error',
          syncError: errorMsg
        };

        if (existing.length > 0) {
          await this.updateMushroomObserverData(observationId, moRecord);
          const [updated] = await db.select()
            .from(mushroomObserverData)
            .where(eq(mushroomObserverData.observationId, observationId));
          return updated;
        } else {
          return await this.createMushroomObserverData(moRecord);
        }
      }

      const observation = data.results[0];
      console.log(`[MushroomObserver] Successfully fetched data for observation ${observationId}`);
      
      // Save MO API response as file
      const { blastDownloader } = await import('./blastDownloader.js');
      await blastDownloader.saveMoApiResponse(observationId, data);
      
      // Extract photo URLs from images array
      const photos = observation.images ? observation.images.map((image: any) => 
        image.original_url || image.huge_url || image.large_url || image.medium_url || image.small_url
      ).filter(Boolean) : [];

      const moRecord: InsertMushroomObserverData = {
        observationId,
        moId,
        moUuid: observation.uuid,
        scientificName: observation.consensus?.name || observation.name?.text_name,
        commonName: observation.consensus?.name || null,
        observer: observation.owner?.legal_name || observation.owner?.login_name || observation.user?.login || observation.user?.name,
        observedOn: observation.date || observation.when,
        location: observation.location?.name,
        state: observation.location?.name ? 
          (observation.location.name.includes(', Arizona,') ? 'Arizona' :
           observation.location.name.includes(', California,') ? 'California' :
           observation.location.name.includes(', Oregon,') ? 'Oregon' :
           observation.location.name.includes(', Washington,') ? 'Washington' :
           observation.location.name.split(', ').slice(-2, -1)[0] || null) : null,
        country: observation.location?.country,
        latitude: observation.lat ? observation.lat.toString() : null,
        longitude: observation.lng ? observation.lng.toString() : null,
        photos: photos,
        confidence: observation.vote?.value?.toString(),
        vote: observation.vote?.favorite ? 'favorite' : null,
        quality: observation.quality,
        isCollection: observation.is_collection || false,
        specimenAvailable: observation.specimen || false,
        notes: observation.notes?.localized || observation.notes?.default,
        // Extract DNA sequences, specifically ITS
        dnaBarcode: observation.sequences?.find(seq => seq.locus === 'ITS')?.bases || null,
        sequenceNotes: observation.sequences?.find(seq => seq.locus === 'ITS')?.notes || null,
        syncStatus: 'success',
        syncError: null,
        lastSyncedAt: new Date()
      };

      // Save the full MO API response as a text file
      try {
        console.log(`[MushroomObserver] Saving API response for ${observationId}`);
        const apiSaveResult = await blastDownloader.saveMoApiResponse(observationId, observation);
        
        if (apiSaveResult.success) {
          moRecord.apiFile = apiSaveResult.apiFilePath;
          moRecord.apiSaveDate = new Date();
          console.log(`[MushroomObserver] API response saved: ${apiSaveResult.apiFilePath}`);
        }
      } catch (apiError) {
        console.error(`[MushroomObserver] Failed to save API response for ${observationId}:`, apiError);
      }

      if (existing.length > 0) {
        await this.updateMushroomObserverData(observationId, moRecord);
        const [updated] = await db.select()
          .from(mushroomObserverData)
          .where(eq(mushroomObserverData.observationId, observationId));
        return updated;
      } else {
        return await this.createMushroomObserverData(moRecord);
      }

    } catch (error) {
      console.error(`[MushroomObserver] Error syncing observation ${observationId}:`, error);
      
      const errorRecord: InsertMushroomObserverData = {
        observationId,
        moId: observationId.replace(/^MO_/, ''),
        syncStatus: 'error',
        syncError: error instanceof Error ? 
          (error.message.includes('fetch failed') || error.name === 'AbortError' ? 
            'Network access blocked - IP whitelist required' : error.message) : 
          'Unknown error'
      };

      const existing = await this.getMushroomObserverData(observationId);
      if (existing.length > 0) {
        await this.updateMushroomObserverData(observationId, errorRecord);
        const [updated] = await db.select()
          .from(mushroomObserverData)
          .where(eq(mushroomObserverData.observationId, observationId));
        return updated;
      } else {
        return await this.createMushroomObserverData(errorRecord);
      }
    }
  }

  // MyCoPortal API integration methods
  async createMycoportalData(data: any): Promise<any> {
    const [result] = await db.insert(mycoportalData).values(data).returning();
    return result;
  }

  async updateMycoportalData(observationId: string, data: any): Promise<void> {
    await db.update(mycoportalData)
      .set(data)
      .where(eq(mycoportalData.observationId, observationId));
  }

  async getMycoportalData(observationId: string): Promise<any[]> {
    return await db.select()
      .from(mycoportalData)
      .where(eq(mycoportalData.observationId, observationId));
  }

  async syncObservationWithMycoportal(observationId: string): Promise<any | null> {
    try {
      console.log(`[MyCoPortal] Syncing observation ${observationId}`);
      
      // Check if MyCoPortal data already exists
      const existing = await this.getMycoportalData(observationId);
      
      // Extract catalog number from observation_id (assuming format like "MC123456")
      const catalogNumber = observationId.replace(/^MC/, '');
      
      console.log(`[MyCoPortal] Attempting to fetch catalog number: ${catalogNumber}`);
      
      // MyCoPortal API endpoint for occurrence records
      const apiUrl = `https://www.mycoportal.org/portal/api/v2/occurrence/${catalogNumber}`;
      
      console.log(`[MyCoPortal] Fetching from: ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MycoMap-Validation-Tool/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`MyCoPortal API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`[MyCoPortal] Successfully fetched data for catalog ${catalogNumber}`);

      // Extract scientific name from occurrence remarks if not in main field
      let extractedScientificName = data.scientificName;
      if (!extractedScientificName && data.occurrenceRemarks) {
        // Look for pattern like "Morchella - Morchella angusticeps" in occurrence remarks
        const scientificNameMatch = data.occurrenceRemarks.match(/- ([A-Z][a-z]+ [a-z]+) -/);
        if (scientificNameMatch) {
          extractedScientificName = scientificNameMatch[1];
        }
      }

      // Parse MyCoPortal response data (using camelCase to match database schema)
      const mycoportalRecord = {
        observationId: observationId,
        catalogNumber: data.catalogNumber || catalogNumber,
        collectionCode: data.collectionCode,
        institutionCode: data.institutionCode,
        scientificName: extractedScientificName,
        commonName: data.vernacularName,
        family: data.family,
        genus: data.genus,
        specificEpithet: data.specificEpithet,
        infraspecificEpithet: data.infraspecificEpithet,
        taxonRank: data.taxonRank,
        identifiedBy: data.identifiedBy,
        dateIdentified: data.dateIdentified,
        recordedBy: data.recordedBy,
        recordNumber: data.recordNumber,
        eventDate: data.eventDate,
        year: data.year ? parseInt(data.year) : null,
        month: data.month ? parseInt(data.month) : null,
        day: data.day ? parseInt(data.day) : null,
        country: data.country,
        stateProvince: data.stateProvince,
        county: data.county,
        locality: data.locality,
        habitat: data.habitat,
        substrate: data.substrate,
        decimalLatitude: data.decimalLatitude ? parseFloat(data.decimalLatitude) : null,
        decimalLongitude: data.decimalLongitude ? parseFloat(data.decimalLongitude) : null,
        coordinateUncertaintyInMeters: data.coordinateUncertaintyInMeters ? parseInt(data.coordinateUncertaintyInMeters) : null,
        elevation: data.elevationInMeters ? parseInt(data.elevationInMeters) : null,
        minimumElevationInMeters: data.minimumElevationInMeters ? parseInt(data.minimumElevationInMeters) : null,
        maximumElevationInMeters: data.maximumElevationInMeters ? parseInt(data.maximumElevationInMeters) : null,
        occurrenceRemarks: data.occurrenceRemarks,
        associatedTaxa: data.associatedTaxa,
        dynamicProperties: data.dynamicProperties,
        geneticAccessionNumber: data.geneticAccessionNumber,
        associatedSequences: data.associatedSequences,
        associatedMedia: data.associatedMedia,
        syncStatus: 'success',
        syncError: null,
        lastSyncedAt: new Date()
      };

      // Save the full MyCoPortal API response as a text file
      try {
        console.log(`[MyCoPortal] Saving API response for ${observationId}`);
        const apiSaveResult = await blastDownloader.saveMycoportalApiResponse(observationId, data);
        
        if (apiSaveResult.success) {
          mycoportalRecord.apiFile = apiSaveResult.apiFilePath;
          mycoportalRecord.apiSaveDate = new Date();
          console.log(`[MyCoPortal] API response saved: ${apiSaveResult.apiFilePath}`);
        }
      } catch (apiError) {
        console.error(`[MyCoPortal] Failed to save API response for ${observationId}:`, apiError);
      }

      if (existing.length > 0) {
        await this.updateMycoportalData(observationId, mycoportalRecord);
        const [updated] = await db.select()
          .from(mycoportalData)
          .where(eq(mycoportalData.observationId, observationId));
        return updated;
      } else {
        return await this.createMycoportalData(mycoportalRecord);
      }

    } catch (error) {
      console.error(`[MyCoPortal] Error syncing observation ${observationId}:`, error);
      
      const errorRecord = {
        observationId: observationId,
        catalogNumber: observationId.replace(/^MC/, ''),
        syncStatus: 'error',
        syncError: (error as Error).message,
        lastSyncedAt: new Date()
      };

      const existing = await this.getMycoportalData(observationId);
      if (existing.length > 0) {
        await this.updateMycoportalData(observationId, errorRecord);
        return existing[0];
      } else {
        return await this.createMycoportalData(errorRecord);
      }
    }
  }

  // Biorecords management - Historical snapshots of fully validated observations
  async createBiorecord(observationData: any): Promise<Biorecord> {
    const biorecordData: InsertBiorecord = {
      observationId: observationData.observationId,
      scientificName: observationData.scientificName,
      commonName: observationData.commonName,
      phylum: observationData.phylum,
      class: observationData.class,
      order: observationData.order,
      family: observationData.family,
      genus: observationData.genus,
      species: observationData.species,
      infraspecies: observationData.infraspecies,
      observer: observationData.observer,
      collector: observationData.collector,
      observedOn: observationData.observedOn,
      latitude: observationData.latitude,
      longitude: observationData.longitude,
      placeGuess: observationData.placeGuess,
      state: observationData.state,
      country: observationData.country,
      genbankAccession: observationData.genbankAccession,
      mycoportalNumber: observationData.mycoportalNumber,
      dnaSequence: observationData.dnaSequence,
      sequence: observationData.sequence,
      collectionNumber: observationData.collectionNumber,
      creationDate: observationData.creationDate,
      verified: observationData.verified,
      kingdom: observationData.kingdom,
      authority: observationData.authority,
      abbreviatedAuthority: observationData.abbreviatedAuthority,
      mycobankNumber: observationData.mycobankNumber,
      fungariumSpecimen: observationData.fungariumSpecimen,
      images: observationData.images,
      flags: observationData.flags,
      forwardPrimer: observationData.forwardPrimer,
      reversePrimer: observationData.reversePrimer,
      runName: observationData.runName,
      sequence2: observationData.sequence2,
      forwardPrimer2: observationData.forwardPrimer2,
      reversePrimer2: observationData.reversePrimer2,
      sequenceOwner2: observationData.sequenceOwner2,
      runName2: observationData.runName2,
      locationName: observationData.locationName,
      notes: observationData.notes,
      moNotes: observationData.moNotes,
      reportLink: observationData.reportLink,
      imageLink: observationData.imageLink,
      firstGenbankRecord: observationData.firstGenbankRecord,
      isFirstStateRecord: observationData.isFirstStateRecord,
      hasMultipleGenotypes: observationData.hasMultipleGenotypes,
      source: observationData.source,
      sourceUrl: observationData.sourceUrl,
      mycoMapBlastUrl: observationData.mycoMapBlastUrl,
      ncbiBlastFile: observationData.ncbiBlastFile,
      localBlastFile: observationData.localBlastFile,
      blastFilesDownloaded: observationData.blastFilesDownloaded,
      blastDownloadDate: observationData.blastDownloadDate,
      mycoMapTraceUrl: observationData.mycoMapTraceUrl,
      fastqFile: observationData.fastqFile,
      traceFilesDownloaded: observationData.traceFilesDownloaded,
      traceDownloadDate: observationData.traceDownloadDate,
      inatApiFile: observationData.inatApiFile,
      inatApiSaved: observationData.inatApiSaved,
      inatApiSaveDate: observationData.inatApiSaveDate,
      // External platform data snapshots
      inatScientificName: observationData.inatScientificName,
      inatObserver: observationData.inatObserver,
      inatObservedOn: observationData.inatObservedOn,
      inatState: observationData.inatState,
      inatGenbankAccession: observationData.inatGenbankAccession,
      moScientificName: observationData.moScientificName,
      moObserver: observationData.moObserver,
      moObservedOn: observationData.moObservedOn,
      moState: observationData.moState,
      moDnaBarcode: observationData.moDnaBarcode,
      moSequenceNotes: observationData.moSequenceNotes,
      mycoportalScientificName: observationData.mycoportalScientificName,
      mycoportalRecordedBy: observationData.mycoportalRecordedBy,
      mycoportalEventDate: observationData.mycoportalEventDate,
      mycoportalState: observationData.mycoportalState,
      mycoportalCatalogNumber: observationData.mycoportalCatalogNumber,
      validatedBy: observationData.validatedBy || 'system',
      validationVersion: '1.0',
      originalObservationId: observationData.originalObservationId
    };

    const [biorecord] = await db.insert(biorecords).values(biorecordData).returning();
    return biorecord;
  }

  async getBiorecords(limit: number = 50, offset: number = 0): Promise<Biorecord[]> {
    return await db
      .select()
      .from(biorecords)
      .orderBy(desc(biorecords.validatedAt))
      .limit(limit)
      .offset(offset);
  }

  async getBiorecordByObservationId(observationId: string): Promise<Biorecord | null> {
    const result = await db
      .select()
      .from(biorecords)
      .where(eq(biorecords.observationId, observationId))
      .orderBy(desc(biorecords.validatedAt))
      .limit(1);
    
    return result[0] || null;
  }

  async getBiorecordHistory(observationId: string): Promise<Biorecord[]> {
    return await db
      .select()
      .from(biorecords)
      .where(eq(biorecords.observationId, observationId))
      .orderBy(desc(biorecords.validatedAt));
  }

  async createBiorecordFromValidatedObservation(observationId: string): Promise<Biorecord | null> {
    // Get the fully validated observation data
    const validatedData = await db.execute(sql`
      SELECT 
        o.*,
        i.species_guess as "inatScientificName",
        CASE 
          WHEN i.user IS NOT NULL AND i.user != '' THEN 
            COALESCE((i.user::json->>'name'), (i.user::json->>'login'), i.user::text)
          ELSE NULL 
        END as "inatObserver",
        i.observed_on_string as "inatObservedOn",
        CASE 
          WHEN i.place_ids IS NOT NULL AND array_length(i.place_ids, 1) > 0 THEN
            (SELECT p.name FROM inaturalist_places p 
             WHERE p.place_id = ANY(i.place_ids) 
             AND p.admin_level = 10 AND p.place_type::integer = 8
             AND p.display_name LIKE '%, US'
             LIMIT 1)
          ELSE NULL
        END as "inatState",
        i.inat_genbank_accession as "inatGenbankAccession",
        m.scientific_name as "moScientificName",
        m.observer as "moObserver",
        m.observed_on as "moObservedOn",
        m.state as "moState",
        m.dna_barcode as "moDnaBarcode",
        m.sequence_notes as "moSequenceNotes",
        mc.scientific_name as "mycoportalScientificName",
        mc.recorded_by as "mycoportalRecordedBy",
        mc.event_date as "mycoportalEventDate",
        mc.state_province as "mycoportalState",
        mc.catalog_number as "mycoportalCatalogNumber"
      FROM observations o
      LEFT JOIN inaturalist_data i ON o.observation_id = i.observation_id
      LEFT JOIN mushroom_observer_data m ON o.observation_id = m.observation_id
      LEFT JOIN mycoportal_data mc ON o.observation_id = mc.observation_id
      WHERE o.observation_id = ${observationId}
      AND (
        -- Species-level identification (at least 2 words in scientific name)
        array_length(string_to_array(trim(o.scientific_name), ' '), 1) >= 2
        AND
        -- Has successful sync with at least one platform
        (
          (o.source = 'iNaturalist' AND i.sync_status = 'success') OR
          (o.source = 'MO Observations' AND m.sync_status = 'success') OR
          (o.source = 'MycoPortal' AND mc.sync_status = 'success')
        )
        AND
        -- Has required files when URLs exist
        (o.mycomap_blast_url IS NULL OR o.blast_files_downloaded = true)
        AND
        (o.mycomap_trace_url IS NULL OR o.trace_files_downloaded = true)
        AND
        -- Has iNaturalist API file saved for iNaturalist records
        (o.source != 'iNaturalist' OR o.inat_api_saved = true)
      )
    `);

    if (validatedData.rows.length === 0) {
      return null; // Observation is not fully validated
    }

    const observationData = validatedData.rows[0] as any;
    observationData.originalObservationId = observationData.id;

    // Check if biorecord already exists
    const existingBiorecord = await this.getBiorecordByObservationId(observationId);
    if (existingBiorecord) {
      // Compare data to see if there are changes
      const hasChanges = this.compareObservationData(existingBiorecord, observationData);
      if (!hasChanges) {
        return existingBiorecord; // No changes, return existing biorecord
      }
    }

    // Create new biorecord snapshot
    return await this.createBiorecord(observationData);
  }

  private compareObservationData(existingBiorecord: Biorecord, newData: any): boolean {
    // Compare key fields to detect changes
    const fieldsToCompare = [
      'scientificName', 'commonName', 'phylum', 'class', 'order', 'family', 'genus', 'species',
      'observer', 'collector', 'state', 'country', 'genbankAccession', 'dnaSequence',
      'inatScientificName', 'inatObserver', 'moScientificName', 'moObserver',
      'mycoportalScientificName', 'mycoportalRecordedBy'
    ];

    for (const field of fieldsToCompare) {
      if (existingBiorecord[field as keyof Biorecord] !== newData[field]) {
        return true; // Changes detected
      }
    }

    return false; // No significant changes
  }

  // NFT minting functionality
  async mintBiorecordNFT(biorecordId: number, nftData: {
    tokenId: string;
    contractAddress: string;
    blockchainNetwork: string;
    metadataUri?: string;
    imageUri?: string;
    mintedBy?: string;
  }): Promise<Biorecord> {
    const [updatedBiorecord] = await db
      .update(biorecords)
      .set({
        nftMinted: true,
        nftTokenId: nftData.tokenId,
        nftContractAddress: nftData.contractAddress,
        nftBlockchainNetwork: nftData.blockchainNetwork,
        nftMetadataUri: nftData.metadataUri,
        nftImageUri: nftData.imageUri,
        nftMintedAt: new Date(),
        nftMintedBy: nftData.mintedBy || 'system'
      })
      .where(eq(biorecords.id, biorecordId))
      .returning();

    return updatedBiorecord;
  }

  async getBiorecordsEligibleForMinting(): Promise<Biorecord[]> {
    return await db
      .select()
      .from(biorecords)
      .where(eq(biorecords.nftMinted, false))
      .orderBy(desc(biorecords.validatedAt));
  }
}