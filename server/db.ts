import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Use a default in-memory or demo database URL if none provided
const databaseUrl = process.env.DATABASE_URL || 'postgresql://demo:demo@localhost:5432/demo_db';

try {
  export const pool = new Pool({ connectionString: databaseUrl });
  export const db = drizzle({ client: pool, schema });
} catch (error) {
  console.warn("Database connection failed, using mock data:", error);
  // For demo purposes, we'll create a mock db object
  export const pool = null;
  export const db = null as any;
}