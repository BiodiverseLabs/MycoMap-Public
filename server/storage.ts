import { 
  users, observations, uploads, contributors, species,
  type User, type InsertUser, type Observation, type InsertObservation,
  type Upload, type InsertUpload, type Contributor, type InsertContributor,
  type Species, type InsertSpecies
} from "@shared/schema";

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

export class MemoryStorage implements IStorage {
  private observations: Observation[] = [];
  private uploads: Upload[] = [];
  private contributors: Contributor[] = [];
  private species: Species[] = [];
  private users: User[] = [];

  async getUser(id: number): Promise<User | undefined> {
    return this.users.find(u => u.id === id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.users.find(u => u.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const user: User = {
      id: this.users.length + 1,
      ...insertUser,
    };
    this.users.push(user);
    return user;
  }

  async getAllObservations(): Promise<Observation[]> {
    return this.observations.slice().reverse();
  }

  async getObservationsByDateRange(startDate: string, endDate: string): Promise<Observation[]> {
    return this.observations.filter(obs => 
      obs.observedOn && obs.observedOn >= startDate && obs.observedOn <= endDate
    ).reverse();
  }

  async getObservationsByState(state: string): Promise<Observation[]> {
    return this.observations.filter(obs => obs.state === state).reverse();
  }

  async createObservation(observation: InsertObservation): Promise<Observation> {
    const newObs: Observation = {
      id: this.observations.length + 1,
      observationId: observation.observationId,
      scientificName: observation.scientificName,
      commonName: observation.commonName || null,
      phylum: observation.phylum || null,
      class: observation.class || null,
      order: observation.order || null,
      family: observation.family || null,
      genus: observation.genus || null,
      species: observation.species || null,
      infraspecies: observation.infraspecies || null,
      observer: observation.observer || null,
      collector: observation.collector || null,
      observedOn: observation.observedOn || null,
      latitude: observation.latitude || null,
      longitude: observation.longitude || null,
      placeGuess: observation.placeGuess || null,
      state: observation.state || null,
      country: observation.country || null,
      genbankAccession: observation.genbankAccession || null,
      isFirstStateRecord: observation.isFirstStateRecord || false,
      hasMultipleGenotypes: observation.hasMultipleGenotypes || false,
      source: observation.source || null,
      sourceUrl: observation.sourceUrl || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.observations.push(newObs);
    return newObs;
  }

  async createObservations(observationList: InsertObservation[]): Promise<Observation[]> {
    const newObservations: Observation[] = [];
    for (const obs of observationList) {
      const newObs = await this.createObservation(obs);
      newObservations.push(newObs);
    }
    return newObservations;
  }

  async getObservationMetrics(): Promise<{
    totalObservations: number;
    uniqueSpecies: number;
    activeContributors: number;
    statesCovered: number;
  }> {
    const uniqueSpecies = new Set(this.observations.map(o => o.scientificName)).size;
    const activeContributors = new Set(this.observations.map(o => o.observer).filter(Boolean)).size;
    const statesCovered = new Set(this.observations.map(o => o.state).filter(Boolean)).size;

    return {
      totalObservations: this.observations.length,
      uniqueSpecies,
      activeContributors,
      statesCovered,
    };
  }

  async getTemporalTrends(groupBy: 'month' | 'quarter' | 'year'): Promise<Array<{
    period: string;
    count: number;
  }>> {
    const trends = new Map<string, number>();
    
    this.observations.forEach(obs => {
      if (!obs.observedOn) return;
      
      const date = new Date(obs.observedOn);
      let period: string;
      
      switch (groupBy) {
        case 'month':
          period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'quarter':
          period = `${date.getFullYear()}-Q${Math.ceil((date.getMonth() + 1) / 3)}`;
          break;
        case 'year':
          period = `${date.getFullYear()}`;
          break;
      }
      
      trends.set(period, (trends.get(period) || 0) + 1);
    });

    return Array.from(trends.entries())
      .map(([period, count]) => ({ period, count }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  async getTaxonomicDistribution(): Promise<Array<{
    phylum: string;
    count: number;
  }>> {
    const distribution = new Map<string, number>();
    
    this.observations.forEach(obs => {
      if (obs.phylum) {
        distribution.set(obs.phylum, (distribution.get(obs.phylum) || 0) + 1);
      }
    });

    return Array.from(distribution.entries())
      .map(([phylum, count]) => ({ phylum, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getTopContributors(limit: number = 10): Promise<Contributor[]> {
    return this.contributors
      .sort((a, b) => (b.observationCount || 0) - (a.observationCount || 0))
      .slice(0, limit);
  }

  async getTopSpecies(limit: number = 10): Promise<Species[]> {
    return this.species
      .sort((a, b) => (b.observationCount || 0) - (a.observationCount || 0))
      .slice(0, limit);
  }

  async getRareSpecies(maxObservations: number = 3): Promise<Species[]> {
    return this.species
      .filter(s => (s.observationCount || 0) <= maxObservations)
      .sort((a, b) => (a.observationCount || 0) - (b.observationCount || 0));
  }

  async getRecentStateRecords(limit: number = 10): Promise<Observation[]> {
    return this.observations
      .filter(obs => obs.isFirstStateRecord)
      .sort((a, b) => new Date(b.observedOn || 0).getTime() - new Date(a.observedOn || 0).getTime())
      .slice(0, limit);
  }

  async createUpload(upload: InsertUpload): Promise<Upload> {
    const newUpload: Upload = {
      id: this.uploads.length + 1,
      filename: upload.filename,
      originalName: upload.originalName,
      recordCount: upload.recordCount,
      status: upload.status,
      errorMessage: upload.errorMessage || null,
      uploadedAt: new Date(),
    };
    this.uploads.push(newUpload);
    return newUpload;
  }

  async getUploads(): Promise<Upload[]> {
    return this.uploads.slice().reverse();
  }

  async updateUploadStatus(id: number, status: string, errorMessage?: string): Promise<void> {
    const upload = this.uploads.find(u => u.id === id);
    if (upload) {
      upload.status = status;
      if (errorMessage) upload.errorMessage = errorMessage;
    }
  }

  async upsertContributor(contributor: InsertContributor): Promise<Contributor> {
    const existing = this.contributors.find(c => c.name === contributor.name);
    if (existing) {
      Object.assign(existing, contributor);
      return existing;
    } else {
      const newContributor: Contributor = {
        id: this.contributors.length + 1,
        ...contributor,
      };
      this.contributors.push(newContributor);
      return newContributor;
    }
  }

  async upsertSpecies(speciesData: InsertSpecies): Promise<Species> {
    const existing = this.species.find(s => s.scientificName === speciesData.scientificName);
    if (existing) {
      Object.assign(existing, speciesData);
      return existing;
    } else {
      const newSpecies: Species = {
        id: this.species.length + 1,
        ...speciesData,
      };
      this.species.push(newSpecies);
      return newSpecies;
    }
  }
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

// Use memory storage initially, will switch to database once data is uploaded
export const storage = new MemoryStorage();
