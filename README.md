# DocMind

> AI-powered PDF question answering with multi-user support, streaming responses, and cited sources.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20App-blue?style=flat-square)](https://your-frontend.vercel.app)
[![Backend](https://img.shields.io/badge/Backend-Railway-purple?style=flat-square)](https://your-backend.up.railway.app/health)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

**[→ Try the live demo](https://your-frontend.vercel.app)**

Upload any PDF. Ask questions about it in plain English. Get answers with exact page citations — streamed token by token.

---

## Demo

![DocMind Demo](./assests/Rag-pipline.png)

*Upload a PDF → Ask questions → Get streamed answers with page citations*

**[Watch the 3-minute demo video →](https://your-video-link)**

---

## What makes this different

Most RAG tutorials build single-user, no-auth systems with basic vector search. DocMind implements what production RAG actually requires:

- **Hybrid search** — semantic vector search + PostgreSQL full-text search combined with Reciprocal Rank Fusion, handling both conceptual questions and exact-term queries
- **Relevance gating** — chunks below a similarity threshold never reach the LLM, preventing hallucination from irrelevant context
- **Database-level isolation** — PostgreSQL Row Level Security enforces user data separation at the database engine level, not just the application layer
- **Prompt injection defence** — retrieved document content is explicitly labelled as untrusted in the system prompt, preventing malicious PDFs from hijacking model behaviour
- **Streaming with citations** — answers appear token-by-token via SSE; citations appear as a separate event after the stream completes

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                           │
│   Login/Register → Document List → Upload → Chat Interface      │
│   Streaming consumer (SSE) | Citation panel | History sidebar   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS + JWT
┌──────────────────────────▼──────────────────────────────────────┐
│                     Express.js API                              │
│                                                                 │
│  POST /auth/register   POST /auth/login    GET /auth/me         │
│  POST /upload          GET  /documents     DELETE /documents    │
│  POST /ask-stream      GET  /conversations GET /usage           │
│                                                                 │
│  Middleware: verifyToken → setRlsContext → route handler        │
└────────────┬────────────────────┬───────────────────────────────┘
             │                    │
┌────────────▼──────────┐  ┌─────▼──────────────────────────────┐
│   Gemini API          │  │   PostgreSQL + pgvector             │
│                       │  │                                     │
│  gemini-embedding-001 │  │  users          (JWT auth)          │
│  → 3072-dim vectors   │  │  documents      (status tracking)   │
│                       │  │  chunks         (vector(3072))      │
│ gemini-3.1-flash-lite │  │  conversations  (history per doc)   │
│ -preview              |  |  api_usage_logs (cost tracking)    |
| → streamed answers    │  |                                     │ 
│                       │  │                                     │
│  (cost tracked per    │  │  RLS policies enforce user          │
│   call to Postgres)   │  │  isolation at the DB level          │
└───────────────────────┘  └─────────────────────────────────────┘
```

### Retrieval Pipeline

```
User question
     │
     ▼
generateEmbedding()          plainto_tsquery()
     │                              │
     ▼                              ▼
semanticSearch()            keywordSearch()
(pgvector cosine sim)       (PostgreSQL FTS)
     │                              │
     └──────────┬───────────────────┘
                │
                ▼
    Reciprocal Rank Fusion (K=60)
                │
                ▼
    applyRelevanceGate()
    (ABSOLUTE_MINIMUM=0.55, RELATIVE=0.85)
                │
                ▼
    mergeAdjacentChunks()
                │
                ▼
    buildSecurePrompt()
    (injection defence)
                │
                ▼
    generateContentStream()
    (SSE token-by-token)
                │
                ▼
    citations event → done event
                │
                ▼
    INSERT conversations + api_usage_logs
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite |
| Backend | Node.js, Express.js |
| Database | PostgreSQL 18 + pgvector 0.8.3 |
| AI / Embeddings | Google Gemini API (gemini-embedding-001, gemini-1.5-flash) |
| Auth | JWT (jsonwebtoken + bcrypt) |
| File Upload | Multer |
| PDF Parsing | pdf-parse v2.4.5 |
| Deployment | Railway (backend + DB), Vercel (frontend) |
| Security | Row Level Security (PostgreSQL), Prompt injection defence |

---

## Features

- **Multi-user auth** — JWT-based registration and login
- **PDF upload** — async indexing with real-time progress bar
- **Hybrid semantic + keyword search** — Reciprocal Rank Fusion
- **Streaming answers** — token-by-token via Server-Sent Events
- **Page citations** — answers reference exact page numbers from the source PDF
- **Conversation history** — persistent per-document Q&A threads
- **Data isolation** — PostgreSQL RLS + application-layer user_id filtering
- **Prompt injection defence** — document content labelled as untrusted
- **Cost tracking** — every Gemini API call logged with token counts
- **Usage dashboard** — per-user token consumption and estimated cost

---

## Running Locally

### Prerequisites

- Node.js 18+
- PostgreSQL 18 with pgvector extension installed
- Google Gemini API key ([get one here](https://aistudio.google.com/))

### Backend Setup

```bash
git clone https://github.com/YOUR_USERNAME/docmind.git
cd docmind/backend
npm install
```

Create `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key
JWT_SECRET=any_long_random_string_here
PsqlPass=your_postgres_password
DB_APP_PASSWORD=docmind_app_password
```

Create the database and run the schema:

```bash
# In psql as postgres superuser
CREATE DATABASE semantic_search_db;
\c semantic_search_db
```

```bash
# In your terminal
psql -U postgres -d semantic_search_db -f schema-v3.sql
```

Start the backend:

```bash
npm start
# Server running at http://localhost:3000
# Verify: GET http://localhost:3000/health
```

### Frontend Setup

```bash
cd ../frontend
npm install
```

Create `.env.local`:

```env
VITE_API_URL=http://localhost:3000
```

Start the frontend:

```bash
npm run dev
# App running at http://localhost:5173
```

---

## Environment Variables

### Backend (Railway)

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key |
| `JWT_SECRET` | Secret for signing JWT tokens (use a long random string) |
| `DATABASE_URL` | Injected automatically by Railway when you add PostgreSQL |
| `NODE_ENV` | Set to `production` |

### Frontend (Vercel)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Your Railway backend URL (e.g. `https://docmind.up.railway.app`) |

---

## API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | None | Create account |
| POST | `/auth/login` | None | Login, receive JWT |
| GET | `/auth/me` | JWT | Get current user |
| POST | `/upload` | JWT | Upload and index a PDF |
| GET | `/documents` | JWT | List user's documents |
| GET | `/documents/:id` | JWT | Get document + indexing progress |
| DELETE | `/documents/:id` | JWT | Delete document and all chunks |
| POST | `/ask-stream` | JWT | Ask question, SSE stream response |
| POST | `/ask` | JWT | Ask question, JSON response |
| GET | `/conversations/:docId` | JWT | Get conversation history for document |
| DELETE | `/conversations/:docId/:id` | JWT | Delete a conversation entry |
| GET | `/usage` | JWT | Get API usage summary |
| GET | `/health` | None | Health check |

---

## Security Architecture

**Three layers of data isolation:**

1. **JWT middleware** — every request must carry a valid signed token
2. **Application-layer filtering** — every SQL query includes `WHERE user_id = $1`
3. **PostgreSQL RLS** — policies enforce isolation at the database engine level; even a query that forgets the WHERE clause returns no rows for the wrong user

**Prompt injection defence:**

Retrieved document content is explicitly labelled as `UNTRUSTED USER-UPLOADED CONTENT` in the system prompt. The model is instructed to treat it as data to summarise rather than instructions to follow, and to report rather than obey any injection attempts found in document content.

---

## How It Works

1. **Upload**: PDF extracted page-by-page → chunked (150 words, 30 overlap) → garbage chunks filtered → embedded in batches → stored in pgvector with page metadata
2. **Question**: Embedded → hybrid search (pgvector + PostgreSQL FTS) → RRF fusion → relevance gate → adjacent chunk merging → injected into secured prompt
3. **Answer**: Streamed token-by-token via SSE → citations extracted after stream → saved to conversation history → token usage logged

---

## Author

**[Your Name]**

- Portfolio: [your-portfolio.com]
- LinkedIn: [linkedin.com/in/your-profile]
- GitHub: [@your-username](https://github.com/your-username)

---

*Built as part of a structured 5-month full-stack development plan. [Read about the project journey →](your-blog-or-notion-link)*