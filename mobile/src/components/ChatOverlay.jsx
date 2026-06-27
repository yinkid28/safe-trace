import { useState, useRef, useEffect } from "react";
import "./ChatOverlay.css";

export default function ChatOverlay({
  messages,
  loading,
  error,
  askQuestion,
  clearChat,
  enabled,
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, open]);

  if (!enabled) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    askQuestion(q);
  };

  return (
    <>
      {/* Floating Action Button */}
      {!open && (
        <button
          className="chat-fab"
          onClick={() => setOpen(true)}
          aria-label="Open chat"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </button>
      )}

      {/* Chat Overlay */}
      {open && (
        <div className="chat-overlay">
          {/* Header */}
          <div className="chat-header">
            <h2 className="chat-title">SafeTrace AI</h2>
            <div className="chat-header-actions">
              {messages.length > 0 && (
                <button
                  className="chat-clear-btn"
                  onClick={clearChat}
                  aria-label="Clear chat"
                >
                  Clear
                </button>
              )}
              <button
                className="chat-close-btn"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="chat-messages">
            {messages.length === 0 && !loading && (
              <div className="chat-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="chat-empty-icon">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                <p>Ask about your family's whereabouts</p>
                <span>e.g. "Where is Tola?" or "Is anyone at home?"</span>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`chat-bubble ${msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}`}
              >
                {msg.content}
              </div>
            ))}

            {loading && (
              <div className="chat-bubble chat-bubble-ai">
                <span className="typing-indicator">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </span>
              </div>
            )}

            {error && (
              <div className="chat-error">{error}</div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <form className="chat-input-bar" onSubmit={handleSubmit}>
            <input
              type="text"
              className="chat-input"
              placeholder="Ask a question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={loading || !input.trim()}
              aria-label="Send message"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
