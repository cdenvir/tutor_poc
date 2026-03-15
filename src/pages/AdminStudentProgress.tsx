import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearUser, getUser } from "../auth";

type ProgressMistake = {
  startIndex: number;
  endIndex: number;
  expected: string;
  heard: string;
  kind: "missing" | "substitution" | "extra" | "reorder" | "unclear";
};

type ProgressEvent = {
  id: string;
  timestamp: string;
  userId: number;
  username: string;
  teacher: boolean;
  bookId: string;
  bookTitle: string;
  partId: number;
  partLabel: string;
  eventType: "listen" | "record_start" | "record_stop" | "analysis";
  payload?: {
    source?: string;
    durationSec?: number;
    scorePercent?: number;
    summary?: string;
    originalText?: string;
    transcribedText?: string;
    mistakes?: ProgressMistake[];
  };
};

type StudentSummary = {
  userId: number;
  username: string;
  listens: number;
  recordings: number;
  analyses: number;
  lastActivityAt: string | null;
  latestScorePercent: number | null;
  averageScorePercent: number | null;
};

function teacherHeaders() {
  return {
    "x-echo-teacher": "true",
  };
}

function formatDateTime(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

export default function AdminStudentProgress() {
  const navigate = useNavigate();
  const user = getUser();

  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selectedStudent = useMemo(
    () => students.find((s) => s.userId === selectedUserId) ?? null,
    [students, selectedUserId]
  );

  const logout = () => {
    clearUser();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    if (!user?.teacher) return;

    let cancelled = false;

    (async () => {
      try {
        setErr(null);
        setLoadingSummary(true);

        const res = await fetch("/api/progress/summary", {
          headers: teacherHeaders(),
          cache: "no-store",
        });

        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Failed to load progress summary.");

        if (!cancelled) {
          const rows = (j.students ?? []) as StudentSummary[];
          setStudents(rows);
          setSelectedUserId((prev) => prev ?? rows[0]?.userId ?? null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message || "Failed to load progress summary.");
        }
      } finally {
        if (!cancelled) {
          setLoadingSummary(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.teacher]);

  useEffect(() => {
    if (!user?.teacher || selectedUserId == null) {
      setEvents([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setErr(null);
        setLoadingEvents(true);

        const res = await fetch(`/api/progress/events?userId=${selectedUserId}`, {
          headers: teacherHeaders(),
          cache: "no-store",
        });

        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Failed to load progress events.");

        if (!cancelled) {
          setEvents((j.events ?? []) as ProgressEvent[]);
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message || "Failed to load progress events.");
        }
      } finally {
        if (!cancelled) {
          setLoadingEvents(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedUserId, user?.teacher]);

  if (!user?.teacher) {
    return (
      <div className="container">
        <div className="shell">
          <div className="card">
            <div className="cardBody">
              <div className="badge" style={{ color: "#fca5a5" }}>
                Teacher access required.
              </div>
              <div style={{ marginTop: 12 }}>
                <Link to="/books" className="btn">Back to Books</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const analysisEvents = events.filter((e) => e.eventType === "analysis");

  return (
    <div className="container">
      <div className="shell" style={{ width: "min(1300px, 100%)" }}>
        <div className="header">
          <div className="brand">
            <div className="logoDot" />
            <div>
              <div className="title">Echo</div>
              <div className="subtitle">Admin • Student Progress</div>
            </div>
          </div>

          <div className="row">
            <Link to="/admin" className="btn">← Admin Home</Link>
            <Link to="/books" className="btn">Book Selection</Link>
            <button className="btn" onClick={logout}>Logout</button>
          </div>
        </div>

        {err && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="cardBody">
              <div className="badge" style={{ color: "#fca5a5" }}>
                ⚠ {err}
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "320px minmax(0, 1fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div className="card">
            <div className="cardHeader">
              <div>
                <div style={{ fontWeight: 700 }}>Students</div>
                <div className="subtitle">{students.length}</div>
              </div>
            </div>

            <div className="cardBody" style={{ display: "grid", gap: 10 }}>
              {loadingSummary && <div className="muted">Loading…</div>}

              {!loadingSummary && students.length === 0 && (
                <div className="muted">No student activity has been recorded yet.</div>
              )}

              {students.map((s) => {
                const selected = s.userId === selectedUserId;

                return (
                  <button
                    key={s.userId}
                    type="button"
                    className="btn"
                    onClick={() => setSelectedUserId(s.userId)}
                    style={{
                      textAlign: "left",
                      justifyContent: "flex-start",
                      padding: 12,
                      background: selected
                        ? "linear-gradient(135deg, rgba(124,58,237,0.45), rgba(96,165,250,0.25))"
                        : undefined,
                    }}
                  >
                    <div style={{ width: "100%", display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 700 }}>{s.username}</div>
                      <div className="muted">Listens: {s.listens}</div>
                      <div className="muted">Recordings: {s.recordings}</div>
                      <div className="muted">Analyses: {s.analyses}</div>
                      <div className="muted">
                        Latest score: {s.latestScorePercent != null ? `${s.latestScorePercent}%` : "—"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <div className="card">
              <div className="cardHeader">
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {selectedStudent ? selectedStudent.username : "Student details"}
                  </div>
                  <div className="subtitle">
                    {selectedStudent
                      ? `Last activity: ${formatDateTime(selectedStudent.lastActivityAt)}`
                      : "Select a student"}
                  </div>
                </div>
              </div>

              <div
                className="cardBody"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <SummaryCard label="Listens" value={selectedStudent?.listens ?? "—"} />
                <SummaryCard label="Recordings" value={selectedStudent?.recordings ?? "—"} />
                <SummaryCard label="Analyses" value={selectedStudent?.analyses ?? "—"} />
                <SummaryCard
                  label="Latest Score"
                  value={
                    selectedStudent?.latestScorePercent != null
                      ? `${selectedStudent.latestScorePercent}%`
                      : "—"
                  }
                />
                <SummaryCard
                  label="Average Score"
                  value={
                    selectedStudent?.averageScorePercent != null
                      ? `${selectedStudent.averageScorePercent}%`
                      : "—"
                  }
                />
              </div>
            </div>

            <div className="card">
              <div className="cardHeader">
                <div>
                  <div style={{ fontWeight: 700 }}>Event History</div>
                  <div className="subtitle">{events.length} events</div>
                </div>
              </div>

              <div className="cardBody" style={{ display: "grid", gap: 12 }}>
                {loadingEvents && <div className="muted">Loading…</div>}

                {!loadingEvents && events.length === 0 && (
                  <div className="muted">No events found for this student.</div>
                )}

                {events.map((e) => (
                  <div key={e.id} className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div className="cardBody" style={{ display: "grid", gap: 8 }}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <div style={{ fontWeight: 700 }}>{e.eventType}</div>
                        <div className="subtitle">{formatDateTime(e.timestamp)}</div>
                      </div>

                      <div className="muted">
                        {e.bookTitle} • {e.partLabel}
                      </div>

                      {e.payload?.durationSec != null && (
                        <div className="muted">Duration: {e.payload.durationSec}s</div>
                      )}

                      {e.payload?.scorePercent != null && (
                        <div className="muted">Score: {e.payload.scorePercent}%</div>
                      )}

                      {e.payload?.summary && (
                        <div className="muted">Summary: {e.payload.summary}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="cardHeader">
                <div>
                  <div style={{ fontWeight: 700 }}>Analysis Attempts</div>
                  <div className="subtitle">{analysisEvents.length}</div>
                </div>
              </div>

              <div className="cardBody" style={{ display: "grid", gap: 16 }}>
                {analysisEvents.length === 0 && (
                  <div className="muted">No analysis attempts recorded yet.</div>
                )}

                {analysisEvents.map((e) => (
                  <div key={`analysis-${e.id}`} className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div className="cardBody" style={{ display: "grid", gap: 12 }}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <div style={{ fontWeight: 700 }}>
                          {e.bookTitle} • {e.partLabel}
                        </div>
                        <div className="subtitle">{formatDateTime(e.timestamp)}</div>
                      </div>

                      <div className="muted">
                        Score: {e.payload?.scorePercent != null ? `${e.payload.scorePercent}%` : "—"}
                      </div>

                      {e.payload?.summary && (
                        <div>
                          <div className="subtitle" style={{ fontWeight: 700, marginBottom: 6 }}>
                            Summary
                          </div>
                          <div className="muted">{e.payload.summary}</div>
                        </div>
                      )}

                      {e.payload?.originalText && (
                        <div>
                          <div className="subtitle" style={{ fontWeight: 700, marginBottom: 6 }}>
                            Original Text
                          </div>
                          <div className="card" style={{ background: "rgba(255,255,255,0.02)" }}>
                            <div className="cardBody" style={{ whiteSpace: "pre-wrap" }}>
                              {e.payload.originalText}
                            </div>
                          </div>
                        </div>
                      )}

                      {e.payload?.transcribedText && (
                        <div>
                          <div className="subtitle" style={{ fontWeight: 700, marginBottom: 6 }}>
                            Transcribed Text
                          </div>
                          <div className="card" style={{ background: "rgba(255,255,255,0.02)" }}>
                            <div className="cardBody" style={{ whiteSpace: "pre-wrap" }}>
                              {e.payload.transcribedText}
                            </div>
                          </div>
                        </div>
                      )}

                      {e.payload?.mistakes && e.payload.mistakes.length > 0 && (
                        <div>
                          <div className="subtitle" style={{ fontWeight: 700, marginBottom: 6 }}>
                            Mistakes
                          </div>
                          <div style={{ display: "grid", gap: 8 }}>
                            {e.payload.mistakes.map((m, idx) => (
                              <div
                                key={idx}
                                className="card"
                                style={{ background: "rgba(255,255,255,0.02)" }}
                              >
                                <div className="cardBody" style={{ display: "grid", gap: 4 }}>
                                  <div style={{ fontWeight: 700 }}>
                                    {m.kind} ({m.startIndex}-{m.endIndex})
                                  </div>
                                  <div className="muted">Expected: {m.expected || "—"}</div>
                                  <div className="muted">Heard: {m.heard || "—"}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
      <div className="cardBody" style={{ display: "grid", gap: 6 }}>
        <div className="subtitle" style={{ fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
      </div>
    </div>
  );
}