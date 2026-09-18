"use client";
import { useState, type FormEvent } from "react";
import { ArrowUpRight, LoaderCircle, LockKeyhole } from "lucide-react";
export default function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const code = String(new FormData(event.currentTarget).get("code") ?? "");
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.assign("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <div className="login-art">
        <div className="brand">
          <span className="brand-mark">e</span>eve
          <span className="brand-label">FANTASY OFFICE</span>
        </div>
        <div className="login-copy">
          <span className="eyebrow">YOUR TEAM. HANDLED.</span>
          <h1>
            A little less managing.
            <br />
            <em>A lot more game.</em>
          </h1>
          <p>
            Your league, the latest intel, and a manager that checks in.
            <br />
            All in one quiet corner of the internet.
          </p>
        </div>
        <div className="field-art" aria-hidden="true">
          <div />
          <div />
          <div />
          <span>01 / THE LONG GAME</span>
        </div>
        <footer>Built for your league. Accountable for every decision.</footer>
      </div>
      <div className="login-form">
        <LockKeyhole size={22} />
        <span className="eyebrow">PRIVATE FRONT OFFICE</span>
        <h2>Welcome back.</h2>
        <p>Enter your owner access code to meet Eve.</p>
        <form onSubmit={submit}>
          <label htmlFor="code">Access code</label>
          <input
            id="code"
            name="code"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Your private access code"
          />
          <button className="primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <>
                Open front office
                <ArrowUpRight size={18} />
              </>
            )}
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="small muted">
          Your code is stored in the local <code>.local/access-code.txt</code>{" "}
          file created during setup.
        </p>
      </div>
    </main>
  );
}
