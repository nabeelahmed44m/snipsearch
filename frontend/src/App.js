import React from "react";
import { HashRouter as Router, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import UploadPage from "./UploadPage";
import SearchPage from "./SearchPage";
import './App.css';

function Topbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  return (
    <div className="topbar">
      <div className="topbar-logo">⚡</div>
      <span className="topbar-title">SnipSearch</span>
      <nav className="topbar-nav">
        <button
          className={`nav-btn ${path === "/" ? "active" : ""}`}
          onClick={() => navigate("/")}
        >Home</button>
        <button
          className={`nav-btn ${path === "/upload" ? "active" : ""}`}
          onClick={() => navigate("/upload")}
        >Upload</button>
        <button
          className={`nav-btn ${path === "/search" ? "active" : ""}`}
          onClick={() => navigate("/search")}
        >Search</button>
      </nav>
    </div>
  );
}

function Home() {
  const navigate = useNavigate();
  return (
    <div className="home-container">
      <div className="hero">
        <div className="hero-icon">🔮</div>
        <h1>SnipSearch</h1>
        <p>Store and semantically search your code snippets with AI-powered hybrid search.</p>
        <div className="hero-actions">
          <button className="hero-btn upload-btn" onClick={() => navigate("/upload")}>
            <span className="btn-icon">📤</span>
            <span className="btn-text">
              Upload Snippet
              <small>Paste and store code</small>
            </span>
          </button>
          <button className="hero-btn search-btn-home" onClick={() => navigate("/search")}>
            <span className="btn-icon">🔍</span>
            <span className="btn-text">
              Search Snippets
              <small>Semantic + keyword + fuzzy</small>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <div className="shell">
        <Topbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/search" element={<SearchPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
