// App.jsx
// Global state owner — manages auth state, the active document,
// and the current conversation being viewed.

import { useEffect, useRef, useState, useCallback } from "react";
import { DocumentList } from "./components/DocumentList";
import { UploadWithProgress } from "./components/UploadWithProgress";
import { ConversationHistory } from "./components/ConversationHistory";
import { StreamingChat } from "./components/StreamingChat";
import { SavedAnswerView } from "./components/SavedAnswerView";
import { LoginPage } from "./components/LoginPage";
import { UsageDashboard } from "./components/usageDashboard";
import { clearToken, getSavedUser } from "./api";
import "./App.css";

export default function App() {

  const [user, setUser] = useState(() => getSavedUser());

  function handleLogin(userData) {
    setUser(userData);
  }

  function handleLogout() {
    clearToken();
    setUser(null);
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <AuthenticatedWorkspace user={user} onLogout={handleLogout} />;
}

function AuthenticatedWorkspace({ user, onLogout }) {
  const mainContentRef = useRef(null);

  // Which document the user is currently working with
  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const [activeDocumentName, setActiveDocumentName] = useState("");

  // Which view is showing in the main area
  // "new" = streaming chat (new question)
  // "saved" = viewing a previous answer
  const [mainView, setMainView] = useState("new");

  // The conversation being viewed in "saved" mode
  const [viewingConversation, setViewingConversation] = useState(null);

  // Controls whether ConversationHistory refetches its list
  // Incrementing this causes the history sidebar to reload
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Controls whether DocumentList refetches its list
  const [docListRefreshKey, setDocListRefreshKey] = useState(0);

  // Controls whether StreamingChat resets its internal input/answer state
  const [chatResetKey, setChatResetKey] = useState(0);

  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTop = 0;
    }
  }, [activeDocumentId, mainView, viewingConversation?.id, chatResetKey]);

  // Called when a document finishes indexing (from UploadWithProgress)
  const handleDocumentReady = useCallback((documentId, filename) => {
    setDocListRefreshKey(prev => prev + 1); // refresh document list
    setActiveDocumentId(documentId);
    setActiveDocumentName(filename);
    setMainView("new");
    setViewingConversation(null);
    setChatResetKey(prev => prev + 1);
  }, []);

  // Called when user selects a document from the list
  const handleSelectDocument = useCallback((doc) => {
    setActiveDocumentId(doc.id);
    setActiveDocumentName(doc.filename);
    setMainView("new");
    setViewingConversation(null);
    setChatResetKey(prev => prev + 1);
    // Reset to new question mode when switching documents
  }, []);

  // Called when a new streaming Q&A completes and is saved
  const handleConversationSaved = useCallback((conversation) => {
    setHistoryRefreshKey(prev => prev + 1); // refresh history sidebar
    setViewingConversation(conversation);
    setMainView("saved");
    // Switch to saved view to show the completed answer with citations
  }, []);

  // Called when user clicks a previous question in the sidebar
  const handleSelectConversation = useCallback((conversation) => {
    setViewingConversation(conversation);
    setMainView("saved");
  }, []);

  const handleConversationDeleted = useCallback((conversationId) => {
    if (viewingConversation?.id === conversationId) {
      setViewingConversation(null);
      setMainView("new");
      setChatResetKey(prev => prev + 1);
    }
  }, [viewingConversation]);

  // Called when user clicks "New Question" button
  const handleNewQuestion = useCallback(() => {
    setMainView("new");
    setViewingConversation(null);
    setChatResetKey(prev => prev + 1);
  }, []);

  const handleShowUsage = useCallback(() => {
    setMainView("usage");
    setViewingConversation(null);
  }, []);

  // Called when a document is deleted
  const handleDocumentDeleted = useCallback((deletedId) => {
    setDocListRefreshKey(prev => prev + 1);
    if (activeDocumentId === deletedId) {
      // User deleted the active document — reset everything
      setActiveDocumentId(null);
      setActiveDocumentName("");
      setMainView("new");
      setViewingConversation(null);
      setChatResetKey(prev => prev + 1);
    }
  }, [activeDocumentId]);

  return (
    <div className="app-layout">

      <div className="user-bar">
        <span className="user-email">{user.email}</span>
        <button
          onClick={onLogout}
          className="danger-button"
          style={{ padding: "8px 12px", borderRadius: "12px", fontSize: "13px", fontWeight: "600" }}
        >
          Sign out
        </button>
      </div>

      {/* Left sidebar — document list + upload */}
      <aside className="sidebar-left">
        <div className="sidebar-header">
          <h1 className="app-title">DocMind</h1>
          <p className="app-subtitle">Ask questions about your PDFs</p>
          <button
            onClick={handleShowUsage}
            className="sidebar-action"
          >
            Usage
          </button>
        </div>

        <UploadWithProgress
          onDocumentReady={handleDocumentReady}
        />

        <DocumentList
          key={docListRefreshKey}
          activeDocumentId={activeDocumentId}
          onSelectDocument={handleSelectDocument}
          onDocumentDeleted={handleDocumentDeleted}
        />
      </aside>

      {/* Main content area */}
      <main className="main-content" ref={mainContentRef}>
        {mainView === "usage" ? (
          <UsageDashboard />
        ) : !activeDocumentId ? (
          <div className="welcome-state">
            <div className="welcome-panel">
              <span className="eyebrow">Private document intelligence</span>
              <h2>Ask better questions against the PDFs that matter.</h2>
              <p>
                Upload a document, wait for indexing to finish, and work through
                answers with grounded citations and conversation history in one place.
              </p>
              <div className="welcome-points">
                <div className="welcome-point">
                  <strong>Warm, focused workspace</strong>
                  Select a ready document on the left and keep related chat history close at hand.
                </div>
                <div className="welcome-point">
                  <strong>Readable answers</strong>
                  Responses stay centered in the workspace with citations separated for easy review.
                </div>
                <div className="welcome-point">
                  <strong>Usage visibility</strong>
                  Open the usage view from the sidebar whenever you need API activity details.
                </div>
              </div>
            </div>
          </div>
        ) : mainView === "saved" && viewingConversation ? (
          <SavedAnswerView
            conversation={viewingConversation}
            onNewQuestion={handleNewQuestion}
          />
        ) : (
          <StreamingChat
            key={`${activeDocumentId}-${chatResetKey}`}
            documentId={activeDocumentId}
            documentName={activeDocumentName}
            onConversationSaved={handleConversationSaved}
          />
        )}
      </main>

      {/* Right sidebar — conversation history */}
      <aside className="sidebar-right">
        {mainView === "usage" ? (
          <div className="empty-sidebar">
            Usage summary is shown in the main panel
          </div>
        ) : activeDocumentId ? (
          <ConversationHistory
            key={`${activeDocumentId}-${historyRefreshKey}`}
            // key includes historyRefreshKey so it refetches after new conversation
            documentId={activeDocumentId}
            onSelectConversation={handleSelectConversation}
            onNewQuestion={handleNewQuestion}
            onConversationDeleted={handleConversationDeleted}
            activeConversationId={viewingConversation?.id}
          />
        ) : (
          <div className="empty-sidebar">
            Upload or select a document to see conversation history
          </div>
        )}
      </aside>
    </div>
  );
}
