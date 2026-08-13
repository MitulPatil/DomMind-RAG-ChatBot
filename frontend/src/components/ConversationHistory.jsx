import { useEffect, useState } from "react";
import { authFetch } from "../api";

export function ConversationHistory({
  documentId,
  onSelectConversation,
  onNewQuestion,
  activeConversationId,
  onConversationDeleted
}) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(Boolean(documentId));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!documentId) return;

    authFetch(`/rag/conversations/${documentId}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        return data;
      })
      .then(data => {
        if (data.success) {
          const history = data.conversations || data.conversation || [];
          setConversations([...history].reverse());
        } else {
          setError(data.error || "Failed to load history");
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [documentId]);

  async function handleDelete(conversationId, event) {
    event.stopPropagation();

    try {
      const res = await authFetch(
        `/rag/conversations/${documentId}/${conversationId}`,
        { method: "DELETE" }
      );
      const data = await res.json();

      if (data.success) {
        setConversations(prev => prev.filter(c => c.id !== conversationId));
        onConversationDeleted?.(conversationId);
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }

  if (loading) {
    return <div className="table-loading">Loading history...</div>;
  }

  if (error) {
    return <div className="page-error">Failed to load history</div>;
  }

  return (
    <div className="conversation-panel">
      <div className="conversation-header">
        <button
          onClick={onNewQuestion}
          className="primary-button new-question-button"
          style={{ width: "100%" }}
        >
          New Question
        </button>
        <div className="section-label" style={{ padding: "14px 0 0" }}>
          Previous Questions
        </div>
      </div>

      {conversations.length === 0 ? (
        <div className="empty-sidebar">No questions yet. Ask something about this document.</div>
      ) : (
        <div className="conversation-list">
          {conversations.map(conv => (
            <div
              key={conv.id}
              onClick={() => onSelectConversation(conv)}
              className={`conversation-row ${String(conv.id) === String(activeConversationId) ? "active" : ""}`}
            >
              <div className="conversation-title">{conv.question}</div>

              <div className="conversation-date">
                {new Date(conv.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </div>

              <button
                onClick={e => handleDelete(conv.id, e)}
                className="icon-button conversation-delete"
                style={{ fontSize: "16px", padding: "4px" }}
                title="Delete this question"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
