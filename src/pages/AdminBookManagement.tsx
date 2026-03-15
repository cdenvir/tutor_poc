import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearUser, getUser } from "../auth";

type BookPart = { id: number; label: string; base: string };
type Book = { id: string; title: string; folder: string; parts: BookPart[] };

async function apiGetBooks(): Promise<Book[]> {
  const r = await fetch("/api/books", { cache: "no-store" });
  if (!r.ok) throw new Error("Failed to load books");
  const j = await r.json();
  return j.books as Book[];
}

function teacherHeaders(extra?: Record<string, string>) {
  return { "x-echo-teacher": "true", ...(extra ?? {}) };
}

async function fileToText(file: File): Promise<string> {
  return await file.text();
}

export default function AdminBookManagement() {
  const user = getUser();
  const navigate = useNavigate();

  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activePartId, setActivePartId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Add book
  const [newTitle, setNewTitle] = useState("");

  // Edit book (requires PUT /api/books/:bookId)
  const [editTitle, setEditTitle] = useState("");
  const [editFolder, setEditFolder] = useState("");

  // Add part
  const [partLabel, setPartLabel] = useState("Part");
  const [partBase, setPartBase] = useState("");
  const [partText, setPartText] = useState("");
  const [partTxtFile, setPartTxtFile] = useState<File | null>(null);
  const [mp3File, setMp3File] = useState<File | null>(null);
  const [vttFile, setVttFile] = useState<File | null>(null);

  // Edit part (requires PUT /api/books/:bookId/parts/:partId)
  const [editPartLabel, setEditPartLabel] = useState("");
  const [editPartBase, setEditPartBase] = useState("");
  const [editPartText, setEditPartText] = useState("");
  const [editTxtFile, setEditTxtFile] = useState<File | null>(null);
  const [replaceMp3, setReplaceMp3] = useState<File | null>(null);
  const [replaceVtt, setReplaceVtt] = useState<File | null>(null);

  const isTeacher = Boolean(user?.teacher);

  const reload = async () => {
    try {
      setErr(null);
      const data = await apiGetBooks();
      setBooks(data);

      const first = data[0];
      setActiveBookId((prev) => prev ?? first?.id ?? null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load books.");
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const activeBook = useMemo(() => books.find((b) => b.id === activeBookId) ?? null, [books, activeBookId]);
  const activePart = useMemo(
    () => activeBook?.parts?.find((p) => p.id === activePartId) ?? null,
    [activeBook, activePartId]
  );

  useEffect(() => {
    if (!activeBook) return;
    if (!activeBook.parts.some((p) => p.id === activePartId)) {
      setActivePartId(activeBook.parts[0]?.id ?? null);
    }
  }, [activeBookId]); // eslint-disable-line react-hooks/exhaustive-deps

  // preload edit book fields
  useEffect(() => {
    if (!activeBook) {
      setEditTitle("");
      setEditFolder("");
      return;
    }
    setEditTitle(activeBook.title);
    setEditFolder(activeBook.folder);
  }, [activeBookId]); // eslint-disable-line react-hooks/exhaustive-deps

  // preload edit part fields + load existing txt (best-effort)
  useEffect(() => {
    (async () => {
      if (!activeBook || !activePart) {
        setEditPartLabel("");
        setEditPartBase("");
        setEditPartText("");
        setEditTxtFile(null);
        setReplaceMp3(null);
        setReplaceVtt(null);
        return;
      }

      setEditPartLabel(activePart.label);
      setEditPartBase(activePart.base);
      setEditTxtFile(null);
      setReplaceMp3(null);
      setReplaceVtt(null);

      try {
        const txtUrl = `/media/books/${encodeURIComponent(activeBook.folder)}/${encodeURIComponent(activePart.base)}.txt`;
        const r = await fetch(txtUrl, { cache: "no-store" });
        if (!r.ok) throw new Error("txt missing");
        const t = await r.text();
        setEditPartText(t);
      } catch {
        setEditPartText("");
      }
    })();
  }, [activeBookId, activePartId]); // eslint-disable-line react-hooks/exhaustive-deps

  const logout = () => {
    clearUser();
    navigate("/login", { replace: true });
  };

  if (!user) return null;

  if (!isTeacher) {
    return (
      <div className="container">
        <div className="shell">
          <div className="header">
            <div className="brand">
              <div className="logoDot" />
              <div>
                <div className="title">Echo</div>
                <div className="subtitle">Admin • Book Management</div>
              </div>
            </div>
            <div className="row">
              <Link className="btn" to="/admin">
                ← Admin
              </Link>
              <button className="btn" onClick={logout}>
                Logout
              </button>
            </div>
          </div>
          <div className="card">
            <div className="cardBody">
              <div className="muted">⚠ Teacher access required.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const addBook = async () => {
    try {
      setErr(null);
      const r = await fetch("/api/books", {
        method: "POST",
        headers: teacherHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ title: newTitle, teacher: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Failed to add book.");
      setNewTitle("");
      await reload();
    } catch (e: any) {
      setErr(e?.message || "Failed.");
    }
  };

  const updateBook = async () => {
    if (!activeBook) return;
    try {
      setErr(null);

      const payload: any = {};
      if (editTitle.trim() && editTitle.trim() !== activeBook.title) payload.title = editTitle.trim();
      if (editFolder.trim() && editFolder.trim() !== activeBook.folder) payload.folder = editFolder.trim();

      if (Object.keys(payload).length === 0) return;

      const r = await fetch(`/api/books/${encodeURIComponent(activeBook.id)}`, {
        method: "PUT",
        headers: teacherHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ...payload, teacher: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Failed to update book.");
      await reload();
    } catch (e: any) {
      setErr(e?.message || "Failed.");
    }
  };

  const deleteBook = async () => {
    if (!activeBook) return;
    const ok = confirm(`Delete book "${activeBook.title}"?\n\nThis can also delete files on disk.`);
    if (!ok) return;

    const r = await fetch(`/api/books/${encodeURIComponent(activeBook.id)}?deleteFiles=true`, {
      method: "DELETE",
      headers: teacherHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ teacher: true }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(j.error || "Failed to delete book.");
      return;
    }
    setActiveBookId(null);
    setActivePartId(null);
    await reload();
  };

  const addPart = async () => {
    if (!activeBook) return;

    if (!partLabel.trim()) return setErr("Part label is required.");
    if (!mp3File) return setErr("MP3 is required.");
    // removed: if (!vttFile) return setErr("VTT is required.");

    // Either textarea or txt file must be provided
    const hasText = Boolean(partText.trim());
    const hasTxt = Boolean(partTxtFile);
    if (!hasText && !hasTxt) return setErr("Text is required (paste text OR upload a .txt).");

    try {
      setErr(null);
      const fd = new FormData();
      fd.append("label", partLabel.trim());
      if (partBase.trim()) fd.append("base", partBase.trim());

      // Prefer txt file if provided, else body text
      if (partTxtFile) {
        fd.append("txt", partTxtFile);
      } else {
        fd.append("text", partText);
      }

      fd.append("mp3", mp3File);
      if (vttFile) fd.append("vtt", vttFile);
      fd.append("teacher", "true");

      const r = await fetch(`/api/books/${encodeURIComponent(activeBook.id)}/parts`, {
        method: "POST",
        headers: teacherHeaders(),
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Failed to add part.");

      // reset part form
      setPartLabel("Part");
      setPartBase("");
      setPartText("");
      setPartTxtFile(null);
      setMp3File(null);
      setVttFile(null);

      await reload();

      // select newest part
      const updated = await apiGetBooks();
      const b = updated.find((x) => x.id === activeBook.id);
      const newest = b?.parts?.reduce((max, p) => (p.id > max.id ? p : max), b.parts[0]);
      if (newest) setActivePartId(newest.id);
    } catch (e: any) {
      setErr(e?.message || "Failed.");
    }
  };

  const updatePart = async () => {
    if (!activeBook || !activePart) return;

    if (!editPartLabel.trim()) return setErr("Part label is required.");
    if (!editPartBase.trim()) return setErr("Base is required (keep the current one if unsure).");

    // Allow: keep current text (do nothing), OR replace via textarea, OR replace via txt upload.
    // If teacher typed in textarea, we send it. If they uploaded txt, we send txt.
    // If neither changed, we still send text to avoid confusion? We'll only send if either is provided.
    const shouldSendText = editTxtFile != null || editPartText != null;

    try {
      setErr(null);
      const fd = new FormData();
      fd.append("label", editPartLabel.trim());
      fd.append("base", editPartBase.trim());

      // Prefer txt upload if provided, otherwise send textarea text.
      // IMPORTANT: sending "text" always will overwrite server-side; so only send when user intends to.
      if (editTxtFile) {
        fd.append("txt", editTxtFile);
      } else if (shouldSendText) {
        fd.append("text", editPartText ?? "");
      }

      if (replaceMp3) fd.append("mp3", replaceMp3);
      if (replaceVtt) fd.append("vtt", replaceVtt);

      fd.append("teacher", "true");

      const r = await fetch(`/api/books/${encodeURIComponent(activeBook.id)}/parts/${activePart.id}`, {
        method: "PUT",
        headers: teacherHeaders(),
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Failed to update part.");

      await reload();
    } catch (e: any) {
      setErr(e?.message || "Failed.");
    }
  };

  const deletePart = async () => {
    if (!activeBook || !activePart) return;
    const ok = confirm(`Delete part "${activePart.label}"?\nFiles will be removed.`);
    if (!ok) return;

    const r = await fetch(`/api/books/${encodeURIComponent(activeBook.id)}/parts/${activePart.id}?deleteFiles=true`, {
      method: "DELETE",
      headers: teacherHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ teacher: true }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(j.error || "Failed to delete part.");
      return;
    }
    await reload();
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.9)",
    outline: "none",
  };

  const textAreaStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 160,
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.9)",
    outline: "none",
    resize: "vertical",
  };

  return (
    <div className="container">
      <div className="shell">
        <div className="header">
          <div className="brand">
            <div className="logoDot" />
            <div>
              <div className="title">Echo</div>
              <div className="subtitle">Admin • Book Management • Books & Parts</div>
            </div>
          </div>

          <div className="row">
            <Link className="btn" to="/admin">
              ← Admin
            </Link>
            <span className="badge">Admin</span>
            <button className="btn" onClick={logout}>
              Logout
            </button>
          </div>
        </div>

        {err && (
          <div className="card">
            <div className="cardBody">
              <div className="muted">⚠ {err}</div>
            </div>
          </div>
        )}

        {/* Add book */}
        <div className="card">
          <div className="cardHeader">
            <div style={{ fontWeight: 800 }}>Add a new book</div>
            <span className="muted">Creates folder + updates books.json</span>
          </div>
          <div className="cardBody">
            <div className="row" style={{ gap: 10 }}>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Book title (e.g. New Story)"
                style={inputStyle}
              />
              <button className="btn btnPrimary" onClick={addBook} disabled={!newTitle.trim()}>
                Add Book
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 14, marginTop: 14 }}>
          {/* Books list + edit */}
          <div className="card">
            <div className="cardHeader">
              <div style={{ fontWeight: 800 }}>Books</div>
              <button className="btn" onClick={reload}>
                Refresh
              </button>
            </div>
            <div className="cardBody" style={{ display: "grid", gap: 10 }}>
              {books.map((b) => {
                const active = b.id === activeBookId;
                return (
                  <button
                    key={b.id}
                    className="btn"
                    onClick={() => setActiveBookId(b.id)}
                    style={{
                      textAlign: "left",
                      padding: 14,
                      borderRadius: 14,
                      border: active ? "1px solid rgba(255,255,255,0.24)" : "1px solid rgba(255,255,255,0.12)",
                      background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{b.title}</div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {b.parts.length} part(s)
                    </div>
                  </button>
                );
              })}

              <div className="divider" />

              <div style={{ fontWeight: 800 }}>Edit selected book</div>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Title"
                style={inputStyle}
                disabled={!activeBook}
              />
              <input
                value={editFolder}
                onChange={(e) => setEditFolder(e.target.value)}
                placeholder="Folder (optional; renames folder on disk)"
                style={inputStyle}
                disabled={!activeBook}
              />

              <div className="row" style={{ justifyContent: "space-between" }}>
                <button className="btn btnPrimary" onClick={updateBook} disabled={!activeBook}>
                  Save Book Changes
                </button>
                <button className="btn btnDanger" onClick={deleteBook} disabled={!activeBook}>
                  Delete Book
                </button>
              </div>
            </div>
          </div>

          {/* Parts + editor */}
          <div className="card">
            <div className="cardHeader">
              <div style={{ fontWeight: 800 }}>Parts {activeBook ? `• ${activeBook.title}` : ""}</div>
              <span className="muted">Upload mp3/vtt and save txt</span>
            </div>

            <div className="cardBody">
              {!activeBook && <div className="muted">Select a book on the left.</div>}

              {activeBook && (
                <>
                  {/* Tabs */}
                  <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {activeBook.parts.map((p) => (
                      <button
                        key={p.id}
                        className={`btn ${p.id === activePartId ? "btnPrimary" : ""}`}
                        onClick={() => setActivePartId(p.id)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                    <div className="muted">
                      Selected: <b>{activePart ? `${activePart.label} (${activePart.base})` : "None"}</b>
                    </div>
                    {activePart && (
                      <Link className="btn" to={`/read/${encodeURIComponent(activeBook.id)}/${activePart.id}`}>
                        Open in Reader →
                      </Link>
                    )}
                  </div>

                  {activePart && (
                    <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
                      <button className="btn btnPrimary" onClick={updatePart}>
                        Save Part Changes
                      </button>
                      <button className="btn btnDanger" onClick={deletePart}>
                        Delete Part
                      </button>
                    </div>
                  )}

                  {activePart && (
                    <>
                      <div className="divider" />
                      <div style={{ fontWeight: 800, marginBottom: 8 }}>Edit selected part</div>

                      <div className="row" style={{ gap: 10 }}>
                        <input
                          value={editPartLabel}
                          onChange={(e) => setEditPartLabel(e.target.value)}
                          placeholder="Part label"
                          style={inputStyle}
                        />
                        <input
                          value={editPartBase}
                          onChange={(e) => setEditPartBase(e.target.value)}
                          placeholder="Base filename"
                          style={inputStyle}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                        <div className="muted">
                          Text source: paste below (saves as .txt) OR upload a .txt (upload wins)
                        </div>

                        <textarea
                          value={editPartText}
                          onChange={(e) => {
                            setEditPartText(e.target.value);
                            // if teacher starts editing textarea, they probably don't want txt upload to override
                            // (they can still upload after if they want)
                          }}
                          placeholder="Edit the passage text here"
                          style={textAreaStyle}
                        />

                        <div className="row" style={{ gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div className="muted" style={{ marginBottom: 6 }}>
                              Replace TXT (optional)
                            </div>
                            <input
                              type="file"
                              accept=".txt,text/plain"
                              onChange={async (e) => {
                                const f = e.target.files?.[0] ?? null;
                                setEditTxtFile(f);
                                if (f) {
                                  // preview loaded txt into textarea for visibility
                                  try {
                                    const t = await fileToText(f);
                                    setEditPartText(t);
                                  } catch {
                                    // ignore
                                  }
                                }
                              }}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div className="muted" style={{ marginBottom: 6 }}>
                              Replace MP3 (optional)
                            </div>
                            <input
                              type="file"
                              accept=".mp3,audio/mpeg"
                              onChange={(e) => setReplaceMp3(e.target.files?.[0] ?? null)}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div className="muted" style={{ marginBottom: 6 }}>
                              Replace VTT (optional)
                            </div>
                            <input
                              type="file"
                              accept=".vtt,text/vtt"
                              onChange={(e) => setReplaceVtt(e.target.files?.[0] ?? null)}
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="divider" />

                  <div style={{ fontWeight: 800, marginBottom: 8 }}>Add new part</div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <div className="row" style={{ gap: 10 }}>
                      <input
                        value={partLabel}
                        onChange={(e) => setPartLabel(e.target.value)}
                        placeholder="Part label (e.g. Part 1)"
                        style={inputStyle}
                      />
                      <input
                        value={partBase}
                        onChange={(e) => setPartBase(e.target.value)}
                        placeholder="Base filename (optional)"
                        style={inputStyle}
                      />
                    </div>

                    <div className="muted">
                      Text source: paste below (saves as .txt) OR upload a .txt (upload wins)
                    </div>

                    <textarea
                      value={partText}
                      onChange={(e) => setPartText(e.target.value)}
                      placeholder="Paste the passage text here (saved as .txt)"
                      style={textAreaStyle}
                    />

                    <div className="row" style={{ gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div className="muted" style={{ marginBottom: 6 }}>TXT (optional)</div>
                        <input
                          type="file"
                          accept=".txt,text/plain"
                          onChange={async (e) => {
                            const f = e.target.files?.[0] ?? null;
                            setPartTxtFile(f);
                            if (f) {
                              // show contents in textarea as preview
                              try {
                                const t = await fileToText(f);
                                setPartText(t);
                              } catch {
                                // ignore
                              }
                            }
                          }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="muted" style={{ marginBottom: 6 }}>MP3</div>
                        <input
                          type="file"
                          accept=".mp3,audio/mpeg"
                          onChange={(e) => setMp3File(e.target.files?.[0] ?? null)}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="muted" style={{ marginBottom: 6 }}>VTT (optional)</div>
                        <input
                          type="file"
                          accept=".vtt,text/vtt"
                          onChange={(e) => setVttFile(e.target.files?.[0] ?? null)}
                        />
                      </div>
                    </div>

                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      <button className="btn btnPrimary" onClick={addPart}>
                        Add Part
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}