# MacroFungi Database Application

## Overview
This is a comprehensive taxonomic observation database application focused on macrofungal species data management. The system provides functionality for uploading, processing, validating, and cross-referencing biological observation records from multiple scientific platforms. Key capabilities include automated taxonomic classification, data validation workflows, and comprehensive admin tools for managing large-scale biological datasets. The project aims to provide a robust platform for mycological data, offering advanced features for data integrity and scientific record preservation.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **UI Library**: Radix UI components with Tailwind CSS styling
- **State Management**: TanStack React Query
- **Build Tool**: Vite
- **Routing**: React Router

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js (REST API)
- **Database ORM**: Drizzle ORM
- **File Processing**: Multer, XLSX library
- **Session Management**: Express sessions with PostgreSQL store

### Data Storage Solutions
- **Primary Database**: PostgreSQL
- **File Storage**: Local filesystem for uploaded files and API responses
- **Schema Management**: Drizzle Kit

### Key Components & Features
- **Data Upload System**: Comprehensive spreadsheet upload with multi-phase processing, file validation, batch processing, and progress tracking.
- **Taxonomic Classification Engine**: Automated genus-based taxonomy completion using reference data, bulk processing, and validation flags.
- **External Platform Integration**: Synchronization and cross-validation with iNaturalist, Mushroom Observer, and MyCoPortal; automated genetic sequence analysis via BLAST.
- **Admin Validation Interface**: Multi-source data comparison, real-time sync status tracking, file management, and advanced search/filtering.
- **IPFS Integration**: Decentralized file storage using Helia client for validated observations, including automatic upload of scientific records (BLAST results, trace files, API responses) and permanent IPFS URLs.
- **BioRecords Management**: Metadata transparency, scientific name validation, and image generation for trading cards.
- **NFT Minting**: Functionality for minting NFTs from biorecords, including token tracking and metadata.
- **Specimen Shipment Tracking**: User-submitted shipments for DNA barcoding with bag/specimen tracking, iNaturalist/Mushroom Observer validation, slime mold detection (via iconic_taxon_name="Protozoa"), voucher number extraction from iNaturalist observation fields, and processing status pipeline (pending → submitted → received → processing → sequenced → complete).
- **Admin LIMS Panel**: Laboratory Information Management System for processing specimen shipments with:
  - **Pending Shipments**: Admin view of submitted shipments with user info, state, specimen counts, and action buttons (Mark Received, Sent to Indiana)
  - **Lab Runs**: Container for 20 sequencing plates per run with draft/in_progress/completed status
  - **Lab Plates**: 96-well plate editor (A01-H12) with platform selection (iNaturalist, MO, MyCoPortal), observation ID, lab code, and primer configuration
  - **Plate Validation**: Automated lookup against iNaturalist API to verify voucher numbers and flag mismatches
  - **Bioinformatics Management**: Track bioinformatics pipeline code/commands for each lab run with stages: Basecalling, QC Filtering, QC Reports, Demultiplexing, and Consensus Building

### Data Flow
- **Upload and Processing**: File upload, initial validation, background processing, batch insertion, post-processing (including contributor/species statistics), and automated classification updates.
- **External Synchronization**: Platform detection, API integration, data comparison, file management (e.g., molecular data), and status tracking.
- **Validation Workflow**: Multi-criteria filtering for validation queue, automated sync with external sources, data verification, file completion checks, and real-time status updates.

## External Dependencies

### Core Dependencies
- **Database**: PostgreSQL 16 (with Neon serverless connections)
- **File Processing**: XLSX library, CSV-parser
- **UI Components**: Radix UI
- **HTTP Client**: Native fetch API
- **Date Handling**: date-fns

### External APIs
- **iNaturalist API**: Observation data, taxonomic information.
- **Mushroom Observer API**: Species data.
- **MyCoPortal API**: DNA sequence and molecular data.
- **NCBI BLAST**: Genetic sequence analysis.

### Development Tools
- **TypeScript**: Type safety
- **ESBuild**: Production build optimization
- **Drizzle Kit**: Database schema management
- **TailwindCSS**: Styling framework