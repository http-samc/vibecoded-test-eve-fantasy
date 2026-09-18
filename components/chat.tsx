"use client";
import { useEveAgent } from "eve/react";
import { useState, type FormEvent } from "react";
import { ArrowUp, LoaderCircle, Sparkles } from "lucide-react";
export function Chat() {
  const agent = useEveAgent();
  const [message, setMessage] = useState("");
  const busy = ["submitted", "streaming", "resuming"].includes(agent.status);
  async function send(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    setMessage("");
    try {
      await agent.send(text);
    } catch {
      setMessage(text);
    }
  }
  return (
    <section className="panel chat-panel">
      <header className="panel-heading">
        <div>
          <span className="eyebrow">YOUR MANAGER</span>
          <h2>Talk to Eve</h2>
        </div>
        <Sparkles size={22} />
      </header>
      <div className="messages" aria-live="polite">
        {agent.data.messages.length === 0 ? (
          <div className="empty">
            <span className="brand-mark large">e</span>
            <h3>What’s on your mind?</h3>
            <p>
              Ask about your lineup, a trade idea, or why Eve made a
              recommendation.
            </p>
            <div className="suggestions">
              {[
                "How is my team doing?",
                "What should I watch this week?",
                "Explain my current action policy.",
              ].map((q) => (
                <button
                  className="subtle"
                  key={q}
                  onClick={() => setMessage(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          agent.data.messages.map((m) => (
            <article key={m.id} className={`message ${m.role}`}>
              <span className="eyebrow">
                {m.role === "user" ? "YOU" : "EVE"}
              </span>
              {m.parts.map((part, i) =>
                part.type === "text" ? <p key={i}>{part.text}</p> : null,
              )}
            </article>
          ))
        )}
        {busy && (
          <p className="muted">
            <LoaderCircle className="spin" size={14} /> Eve is checking…
          </p>
        )}
      </div>
      {agent.error && (
        <p className="error" role="alert">
          Eve couldn’t complete this turn. Try again.
        </p>
      )}
      <form onSubmit={send} className="composer">
        <input
          aria-label="Message Eve"
          placeholder="Ask your manager…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={4000}
        />
        <button
          className="primary icon-button"
          disabled={busy || !message.trim()}
          aria-label="Send message"
        >
          <ArrowUp size={18} />
        </button>
      </form>
    </section>
  );
}
