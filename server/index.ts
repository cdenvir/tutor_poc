import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
console.log("Loaded key:", process.env.OPENAI_API_KEY ? "YES" : "NO");
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const upload = multer({ storage: multer.memoryStorage() });

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Missing OPENAI_API_KEY in environment.");
  process.exit(1);
}

const client = new OpenAI({ apiKey });

type BookPart = { id: number; label: string; base: string };
type Book = { id: string; title: string; folder: string; parts: BookPart[] };

const BOOKS_JSON_PATH = path.join(process.cwd(), "public", "media", "books", "books.json");
const BOOKS_ROOT = path.join(process.cwd(), "public", "media", "books");

function safeSlug(input: string) {
  // conservative slug for ids and filenames
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function safeFolderName(input: string) {
  // keep readable folder names but remove dangerous chars
  const cleaned = input.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "").slice(0, 80);
  return cleaned || "New Book";
}

function ensureBooksJsonExists() {
  if (!fs.existsSync(BOOKS_JSON_PATH)) {
    fs.mkdirSync(path.dirname(BOOKS_JSON_PATH), { recursive: true });
    fs.writeFileSync(BOOKS_JSON_PATH, "[]", "utf-8");
  }
}

function readBooks(): Book[] {
  ensureBooksJsonExists();
  const raw = fs.readFileSync(BOOKS_JSON_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("books.json must be an array");
  return parsed;
}

let booksWriteQueue: Promise<void> = Promise.resolve();
function writeBooks(books: Book[]) {
  ensureBooksJsonExists();
  booksWriteQueue = booksWriteQueue.then(async () => {
    const tmp = `${BOOKS_JSON_PATH}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(books, null, 2), "utf-8");
    await fs.promises.rename(tmp, BOOKS_JSON_PATH);
  });
  return booksWriteQueue;
}

function bookFolderPath(book: Book) {
  // Ensure it stays under BOOKS_ROOT
  return path.join(BOOKS_ROOT, book.folder);
}

function partBasePath(book: Book, part: BookPart) {
  return path.join(bookFolderPath(book), part.base);
}

function requireTeacher(req: any, res: any, next: any) {
  // PoC: trust user id sent from client (NOT secure). Good enough for local.
  const isTeacher = Boolean(req.body?.teacher === true || req.headers["x-echo-teacher"] === "true");
  if (!isTeacher) return res.status(403).json({ error: "Teacher access required." });
  next();
}


type WordDef = {
  word: string;
  definition_ko: string;
  example_en: string;
  example_ko: string;
  createdAt: string; // ISO
  model: string;
};

type UserRecord = {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  gender: "M" | "F" | "X";
  yearOfBirth: number;
  teacher: boolean;
  englishName?: string;
};

const USERS_PATH = path.join(process.cwd(), "server", "data", "users.json");

function loadUsers(): UserRecord[] {
  const txt = fs.readFileSync(USERS_PATH, "utf-8");
  const arr = JSON.parse(txt);
  if (!Array.isArray(arr)) throw new Error("users.json must be an array");
  return arr;
}

const DEFINITIONS_PATH = path.join(process.cwd(), "server", "data", "definitions.json");

// In-memory mirror of the JSON file (loaded at startup)
let definitionsCache: Record<string, WordDef> = {};

// Simple single-process write queue (prevents overlapping writes)
let writeQueue: Promise<void> = Promise.resolve();

function normalizeWord(raw: string): string {
  // Remove surrounding punctuation and lower-case
  const cleaned = raw.trim().replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, "");
  return cleaned.toLowerCase();
}

function loadDefinitionsCache() {
  try {
    if (!fs.existsSync(DEFINITIONS_PATH)) {
      fs.mkdirSync(path.dirname(DEFINITIONS_PATH), { recursive: true });
      fs.writeFileSync(DEFINITIONS_PATH, "{}", "utf-8");
    }
    const txt = fs.readFileSync(DEFINITIONS_PATH, "utf-8");
    const parsed = JSON.parse(txt);
    definitionsCache = parsed && typeof parsed === "object" ? parsed : {};
    console.log(`Loaded definitions cache: ${Object.keys(definitionsCache).length} entries`);
  } catch (e) {
    console.warn("Failed to load definitions cache, starting empty.", e);
    definitionsCache = {};
  }
}

loadDefinitionsCache();

function saveDefinitionsCache() {
  // Queue writes so we never corrupt the file
  writeQueue = writeQueue.then(async () => {
    const tmp = `${DEFINITIONS_PATH}.tmp`;
    const json = JSON.stringify(definitionsCache, null, 2);
    await fs.promises.writeFile(tmp, json, "utf-8");
    await fs.promises.rename(tmp, DEFINITIONS_PATH);
  }).catch((e) => {
    console.error("Failed to write definitions cache:", e);
  });

  return writeQueue;
}

// Read the original text from your public folder
function getOriginalText(): string {
  const p = path.join(process.cwd(), "public", "media", "Kipper and the giant - 1.txt");
  return fs.readFileSync(p, "utf-8");
}

// Simple word tokenizer (keep punctuation attached-ish)
function tokenizeWords(s: string): string[] {
  return s.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

// Build an indexed word list like "0:Kipper 1:and ..."
function indexedWords(words: string[]): string {
  return words.map((w, i) => `${i}:${w}`).join(" ");
}

/**
 * 1) Transcribe user audio using Audio API (/v1/audio/transcriptions)
 * Models include gpt-4o-transcribe and gpt-4o-mini-transcribe. :contentReference[oaicite:2]{index=2}
 */
app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Missing audio file." });

    const transcription = await client.audio.transcriptions.create({
      model: "gpt-4o-mini-transcribe",
      language: "en", // ✅ force English
      file: new File([req.file.buffer], req.file.originalname || "recording.webm", {
        type: req.file.mimetype || "audio/webm",
      }),
    });

    return res.json({ text: transcription.text });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "Transcription failed." });
  }
});

/**
 * 2) Ask a text model to diff & score (Responses API recommended). :contentReference[oaicite:3]{index=3}
 * We ask it to return strict JSON with word indices referencing the ORIGINAL text.
 */
app.post("/api/analyze", async (req, res) => {
  try {
    const userTranscript: string = String(req.body?.transcript || "").trim();
    if (!userTranscript) return res.status(400).json({ error: "Missing transcript." });

    const original = String(req.body?.originalText || "").trim() || getOriginalText();
    const originalWords = tokenizeWords(original);
    const indexed = indexedWords(originalWords);

   const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    scorePercent: { type: "number", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    mistakes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          startIndex: { type: "integer", minimum: 0 },
          endIndex: { type: "integer", minimum: 0 },
          expected: { type: "string" },
          heard: { type: "string" },
          kind: { type: "string", enum: ["missing", "substitution", "extra", "reorder", "unclear"] },
        },
        required: ["startIndex", "endIndex", "expected", "heard", "kind"],
      },
    },
  },
  required: ["scorePercent", "summary", "mistakes"],
} as const;

    const prompt = `
You are grading a student's read-aloud accuracy.

You will be given:
(1) ORIGINAL text as an indexed list of words: "index:word index:word ..."
(2) STUDENT transcript text (what they said)

Task:
- Compare student transcript to the ORIGINAL.
- Return mistakes referencing ORIGINAL word indices.
- Each mistake covers a contiguous span [startIndex..endIndex] in ORIGINAL.
- "expected" = the exact ORIGINAL span text.
- "heard" = what the student said for that span (or "" if missing).
- Choose kind: missing/substitution/extra/reorder/unclear
- ScorePercent should reflect accuracy (word-level), 0..100.

IMPORTANT:
- Keep mistakes minimal and non-overlapping.
- If the student adds extra words not in original, record them as kind="extra" with startIndex=endIndex=the nearest original index where it occurred and expected="".
`.trim();

const resp = await client.responses.create({
  model: "gpt-5-mini",
  input: [
    { role: "system", content: prompt },
    {
      role: "user",
      content: `ORIGINAL_INDEXED_WORDS:\n${indexed}\n\nSTUDENT_TRANSCRIPT:\n${userTranscript}`,
    },
  ],
  text: {
    format: {
      type: "json_schema",
      name: "reading_analysis",   // ✅ this is what your error is asking for
      schema: analysisSchema,
      strict: true,
    },
  },
});

    // Responses API returns text in output; OpenAI SDK exposes helpers in some versions.
    // We'll parse from the first text output we find.
    const outText = resp.output_text;
    if (!outText) return res.status(500).json({ error: "No analysis output_text." });

    let analysis: any;
    try {
      analysis = JSON.parse(outText);
    } catch {
      return res.status(500).json({ error: "Could not parse analysis JSON." });
    }

    return res.json({
      originalText: original,
      originalWords,
      transcript: userTranscript,
      analysis,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "Analysis failed." });
  }
});

app.post("/api/define", async (req, res) => {
  try {
    const rawWord = String(req.body?.word || "");
    const key = normalizeWord(rawWord);
    if (!key) return res.status(400).json({ error: "Invalid word." });

    // 1) CACHE HIT
    const cached = definitionsCache[key];
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    // 2) CACHE MISS -> call OpenAI
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        word: { type: "string" },
        definition_ko: { type: "string" },
        example_en: { type: "string" },
        example_ko: { type: "string" },
      },
      required: ["word", "definition_ko", "example_en", "example_ko"],
    } as const;

    const prompt = `
You are an English tutor. The user double-clicked a single English word from a children's story.
Return:
- a clear Korean definition (short, natural Korean)
- one simple English example sentence suitable for kids
- a natural Korean translation of that example
Keep it concise.
`.trim();

    const model = "gpt-5-mini";

    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: prompt },
        { role: "user", content: `Word: ${key}` },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "word_definition",
          schema,
          strict: true,
        },
      },
    });

    const outText = resp.output_text;
    if (!outText) return res.status(500).json({ error: "No output_text from model." });

    const data = JSON.parse(outText) as {
      word: string;
      definition_ko: string;
      example_en: string;
      example_ko: string;
    };

    // 3) Store in cache (keyed by normalized word)
    const entry: WordDef = {
      word: key,
      definition_ko: data.definition_ko,
      example_en: data.example_en,
      example_ko: data.example_ko,
      createdAt: new Date().toISOString(),
      model,
    };

    definitionsCache[key] = entry;
    await saveDefinitionsCache();

    return res.json({ ...entry, cached: false });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Definition lookup failed." });
  }
});

app.post("/api/login", (req, res) => {
  try {
    const usernameRaw = String(req.body?.username || "").trim();
    const username = usernameRaw.toLowerCase();

    if (!username) return res.status(400).json({ error: "Username is required." });

    const users = loadUsers();
    const found = users.find((u) => u.username.toLowerCase() === username);

    if (!found) return res.status(401).json({ error: "Invalid username." });

    // Return the user record (no password for now)
    return res.json({ user: found });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Login failed." });
  }
});

app.get("/health", (_req, res) => res.send("ok"));

app.get("/api/books", (_req, res) => {
  try {
    const books = readBooks();
    return res.json({ books });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to read books.json" });
  }
});


app.post("/api/books", requireTeacher, async (req, res) => {
  try {
    const titleRaw = String(req.body?.title || "").trim();
    if (!titleRaw) return res.status(400).json({ error: "Title is required." });

    const books = readBooks();

    const id = safeSlug(req.body?.id ? String(req.body.id) : titleRaw);
    if (!id) return res.status(400).json({ error: "Invalid id/title." });
    if (books.some(b => b.id === id)) return res.status(409).json({ error: "Book id already exists." });

    const folder = safeFolderName(titleRaw);
    const folderPath = path.join(BOOKS_ROOT, folder);
    fs.mkdirSync(folderPath, { recursive: true });

    const book: Book = { id, title: titleRaw, folder, parts: [] };
    books.push(book);
    await writeBooks(books);

    return res.json({ book });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to add book." });
  }
});

// ✅ Update book (title + optional folder rename)
app.put("/api/books/:bookId", requireTeacher, async (req, res) => {
  try {
    const { bookId } = req.params;

    const books = readBooks();
    const book = books.find((b) => b.id === bookId);
    if (!book) return res.status(404).json({ error: "Book not found." });

    const titleRaw = req.body?.title != null ? String(req.body.title).trim() : "";
    const folderRaw = req.body?.folder != null ? String(req.body.folder).trim() : "";

    // Title update (optional)
    if (titleRaw) {
      book.title = titleRaw;
    }

    // Folder rename (optional) — ONLY do this if folder is provided and different
    if (folderRaw) {
      const newFolder = safeFolderName(folderRaw);
      if (!newFolder) return res.status(400).json({ error: "Invalid folder." });

      if (newFolder !== book.folder) {
        const oldPath = bookFolderPath(book);
        const newPath = path.join(BOOKS_ROOT, newFolder);

        // Basic safety: ensure both are under BOOKS_ROOT
        const rootResolved = path.resolve(BOOKS_ROOT) + path.sep;
        const oldResolved = path.resolve(oldPath) + path.sep;
        const newResolved = path.resolve(newPath) + path.sep;
        if (!oldResolved.startsWith(rootResolved) || !newResolved.startsWith(rootResolved)) {
          return res.status(400).json({ error: "Invalid folder path." });
        }

        if (fs.existsSync(newPath)) {
          return res.status(409).json({ error: "Target folder already exists." });
        }

        // Ensure old exists (it should), then rename
        fs.mkdirSync(path.dirname(newPath), { recursive: true });
        if (fs.existsSync(oldPath)) {
          await fs.promises.rename(oldPath, newPath);
        } else {
          // If folder somehow missing, just create new
          fs.mkdirSync(newPath, { recursive: true });
        }

        book.folder = newFolder;
      }
    }

    await writeBooks(books);
    return res.json({ book });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to update book." });
  }
});

// ✅ Delete book (optionally delete files on disk)
app.delete("/api/books/:bookId", requireTeacher, async (req, res) => {
  try {
    const { bookId } = req.params;
    const deleteFiles = String(req.query.deleteFiles || "true") === "true";

    const books = readBooks();
    const idx = books.findIndex((b) => b.id === bookId);
    if (idx < 0) return res.status(404).json({ error: "Book not found." });

    const book = books[idx];
    books.splice(idx, 1);

    await writeBooks(books);

    if (deleteFiles) {
      const folder = bookFolderPath(book);

      // Safety: ensure delete stays under BOOKS_ROOT
      const rootResolved = path.resolve(BOOKS_ROOT) + path.sep;
      const folderResolved = path.resolve(folder) + path.sep;
      if (!folderResolved.startsWith(rootResolved)) {
        return res.status(400).json({ error: "Invalid folder path." });
      }

      if (fs.existsSync(folder)) {
        // Node 14+ supports fs.rmSync; you are using it elsewhere already
        fs.rmSync(folder, { recursive: true, force: true });
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to delete book." });
  }
});

app.post(
  "/api/books/:bookId/parts",
  requireTeacher,
  upload.fields([{ name: "mp3", maxCount: 1 }, { name: "vtt", maxCount: 1 }, { name: "txt", maxCount: 1 }]),
  async (req, res) => {
    try {
      const { bookId } = req.params;

      const labelRaw = String(req.body?.label || "").trim();
      if (!labelRaw) return res.status(400).json({ error: "Part label is required." });

      const files = req.files as any;
      const mp3 = files?.mp3?.[0];
      const vtt = files?.vtt?.[0];
      const txtFile = files?.txt?.[0];

      if (!mp3) return res.status(400).json({ error: "MP3 file is required." });
      if (!vtt) return res.status(400).json({ error: "VTT file is required." });

      // ✅ Text can come from body.text OR from uploaded txt file
      const textFromBody = typeof req.body?.text === "string" ? String(req.body.text) : "";
      const textFromFile = txtFile ? txtFile.buffer.toString("utf-8") : "";
      const finalText = (textFromFile || textFromBody).trim();
      if (!finalText) return res.status(400).json({ error: "Text is required (either 'text' field or 'txt' file)." });

      const books = readBooks();
      const book = books.find(b => b.id === bookId);
      if (!book) return res.status(404).json({ error: "Book not found." });

      const nextId = (book.parts.reduce((m, p) => Math.max(m, p.id), 0) || 0) + 1;

      // Base name: user can pass base, else use "Title - N"
      const baseRaw = String(req.body?.base || `${book.title} - ${nextId}`).trim();
      const base = safeFolderName(baseRaw); // reuse safeFolderName for filenames
      if (!base) return res.status(400).json({ error: "Invalid base name." });

      // Ensure folder exists
      fs.mkdirSync(bookFolderPath(book), { recursive: true });

      // Write files
      await fs.promises.writeFile(path.join(bookFolderPath(book), `${base}.mp3`), mp3.buffer);
      await fs.promises.writeFile(path.join(bookFolderPath(book), `${base}.vtt`), vtt.buffer);
      await fs.promises.writeFile(path.join(bookFolderPath(book), `${base}.txt`), finalText, "utf-8");

      const part: BookPart = { id: nextId, label: labelRaw, base };
      book.parts.push(part);

      await writeBooks(books);

      return res.json({ book, part });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to add part." });
    }
  }
);

app.put(
  "/api/books/:bookId/parts/:partId",
  requireTeacher,
  upload.fields([{ name: "mp3", maxCount: 1 }, { name: "vtt", maxCount: 1 }, { name: "txt", maxCount: 1 }]),
  async (req, res) => {
    try {
      const { bookId, partId } = req.params;
      const pid = Number(partId);

      const books = readBooks();
      const book = books.find(b => b.id === bookId);
      if (!book) return res.status(404).json({ error: "Book not found." });

      const part = book.parts.find(p => p.id === pid);
      if (!part) return res.status(404).json({ error: "Part not found." });

      const newLabel = req.body?.label ? String(req.body.label).trim() : part.label;

      // ✅ Text update can come from:
      // - uploaded txt file
      // - body.text (even if empty string, if present)
      const files = req.files as any;
      const txtFile = files?.txt?.[0];

      const hasTextField = Object.prototype.hasOwnProperty.call(req.body ?? {}, "text");
      const textFromBody = hasTextField ? String(req.body.text ?? "") : undefined;
      const textFromFile = txtFile ? txtFile.buffer.toString("utf-8") : undefined;

      // Handle base rename (optional)
      const requestedBase = req.body?.base ? safeFolderName(String(req.body.base).trim()) : part.base;
      if (!requestedBase) return res.status(400).json({ error: "Invalid base." });

      const folder = bookFolderPath(book);
      fs.mkdirSync(folder, { recursive: true });

      // If base changed, rename existing files if present
      if (requestedBase !== part.base) {
        const exts = [".mp3", ".vtt", ".txt"];
        for (const ext of exts) {
          const from = path.join(folder, `${part.base}${ext}`);
          const to = path.join(folder, `${requestedBase}${ext}`);
          if (fs.existsSync(from)) fs.renameSync(from, to);
        }
        part.base = requestedBase;
      }

      // Optionally replace uploaded files
      const mp3 = files?.mp3?.[0];
      const vtt = files?.vtt?.[0];
      if (mp3) await fs.promises.writeFile(path.join(folder, `${part.base}.mp3`), mp3.buffer);
      if (vtt) await fs.promises.writeFile(path.join(folder, `${part.base}.vtt`), vtt.buffer);

      // ✅ Optionally replace text if txt file uploaded OR body.text was provided
      const chosenText = textFromFile ?? textFromBody;
      if (chosenText !== undefined) {
        await fs.promises.writeFile(path.join(folder, `${part.base}.txt`), String(chosenText), "utf-8");
      }

      part.label = newLabel;

      await writeBooks(books);

      return res.json({ book, part });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to update part." });
    }
  }
);

app.delete("/api/books/:bookId/parts/:partId", requireTeacher, async (req, res) => {
  try {
    const { bookId, partId } = req.params;
    const pid = Number(partId);
    const deleteFiles = String(req.query.deleteFiles || "true") === "true";

    const books = readBooks();
    const book = books.find(b => b.id === bookId);
    if (!book) return res.status(404).json({ error: "Book not found." });

    const idx = book.parts.findIndex(p => p.id === pid);
    if (idx < 0) return res.status(404).json({ error: "Part not found." });

    const part = book.parts[idx];
    book.parts.splice(idx, 1);

    await writeBooks(books);

    if (deleteFiles) {
      const folder = bookFolderPath(book);
      const exts = [".mp3", ".vtt", ".txt"];
      for (const ext of exts) {
        const p = path.join(folder, `${part.base}${ext}`);
        if (fs.existsSync(p)) fs.rmSync(p, { force: true });
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to delete part." });
  }
});


const port = 8787;
app.listen(port, () => {
  console.log(`Echo backend listening on http://localhost:${port}`);
});