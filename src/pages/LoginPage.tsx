import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setUser, type UserRecord } from "../auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsernameState] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const trimmed = useMemo(() => username.trim(), [username]);

  const login = async () => {
    setError(null);
    if (!trimmed) {
      setError("Please enter your username.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Login failed.");
        return;
      }

      const j = (await res.json()) as { user: UserRecord };
      setUser(j.user);

      navigate("/books", { replace: true });
    } catch {
      setError("Could not reach server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") login();
  };

  return (
    <div className="container">
      <div className="shell" style={{ maxWidth: 560 }}>
        <div className="header" style={{ marginBottom: 18 }}>
          <div className="brand">
            <div className="logoDot" />
            <div>
              <div className="title">Echo</div>
              <div className="subtitle">Login to continue</div>
            </div>
          </div>
          <div className="badge">v0.1</div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <div style={{ fontWeight: 800 }}>Welcome back</div>
            <span className="muted">Username only</span>
          </div>

          <div className="cardBody">
            <div className="muted" style={{ marginBottom: 10 }}>
              Enter your username to open the reading page.
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>
                  Username
                </div>
                <input
                  value={username}
                  onChange={(e) => setUsernameState(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="e.g. student1"
                  style={{
                    width: "100%",
                    padding: "12px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.9)",
                    outline: "none",
                    fontSize: 16,
                  }}
                />
              </div>

              {error && (
                <div
                  style={{
                    border: "1px solid rgba(239,68,68,0.35)",
                    background: "rgba(239,68,68,0.14)",
                    padding: "10px 12px",
                    borderRadius: 12,
                  }}
                  className="muted"
                >
                  ⚠ {error}
                </div>
              )}

              <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
                <div className="muted">
                  Tip: usernames are stored in <code>server/data/users.json</code>
                </div>
                <button className="btn btnPrimary" onClick={login} disabled={loading}>
                  {loading ? "Signing in…" : "Login"}
                </button>
              </div>
            </div>

            <div className="divider" />

            <div className="muted">
              No password yet — we’ll add that later if needed.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}