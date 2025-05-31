import { 
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
  getObservationMetrics(startDate?: string, endDate?: string): Promise<{
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
  
  getTopContributors(limit?: number, startDate?: string, endDate?: string): Promise<Contributor[]>;
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
  
  // Record Index
  getRecordIndex(limit?: number, offset?: number, stateFirstsOnly?: boolean): Promise<Array<{
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
  }>>;
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
      username: insertUser.username,
      password: insertUser.password,
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

  async getObservationMetrics(startDate?: string, endDate?: string): Promise<{
    totalObservations: number;
    uniqueSpecies: number;
    activeContributors: number;
    statesCovered: number;
  }> {
    // Filter observations by date range if provided
    let filteredObservations = this.observations;
    if (startDate && endDate) {
      filteredObservations = this.observations.filter(obs => {
        if (!obs.observedOn) return false;
        const obsDate = obs.observedOn;
        return obsDate >= startDate && obsDate <= endDate;
      });
    }

    const uniqueSpecies = new Set(filteredObservations.map(o => o.scientificName)).size;
    const activeContributors = new Set(filteredObservations.map(o => o.observer).filter(Boolean)).size;
    const statesCovered = new Set(filteredObservations.map(o => o.state).filter(Boolean)).size;

    return {
      totalObservations: filteredObservations.length,
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
        name: contributor.name,
        affiliation: contributor.affiliation || null,
        observationCount: contributor.observationCount || null,
        verificationRate: contributor.verificationRate || null,
        firstObservation: contributor.firstObservation || null,
        lastObservation: contributor.lastObservation || null,
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
        scientificName: speciesData.scientificName,
        commonName: speciesData.commonName || null,
        phylum: speciesData.phylum || null,
        class: speciesData.class || null,
        order: speciesData.order || null,
        family: speciesData.family || null,
        genus: speciesData.genus || null,
        observationCount: speciesData.observationCount || null,
        firstObserved: speciesData.firstObserved || null,
        lastObserved: speciesData.lastObserved || null,
        stateCount: speciesData.stateCount || null,
      };
      this.species.push(newSpecies);
      return newSpecies;
    }
  }

  async getRecordIndex(limit: number = 50, offset: number = 0, stateFirstsOnly: boolean = false): Promise<Array<{
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
    // Memory storage implementation - basic version
    const sortedObs = this.observations
      .filter(obs => obs.species && obs.observedOn)
      .sort((a, b) => {
        const dateA = new Date(a.observedOn || '').getTime();
        const dateB = new Date(b.observedOn || '').getTime();
        if (dateA !== dateB) return dateA - dateB;
        return a.species!.localeCompare(b.species!);
      });

    const result = sortedObs.map((obs, index) => {
      const globalIndex = index + 1;
      
      // Get all observations of this same species in this same state, sorted by date
      const sameSpeciesInState = sortedObs.filter(o => 
        o.species === obs.species && o.state === obs.state
      );
      const stateSpeciesIndex = sameSpeciesInState.findIndex(o => o.id === obs.id) + 1;
      
      const firstGlobalForSpecies = sortedObs.find(o => o.species === obs.species);
      const firstStateForSpecies = sameSpeciesInState[0]; // First of this species in this state
      
      return {
        id: obs.id,
        species: obs.species!,
        state: obs.state || 'Unknown',
        reportDate: obs.observedOn || '',
        source: obs.source || 'Unknown',
        referenceNumber: obs.observationId || 'N/A',
        datasetRecordNumber: globalIndex,
        stateRecordNumber: stateSpeciesIndex,
        isFirstGlobal: firstGlobalForSpecies?.id === obs.id,
        isFirstInState: firstStateForSpecies?.id === obs.id
      };
    });

    // Filter for state firsts only if requested
    const filteredResult = stateFirstsOnly 
      ? result.filter(record => record.isFirstInState)
      : result;

    return filteredResult.slice(offset, offset + limit);
  }
}

// Use database storage instead of memory storage
import { DatabaseStorage } from "./db";
export const storage = new DatabaseStorage();