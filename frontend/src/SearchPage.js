import React, { useState } from "react";

const scoreColour = (score) => {
  if (score >= 0.75) return "#22c55e";
  if (score >= 0.45) return "#f59e0b";
  return "#ef4444";
};

const SubPill = ({ label, value, colour }) => (
  <span className="sub-pill" style={{
    background: colour + "18",
    border: `1px solid ${colour}50`,
    color: colour,
  }}>
    {label} {(value * 100).toFixed(0)}%
  </span>
);

function SearchPage() {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(5);
  const [threshold, setThreshold] = useState(0.2);
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setMessage("");
    setResults([]);
    setMeta(null);
    if (!query.trim()) { setMessage("Please enter a search query."); return; }
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          top_k: Number(topK),
          threshold: Number(threshold),
        }),
      });
      const data = await res.json();
      setMeta({ top_k: data.top_k, threshold: data.threshold, count: data.count });
      if (data.results?.length > 0) {
        setResults(data.results);
      } else {
        setMessage("No results found. Try lowering Min Score or rephrasing.");
      }
    } catch (err) {
      setMessage("Search failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>Search Snippets</h2>
        <p>Semantic · Keyword · Fuzzy filename matching</p>
      </div>

      <input
        type="text"
        className="input-box"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        placeholder="Search by keyword, filename, or describe what you need…"
      />

      {/* Controls */}
      <div className="controls-row">
        <div className="control-group">
          <label>Top-K</label>
          <input
            className="control-input"
            type="number" min={1} max={50} value={topK}
            onChange={(e) => setTopK(e.target.value)}
          />
        </div>
        <div className="control-group">
          <label>Min Score</label>
          <input
            className="control-input"
            type="number" min={0} max={1} step={0.05} value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
        </div>
        <button className="search-btn" onClick={handleSearch} disabled={loading}>
          {loading ? <><span className="spinner" />Searching…</> : "🔍 Search"}
        </button>
      </div>

      {/* Meta row */}
      {meta && (
        <div className="meta-row">
          <span className="count">{meta.count}</span> result{meta.count !== 1 ? "s" : ""}
          <span className="meta-dot">·</span>
          top-{meta.top_k}
          <span className="meta-dot">·</span>
          threshold ≥ {meta.threshold}
        </div>
      )}

      {message && <div className="message">{message}</div>}

      {/* Results */}
      <div className="results-list">
        {results.map((r, i) => {
          const col = scoreColour(r.score);
          return (
            <div
              className="result-item"
              key={r.id}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="result-header">
                <div className="scores-row">
                  {/* Main badge */}
                  <span className="score-badge" style={{
                    background: col,
                    color: "#fff",
                    boxShadow: `0 0 10px ${col}55`,
                  }}>
                    {(r.score * 100).toFixed(1)}%
                  </span>
                  {/* Sub-score pills */}
                  {r.vector_score > 0 && <SubPill label="Semantic" value={r.vector_score} colour="#818cf8" />}
                  {r.fts_score > 0 && <SubPill label="Keyword" value={r.fts_score} colour="#38bdf8" />}
                  {r.trgm_score > 0 && <SubPill label="Fuzzy" value={r.trgm_score} colour="#fb923c" />}
                </div>
              </div>
              <pre className="snippet-text">{r.snippet}</pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SearchPage;
