# SnipSearch ⚡🔍

SnipSearch is an AI-powered Chrome Extension for storing and retrieving code snippets. It goes far beyond standard substring matching by combining three powerful search methods into a single, unified hybrid search:

1. 🟣 **Semantic Search (pgvector):** Understands the *meaning* of your query. (e.g. searching "upload text" will find a Javascript `fetch()` snippet).
2. 🔵 **Keyword Search (PostgreSQL Full-Text Search):** Finds exact words with stemming support.
3. 🟠 **Fuzzy Search (pg_trgm):** Locates partial filenames, hyphens, and numbers that traditional tokenizers miss (e.g. searching "logo512" finds "logo512.png").

## 🏗️ Architecture

The project consists of two distinct parts:
* **`frontend/`**: The Chrome Extension UI built with React, styled with a premium dark-glassmorphism theme.
* **`backend/`**: A FastAPI Python service powered by `sentence-transformers` for embedding generation and a Neon Serverless PostgreSQL database for indexing.

---

## 🚀 Getting Started

### 1. Backend Setup

The backend handles the AI embeddings and database queries. It uses a hosted Neon PostgreSQL database with the `pgvector` and `pg_trgm` extensions enabled.

**Prerequisites:** Python 3.9+

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Set up your environment variables
# Create a .env file and add your Neon Database URL (must include pgvector support)
echo "NEON_DB_URL=postgresql://user:pass@host/dbname" > .env

# Run the backend server
python -m uvicorn main:app --reload
```
The server will start at `http://localhost:8000`. Database tables and indexes are created automatically on startup.

### 2. Frontend (Chrome Extension) Setup

The frontend is a React application configured to output a Chrome Extension Manifest V3 compatible build.

**Prerequisites:** Node.js v16+

```bash
cd frontend

# Install dependencies
npm install

# Build the extension
npm run build
```

**Loading into Chrome:**
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top right corner).
3. Click **Load unpacked**.
4. Select the `frontend/build` directory.

The SnipSearch extension icon (⚡) will now appear in your browser tray!

---

## ⚙️ How Hybrid Search Works

When you search for a snippet, the backend executes three parallel queries against the Neon database:
1. It calculates the **Cosine Similarity** of the `all-MiniLM-L6-v2` embedding against your query using a fast HNSW index.
2. It calculates the **ts_rank** of your query using PostgreSQL's native Full-Text Search.
3. It extracts the **word_similarity** of your query using trigram matching.

The results are normalised, weighted (Vector: 50%, Keyword: 30%, Fuzzy: 20%), merged, and filtered through strict confidence gates to eliminate noise.

## 🎨 UI Features
* **Live Configuration:** Adjust the `Top-K` limit and `Min Score` threshold directly from the extension UI.
* **Score Badges:** Every result shows a colour-coded total match percentage, alongside diagnostic sub-pills (Semantic, Keyword, Fuzzy) so you know exactly *why* a snippet was returned.
* **Premium Dark Mode:** Inter + JetBrains Mono fonts, animated background grids, and staggered glassmorphic result cards.
