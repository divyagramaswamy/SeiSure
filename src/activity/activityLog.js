import { api } from "../profile";

// How many days of history the profile page shows. Older data stays in
// data/patients.json.
const SHOW_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

// Motion score thresholds for each movement level
export const LEVELS = [
  { key: "still", label: "Still", max: 10 },
  { key: "light", label: "Light movement", max: 35 },
  { key: "active", label: "Active movement", max: 70 },
  { key: "intense", label: "Intense movement", max: Infinity },
];

// Event types and whether they count as alarming
export const EVENT_TYPES = {
  seizure: { label: "Possible seizure", alarming: true },
  intense: { label: "Intense movement", alarming: true },
  verifying: { label: "Rejected by sensor fusion", alarming: false },
  falseAlarm: { label: "False alarm", alarming: false },
  call: { label: "Caregiver called", alarming: false },
};

export const emptyLog = { samples: [], events: [] };

export function motionLevel(motion) {
  return LEVELS.find((level) => motion < level.max).key;
}

// The patient's activity from the last SHOW_DAYS days
export async function fetchLog(patientId) {
  const log = await api(`/${patientId}/activity`);
  const cutoff = Date.now() - SHOW_DAYS * DAY;
  return {
    samples: log.samples.filter((s) => s.t >= cutoff),
    events: log.events.filter((e) => e.t >= cutoff),
  };
}

function append(patientId, activity) {
  return api(`/${patientId}/activity`, { method: "POST", body: activity });
}

// Fire-and-forget writes from the monitor; a failed save is logged, not
// shown, so it never interrupts monitoring
function appendInBackground(patientId, activity) {
  append(patientId, activity).catch((err) =>
    console.error("Could not save activity:", err),
  );
}

/**
 * sample: { t, mins, motion, peak, posture }
 *   t       start of the period (ms)
 *   mins    minutes of tracking it covers
 *   motion  average motion score, peak  highest motion score
 *   posture "upright" | "lying" | null
 */
export function addSample(patientId, sample) {
  appendInBackground(patientId, { samples: [sample] });
}

export function addEvent(patientId, type, text, extra = {}) {
  const event = { t: Date.now(), type, text, ...extra };
  appendInBackground(patientId, { events: [event] });
}

export function clearLog(patientId) {
  return api(`/${patientId}/activity`, { method: "DELETE" });
}

export function hasDemoData(log) {
  return log.samples.some((s) => s.demo) || log.events.some((e) => e.demo);
}

// Totals for the whole log: minutes per movement level and posture, and
// event counts by type
export function summarize(log) {
  const levels = Object.fromEntries(LEVELS.map((l) => [l.key, 0]));
  const postures = { upright: 0, lying: 0 };
  let minutes = 0;

  for (const s of log.samples) {
    minutes += s.mins;
    levels[motionLevel(s.motion)] += s.mins;
    if (s.posture) postures[s.posture] += s.mins;
  }

  const events = Object.fromEntries(Object.keys(EVENT_TYPES).map((k) => [k, 0]));
  for (const e of log.events) events[e.type] = (events[e.type] ?? 0) + 1;

  return { minutes, levels, postures, events };
}

// Groups the log into days (newest first), each with an hour-by-hour average
// motion (null for hours with no tracking) and that day's events
export function groupByDay(log) {
  const days = new Map();

  function dayFor(t) {
    const start = new Date(t);
    start.setHours(0, 0, 0, 0);
    const key = start.getTime();
    if (!days.has(key)) {
      days.set(key, {
        start: key,
        minutes: 0,
        hours: Array.from({ length: 24 }, () => ({ total: 0, mins: 0 })),
        events: [],
      });
    }
    return days.get(key);
  }

  for (const s of log.samples) {
    const day = dayFor(s.t);
    const hour = day.hours[new Date(s.t).getHours()];
    hour.total += s.motion * s.mins;
    hour.mins += s.mins;
    day.minutes += s.mins;
  }

  for (const e of log.events) {
    dayFor(e.t).events.push(e);
  }

  return [...days.values()]
    .sort((a, b) => b.start - a.start)
    .map((day) => ({
      ...day,
      hours: day.hours.map((h) => (h.mins ? h.total / h.mins : null)),
      events: day.events.sort((a, b) => b.t - a.t),
    }));
}

// Deterministic pseudo-random numbers so the sample history looks the same
// every time it is loaded
function seededRandom(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

// Adds five days of made-up history, marked demo: true, for presentations
export function addDemoHistory(patientId) {
  const random = seededRandom(42);
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const samples = [];
  for (let d = 4; d >= 0; d--) {
    for (let slot = 0; slot < 144; slot++) {
      const t = today.getTime() - d * DAY + slot * 10 * 60 * 1000;
      if (t > now) break;

      const hour = slot / 6;
      const asleep = hour < 7 || hour >= 23;
      const r = random();
      let motion;
      if (asleep) motion = r < 0.85 ? 2 + r * 6 : 12 + r * 20;
      else if (hour >= 17 && hour < 19) motion = 30 + r * 35;
      else motion = r < 0.3 ? 4 + r * 10 : 12 + r * 25;

      samples.push({
        t,
        mins: 10,
        motion: Math.round(motion),
        peak: Math.round(Math.min(100, motion * 1.8)),
        posture: asleep ? "lying" : r < 0.15 ? "lying" : "upright",
        demo: true,
      });
    }
  }

  const at = (daysAgo, h, m) =>
    today.getTime() - daysAgo * DAY + (h * 60 + m) * 60 * 1000;
  const events = [
    { t: at(4, 3, 12), type: "intense", text: "Intense movement for 6 seconds" },
    { t: at(3, 10, 5), type: "falseAlarm", text: "Alert marked as false alarm" },
    { t: at(2, 2, 47), type: "seizure", text: "Possible seizure detected (vision + watch)" },
    { t: at(2, 2, 48), type: "call", text: "Caregiver called" },
    { t: at(1, 15, 20), type: "verifying", text: "Visual anomaly rejected by sensor fusion" },
    { t: at(0, 4, 10), type: "intense", text: "Intense movement for 4 seconds" },
  ]
    .filter((e) => e.t <= now)
    .map((e) => ({ ...e, demo: true }));

  return append(patientId, { samples, events });
}
