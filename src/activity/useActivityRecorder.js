import { useEffect, useRef } from "react";
import { addEvent, addSample } from "./activityLog";

const SAMPLE_INTERVAL = 1000;
// Motion score that counts as intense, and how long it must last to be logged
const INTENSE_MOTION = 70;
const INTENSE_DURATION = 3000;
// Motion must drop below this before another intense episode is logged
const CALM_MOTION = 35;
// Minutes with less tracking than this are not saved
const MIN_SECONDS_PER_MINUTE = 10;

function newBucket(start) {
  return { start, sum: 0, count: 0, peak: 0, upright: 0, lying: 0 };
}

function flush(patientId, bucket) {
  if (!bucket || bucket.count < MIN_SECONDS_PER_MINUTE) return;

  addSample(patientId, {
    t: bucket.start,
    mins: bucket.count / 60,
    motion: Math.round(bucket.sum / bucket.count),
    peak: bucket.peak,
    posture:
      bucket.upright || bucket.lying
        ? bucket.upright >= bucket.lying
          ? "upright"
          : "lying"
        : null,
  });
}

/**
 * Samples the live pose tracking once a second, saves a summary for each
 * minute to the patient's activity log, and logs sustained intense movement
 * as an event. Records nothing while no patient is selected.
 */
export default function useActivityRecorder(patientId, { status, motion, posture }) {
  const latest = useRef({ status, motion, posture });

  useEffect(() => {
    latest.current = { status, motion, posture };
  }, [status, motion, posture]);

  useEffect(() => {
    if (!patientId) return;

    let bucket = null;
    let intenseSince = null;
    let intenseLogged = false;

    const timer = setInterval(() => {
      const { status, motion, posture } = latest.current;
      if (status !== "tracking") return;

      const now = Date.now();
      const minute = Math.floor(now / 60000) * 60000;
      if (bucket?.start !== minute) {
        flush(patientId, bucket);
        bucket = newBucket(minute);
      }

      bucket.sum += motion;
      bucket.count++;
      bucket.peak = Math.max(bucket.peak, motion);
      if (posture) bucket[posture]++;

      if (motion >= INTENSE_MOTION) {
        intenseSince ??= now;
        if (!intenseLogged && now - intenseSince >= INTENSE_DURATION) {
          addEvent(patientId, "intense", "Intense movement for 3+ seconds");
          intenseLogged = true;
        }
      } else {
        intenseSince = null;
        if (motion < CALM_MOTION) intenseLogged = false;
      }
    }, SAMPLE_INTERVAL);

    return () => {
      clearInterval(timer);
      flush(patientId, bucket);
    };
  }, [patientId]);
}
