// Vite plugin that stores patients and their activity in a local JSON file.
// Only runs with `npm run dev` / `npm run preview`; there is no production
// backend yet.
//
//   GET    /api/patients                 list patient profiles
//   POST   /api/patients                 create a patient   body: profile
//   PUT    /api/patients/:id             update a profile   body: profile
//   GET    /api/patients/:id/activity    { samples, events }
//   POST   /api/patients/:id/activity    append             body: { samples?, events? }
//   DELETE /api/patients/:id/activity    clear activity

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_FILE = path.resolve("data/patients.json");
const PROFILE_FIELDS = [
  "patientName",
  "caregiverName",
  "relationship",
  "caregiverPhone",
  "notes",
];

async function readData() {
  try {
    return JSON.parse(await readFile(DATA_FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return { patients: {} };
    throw err;
  }
}

// Write to a temp file and rename, so a crash never leaves half a file
async function writeData(data) {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  const temp = `${DATA_FILE}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2));
  await rename(temp, DATA_FILE);
}

// Requests are handled one at a time so concurrent writes can't overwrite
// each other
let queue = Promise.resolve();
function withData(fn) {
  const result = queue.then(async () => {
    const data = await readData();
    const { value, changed } = await fn(data);
    if (changed) await writeData(data);
    return value;
  });
  queue = result.catch(() => {});
  return result;
}

function pickProfile(body) {
  return Object.fromEntries(
    PROFILE_FIELDS.map((field) => [field, String(body?.[field] ?? "")]),
  );
}

function toSummary(id, patient) {
  return { id, ...pickProfile(patient) };
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function send(res, status, value) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(value === undefined ? "" : JSON.stringify(value));
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const match = url.pathname.match(
    /^\/api\/patients(?:\/([\w-]+)(?:\/(activity))?)?\/?$/,
  );
  if (!match) return send(res, 404, { error: "Not found" });
  const [, id, sub] = match;

  const body = ["POST", "PUT"].includes(req.method) ? await readBody(req) : null;

  const result = await withData((data) => {
    const patient = id && data.patients[id];
    if (id && !patient) return { value: [404, { error: "Unknown patient" }] };

    if (!id && req.method === "GET") {
      const list = Object.entries(data.patients).map(([pid, p]) =>
        toSummary(pid, p),
      );
      return { value: [200, list] };
    }

    if (!id && req.method === "POST") {
      const newId = randomUUID();
      data.patients[newId] = { ...pickProfile(body), samples: [], events: [] };
      return {
        value: [201, toSummary(newId, data.patients[newId])],
        changed: true,
      };
    }

    if (!sub && req.method === "PUT") {
      Object.assign(patient, pickProfile(body));
      return { value: [200, toSummary(id, patient)], changed: true };
    }

    if (sub && req.method === "GET") {
      return {
        value: [200, { samples: patient.samples, events: patient.events }],
      };
    }

    if (sub && req.method === "POST") {
      if (Array.isArray(body.samples)) patient.samples.push(...body.samples);
      if (Array.isArray(body.events)) patient.events.push(...body.events);
      return { value: [204], changed: true };
    }

    if (sub && req.method === "DELETE") {
      patient.samples = [];
      patient.events = [];
      return { value: [204], changed: true };
    }

    return { value: [405, { error: "Method not allowed" }] };
  });

  send(res, ...result);
}

function middleware(req, res, next) {
  if (!req.url.startsWith("/api/")) return next();

  handle(req, res).catch((err) => {
    console.error("[patient api]", err);
    send(res, err instanceof SyntaxError ? 400 : 500, { error: err.message });
  });
}

export default function patientApi() {
  return {
    name: "patient-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
