import React, { useState } from "react";

function UploadPage() {
  const [snippet, setSnippet] = useState("");
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState(""); // "success" | "error" | ""
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    setMessage("");
    setMsgType("");
    if (!snippet.trim()) {
      setMessage("Please paste a snippet first.");
      setMsgType("error");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8000/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snippet }),
      });
      const result = await response.json();
      setMessage(result.message || "Snippet uploaded!");
      setMsgType("success");
      setSnippet("");
    } catch (error) {
      setMessage("Upload failed: " + error.message);
      setMsgType("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>Upload Snippet</h2>
        <p>Paste any code or text — it will be embedded and indexed instantly.</p>
      </div>

      <textarea
        className="input-box"
        value={snippet}
        onChange={(e) => setSnippet(e.target.value)}
        placeholder="// Paste your code snippet here…"
        rows={7}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleUpload();
        }}
      />
      <div className="char-counter">{snippet.length} chars</div>

      <button className="main-btn" onClick={handleUpload} disabled={loading}>
        {loading ? <><span className="spinner" />Uploading…</> : "⬆ Upload Snippet"}
      </button>

      {message && (
        <div className={`message ${msgType}`}>
          {msgType === "success" ? "✓ " : "✕ "}{message}
        </div>
      )}
    </div>
  );
}

export default UploadPage;
