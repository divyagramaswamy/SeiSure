import { useEffect, useRef } from "react";
import {
  FilesetResolver,
  PoseLandmarker,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

const TRACKED_JOINTS = [
  11, 12, // shoulders
  13, 14, // elbows
  15, 16, // wrists
  23, 24, // hips
  25, 26, // knees
  27, 28, // ankles
];

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

export default function PoseCamera({ privacy, onVisionScore }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const landmarkerRef = useRef(null);
  const animationRef = useRef(null);

  const previousPoseRef = useRef(null);
  const smoothedScoreRef = useRef(0);

  const lastVideoTimeRef = useRef(-1);
  const lastScoreUpdateRef = useRef(0);

  useEffect(() => {
    let stream = null;
    let cancelled = false;

    async function initialize() {
      try {
        // 1. Start webcam
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        const video = videoRef.current;

        if (!video) return;

        video.srcObject = stream;
        await video.play();

        // 2. Load MediaPipe
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
        );

        // 3. Load pose model
        const poseLandmarker =
          await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
              delegate: "GPU",
            },

            runningMode: "VIDEO",
            numPoses: 1,

            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });

        landmarkerRef.current = poseLandmarker;

        predict();
      } catch (error) {
        console.error("Pose initialization failed:", error);
      }
    }

    function predict() {
      if (cancelled) return;

      const video = videoRef.current;
      const poseLandmarker = landmarkerRef.current;

      if (
        video &&
        poseLandmarker &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTimeRef.current
      ) {
        lastVideoTimeRef.current = video.currentTime;

        const results = poseLandmarker.detectForVideo(
          video,
          performance.now()
        );

        drawSkeleton(results);
        calculateMotion(results);
      }

      animationRef.current =
        requestAnimationFrame(predict);
    }

    function drawSkeleton(results) {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");

      // Privacy background
      ctx.fillStyle = "#03090d";
      ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      if (!results.landmarks?.length) return;

      const landmarks = results.landmarks[0];

      // Draw mirrored skeleton
      ctx.save();

      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);

      const drawingUtils = new DrawingUtils(ctx);

      drawingUtils.drawConnectors(
        landmarks,
        PoseLandmarker.POSE_CONNECTIONS,
        {
          color: "#31d6a6",
          lineWidth: 4,
        }
      );

      drawingUtils.drawLandmarks(landmarks, {
        color: "#8fffe0",
        fillColor: "#31d6a6",
        radius: 4,
      });

      ctx.restore();

      // Draw readable labels
      ctx.font = "14px Inter, sans-serif";
      ctx.fillStyle = "#baffec";

      for (const [indexString, label] of Object.entries(
        JOINT_LABELS
      )) {
        const index = Number(indexString);
        const landmark = landmarks[index];

        if (!landmark) continue;
        if ((landmark.visibility ?? 1) < 0.5) continue;

        const x =
          (1 - landmark.x) * canvas.width;

        const y =
          landmark.y * canvas.height;

        ctx.fillText(label, x + 7, y - 7);
      }
    }

    function calculateMotion(results) {
      if (!results.landmarks?.length) {
        previousPoseRef.current = null;
        return;
      }

      const landmarks = results.landmarks[0];

      /*
        Make coordinates body-relative so walking toward
        the camera does not automatically look like
        extreme limb movement.
      */

      const leftHip = landmarks[23];
      const rightHip = landmarks[24];

      const centerX =
        (leftHip.x + rightHip.x) / 2;

      const centerY =
        (leftHip.y + rightHip.y) / 2;

      const leftShoulder = landmarks[11];
      const rightShoulder = landmarks[12];

      const bodyScale = Math.max(
        0.08,
        Math.hypot(
          leftShoulder.x - rightShoulder.x,
          leftShoulder.y - rightShoulder.y
        )
      );

      const currentPose = TRACKED_JOINTS.map(
        (index) => {
          const point = landmarks[index];

          return {
            x: (point.x - centerX) / bodyScale,
            y: (point.y - centerY) / bodyScale,
            visibility: point.visibility ?? 1,
          };
        }
      );

      const previousPose =
        previousPoseRef.current;

      if (previousPose) {
        let totalMovement = 0;
        let validPoints = 0;

        for (
          let i = 0;
          i < currentPose.length;
          i++
        ) {
          const current = currentPose[i];
          const previous = previousPose[i];

          if (
            current.visibility < 0.5 ||
            previous.visibility < 0.5
          ) {
            continue;
          }

          const distance = Math.hypot(
            current.x - previous.x,
            current.y - previous.y
          );

          totalMovement += distance;
          validPoints++;
        }

        if (validPoints > 0) {
          const averageMovement =
            totalMovement / validPoints;

          const rawScore = Math.min(
            100,
            averageMovement * 300
          );

          // Smooth noisy frame-to-frame movement
          smoothedScoreRef.current =
            smoothedScoreRef.current * 0.7 +
            rawScore * 0.3;

          // Avoid updating React 60 times/sec
          const now = performance.now();

          if (
            now - lastScoreUpdateRef.current >
            100
          ) {
            onVisionScore(
              Math.round(
                smoothedScoreRef.current
              )
            );

            lastScoreUpdateRef.current = now;
          }
        }
      }

      previousPoseRef.current = currentPose;
    }

    initialize();

    return () => {
      cancelled = true;

      cancelAnimationFrame(
        animationRef.current
      );

      if (stream) {
        stream
          .getTracks()
          .forEach((track) => track.stop());
      }

      landmarkerRef.current?.close();
    };
  }, [onVisionScore]);

  return (
    <div className="poseCamera">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`poseVideo ${
          privacy ? "poseHidden" : ""
        }`}
      />

      <canvas
        ref={canvasRef}
        className={`poseCanvas ${
          privacy ? "" : "poseHidden"
        }`}
      />

      {privacy && (
        <div className="privacyLabel">
          POSE-ONLY PRIVACY VIEW
        </div>
      )}
    </div>
  );
}