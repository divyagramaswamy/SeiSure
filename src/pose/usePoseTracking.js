import {
  useEffect,
  useState,
} from "react";

import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

const MODEL_URL =
  "/models/pose_landmarker_lite.task";

const MIN_VISIBILITY = 0.5;

const MOTION_POINTS = [
  11, 12, 13, 14, 15, 16,
  23, 24, 25, 26, 27, 28,
];

const REGION_POINTS = {
  leftArm: [11, 13, 15],
  rightArm: [12, 14, 16],

  leftLeg: [23, 25, 27],
  rightLeg: [24, 26, 28],

  torso: [11, 12, 23, 24],
};

const EMPTY_REGIONS = {
  leftArm: 0,
  rightArm: 0,
  leftLeg: 0,
  rightLeg: 0,
  torso: 0,
};

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

const MOTION_SMOOTHING = 0.5;
const MOTION_SCALE = 50;
const STATE_INTERVAL = 250;

async function createLandmarker() {
  const vision =
    await FilesetResolver.forVisionTasks(
      WASM_URL,
    );

  const options = {
    runningMode: "VIDEO",
    numPoses: 1,
  };

  try {
    return await PoseLandmarker.createFromOptions(
      vision,
      {
        ...options,

        baseOptions: {
          modelAssetPath:
            MODEL_URL,

          delegate: "GPU",
        },
      },
    );
  } catch {
    return PoseLandmarker.createFromOptions(
      vision,
      {
        ...options,

        baseOptions: {
          modelAssetPath:
            MODEL_URL,

          delegate: "CPU",
        },
      },
    );
  }
}

function visible(point) {
  return (
    point &&
    point.visibility >
      MIN_VISIBILITY
  );
}

function toPixels(
  point,
  width,
  height,
) {
  return {
    x: point.x * width,
    y: point.y * height,
  };
}

function distance(a, b) {
  return Math.hypot(
    a.x - b.x,
    a.y - b.y,
  );
}

function torsoLength(
  pose,
  width,
  height,
) {
  if (
    !visible(pose[11]) ||
    !visible(pose[12])
  ) {
    return null;
  }

  const ls = toPixels(
    pose[11],
    width,
    height,
  );

  const rs = toPixels(
    pose[12],
    width,
    height,
  );

  if (
    visible(pose[23]) &&
    visible(pose[24])
  ) {
    const lh = toPixels(
      pose[23],
      width,
      height,
    );

    const rh = toPixels(
      pose[24],
      width,
      height,
    );

    const shoulders = {
      x: (ls.x + rs.x) / 2,
      y: (ls.y + rs.y) / 2,
    };

    const hips = {
      x: (lh.x + rh.x) / 2,
      y: (lh.y + rh.y) / 2,
    };

    return distance(
      shoulders,
      hips,
    );
  }

  return distance(ls, rs) * 1.5;
}

function estimatePosture(
  pose,
  width,
  height,
) {
  if (
    ![11, 12, 23, 24].every(
      (i) => visible(pose[i]),
    )
  ) {
    return null;
  }

  const [ls, rs, lh, rh] = [
    11, 12, 23, 24,
  ].map((i) =>
    toPixels(
      pose[i],
      width,
      height,
    ),
  );

  const dx =
    (ls.x +
      rs.x -
      lh.x -
      rh.x) /
    2;

  const dy =
    (ls.y +
      rs.y -
      lh.y -
      rh.y) /
    2;

  return Math.abs(dy) >=
    Math.abs(dx)
    ? "upright"
    : "lying";
}

function drawPose(
  ctx,
  drawingUtils,
  pose,
  width,
  height,
) {
  ctx.clearRect(
    0,
    0,
    width,
    height,
  );

  if (!pose) return;

  ctx.save();

  ctx.translate(width, 0);
  ctx.scale(-1, 1);

  drawingUtils.drawConnectors(
    pose,
    PoseLandmarker.POSE_CONNECTIONS,
    {
      color: "#31d6a6",
      lineWidth: 4,
    },
  );

  drawingUtils.drawLandmarks(
    pose,
    {
      color: "#8fffe0",
      fillColor: "#31d6a6",
      radius: 4,
    },
  );

  ctx.restore();

  ctx.font =
    "14px Inter, sans-serif";

  ctx.fillStyle = "#baffec";

  for (const [
    index,
    label,
  ] of Object.entries(
    JOINT_LABELS,
  )) {
    const point = pose[index];

    if (!visible(point)) {
      continue;
    }

    ctx.fillText(
      label,
      (1 - point.x) *
        width +
        7,
      point.y * height - 7,
    );
  }
}

function measurePointSet(
  indices,
  pose,
  prevPose,
  dt,
  width,
  height,
  scale,
) {
  if (
    !scale ||
    !prevPose ||
    dt <= 0
  ) {
    return 0;
  }

  let total = 0;
  let count = 0;

  for (const i of indices) {
    if (
      !visible(pose[i]) ||
      !visible(prevPose[i])
    ) {
      continue;
    }

    total += distance(
      toPixels(
        pose[i],
        width,
        height,
      ),

      toPixels(
        prevPose[i],
        width,
        height,
      ),
    );

    count++;
  }

  if (!count) return 0;

  return (
    total /
    count /
    scale /
    dt
  );
}

function scoreSpeed(speed) {
  return Math.min(
    100,
    Math.round(
      speed * MOTION_SCALE,
    ),
  );
}

export default function usePoseTracking(
  videoRef,
  canvasRef,
) {
  const [status, setStatus] =
    useState("loading");

  const [motion, setMotion] =
    useState(0);

  const [posture, setPosture] =
    useState(null);

  const [
    regions,
    setRegions,
  ] = useState(EMPTY_REGIONS);

  useEffect(() => {
    let landmarker;
    let frame;

    let cancelled = false;

    let drawingUtils = null;
    let lastVideoTime = -1;

    let prevPose = null;
    let prevTime = 0;

    let smoothed = 0;

    let regionSmoothed = {
      ...EMPTY_REGIONS,
    };

    let lastStateUpdate = 0;

    let currentStatus =
      "loading";

    function updateStatus(next) {
      if (
        next !== currentStatus
      ) {
        currentStatus = next;
        setStatus(next);
      }
    }

    function loop() {
      frame =
        requestAnimationFrame(loop);

      const video =
        videoRef.current;

      const canvas =
        canvasRef.current;

      if (
        !video ||
        !canvas ||
        video.readyState < 2
      ) {
        return;
      }

      if (
        video.currentTime ===
        lastVideoTime
      ) {
        return;
      }

      lastVideoTime =
        video.currentTime;

      const width =
        video.videoWidth;

      const height =
        video.videoHeight;

      if (
        canvas.width !== width ||
        canvas.height !== height
      ) {
        canvas.width = width;
        canvas.height = height;
      }

      drawingUtils ??=
        new DrawingUtils(
          canvas.getContext(
            "2d",
          ),
        );

      const now =
        performance.now();

      const pose =
        landmarker.detectForVideo(
          video,
          now,
        ).landmarks[0];

      drawPose(
        canvas.getContext("2d"),
        drawingUtils,
        pose,
        width,
        height,
      );

      const tracked =
        pose &&
        visible(pose[11]) &&
        visible(pose[12]);

      updateStatus(
        tracked
          ? "tracking"
          : "searching",
      );

      let speed = 0;

      const regionSpeeds = {
        ...EMPTY_REGIONS,
      };

      const dt = prevTime
        ? (now - prevTime) /
          1000
        : 0;

      if (
        tracked &&
        prevPose &&
        dt > 0
      ) {
        const scale =
          torsoLength(
            pose,
            width,
            height,
          );

        speed =
          measurePointSet(
            MOTION_POINTS,
            pose,
            prevPose,
            dt,
            width,
            height,
            scale,
          );

        for (const [
          region,
          points,
        ] of Object.entries(
          REGION_POINTS,
        )) {
          regionSpeeds[region] =
            measurePointSet(
              points,
              pose,
              prevPose,
              dt,
              width,
              height,
              scale,
            );
        }
      }

      smoothed +=
        (speed - smoothed) *
        (1 -
          Math.exp(
            -dt /
              MOTION_SMOOTHING,
          ));

      for (const region of Object.keys(
        regionSmoothed,
      )) {
        regionSmoothed[region] +=
          (regionSpeeds[region] -
            regionSmoothed[
              region
            ]) *
          (1 -
            Math.exp(
              -dt /
                MOTION_SMOOTHING,
            ));
      }

      prevPose = tracked
        ? pose
        : null;

      prevTime = now;

      if (
        now -
          lastStateUpdate >
        STATE_INTERVAL
      ) {
        lastStateUpdate = now;

        setMotion(
          scoreSpeed(smoothed),
        );

        setRegions(
          Object.fromEntries(
            Object.entries(
              regionSmoothed,
            ).map(
              ([
                region,
                value,
              ]) => [
                region,
                scoreSpeed(
                  value,
                ),
              ],
            ),
          ),
        );

        setPosture(
          tracked
            ? estimatePosture(
                pose,
                width,
                height,
              )
            : null,
        );
      }
    }

    createLandmarker()
      .then((result) => {
        if (cancelled) {
          result.close();
          return;
        }

        landmarker = result;

        updateStatus(
          "searching",
        );

        loop();
      })
      .catch((err) => {
        console.error(
          "Pose model failed to load:",
          err,
        );

        if (!cancelled) {
          updateStatus(
            "error",
          );
        }
      });

    return () => {
      cancelled = true;

      cancelAnimationFrame(
        frame,
      );

      landmarker?.close();
    };
  }, [videoRef, canvasRef]);

  return {
    status,
    motion,
    posture,
    regions,
  };
}
