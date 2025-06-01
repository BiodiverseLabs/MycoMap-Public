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
  
  getFamilyDistribution(): Promise<Array<{
    family: string;
    count: number;
  }>>;
  
  getClassDistribution(): Promise<Array<{
    class: string;
    count: number;
  }>>;
  
  getOrderDistribution(): Promise<Array<{
    order: string;
    count: number;
  }>>;
  
  getGenusDistribution(): Promise<Array<{
    genus: string;
    count: number;
  }>>;
  
  getSeasonalPatterns(): Promise<Array<{
    season: string;
    count: number;
    percentage: number;
  }>>;
  
  getMonthlyStatistics(): Promise<Array<{
    month: string;
    count: number;
    monthNumber: number;
  }>>;
  
  getTopContributors(limit?: number, startDate?: string, endDate?: string, state?: string): Promise<Contributor[]>;
  getTopSpecies(limit?: number, state?: string): Promise<Species[]>;
  getRareSpecies(maxObservations?: number, state?: string): Promise<Species[]>;
  getRecentStateRecords(limit?: number, state?: string): Promise<Observation[]>;
  
  // Uploads
  createUpload(upload: InsertUpload): Promise<Upload>;
  getUploads(): Promise<Upload[]>;
  updateUploadStatus(id: number, status: string, errorMessage?: string): Promise<void>;
  
  // Contributors and Species
  upsertContributor(contributor: InsertContributor): Promise<Contributor>;
  upsertSpecies(species: InsertSpecies): Promise<Species>;
  
  // Record Index
  getRecordIndex(limit?: number, offset?: number, stateFirstsOnly?: boolean, recent?: boolean, state?: string, globalFirstsOnly?: boolean, startDate?: string, endDate?: string, species?: string): Promise<Array<{
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
  
  // Data management
  clearAllData(): Promise<void>;
  
  // Source analytics
  getObservationSources(dateRange?: string): Promise<Array<{
    source: string;
    count: number;
    percentage: number;
  }>>;
  
  // Species accumulation curve
  getSpeciesAccumulation(state?: string): Promise<Array<{
    observationNumber: number;
    uniqueSpeciesCount: number;
  }>>;
  
  // Global first records analytics
  getStatesWithMostGlobalFirsts(filterState?: string): Promise<Array<{
    state: string;
    globalFirstCount: number;
    percentage: number;
  }>>;
  
  getContributorsWithMostGlobalFirsts(limit?: number, filterState?: string): Promise<Array<{
    id: string;
    name: string;
    affiliation?: string;
    globalFirstCount: number;
    percentage: number;
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

  async getFamilyDistribution(): Promise<Array<{
    family: string;
    count: number;
  }>> {
    const distribution = new Map<string, number>();
    
    this.observations.forEach(obs => {
      if (obs.family) {
        distribution.set(obs.family, (distribution.get(obs.family) || 0) + 1);
      }
    });

    return Array.from(distribution.entries())
      .map(([family, count]) => ({ family, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  async getClassDistribution(): Promise<Array<{
    class: string;
    count: number;
  }>> {
    const distribution = new Map<string, number>();
    
    this.observations.forEach(obs => {
      if (obs.class) {
        distribution.set(obs.class, (distribution.get(obs.class) || 0) + 1);
      }
    });

    return Array.from(distribution.entries())
      .map(([className, count]) => ({ class: className, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getOrderDistribution(): Promise<Array<{
    order: string;
    count: number;
  }>> {
    const distribution = new Map<string, number>();
    
    this.observations.forEach(obs => {
      if (obs.order) {
        distribution.set(obs.order, (distribution.get(obs.order) || 0) + 1);
      }
    });

    return Array.from(distribution.entries())
      .map(([order, count]) => ({ order, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getGenusDistribution(): Promise<Array<{ genus: string; count: number }>> {
    const distribution = new Map<string, number>();
    
    this.observations.forEach(obs => {
      if (obs.genus) {
        distribution.set(obs.genus, (distribution.get(obs.genus) || 0) + 1);
      }
    });

    return Array.from(distribution.entries())
      .map(([genus, count]) => ({ genus, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getSeasonalPatterns(): Promise<Array<{ season: string; count: number; percentage: number }>> {
    const seasons = new Map<string, number>();
    let total = 0;

    this.observations.forEach(obs => {
      if (!obs.observedOn) return;
      const date = new Date(obs.observedOn);
      const month = date.getMonth() + 1;
      
      let season: string;
      if (month === 12 || month === 1 || month === 2) season = 'Winter';
      else if (month >= 3 && month <= 5) season = 'Spring';
      else if (month >= 6 && month <= 8) season = 'Summer';
      else season = 'Fall';
      
      seasons.set(season, (seasons.get(season) || 0) + 1);
      total++;
    });

    return Array.from(seasons.entries())
      .map(([season, count]) => ({
        season,
        count,
        percentage: Number(((count / total) * 100).toFixed(1))
      }))
      .sort((a, b) => b.count - a.count);
  }

  async getMonthlyStatistics(): Promise<Array<{ month: string; count: number; monthNumber: number }>> {
    const months = new Map<number, number>();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];

    this.observations.forEach(obs => {
      if (!obs.observedOn) return;
      const date = new Date(obs.observedOn);
      const monthNum = date.getMonth() + 1;
      months.set(monthNum, (months.get(monthNum) || 0) + 1);
    });

    return Array.from(months.entries())
      .map(([monthNumber, count]) => ({
        month: monthNames[monthNumber - 1],
        count,
        monthNumber
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
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
    // Memory storage implementation - apply filters and sort by newest first
    let filteredObs = this.observations.filter(obs => obs.species && obs.observedOn);

    // Apply state filter
    if (state) {
      filteredObs = filteredObs.filter(obs => obs.state === state);
    }

    // Apply date range filters
    if (startDate) {
      const start = new Date(startDate);
      filteredObs = filteredObs.filter(obs => new Date(obs.observedOn || '') >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      filteredObs = filteredObs.filter(obs => new Date(obs.observedOn || '') <= end);
    }

    // Apply species filter
    if (species) {
      filteredObs = filteredObs.filter(obs => obs.species?.toLowerCase().includes(species.toLowerCase()));
    }

    const sortedObs = filteredObs.sort((a, b) => {
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

    // Apply filters
    let filteredResult = result;

    if (stateFirstsOnly) {
      filteredResult = filteredResult.filter(record => record.isFirstInState);
    }

    if (globalFirstsOnly) {
      filteredResult = filteredResult.filter(record => record.isFirstGlobal);
    }

    // If recent is requested, show records that are either global firsts or state firsts, ordered by most recent date
    if (recent) {
      filteredResult = filteredResult
        .filter(record => record.isFirstGlobal || record.isFirstInState)
        .sort((a, b) => new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime());
    } else {
      // Default sort by most recent
      filteredResult = filteredResult.sort((a, b) => new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime());
    }

    return filteredResult.slice(offset, offset + limit);
  }

  async clearAllData(): Promise<void> {
    this.observations = [];
    this.uploads = [];
    this.contributors = [];
    this.species = [];
    this.users = [];
  }

  async getObservationSources(dateRange?: string): Promise<Array<{
    source: string;
    count: number;
    percentage: number;
  }>> {
    // Filter observations by date range if provided
    let filteredObs = this.observations;
    
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
      
      filteredObs = this.observations.filter(obs => 
        obs.observedOn && new Date(obs.observedOn) >= startDate
      );
    }

    // Count observations by source
    const sourceCounts = new Map<string, number>();
    const total = filteredObs.length;

    filteredObs.forEach(obs => {
      const source = obs.source || 'Unknown';
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    });

    // Convert to array with percentages
    return Array.from(sourceCounts.entries())
      .map(([source, count]) => ({
        source,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count);
  }

  async getSpeciesAccumulation(state?: string): Promise<Array<{
    observationNumber: number;
    uniqueSpeciesCount: number;
  }>> {
    let filteredObs = this.observations.filter(obs => obs.scientificName && obs.scientificName.trim() !== '');
    
    if (state && state !== 'all') {
      filteredObs = filteredObs.filter(obs => obs.state === state);
    }
    
    // Sort by observed date, then by id for consistent ordering
    filteredObs.sort((a, b) => {
      const dateCompare = new Date(a.observedOn).getTime() - new Date(b.observedOn).getTime();
      return dateCompare !== 0 ? dateCompare : a.id - b.id;
    });
    
    const result: Array<{ observationNumber: number; uniqueSpeciesCount: number }> = [];
    const seenSpecies = new Set<string>();
    
    filteredObs.forEach((obs, index) => {
      seenSpecies.add(obs.scientificName);
      result.push({
        observationNumber: index + 1,
        uniqueSpeciesCount: seenSpecies.size
      });
    });
    
    return result;
  }
}

// Use database storage instead of memory storage
import { DatabaseStorage } from "./db";
export const storage = new DatabaseStorage();