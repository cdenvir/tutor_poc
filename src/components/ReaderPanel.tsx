import React, { useEffect, useMemo, useRef, useState } from "react";

type RecorderState = "idle" | "recording" | "stopped";
type VttCue = { start: number; end: number; text: string };

type AnalysisMistake = {
  startIndex: number;
  endIndex: number;
  expected: string;
  heard: string;
  kind: "missing" | "substitution" | "extra" | "reorder" | "unclear";
};

type AnalysisResult = {
  scorePercent: number;
  summary: string;
  mistakes: AnalysisMistake[];
};

function encodePublicPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function parseVttTimestamp(ts: string): number {
  const parts = ts.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return 0;

  let h = 0, m = 0, sMs = "";
  if (parts.length === 3) {
    h = Number(parts[0]) || 0;
    m = Number(parts[1]) || 0;
    sMs = parts[2];
  } else {
    m = Number(parts[0]) || 0;
    sMs = parts[1];
  }

  const [sStr, msStr = "0"] = sMs.split(".");
  const s = Number(sStr) || 0;
  const ms = Number(msStr.padEnd(3, "0").slice(0, 3)) || 0;

  return h * 3600 + m * 60 + s + ms / 1000;
}

function parseVtt(vttText: string): VttCue[] {
  const lines = vttText.replace(/\r/g, "").split("\n");
  const cues: VttCue[] = [];

  let i = 0;
  while (i < lines.length) {
    let line = lines[i].trim();

    if (!line || line.toUpperCase().startsWith("WEBVTT")) {
      i++;
      continue;
    }
    if (line.toUpperCase().startsWith("NOTE")) {
      i++;
      while (i < lines.length && lines[i].trim() !== "") i++;
      continue;
    }

    const next = i + 1 < lines.length ? lines[i + 1].trim() : "";
    if (next.includes("-->") && !line.includes("-->")) {
      i++;
      line = lines[i].trim();
    }

    if (!line.includes("-->")) {
      i++;
      continue;
    }

    const [left, rightRaw] = line.split("-->");
    const start = parseVttTimestamp(left.trim());
    const end = parseVttTimestamp(rightRaw.trim().split(/\s+/)[0]);

    i++;
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      textLines.push(lines[i]);
      i++;
    }
    const text = textLines.join(" ").trim();
    if (text) cues.push({ start, end, text });
    i++;
  }

  cues.sort((a, b) => a.start - b.start);
  return cues;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function tokenizeWords(s: string): string[] {
  return s.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

export default function ReaderPanel({ basePath }: { basePath: string }) {
const audioSrc = useMemo(() => `${basePath}.mp3`, [basePath]);
const textSrc  = useMemo(() => `${basePath}.txt`, [basePath]);
const vttSrc   = useMemo(() => `${basePath}.vtt`, [basePath]);

  const [text, setText] = useState<string>("Loading text…");
  const [isPlaying, setIsPlaying] = useState(false);

  const [cues, setCues] = useState<VttCue[]>([]);
  const [activeCueIndex, setActiveCueIndex] = useState<number>(-1);

  // Sync controls (persisted)
  const [syncOffsetSec, setSyncOffsetSec] = useState<number>(() => {
    const v = localStorage.getItem("echo_sync_offset_sec");
    return v ? Number(v) : 0;
  });
  const [syncScale, setSyncScale] = useState<number>(() => {
    const v = localStorage.getItem("echo_sync_scale");
    return v ? Number(v) : 1;
  });

  // --- NEW: dictionary popup state ---
const [dictOpen, setDictOpen] = useState(false);
const [dictLoading, setDictLoading] = useState(false);
const [dictError, setDictError] = useState<string | null>(null);
const [dictWord, setDictWord] = useState<string>("");
const [dictResult, setDictResult] = useState<{
  word: string;
  definition_ko: string;
  example_en: string;
  example_ko: string;
} | null>(null);

const pickWordFromDoubleClick = (text: string) => {
  // best-effort: single word, strip punctuation around it
  return text.trim().replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, "");
};

const openDefinition = async (raw: string) => {
  const w = pickWordFromDoubleClick(raw);
  if (!w) return;

  setDictOpen(true);
  setDictLoading(true);
  setDictError(null);
  setDictResult(null);
  setDictWord(w);

  try {
    const r = await fetch("/api/define", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: w }),
    });
    if (!r.ok) throw new Error("define failed");
    const j = await r.json();
    setDictResult(j);
  } catch {
    setDictError("Could not fetch definition. Check backend console.");
  } finally {
    setDictLoading(false);
  }
};

  useEffect(() => localStorage.setItem("echo_sync_offset_sec", String(syncOffsetSec)), [syncOffsetSec]);
  useEffect(() => localStorage.setItem("echo_sync_scale", String(syncScale)), [syncScale]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Recording
  const [recState, setRecState] = useState<RecorderState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recError, setRecError] = useState<string | null>(null);

  // Analyze UI state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const originalWords = useMemo(() => tokenizeWords(text), [text]);

  // Load TXT
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(textSrc, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const t = await res.text();
        if (!cancelled) setText(t);
      } catch {
        if (!cancelled) setText("Could not load the .txt file. Check public/media/.");
      }
    })();
    return () => { cancelled = true; };
  }, [textSrc]);

  // Load VTT
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(vttSrc, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const vtt = await res.text();
        const parsed = parseVtt(vtt);
        if (!cancelled) setCues(parsed);
      } catch {
        if (!cancelled) setCues([]);
      }
    })();
    return () => { cancelled = true; };
  }, [vttSrc]);

  // Audio highlight via cues + offset/scale
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setActiveCueIndex(-1);
    };

    const onTimeUpdate = () => {
      if (cues.length === 0) return;
      const effectiveTime = a.currentTime * syncScale + syncOffsetSec;

      if (activeCueIndex >= 0 && activeCueIndex < cues.length) {
        const c = cues[activeCueIndex];
        if (effectiveTime >= c.start && effectiveTime < c.end) return;
      }

      let idx = -1;
      for (let i = 0; i < cues.length; i++) {
        if (effectiveTime >= cues[i].start && effectiveTime < cues[i].end) {
          idx = i;
          break;
        }
      }
      setActiveCueIndex(idx);
    };

    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    a.addEventListener("timeupdate", onTimeUpdate);

    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [cues, activeCueIndex, syncOffsetSec, syncScale]);

  useEffect(() => {
    if (activeCueIndex < 0) return;
    const el = document.getElementById(`cue-${activeCueIndex}`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeCueIndex]);

  const togglePlay = async () => {
    const a = audioRef.current;
    if (!a) return;
    try {
      if (a.paused) await a.play();
      else a.pause();
    } catch {}
  };

  const nudgeOffset = (delta: number) => {
    setSyncOffsetSec((v) => clamp(Number((v + delta).toFixed(2)), -5, 5));
  };

  const resetSync = () => {
    setSyncOffsetSec(0);
    setSyncScale(1);
  };

  // Recording
  const startRecording = async () => {
    setRecError(null);
    setAnalysis(null);
    setTranscript("");
    setAnalysisError(null);

    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setRecordedBlob(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t));

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
        setRecState("stopped");
      };

      mr.start();
      mediaRecorderRef.current = mr;
      setRecState("recording");
    } catch (e: any) {
      setRecError(
        e?.name === "NotAllowedError"
          ? "Microphone permission denied. Allow mic access and try again."
          : "Could not start recording."
      );
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    if (mr.state === "recording") mr.stop();
    mediaRecorderRef.current = null;
  };

  // NEW: Analyze flow
  const analyzeRecording = async () => {
    if (!recordedBlob) return;

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysis(null);

    try {
      // 1) Transcribe
      const fd = new FormData();
      fd.append("audio", recordedBlob, "recording.webm");

      const tRes = await fetch("/api/transcribe", { method: "POST", body: fd });
      if (!tRes.ok) throw new Error("Transcribe failed");
      const tJson = await tRes.json();
      const tText = String(tJson.text || "");
      setTranscript(tText);

      // 2) Analyze/diff
      const aRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: tText, originalText: text }),
      });
      if (!aRes.ok) throw new Error("Analyze failed");
      const aJson = await aRes.json();
      setAnalysis(aJson.analysis as AnalysisResult);
    } catch (e: any) {
      setAnalysisError("Analysis failed. Check the backend console + OPENAI_API_KEY.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Render original text with mistake highlights (by word index span)
  const mistakeMap = useMemo(() => {
    const map = new Map<number, AnalysisMistake>();
    if (!analysis) return map;

    for (const m of analysis.mistakes) {
      const start = Math.max(0, m.startIndex);
      const end = Math.max(start, m.endIndex);
      for (let i = start; i <= end; i++) map.set(i, m);
    }
    return map;
  }, [analysis]);

  const hasVtt = cues.length > 0;

  return (
    <div className="card">
      <div className="cardHeader">
        <div className="row">
          <button className="btn btnPrimary" onClick={togglePlay}>
            {isPlaying ? "Pause ▶︎" : "Play ▶︎"}
          </button>
          <span className="badge">Story audio</span>
          <span className="badge">
            Sync: {syncOffsetSec >= 0 ? `+${syncOffsetSec.toFixed(2)}` : syncOffsetSec.toFixed(2)}s, ×{syncScale.toFixed(3)}
          </span>
        </div>

        <div className="row">
          <button className="btn" onClick={() => nudgeOffset(-0.25)} title="Highlight earlier">
            ◀︎ -0.25s
          </button>
          <button className="btn" onClick={() => nudgeOffset(+0.25)} title="Highlight later">
            +0.25s ▶︎
          </button>
          <button className="btn" onClick={resetSync} title="Reset sync values">
            Reset
          </button>
        </div>
      </div>

      <div className="cardBody">
        <div className="textPanel" aria-label="Story text">
          {hasVtt ? (
            cues.map((c, i) => (
            <span
              key={i}
              id={`cue-${i}`}
              className={`word ${i === activeCueIndex ? "wordActive" : ""}`}
              onDoubleClick={() => openDefinition(c.text)}
              style={{ cursor: "pointer" }}
              title="Double-click for Korean definition"
            >
              {c.text}{" "}
            </span>
            ))
          ) : (
            <span className="muted">{text}</span>
          )}
        </div>

        <audio ref={audioRef} src={audioSrc} preload="metadata" />

        <div className="divider" />

        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Record your reading</div>
            <div className="muted">Record, stop, replay — then analyze.</div>
          </div>

          {recState !== "recording" ? (
            <button className="btn" onClick={startRecording}>
              ● Record
            </button>
          ) : (
            <button className="btn btnDanger" onClick={stopRecording}>
              ■ Stop
            </button>
          )}
        </div>

        {recError && (
          <div style={{ marginTop: 10 }} className="muted">
            ⚠ {recError}
          </div>
        )}

        {recordedUrl && (
          <div style={{ marginTop: 12 }}>
            <div className="muted" style={{ marginBottom: 8 }}>
              Your recording:
            </div>
            <audio controls src={recordedUrl} />

            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn btnPrimary" onClick={analyzeRecording} disabled={isAnalyzing}>
                {isAnalyzing ? "Analyzing…" : "Analyze recording"}
              </button>
              {transcript && <span className="badge">Transcript ready</span>}
              {analysis && <span className="badge">Score: {analysis.scorePercent.toFixed(0)}%</span>}
            </div>

            {analysisError && (
              <div style={{ marginTop: 10 }} className="muted">
                ⚠ {analysisError}
              </div>
            )}

            {transcript && (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Transcript (what you said)</div>
                <div className="textPanel" style={{ maxHeight: 140, fontSize: 14 }}>
                  {transcript}
                </div>
              </div>
            )}

            {analysis && (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>
                  Results — mistakes highlighted in the ORIGINAL text
                </div>

                <div className="textPanel" style={{ maxHeight: 220 }}>
                  {originalWords.map((w, idx) => {
                    const m = mistakeMap.get(idx);
                    const bg =
                      !m ? "" :
                      m.kind === "missing" ? "rgba(239,68,68,0.18)" :
                      m.kind === "substitution" ? "rgba(245,158,11,0.18)" :
                      m.kind === "extra" ? "rgba(59,130,246,0.18)" :
                      "rgba(168,85,247,0.18)";

                    const outline =
                      !m ? "" :
                      m.kind === "missing" ? "1px solid rgba(239,68,68,0.35)" :
                      m.kind === "substitution" ? "1px solid rgba(245,158,11,0.35)" :
                      m.kind === "extra" ? "1px solid rgba(59,130,246,0.35)" :
                      "1px solid rgba(168,85,247,0.35)";

                    return (
                      <span
                        key={idx}
                        className="word"
                        title={m ? `${m.kind}: expected "${m.expected}" heard "${m.heard}"` : ""}
                        style={m ? { background: bg, outline, outlineOffset: 0 } : undefined}
                      >
                        {w}{" "}
                      </span>
                    );
                  })}
                </div>

                <div style={{ marginTop: 10 }} className="muted">
                  <b>Summary:</b> {analysis.summary}
                </div>

                {analysis.mistakes.length > 0 && (
                  <div style={{ marginTop: 10 }} className="muted">
                    <b>Mistakes:</b>
                    <ul style={{ marginTop: 6 }}>
                      {analysis.mistakes.slice(0, 12).map((m, i) => (
                        <li key={i}>
                          <b>{m.kind}</b> ({m.startIndex}-{m.endIndex}) expected “{m.expected}” heard “{m.heard}”
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 12 }} className="muted">
{dictOpen && (
  <div
    onClick={() => setDictOpen(false)}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.55)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      zIndex: 9999,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "min(720px, 100%)",
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(15, 18, 28, 0.96)",
        borderRadius: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
        padding: 16,
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>
          Echo • 단어 뜻
        </div>
        <button className="btn" onClick={() => setDictOpen(false)}>Close</button>
      </div>

      <div className="badge" style={{ marginBottom: 10 }}>
        Word: {dictWord}
      </div>

      {dictLoading && <div className="muted">Looking up definition…</div>}
      {dictError && <div className="muted">⚠ {dictError}</div>}

      {dictResult && (
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>뜻 (Korean definition)</div>
            <div className="textPanel" style={{ maxHeight: 120, fontSize: 15 }}>
              {dictResult.definition_ko}
            </div>
          </div>

          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Example (EN)</div>
            <div className="textPanel" style={{ maxHeight: 120, fontSize: 15 }}>
              {dictResult.example_en}
            </div>
          </div>

          <div>
            <div className="muted" style={{ marginBottom: 4 }}>예문 (KO)</div>
            <div className="textPanel" style={{ maxHeight: 120, fontSize: 15 }}>
              {dictResult.example_ko}
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
)}
          Note: this uses your local backend so your API key stays off the browser.
        </div>
      </div>
    </div>
  );
}