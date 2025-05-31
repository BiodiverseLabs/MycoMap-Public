import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertObservationSchema, insertUploadSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import * as XLSX from 'xlsx';
import path from "path";
import fs from "fs";

const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Analytics endpoints
  app.get("/api/observations", async (req, res) => {
    try {
      const { startDate, endDate, state } = req.query;
      
      let observations;
      if (startDate && endDate) {
        observations = await storage.getObservationsByDateRange(
          startDate as string, 
          endDate as string
        );
      } else if (state) {
        observations = await storage.getObservationsByState(state as string);
      } else {
        observations = await storage.getAllObservations();
      }
      
      res.json(observations);
    } catch (error) {
      console.error("Error fetching observations:", error);
      res.status(500).json({ error: "Failed to fetch observations" });
    }
  });

  app.get("/api/metrics", async (req, res) => {
    try {
      const metrics = await storage.getObservationMetrics();
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching metrics:", error);
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  });

  app.get("/api/temporal-trends", async (req, res) => {
    try {
      const { groupBy = 'month' } = req.query;
      const trends = await storage.getTemporalTrends(groupBy as 'month' | 'quarter' | 'year');
      res.json(trends);
    } catch (error) {
      console.error("Error fetching temporal trends:", error);
      res.status(500).json({ error: "Failed to fetch temporal trends" });
    }
  });

  app.get("/api/taxonomic-distribution", async (req, res) => {
    try {
      const distribution = await storage.getTaxonomicDistribution();
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching taxonomic distribution:", error);
      res.status(500).json({ error: "Failed to fetch taxonomic distribution" });
    }
  });

  app.get("/api/contributors", async (req, res) => {
    try {
      const { limit = '10' } = req.query;
      const contributors = await storage.getTopContributors(parseInt(limit as string));
      res.json(contributors);
    } catch (error) {
      console.error("Error fetching contributors:", error);
      res.status(500).json({ error: "Failed to fetch contributors" });
    }
  });

  app.get("/api/species", async (req, res) => {
    try {
      const { limit = '10', type = 'top' } = req.query;
      
      let species;
      if (type === 'rare') {
        species = await storage.getRareSpecies(parseInt(limit as string));
      } else {
        species = await storage.getTopSpecies(parseInt(limit as string));
      }
      
      res.json(species);
    } catch (error) {
      console.error("Error fetching species:", error);
      res.status(500).json({ error: "Failed to fetch species" });
    }
  });

  app.get("/api/state-records", async (req, res) => {
    try {
      const { limit = '10' } = req.query;
      const records = await storage.getRecentStateRecords(parseInt(limit as string));
      res.json(records);
    } catch (error) {
      console.error("Error fetching state records:", error);
      res.status(500).json({ error: "Failed to fetch state records" });
    }
  });

  // Upload endpoints
  app.get("/api/uploads", async (req, res) => {
    try {
      const uploads = await storage.getUploads();
      res.json(uploads);
    } catch (error) {
      console.error("Error fetching uploads:", error);
      res.status(500).json({ error: "Failed to fetch uploads" });
    }
  });

  app.post("/api/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { originalname, filename, path: filePath } = req.file;

      // Create upload record
      const uploadRecord = await storage.createUpload({
        filename,
        originalName: originalname,
        recordCount: 0,
        status: 'processing'
      });

      // Process Excel file asynchronously
      processExcelFile(uploadRecord.id, filePath, originalname)
        .catch(error => {
          console.error("Error processing file:", error);
          storage.updateUploadStatus(uploadRecord.id, 'failed', error.message);
        });

      res.json({ 
        message: "File uploaded successfully and is being processed",
        uploadId: uploadRecord.id 
      });

    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  async function processExcelFile(uploadId: number, filePath: string, originalName: string) {
    try {
      console.log('Processing Excel file:', filePath);
      console.log('File exists:', fs.existsSync(filePath));
      
      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      console.log('Workbook loaded, sheet names:', workbook.SheetNames);
      const sheetName = workbook.SheetNames.find(name => 
        name.toLowerCase().includes('validated') || 
        name.toLowerCase().includes('observation')
      ) || workbook.SheetNames[0];
      
      const worksheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(worksheet);

      // Transform and validate data
      const observations = rawData.map((row: any) => {
        return {
          observationId: row['Observation ID'] || row['observation_id'] || `${Date.now()}-${Math.random()}`,
          scientificName: row['Scientific Name'] || row['scientific_name'] || '',
          commonName: row['Common Name'] || row['common_name'] || null,
          phylum: row['Phylum'] || row['phylum'] || null,
          class: row['Class'] || row['class'] || null,
          order: row['Order'] || row['order'] || null,
          family: row['Family'] || row['family'] || null,
          genus: row['Genus'] || row['genus'] || null,
          species: row['Species'] || row['species'] || null,
          infraspecies: row['Infraspecies'] || row['infraspecies'] || null,
          observer: row['Observer'] || row['observer'] || null,
          collector: row['Collector'] || row['collector'] || null,
          observedOn: row['Observed On'] || row['observed_on'] || null,
          latitude: row['Latitude'] || row['latitude'] || null,
          longitude: row['Longitude'] || row['longitude'] || null,
          placeGuess: row['Place Guess'] || row['place_guess'] || null,
          state: row['State'] || row['state'] || null,
          country: row['Country'] || row['country'] || null,
          genbankAccession: row['GenBank Accession'] || row['genbank_accession'] || null,
          isFirstStateRecord: Boolean(row['First State Record'] || row['is_first_state_record']),
          hasMultipleGenotypes: Boolean(row['Multiple Genotypes'] || row['has_multiple_genotypes']),
          source: row['Source'] || row['source'] || 'Unknown',
          sourceUrl: row['Source URL'] || row['source_url'] || null,
        };
      }).filter(obs => obs.scientificName); // Filter out rows without scientific name

      // Insert observations in batches
      const batchSize = 100;
      let insertedCount = 0;
      
      for (let i = 0; i < observations.length; i += batchSize) {
        const batch = observations.slice(i, i + batchSize);
        await storage.createObservations(batch);
        insertedCount += batch.length;
      }

      // Update contributor and species statistics
      await updateStatistics();

      // Update upload status
      await storage.updateUploadStatus(uploadId, 'completed');

      // Clean up uploaded file
      fs.unlinkSync(filePath);

    } catch (error) {
      console.error("Error processing Excel file:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await storage.updateUploadStatus(uploadId, 'failed', errorMessage);
      
      // Clean up uploaded file
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkError) {
        console.error("Error deleting file:", unlinkError);
      }
    }
  }

  async function updateStatistics() {
    // This would update contributor and species statistics
    // Implementation would aggregate data from observations table
    // For now, we'll skip this to keep the example focused
  }

  const httpServer = createServer(app);
  return httpServer;
}
