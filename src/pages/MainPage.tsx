import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReaderPanel from "../components/ReaderPanel";
import { clearUser, getUser } from "../auth";

type BookPart = { id: number; label: string; base: string };
type Book = { id: string; title: string; folder: string; parts: BookPart[] };

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export default function MainPage() {
  const navigate = useNavigate();
  const user = getUser();
  const { bookId, partId } = useParams();

  const [books, setBooks] = useState<Book[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setErr(null);

        const res = await fetch("/api/books", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Failed to load books (${res.status})`);
        }

        const j = await res.json();
        if (!cancelled) {
          setBooks(j.books ?? []);
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message || "Failed to load book list.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeBook = useMemo(
    () => books.find((b) => b.id === bookId) ?? null,
    [books, bookId]
  );

  const activePart = useMemo(() => {
    if (!activeBook) return null;
    const pid = Number(partId);
    return activeBook.parts.find((p) => p.id === pid) ?? null;
  }, [activeBook, partId]);

  const basePath = useMemo(() => {
    if (!activeBook || !activePart) return null;
    return encodePath(`/media/books/${activeBook.folder}/${activePart.base}`);
  }, [activeBook, activePart]);

  const displayName =
    user?.englishName?.trim()
      ? `${user.firstName} (${user.englishName}) ${user.lastName}`
      : `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();

  const logout = () => {
    clearUser();
    navigate("/login", { replace: true });
  };

  if (!user) return null;

  return (
    <div className="container">
      <div className="shell">
        <div className="header">
          <div className="brand">
            <div className="logoDot" />
            <div>
              <div className="title">Echo</div>
              <div className="subtitle">
                {(user.teacher ? "Teacher" : "Student")} • {displayName}
                {activeBook ? ` • ${activeBook.title}` : ""}
                {activePart ? ` • ${activePart.label}` : ""}
              </div>
            </div>
          </div>

          <div className="row">
            <Link className="btn" to="/books">← Book Selection</Link>
            <span className="badge">Main Page</span>
            <button className="btn" onClick={logout}>Logout</button>
          </div>
        </div>

        {err && (
          <div className="card">
            <div className="cardBody">
              <div className="muted">⚠ {err}</div>
            </div>
          </div>
        )}

        {!err && (!activeBook || !activePart || !basePath) && (
          <div className="card">
            <div className="cardBody">
              <div className="muted">
                ⚠ Could not resolve the selected book/part.
              </div>
              <div className="muted" style={{ marginTop: 8 }}>
                Go back to <Link to="/books">Book Selection</Link>.
              </div>
            </div>
          </div>
        )}

        {!err && basePath && <ReaderPanel basePath={basePath} />}
      </div>
    </div>
  );
}