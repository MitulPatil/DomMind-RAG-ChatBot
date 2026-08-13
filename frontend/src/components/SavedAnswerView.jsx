import { CitationsPanel } from "./CitationsPanel";

export function SavedAnswerView({ conversation, onNewQuestion }) {
  const question = conversation?.question || "";
  const answer = conversation?.answer || "";
  const createdAt = conversation?.createdAt || conversation?.created_at;
  let citations = conversation?.citations || [];

  if (typeof citations === "string") {
    try {
      citations = JSON.parse(citations);
    } catch {
      citations = [];
    }
  }

  return (
    <div className="saved-shell">
      <div className="saved-header">
        <button
          onClick={onNewQuestion}
          className="ghost-button saved-link"
          style={{ padding: "10px 14px", borderRadius: "14px", fontSize: "13px", fontWeight: "600" }}
        >
          New question
        </button>
      </div>

      <div className="question-panel">{question}</div>

      <div className="saved-panel">
        {answer || "No saved answer text was returned for this conversation."}
      </div>

      {citations.length > 0 && (
        <div style={{ marginTop: "18px" }}>
          <CitationsPanel citations={citations} />
        </div>
      )}

      <div className="saved-time">
        {createdAt ? `Asked ${new Date(createdAt).toLocaleString("en-IN")}` : "Saved conversation"}
      </div>
    </div>
  );
}
