import { useEffect, useState } from "react";
import { authFetch } from "../api";

export function DocumentList({ activeDocumentId, onSelectDocument, onDocumentDeleted }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch("/rag/documents")
      .then(r => r.json())
      .then(data => {
        if (data.success) setDocuments(data.documents);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(doc, e) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${doc.filename}"? This cannot be undone.`)) return;

    try {
      const res = await authFetch(`/rag/documents/${doc.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setDocuments(prev => prev.filter(d => d.id !== doc.id));
        onDocumentDeleted(doc.id);
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }

  if (loading) {
    return <div className="documents-loading">Loading documents...</div>;
  }

  if (documents.length === 0) {
    return <div className="documents-empty">No documents yet. Upload a PDF above.</div>;
  }

  return (
    <div>
      <div className="section-label">Documents</div>
      <div className="document-list">
        {documents.map(doc => {
          const isActive = doc.id === activeDocumentId;
          const rowClass = [
            "document-row",
            doc.status,
            doc.status === "ready" ? "ready" : "",
            isActive ? "active" : ""
          ].filter(Boolean).join(" ");

          return (
            <div
              key={doc.id}
              onClick={() => doc.status === "ready" && onSelectDocument(doc)}
              className={rowClass}
            >
              <span className={`document-status ${doc.status}`} />

              <div className="document-copy">
                <div className="document-name">{doc.filename}</div>
                <div className="document-meta">
                  {doc.status === "ready"
                    ? `${doc.chunk_count} chunks - ${doc.num_pages}p`
                    : doc.status === "processing"
                    ? "Processing..."
                    : "Failed"}
                </div>
              </div>

              {doc.status === "ready" && (
                <button
                  onClick={e => handleDelete(doc, e)}
                  className="icon-button"
                  style={{ fontSize: "18px", padding: "4px 6px", flexShrink: 0 }}
                  title="Delete document"
                >
                  x
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
