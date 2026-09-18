"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <span className="brand-mark">e</span>
      <h1>Something interrupted the check-in.</h1>
      <p>Your team has not been changed by this page error.</p>
      <button className="primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
