import { useEffect, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

// Must match the installed @mediapipe/tasks-vision version (pinned in package.json)
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL = "/models/pose_landmarker_lite.task";

// Landmark indices: 11-16 shoulders/elbows/wrists, 23-28 hips/knees/ankles.
// MediaPipe's "left" is the person's left.
const MOTION_POINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const MIN_VISIBILITY = 0.5;

const JOINT_LABELS = {
  11: "L Shoulder",
  12: "R Shoulder",
  13: "L Elbow",
  14: "R Elbow",
  15: "L Wrist",
  16: "R Wrist",
  23: "L Hip",
  24: "R Hip",
  25: "L Knee",
  26: "R Knee",
  27: "L Ankle",
  28: "R Ankle",
};

// Smoothing time constant for the motion score, in seconds
const MOTION_SMOOTHING = 0.5;
// Torso lengths per second that map to 1% motion. Rough value, needs tuning
// against real recordings.
const MOTION_SCALE = 50;
// How often the motion score is pushed to React state, in ms
const STATE_INTERVAL = 250;

async function createLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = {
    runningMode: "VIDEO",
    numPoses: 1,
  };

  try {
    return await PoseLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    });
  } catch {
    // Some machines have no usable WebGL, fall back to the CPU
    return PoseLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
    });
  }
}

function visible(point) {
  return point && point.visibility > MIN_VISIBILITY;
}

function toPixels(point, width, height) {
  return { x: point.x * width, y: point.y * height };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Shoulder-midpoint to hip-midpoint length in pixels, used so motion is
// measured relative to body size rather than distance from the camera
function torsoLength(pose, width, height) {
  const [ls, rs, lh, rh] = [11, 12, 23, 24].map((i) =>
    toPixels(pose[i], width, height),
  );
  const shoulders = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };

  if (visible(pose[23]) && visible(pose[24])) {
    const hips = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    return distance(shoulders, hips);
  }

  // Hips out of frame (e.g. sitting close to the camera)
  return distance(ls, rs) * 1.5;
}

// "upright" when the torso is within 45° of vertical, "lying" otherwise.
// null when the shoulders or hips are out of view.
function estimatePosture(pose, width, height) {
  if (![11, 12, 23, 24].every((i) => visible(pose[i]))) return null;

  const [ls, rs, lh, rh] = [11, 12, 23, 24].map((i) =>
    toPixels(pose[i], width, height),
  );
  const dx = (ls.x + rs.x - lh.x - rh.x) / 2;
  const dy = (ls.y + rs.y - lh.y - rh.y) / 2;

  return Math.abs(dy) >= Math.abs(dx) ? "upright" : "lying";
}

// Stick figure and joint names. The skeleton is mirrored to match the
// mirrored video; labels are placed at the mirrored x so the text reads
// normally.
function drawPose(ctx, drawingUtils, pose, width, height) {
  ctx.clearRect(0, 0, width, height);
  if (!pose) return;

  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);

  drawingUtils.drawConnectors(pose, PoseLandmarker.POSE_CONNECTIONS, {
    color: "#31d6a6",
    lineWidth: 4,
  });
  drawingUtils.drawLandmarks(pose, {
    color: "#8fffe0",
    fillColor: "#31d6a6",
    radius: 4,
  });

  ctx.restore();

  ctx.font = "14px Inter, sans-serif";
  ctx.fillStyle = "#baffec";

  for (const [index, label] of Object.entries(JOINT_LABELS)) {
    const point = pose[index];
    if (!visible(point)) continue;
    ctx.fillText(label, (1 - point.x) * width + 7, point.y * height - 7);
  }
}

// Mean movement of the body landmarks since the last frame, in torso
// lengths per second
function measureSpeed(pose, prevPose, dt, width, height) {
  const scale = torsoLength(pose, width, height);
  if (!scale || dt <= 0) return null;

  let total = 0;
  let count = 0;

  for (const i of MOTION_POINTS) {
    if (!visible(pose[i]) || !visible(prevPose[i])) continue;
    total += distance(
      toPixels(pose[i], width, height),
      toPixels(prevPose[i], width, height),
    );
    count++;
  }

  return count ? total / count / scale / dt : null;
}

/**
 * Runs pose estimation on the camera video and draws a face-free skeleton
 * onto the canvas.
 *
 * status: "loading" | "searching" (no person in view) | "tracking" | "error"
 * motion: 0-100 smoothed body movement score
 * posture: "upright" | "lying" | null (unknown)
 */
export default function usePoseTracking(videoRef, canvasRef) {
  const [status, setStatus] = useState("loading");
  const [motion, setMotion] = useState(0);
  const [posture, setPosture] = useState(null);

  useEffect(() => {
    let landmarker;
    let frame;
    let cancelled = false;

    let drawingUtils = null;
    let lastVideoTime = -1;
    let prevPose = null;
    let prevTime = 0;
    let smoothed = 0;
    let lastStateUpdate = 0;
    let currentStatus = "loading";

    function updateStatus(next) {
      if (next !== currentStatus) {
        currentStatus = next;
        setStatus(next);
      }
    }

    function loop() {
      frame = requestAnimationFrame(loop);

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      if (video.currentTime === lastVideoTime) return;
      lastVideoTime = video.currentTime;

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      drawingUtils ??= new DrawingUtils(canvas.getContext("2d"));

      const now = performance.now();
      const pose = landmarker.detectForVideo(video, now).landmarks[0];

      drawPose(canvas.getContext("2d"), drawingUtils, pose, width, height);

      const tracked = pose && visible(pose[11]) && visible(pose[12]);
      updateStatus(tracked ? "tracking" : "searching");

      let speed = 0;
      if (tracked && prevPose) {
        speed =
          measureSpeed(pose, prevPose, (now - prevTime) / 1000, width, height) ??
          0;
      }

      const dt = prevTime ? (now - prevTime) / 1000 : 0;
      smoothed += (speed - smoothed) * (1 - Math.exp(-dt / MOTION_SMOOTHING));

      prevPose = tracked ? pose : null;
      prevTime = now;

      if (now - lastStateUpdate > STATE_INTERVAL) {
        lastStateUpdate = now;
        setMotion(Math.min(100, Math.round(smoothed * MOTION_SCALE)));
        setPosture(tracked ? estimatePosture(pose, width, height) : null);
      }
    }

    createLandmarker()
      .then((result) => {
        if (cancelled) {
          result.close();
          return;
        }
        landmarker = result;
        updateStatus("searching");
        loop();
      })
      .catch((err) => {
        console.error("Pose model failed to load:", err);
        if (!cancelled) updateStatus("error");
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      landmarker?.close();
    };
  }, [videoRef, canvasRef]);

  return { status, motion, posture };
}
