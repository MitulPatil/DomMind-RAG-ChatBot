import { useEffect, useRef, useState } from "react";
import { authFetch } from "../api";

export function UploadWithProgress({ onDocumentReady }) {
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [documentId, setDocumentId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [filename, setFilename] = useState("");

  const pollIntervalRef = useRef(null);

  useEffect(() => {
    if (!documentId || status !== "processing") return;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await authFetch(`/rag/documents/${documentId}`);
        const data = await res.json();

        if (!data.success) return;

        const doc = data.document;
        setProgress(doc.progress);

        if (doc.status === "ready") {
          clearInterval(pollIntervalRef.current);
          setStatus("ready");
          setProgress(100);
          onDocumentReady?.(documentId, doc.filename);
        }

        if (doc.status === "failed") {
          clearInterval(pollIntervalRef.current);
          setStatus("failed");
          setErrorMessage(doc.errorMessage || "Indexing failed");
        }
      } catch (err) {
        console.error("Poll error:", err);
      }
    }, 2000);

    return () => clearInterval(pollIntervalRef.current);
  }, [documentId, status, onDocumentReady]);

  async function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setErrorMessage("Please select a PDF file");
      return;
    }

    setFilename(file.name);
    setStatus("uploading");
    setProgress(0);
    setErrorMessage("");

    const formData = new FormData();
    formData.append("pdf", file);

    try {
      const res = await authFetch("/rag/upload", {
        method: "POST",
        body: formData
      });

      const data = await res.json();

      if (!data.success) {
        setStatus("failed");
        setErrorMessage(data.error || "Upload failed");
        return;
      }

      if (data.alreadyIndexed) {
        setStatus("ready");
        setProgress(100);
        onDocumentReady?.(data.documentId, data.filename);
        return;
      }

      setDocumentId(data.documentId);
      setStatus("processing");
    } catch {
      setStatus("failed");
      setErrorMessage("Network error - please try again");
    }
  }

  return (
    <div className="upload-panel">
      <label className="upload-dropzone">
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          disabled={status === "uploading" || status === "processing"}
          style={{ display: "none" }}
        />
        <div className="upload-file-name">
          {status === "idle" ? "Choose a PDF to index" : filename}
        </div>
        <div className="upload-caption">
          Upload a document to start grounded chat and citation-based answers.
        </div>
      </label>

      {status === "uploading" && <div className="status-text">Uploading document...</div>}

      {status === "processing" && (
        <div className="progress-block">
          <div className="progress-meta">
            <span>Indexing PDF</span>
            <span>{progress}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-caption">
            This may take a minute for larger files.
          </div>
        </div>
      )}

      {status === "ready" && (
        <div className="inline-alert success">
          Document ready. You can now ask questions about it.
        </div>
      )}

      {status === "failed" && (
        <div className="inline-alert error">
          {errorMessage}
          <button
            onClick={() => setStatus("idle")}
            className="text-button"
            style={{ display: "block", marginTop: "6px", fontSize: "12px" }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
