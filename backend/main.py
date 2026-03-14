from fastapi import FastAPI, Depends
from pydantic import BaseModel
from fastembed import TextEmbedding
from sqlalchemy import create_engine, Column, Integer, Text, text
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from pgvector.sqlalchemy import Vector
from dotenv import load_dotenv
import os
from fastapi.middleware.cors import CORSMiddleware

# -----------------------
# App & Model Setup
# -----------------------

app = FastAPI()
model = TextEmbedding("sentence-transformers/all-MiniLM-L6-v2")

_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(dotenv_path=_env_path)
DATABASE_URL = os.getenv("NEON_DB_URL")
assert DATABASE_URL, f".env not found or NEON_DB_URL missing (looked in {_env_path})"

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,   # test connection before use → auto-reconnect on SSL drop
    pool_recycle=300,     # recycle connections every 5 min (before Neon closes them)
    pool_size=2,          # Neon serverless has low connection limits
    max_overflow=3,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------
# Database Model
# -----------------------

class Snippet(Base):
    __tablename__ = "snippets"

    id = Column(Integer, primary_key=True, index=True)
    snippet = Column(Text, nullable=False)
    embedding = Column(Vector(384))

Base.metadata.create_all(bind=engine)

# Ensure all required indexes exist (idempotent)
with engine.connect() as conn:
    # pg_trgm extension (for filename / partial-word / number matching)
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm;"))

    # GIN index for full-text search
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS snippets_fts_idx
        ON snippets USING gin(to_tsvector('english', snippet));
    """))

    # GIN trigram index for substring / filename matching
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS snippets_trgm_idx
        ON snippets USING gin(snippet gin_trgm_ops);
    """))
    conn.commit()

# -----------------------
# Dependency
# -----------------------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# -----------------------
# Schemas
# -----------------------

class SnippetUpload(BaseModel):
    snippet: str

class SnippetSearch(BaseModel):
    query: str
    top_k: int = 5
    threshold: float = 0.2   # applied to final COMBINED score
    # Weights — must sum to 1.0
    vector_weight: float = 0.5
    fts_weight: float = 0.3
    trgm_weight: float = 0.2

# -----------------------
# Routes
# -----------------------

@app.post("/upload")
def upload_snippet(data: SnippetUpload, db: Session = Depends(get_db)):
    embedding = list(model.embed([data.snippet]))[0].tolist()
    snippet = Snippet(snippet=data.snippet, embedding=embedding)
    db.add(snippet)
    db.commit()
    db.refresh(snippet)
    return {"success": True, "id": snippet.id, "message": "Snippet uploaded!"}


@app.post("/search")
def search_snippet(data: SnippetSearch, db: Session = Depends(get_db)):
    query_embedding = list(model.embed([data.query]))[0].tolist()

    # ── 1. Vector path (cosine, HNSW index — no full scan) ───────────────────
    vector_rows = (
        db.query(
            Snippet,
            Snippet.embedding.cosine_distance(query_embedding).label("distance")
        )
        .order_by(Snippet.embedding.cosine_distance(query_embedding))
        .limit(data.top_k)
        .all()
    )

    vector_hits: dict[int, dict] = {}
    for snippet, distance in vector_rows:
        vector_hits[snippet.id] = {
            "id": snippet.id,
            "snippet": snippet.snippet,
            "vector_score": round(1.0 - float(distance), 4),
        }

    # ── 2. Full-text search path (tsvector GIN index) ────────────────────────
    # Good for: whole words, stems (run/running/ran), stop-word filtering
    fts_rows = db.execute(
        text("""
            SELECT id, snippet,
                   ts_rank(to_tsvector('english', snippet),
                           plainto_tsquery('english', :q)) AS rank
            FROM snippets
            WHERE to_tsvector('english', snippet) @@ plainto_tsquery('english', :q)
            ORDER BY rank DESC
            LIMIT :k
        """),
        {"q": data.query, "k": data.top_k},
    ).fetchall()

    max_fts = max((r.rank for r in fts_rows), default=1.0) or 1.0
    fts_hits: dict[int, dict] = {}
    for row in fts_rows:
        fts_hits[row.id] = {
            "id": row.id,
            "snippet": row.snippet,
            "fts_score": round(float(row.rank) / max_fts, 4),
        }

    # ── 3. Trigram path (pg_trgm GIN index) ─────────────────────────────────
    # word_similarity(:q, snippet) → how well the query matches the CLOSEST
    # word/token inside the snippet (not the whole document).
    # This is what makes "logo512" find "logo512.png" inside a long JSON blob.
    # The <% operator uses the GIN index so it is NOT a full table scan.
    trgm_rows = db.execute(
        text("""
            SELECT id, snippet,
                   word_similarity(:q, snippet) AS trgm_score
            FROM snippets
            WHERE :q <% snippet
            ORDER BY trgm_score DESC
            LIMIT :k
        """),
        {"q": data.query, "k": data.top_k},
    ).fetchall()

    max_trgm = max((r.trgm_score for r in trgm_rows), default=1.0) or 1.0
    trgm_hits: dict[int, dict] = {}
    for row in trgm_rows:
        trgm_hits[row.id] = {
            "id": row.id,
            "snippet": row.snippet,
            "trgm_score": round(float(row.trgm_score) / max_trgm, 4),
        }

    # ── 4. Merge & rank ──────────────────────────────────────────────────────
    all_ids = set(vector_hits) | set(fts_hits) | set(trgm_hits)
    merged: dict[int, dict] = {}

    for sid in all_ids:
        v = vector_hits.get(sid, {}).get("vector_score", 0.0)
        f = fts_hits.get(sid,   {}).get("fts_score",    0.0)
        t = trgm_hits.get(sid,  {}).get("trgm_score",   0.0)

        combined = round(
            data.vector_weight * v +
            data.fts_weight    * f +
            data.trgm_weight   * t,
            4
        )

        # Gate 1: final combined score must be above threshold
        if combined < data.threshold:
            continue

        # Gate 2: at least ONE path must have a MEANINGFUL signal.
        # Prevents weak-but-non-zero scores from sneaking through.
        #   Vector needs ≥ 0.5  (strong semantic match)
        #   FTS needs   > 0     (any keyword match is meaningful)
        #   Trigram needs ≥ 0.3 (partial word/filename match, not noise)
        has_semantic = v >= 0.5
        has_keyword  = f > 0.0
        has_fuzzy    = t >= 0.3
        if not (has_semantic or has_keyword or has_fuzzy):
            continue

        snippet_text = (
            vector_hits.get(sid) or fts_hits.get(sid) or trgm_hits.get(sid)
        )["snippet"]

        merged[sid] = {
            "id": sid,
            "snippet": snippet_text,
            "score": combined,
            "vector_score": v,
            "fts_score": f,
            "trgm_score": t,
        }

    results = sorted(merged.values(), key=lambda x: x["score"], reverse=True)

    return {
        "query": data.query,
        "top_k": data.top_k,
        "threshold": data.threshold,
        "count": len(results),
        "results": results,
    }