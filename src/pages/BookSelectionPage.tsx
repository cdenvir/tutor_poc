import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getUser, clearUser } from "../auth";

type BookPart = { id: number; label: string; base: string };
type Book = { id: string; title: string; folder: string; parts: BookPart[] };

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export default function BookSelectionPage() {
  const navigate = useNavigate();
  const user = getUser();

  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activePartId, setActivePartId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null);
        // const res = await fetch(encodePath("/media/books/books.json"), { cache: "no-store" });
        const res = await fetch("/api/books", { cache: "no-store" });
        const raw = await res.text(); // ✅ read once

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} loading books. First 120 chars: ${raw.slice(0, 120)}`);
        }

        let j: any;
        try {
          j = JSON.parse(raw);
        } catch {
          throw new Error(`Expected JSON but got: ${raw.slice(0, 120)}`);
        }

        const data = j.books; // for /api/books
        if (!Array.isArray(data)) throw new Error("Invalid response shape: expected { books: [...] }");

        setBooks(data);

        if (!cancelled) {
          setBooks(data);
          const firstBook = data[0];
          setActiveBookId(firstBook?.id ?? null);
          setActivePartId(firstBook?.parts?.[0]?.id ?? null);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load book list.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeBook = useMemo(() => books.find((b) => b.id === activeBookId) ?? null, [books, activeBookId]);
  const activePart = useMemo(
    () => activeBook?.parts?.find((p) => p.id === activePartId) ?? null,
    [activeBook, activePartId]
  );

  // Keep active part valid when switching books
  useEffect(() => {
    if (!activeBook) return;
    if (!activeBook.parts?.some((p) => p.id === activePartId)) {
      setActivePartId(activeBook.parts?.[0]?.id ?? null);
    }
  }, [activeBookId]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayName = user
    ? (user.englishName?.trim() ? `${user.firstName} (${user.englishName}) ${user.lastName}` : `${user.firstName} ${user.lastName}`)
    : "";

  const logout = () => {
    clearUser();
    navigate("/login", { replace: true });
  };

  return (
    <div className="container">
      <div className="shell">
        <div className="header">
          <div className="brand">
            <div className="logoDot" />
            <div>
              <div className="title">Echo</div>
              <div className="subtitle">Book Selection {user ? `• ${displayName}` : ""}</div>
            </div>
          </div>

          <div className="row">
            <span className="badge">Books</span>
            <button className="btn" onClick={logout}>Logout</button>
            {user?.teacher && <Link className="btn" to="/admin">Admin</Link>}
          </div>
        </div>

        {err && (
          <div className="card">
            <div className="cardBody">
              <div className="muted">⚠ {err}</div>
              <div className="muted" style={{ marginTop: 8 }}>
                Check <code>public/media/books/books.json</code>
              </div>
            </div>
          </div>
        )}

        {!err && (
          <div className="card">
            <div className="cardHeader">
              <div style={{ fontWeight: 800 }}>Choose a book</div>
              <span className="muted">Loaded dynamically from books.json</span>
            </div>

            <div className="cardBody">
              {/* Book list */}
              <div style={{ display: "grid", gap: 10 }}>
                {books.map((b) => {
                  const isActive = b.id === activeBookId;
                  return (
                    <button
                      key={b.id}
                      className="btn"
                      onClick={() => setActiveBookId(b.id)}
                      style={{
                        textAlign: "left",
                        padding: 14,
                        borderRadius: 14,
                        border: isActive ? "1px solid rgba(255,255,255,0.24)" : "1px solid rgba(255,255,255,0.12)",
                        background: isActive ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{b.title}</div>
                      <div className="muted" style={{ marginTop: 4 }}>
                        {b.parts?.length || 0} part(s)
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="divider" />

              {/* Parts as tabs */}
              {activeBook && (
                <>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>
                    {activeBook.title} • Parts
                  </div>

                  <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {activeBook.parts.map((p) => {
                      const isActive = p.id === activePartId;
                      return (
                        <button
                          key={p.id}
                          className={`btn ${isActive ? "btnPrimary" : ""}`}
                          onClick={() => setActivePartId(p.id)}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div className="muted">
                      Selected: <b>{activePart?.label}</b>
                    </div>

                    {activePart && (
                      <Link
                        className="btn btnPrimary"
                        to={`/read/${encodeURIComponent(activeBook.id)}/${activePart.id}`}
                      >
                        Open
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}