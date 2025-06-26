# Latest AI trends through a healthcare example

A sophisticated AI-powered system designed to analyze healthcare documentation and assist with clinical assessments, specifically focused on OASIS (Outcome and Assessment Information Set) evaluations and nursing workflows.

## Overview

This project combines multiple AI models with advanced document processing capabilities to create an intelligent healthcare assistant that can:

- **Analyze patient documentation** using semantic search and vector embeddings
- **Perform OASIS assessments** with automated scoring and confidence evaluation  
- **Assist nursing staff** with patient information queries and clinical decision support
- **Process and chunk medical documents** with OCR capabilities
- **Evaluate AI responses** using multi-model grading systems

## Key Features

### 🏥 OASIS Assessment Workflow
- Automated analysis of bed-to-chair transfer assessments (GG0170K1)
- Evidence-based scoring with detailed explanations
- Multi-model evaluation using Claude for assessment and GPT for grading
- Confidence scoring and alternative consideration analysis

### 👩‍⚕️ Intelligent Nursing Agent
- Interactive AI assistant for nurses with access to patient documentation
- RAG (Retrieval-Augmented Generation) search through medical records
- Web search integration for current medical guidelines and best practices
- Multi-step reasoning with tool selection for comprehensive responses

### 📄 Advanced Document Processing
- OCR processing of medical documents and PDFs
- Intelligent text chunking for optimal context retrieval
- Vector embedding generation and storage
- Semantic similarity search across patient records

## Architecture

### Database Layer
- **PostgreSQL** with **pgvector** extension for vector storage and similarity search
- **Prisma ORM** for type-safe database operations
- Hierarchical document structure: `Document → DocumentPage → DocumentChunk`

### AI Model Layer
- **Vercel AI SDK** for unified model access and tool integration
- Registry-based model management supporting multiple providers
- Structured output generation with Zod schema validation

### Processing Pipeline
1. **Document Ingestion**: OCR and text extraction from medical documents
2. **Chunking**: Intelligent text segmentation for optimal retrieval
3. **Embedding**: Vector generation using OpenAI's embedding models  
4. **Storage**: Persistence with metadata and similarity indexing
5. **Retrieval**: Semantic search for relevant patient information
6. **Analysis**: AI-powered assessment and reasoning
7. **Evaluation**: Multi-model grading and quality assurance

## Technology Stack

### Core Dependencies
- **AI Models**: Anthropic Claude, OpenAI GPT, Google Gemini
- **Vector Database**: PostgreSQL with pgvector
- **ORM**: Prisma Client
- **AI Framework**: Vercel AI SDK
- **Evaluation**: Braintrust, autoevals
- **Document Processing**: pdf-lib for PDF manipulation
- **Schema Validation**: Zod for type safety

### Development Tools
- **TypeScript** for type-safe development
- **tsx** for TypeScript execution
- **Docker** for database containerization

## Getting Started

### Prerequisites
- Node.js and npm
- Docker for PostgreSQL with pgvector
- API keys for Anthropic, OpenAI, and Google AI services

### Database Setup
```bash
npm run db:start    # Start PostgreSQL with pgvector in Docker
npm run db:connect  # Connect to database for manual operations
```

### Available Scripts
- `scripts/createOcr.ts` - Process documents with OCR
- `scripts/createChunks.ts` - Generate text chunks from pages
- `scripts/createEmbeddings.ts` - Create vector embeddings
- `scripts/oasisWorkflow.ts` - Run OASIS assessment workflow
- `scripts/nursingAgent.ts` - Interactive nursing assistant
- `scripts/oasisWorkflow.eval.ts` - Evaluation and testing

This system represents a practical application of AI in healthcare, focusing on improving documentation accuracy, clinical decision support, and nursing workflow efficiency while maintaining high standards for patient care and safety.