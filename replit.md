# MacroFungi Database Application

## Overview

This is a comprehensive taxonomic observation database application focused on macrofungal species data management. The system provides functionality for uploading, processing, validating, and cross-referencing biological observation records from multiple scientific platforms including iNaturalist, Mushroom Observer, and MyCoPortal. The application features automated taxonomic classification, data validation workflows, and comprehensive admin tools for managing large-scale biological datasets.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **UI Library**: Radix UI components with Tailwind CSS styling
- **State Management**: TanStack React Query for server state management
- **Build Tool**: Vite for development and production builds
- **Routing**: React Router for client-side navigation

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for REST API endpoints
- **Database ORM**: Drizzle ORM for type-safe database operations
- **File Processing**: Multer for file uploads, XLSX library for Excel processing
- **Session Management**: Express sessions with PostgreSQL store

### Data Storage Solutions
- **Primary Database**: PostgreSQL for structured taxonomic data
- **File Storage**: Local filesystem for uploaded Excel files and downloaded API responses
- **Schema Management**: Drizzle Kit for database migrations and schema updates

## Key Components

### Data Upload System
- **Excel Processing Pipeline**: Comprehensive spreadsheet upload functionality with multi-phase processing
- **File Validation**: Format validation (Excel only), size limits (50MB), and structure verification
- **Batch Processing**: Optimized batch insertion with configurable chunk sizes (1000 records default)
- **Progress Tracking**: Real-time upload status monitoring with detailed progress reporting

### Taxonomic Classification Engine
- **Automated Classification**: Genus-based taxonomy completion using reference data lookups
- **Bulk Processing**: SQL-optimized batch updates for large datasets
- **Validation Flags**: Classification update tracking and completion status monitoring
- **Reference Data**: Comprehensive genus-to-taxonomy mapping from complete records

### External Platform Integration
- **iNaturalist API**: Observation data synchronization and cross-validation
- **Mushroom Observer API**: Species data retrieval and comparison
- **MyCoPortal Integration**: DNA sequence and molecular data management
- **BLAST Search Integration**: Automated genetic sequence analysis and file management

### Admin Validation Interface
- **Cross-Platform Validation**: Multi-source data comparison and verification
- **Synchronization Monitoring**: Real-time sync status tracking across platforms
- **File Management**: API response, BLAST result, and sequence trace file tracking
- **Search and Filtering**: Advanced filtering by source, sync status, and validation completeness

## Data Flow

### Upload and Processing Flow
1. **File Upload**: Excel files uploaded via drag-and-drop interface
2. **Initial Validation**: File format and size validation
3. **Background Processing**: Asynchronous Excel parsing and data extraction
4. **Batch Insertion**: Optimized database insertion in configurable chunks
5. **Post-Processing**: Four-phase optimization including contributor/species statistics updates
6. **Classification Updates**: Automated taxonomy completion using reference data

### External Synchronization Flow
1. **Platform Detection**: Source platform identification from observation data
2. **API Integration**: Automated data retrieval from external platforms
3. **Data Comparison**: Cross-platform validation and discrepancy detection
4. **File Management**: Download and storage of associated molecular data files
5. **Status Tracking**: Comprehensive sync status and error reporting

### Validation Workflow
1. **Record Filtering**: Multi-criteria filtering for validation queue management
2. **Platform Synchronization**: Automated sync with external data sources
3. **Data Verification**: Cross-platform comparison and validation
4. **File Completion**: BLAST results and sequence file download verification
5. **Status Updates**: Real-time validation progress and completion tracking

## External Dependencies

### Core Dependencies
- **Database**: PostgreSQL 16 with Neon serverless connections
- **File Processing**: XLSX library for Excel parsing, CSV-parser for alternative formats
- **UI Components**: Comprehensive Radix UI component library
- **HTTP Client**: Native fetch API for external platform integrations
- **Date Handling**: date-fns library for temporal data processing

### External APIs
- **iNaturalist API**: Observation data retrieval and validation
- **Mushroom Observer API**: Species information and cross-referencing
- **MyCoPortal API**: DNA sequence and molecular data access
- **NCBI BLAST**: Genetic sequence analysis and comparison

### Development Tools
- **TypeScript**: Full type safety across frontend and backend
- **ESBuild**: Production build optimization
- **Drizzle Kit**: Database schema management and migrations
- **TailwindCSS**: Utility-first styling framework

## Deployment Strategy

### Development Environment
- **Local Development**: Node.js 20 with PostgreSQL 16
- **Hot Reload**: Vite dev server with automatic TypeScript compilation
- **Database**: Local PostgreSQL instance with environment-based configuration

### Production Deployment
- **Platform**: Replit autoscale deployment target
- **Build Process**: Vite frontend build + ESBuild backend bundling
- **Database**: Neon serverless PostgreSQL with connection pooling
- **File Storage**: Persistent file system for uploads and downloaded data

### Configuration Management
- **Environment Variables**: DATABASE_URL and NODE_ENV configuration
- **Database Migrations**: Automated schema updates via Drizzle Kit
- **Static Assets**: Vite-optimized frontend assets with proper caching

## Recent Changes

- June 16, 2025: Fixed iNaturalist scientific name validation bug
  - Updated validation queries to prioritize scientific names over common names
  - Fixed issue where "Bitter Bracket" was showing instead of "Amaropostia stiptica"
  - Scientific name now extracted from taxon data with priority: provisional species name → taxon scientific name → preferred common name → species guess
  - Validation interface now displays proper taxonomic identifications for accurate cross-platform comparison

- June 16, 2025: BioRecord Images trading card generator implemented
  - Created new "BioRecord Images" tab in admin interface
  - Built three vintage-style trading card designs based on user-provided templates
  - Implemented canvas-based card generation with downloadable PNG output
  - Added platform-specific data fetching for iNaturalist, Mushroom Observer, and MyCoPortal
  - Designed cards feature specimen photos, scientific names, location data, and platform IDs
  - Cards use vintage trading card aesthetics with multiple border styles and classic typography

- June 16, 2025: Complete NFT minting functionality implemented
  - Added database operations for NFT token tracking and metadata
  - Created API endpoints for minting NFTs from biorecords
  - Implemented "BioRecord Minted" status badge in validation interface
  - Restored missing biorecords from fully validated observations
  - Added mock minting capability for demonstration purposes

## Changelog

- June 16, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.