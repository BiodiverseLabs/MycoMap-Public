import { 
  users, observations, uploads, contributors, species,
  type User, type InsertUser, type Observation, type InsertObservation,
  type Upload, type InsertUpload, type Contributor, type InsertContributor,
  type Species, type InsertSpecies
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, and, gte, lte, count, asc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Observations
  getAllObservations(): Promise<Observation[]>;
  getObservationsByDateRange(startDate: string, endDate: string): Promise<Observation[]>;
  getObservationsByState(state: string): Promise<Observation[]>;
  createObservation(observation: InsertObservation): Promise<Observation>;
  createObservations(observations: InsertObservation[]): Promise<Observation[]>;
  
  // Analytics
  getObservationMetrics(): Promise<{
    totalObservations: number;
    uniqueSpecies: number;
    activeContributors: number;
    statesCovered: number;
  }>;
  
  getTemporalTrends(groupBy: 'month' | 'quarter' | 'year'): Promise<Array<{
    period: string;
    count: number;
  }>>;
  
  getTaxonomicDistribution(): Promise<Array<{
    phylum: string;
    count: number;
  }>>;
  
  getTopContributors(limit?: number): Promise<Contributor[]>;
  getTopSpecies(limit?: number): Promise<Species[]>;
  getRareSpecies(maxObservations?: number): Promise<Species[]>;
  getRecentStateRecords(limit?: number): Promise<Observation[]>;
  
  // Uploads
  createUpload(upload: InsertUpload): Promise<Upload>;
  getUploads(): Promise<Upload[]>;
  updateUploadStatus(id: number, status: string, errorMessage?: string): Promise<void>;
  
  // Contributors and Species
  upsertContributor(contributor: InsertContributor): Promise<Contributor>;
  upsertSpecies(species: InsertSpecies): Promise<Species>;
}

export class DatabaseStorage implements IStorage {
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

  async getAllObservations(): Promise<Observation[]> {
    return await db.select().from(observations).orderBy(desc(observations.createdAt));
  }

  async getObservationsByDateRange(startDate: string, endDate: string): Promise<Observation[]> {
    return await db
      .select()
      .from(observations)
      .where(
        and(
          gte(observations.observedOn, startDate),
          lte(observations.observedOn, endDate)
        )
      )
      .orderBy(desc(observations.observedOn));
  }

  async getObservationsByState(state: string): Promise<Observation[]> {
    return await db
      .select()
      .from(observations)
      .where(eq(observations.state, state))
      .orderBy(desc(observations.observedOn));
  }

  async createObservation(observation: InsertObservation): Promise<Observation> {
    const [newObservation] = await db
      .insert(observations)
      .values(observation)
      .returning();
    return newObservation;
  }

  async createObservations(observationList: InsertObservation[]): Promise<Observation[]> {
    return await db
      .insert(observations)
      .values(observationList)
      .returning();
  }

  async getObservationMetrics(): Promise<{
    totalObservations: number;
    uniqueSpecies: number;
    activeContributors: number;
    statesCovered: number;
  }> {
    const [totalObs] = await db
      .select({ count: count() })
      .from(observations);

    const [uniqueSpeciesResult] = await db
      .select({ count: sql<number>`count(distinct ${observations.scientificName})` })
      .from(observations);

    const [contributorsResult] = await db
      .select({ count: sql<number>`count(distinct ${observations.observer})` })
      .from(observations);

    const [statesResult] = await db
      .select({ count: sql<number>`count(distinct ${observations.state})` })
      .from(observations);

    return {
      totalObservations: totalObs.count,
      uniqueSpecies: uniqueSpeciesResult.count,
      activeContributors: contributorsResult.count,
      statesCovered: statesResult.count,
    };
  }

  async getTemporalTrends(groupBy: 'month' | 'quarter' | 'year'): Promise<Array<{
    period: string;
    count: number;
  }>> {
    let dateFormat: string;
    switch (groupBy) {
      case 'month':
        dateFormat = 'YYYY-MM';
        break;
      case 'quarter':
        dateFormat = 'YYYY-Q';
        break;
      case 'year':
        dateFormat = 'YYYY';
        break;
    }

    const result = await db
      .select({
        period: sql<string>`to_char(${observations.observedOn}, ${dateFormat})`,
        count: count(),
      })
      .from(observations)
      .where(sql`${observations.observedOn} IS NOT NULL`)
      .groupBy(sql`to_char(${observations.observedOn}, ${dateFormat})`)
      .orderBy(sql`to_char(${observations.observedOn}, ${dateFormat})`);

    return result;
  }

  async getTaxonomicDistribution(): Promise<Array<{
    phylum: string;
    count: number;
  }>> {
    const result = await db
      .select({
        phylum: observations.phylum,
        count: count(),
      })
      .from(observations)
      .where(sql`${observations.phylum} IS NOT NULL`)
      .groupBy(observations.phylum)
      .orderBy(desc(count()));

    return result.map(r => ({ phylum: r.phylum!, count: r.count }));
  }

  async getTopContributors(limit: number = 10): Promise<Contributor[]> {
    return await db
      .select()
      .from(contributors)
      .orderBy(desc(contributors.observationCount))
      .limit(limit);
  }

  async getTopSpecies(limit: number = 10): Promise<Species[]> {
    return await db
      .select()
      .from(species)
      .orderBy(desc(species.observationCount))
      .limit(limit);
  }

  async getRareSpecies(maxObservations: number = 3): Promise<Species[]> {
    return await db
      .select()
      .from(species)
      .where(sql`${species.observationCount} <= ${maxObservations}`)
      .orderBy(asc(species.observationCount), desc(species.lastObserved));
  }

  async getRecentStateRecords(limit: number = 10): Promise<Observation[]> {
    return await db
      .select()
      .from(observations)
      .where(eq(observations.isFirstStateRecord, true))
      .orderBy(desc(observations.observedOn))
      .limit(limit);
  }

  async createUpload(upload: InsertUpload): Promise<Upload> {
    const [newUpload] = await db
      .insert(uploads)
      .values(upload)
      .returning();
    return newUpload;
  }

  async getUploads(): Promise<Upload[]> {
    return await db
      .select()
      .from(uploads)
      .orderBy(desc(uploads.uploadedAt));
  }

  async updateUploadStatus(id: number, status: string, errorMessage?: string): Promise<void> {
    await db
      .update(uploads)
      .set({
        status,
        errorMessage,
      })
      .where(eq(uploads.id, id));
  }

  async upsertContributor(contributor: InsertContributor): Promise<Contributor> {
    const [result] = await db
      .insert(contributors)
      .values(contributor)
      .onConflictDoUpdate({
        target: contributors.name,
        set: {
          observationCount: contributor.observationCount,
          verificationRate: contributor.verificationRate,
          lastObservation: contributor.lastObservation,
        },
      })
      .returning();
    return result;
  }

  async upsertSpecies(speciesData: InsertSpecies): Promise<Species> {
    const [result] = await db
      .insert(species)
      .values(speciesData)
      .onConflictDoUpdate({
        target: species.scientificName,
        set: {
          observationCount: speciesData.observationCount,
          lastObserved: speciesData.lastObserved,
          stateCount: speciesData.stateCount,
        },
      })
      .returning();
    return result;
  }
}

export const storage = new DatabaseStorage();
