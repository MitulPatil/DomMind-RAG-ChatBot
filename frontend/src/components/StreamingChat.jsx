import { useCallback, useEffect, useRef, useState } from "react";
import { CitationsPanel } from "./CitationsPanel";
import { authFetch, authFetchStream } from "../api";

const TYPE_INTERVAL_MS = 20;

function splitDisplayTokens(text) {
  return text.match(/\s+|[^\s]+/gu) || [];
}

export function StreamingChat({ documentId, documentName, onConversationSaved }) {
  const [question, setQuestion] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState([]);
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const tokenQueueRef = useRef([]);
  const displayedAnswerRef = useRef("");
  const animationTimerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const mountedRef = useRef(false);
  const doneEventReceivedRef = useRef(false);
  const streamClosedRef = useRef(false);
  const completionHandledRef = useRef(false);
  const finalCitationsRef = useRef([]);
  const pendingQuestionRef = useRef("");
  const documentIdRef = useRef(documentId);
  const onConversationSavedRef = useRef(onConversationSaved);

  useEffect(() => {
    documentIdRef.current = documentId;
    onConversationSavedRef.current = onConversationSaved;
  }, [documentId, onConversationSaved]);

  const clearAnimationTimer = useCallback(() => {
    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current);
      animationTimerRef.current = null;
    }
  }, []);

  const resetStreamState = useCallback(() => {
    clearAnimationTimer();
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    tokenQueueRef.current = [];
    displayedAnswerRef.current = "";
    doneEventReceivedRef.current = false;
    streamClosedRef.current = false;
    completionHandledRef.current = false;
    finalCitationsRef.current = [];
    pendingQuestionRef.current = "";
    setCurrentQuestion("");
  }, [clearAnimationTimer]);

  const finishIfReady = useCallback(async () => {
    const hasPendingDisplayWork =
      tokenQueueRef.current.length > 0 || animationTimerRef.current;

    if (
      completionHandledRef.current ||
      !doneEventReceivedRef.current ||
      !streamClosedRef.current ||
      hasPendingDisplayWork
    ) {
      return;
    }

    completionHandledRef.current = true;
    if (!mountedRef.current) return;

    setStatus("complete");
    setCitations(finalCitationsRef.current);

    try {
      const histRes = await authFetch(`/rag/conversations/${documentIdRef.current}`);
      const histData = await histRes.json();

      if (
        mountedRef.current &&
        histData.success &&
        histData.conversations.length > 0
      ) {
        const latest = histData.conversations[histData.conversations.length - 1];
        onConversationSavedRef.current?.({
          id: latest.id,
          question: pendingQuestionRef.current,
          answer: displayedAnswerRef.current,
          citations: finalCitationsRef.current,
          createdAt: latest.createdAt
        });
      }
    } catch {
      // History refresh is best-effort; the streamed answer is already visible.
    }
  }, []);

  const startAnimationLoop = useCallback(() => {
    if (animationTimerRef.current) return;

    const tick = () => {
      if (!mountedRef.current) {
        clearAnimationTimer();
        return;
      }

      const nextToken = tokenQueueRef.current.shift();

      if (nextToken === undefined) {
        animationTimerRef.current = null;
        finishIfReady();
        return;
      }

      displayedAnswerRef.current += nextToken;
      setAnswer(displayedAnswerRef.current);
      animationTimerRef.current = setTimeout(tick, TYPE_INTERVAL_MS);
    };

    animationTimerRef.current = setTimeout(tick, TYPE_INTERVAL_MS);
  }, [clearAnimationTimer, finishIfReady]);

  const enqueueDisplayText = useCallback((text) => {
    if (!text) return;

    tokenQueueRef.current.push(...splitDisplayTokens(text));
    startAnimationLoop();
  }, [startAnimationLoop]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      resetStreamState();
    };
  }, [resetStreamState]);

  async function handleSubmit() {
    if (!question.trim() || status === "loading" || status === "streaming") return;

    resetStreamState();

    const q = question.trim();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    pendingQuestionRef.current = q;

    setQuestion("");
    setCurrentQuestion(q);
    setAnswer("");
    setCitations([]);
    setErrorMessage("");
    setStatus("loading");

    try {
      const response = await authFetchStream(
        "/rag/ask-stream",
        { documentId, question: q },
        { signal: controller.signal }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) throw new Error("Streaming response is not available");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          streamClosedRef.current = true;
          finishIfReady();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          if (!event.startsWith("data: ")) continue;

          let data;
          try {
            data = JSON.parse(event.slice(6));
          } catch {
            continue;
          }

          if (data.type === "token") {
            setStatus("streaming");
            enqueueDisplayText(data.text);
          } else if (data.type === "citations") {
            finalCitationsRef.current = data.citations || [];
          } else if (data.type === "done") {
            doneEventReceivedRef.current = true;
            finishIfReady();
          } else if (data.type === "error") {
            tokenQueueRef.current = [];
            clearAnimationTimer();
            setErrorMessage(data.message);
            setStatus("error");
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") return;

      tokenQueueRef.current = [];
      clearAnimationTimer();
      setErrorMessage(err.message || "Connection failed");
      setStatus("error");
    }
  }

  return (
  <div className="workspace-shell">
    <div className="workspace-header">
      <div className="workspace-label">Document workspace</div>

      <div className="workspace-title">
        {documentName}
      </div>

      <div className="workspace-subtitle">
        Ask focused questions and review grounded answers with source references.
      </div>
    </div>

    {/* Fixed composer area */}
    <div className="composer-panel">
      <div className="composer-row">
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e =>
            e.key === "Enter" &&
            !e.shiftKey &&
            handleSubmit()
          }
          placeholder="Ask a question about this document..."
          disabled={status === "loading" || status === "streaming"}
          className="field"
        />

        <button
          onClick={handleSubmit}
          disabled={
            !question.trim() ||
            status === "loading" ||
            status === "streaming"
          }
          className="primary-button composer-button"
        >
          {status === "loading" || status === "streaming"
            ? "Working..."
            : "Ask"}
        </button>
      </div>

      {status === "loading" && (
        <div className="chat-meta">
          Searching the indexed document...
        </div>
      )}

      {status === "error" && (
        <div
          className="inline-alert error"
          style={{ marginTop: "14px" }}
        >
          {errorMessage}
        </div>
      )}
    </div>

    {/* Only this area should scroll */}
    <div className="chat-scroll-area">
      <div className="chat-thread">
        {currentQuestion && (
          <div className="message-bubble user">
            {currentQuestion}
          </div>
        )}

        {(status === "streaming" || status === "complete") &&
          answer && (
            <div className="message-bubble assistant">
              {answer}

              {status === "streaming" && (
                <span className="message-cursor" />
              )}
            </div>
          )}

        {status === "complete" && citations.length > 0 && (
          <div className="citations-container">
            <CitationsPanel citations={citations} />
          </div>
        )}
      </div>
    </div>
  </div>
);
}
