import { useEffect, useRef, useState } from "react";
import usePoseTracking from "../pose/usePoseTracking";
import useActivityRecorder from "../activity/useActivityRecorder";
import { addEvent } from "../activity/activityLog";

const DEFAULT_VISION_THRESHOLD = 65;
const DEFAULT_HR_THRESHOLD = 120;
const DEFAULT_DURATION_SECONDS = 4;

export default function Dashboard({ patient }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [privacy, setPrivacy] = useState(false);
  const [cameraError, setCameraError] = useState(false);

  // Detection settings
  const [visionThreshold, setVisionThreshold] = useState(
    DEFAULT_VISION_THRESHOLD,
  );
  const [heartRateThreshold, setHeartRateThreshold] = useState(
    DEFAULT_HR_THRESHOLD,
  );
  const [durationThreshold, setDurationThreshold] = useState(
    DEFAULT_DURATION_SECONDS,
  );

  // Sensor source
  const [demoMode, setDemoMode] = useState(false);

  // Real HealthKit value received through our backend
  const [liveHeartRate, setLiveHeartRate] = useState(null);
  const [heartRateTimestamp, setHeartRateTimestamp] = useState(null);
  const [sensorConnected, setSensorConnected] = useState(false);

  // Only used when Cmd+D enables demo mode
  const [demoHeartRate, setDemoHeartRate] = useState(76);

  // Detection timing
  const [holdProgress, setHoldProgress] = useState(0);
  const [eventDetected, setEventDetected] = useState(false);

  const candidateStartRef = useRef(null);
  const eventLoggedRef = useRef(false);

  const pose = usePoseTracking(videoRef, canvasRef);

  useActivityRecorder(patient?.id, pose);

  const heartRate = demoMode ? demoHeartRate : liveHeartRate;

  const visionAboveThreshold =
    pose.status === "tracking" &&
    pose.motion >= visionThreshold;

  const heartRateAboveThreshold =
    heartRate !== null &&
    heartRate >= heartRateThreshold;

  const candidate =
    visionAboveThreshold &&
    heartRateAboveThreshold;

  /*
   * -----------------------------------------
   * CAMERA
   * -----------------------------------------
   */
  useEffect(() => {
    let stream;
    let cancelled = false;

    async function startCamera() {
      try {
        stream =
          await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });

        if (cancelled) {
          stream
            .getTracks()
            .forEach((track) => track.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera unavailable:", err);

        if (!cancelled) {
          setCameraError(true);
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;

      stream
        ?.getTracks()
        .forEach((track) => track.stop());
    };
  }, []);

  /*
   * -----------------------------------------
   * CMD+D / CTRL+D DEMO MODE
   * -----------------------------------------
   */
  useEffect(() => {
    function handleShortcut(event) {
      const target = event.target;

      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

      if (isTyping) return;

      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "d"
      ) {
        event.preventDefault();

        setDemoMode((current) => !current);
      }
    }

    window.addEventListener("keydown", handleShortcut);

    return () => {
      window.removeEventListener(
        "keydown",
        handleShortcut,
      );
    };
  }, []);

  /*
   * -----------------------------------------
   * POLL LATEST HEALTHKIT HEART RATE
   *
   * The iPhone bridge will POST samples to:
   * POST /api/heart-rate
   *
   * Dashboard reads the most recent sample here.
   * -----------------------------------------
   */
  useEffect(() => {
    let cancelled = false;

    async function loadHeartRate() {
      if (demoMode) return;

      try {
        const response = await fetch(
          "/api/heart-rate",
        );

        if (!response.ok) {
          throw new Error(
            `Heart-rate API returned ${response.status}`,
          );
        }

        const result = await response.json();

        if (cancelled) return;

        if (result.heartRate !== null) {
          setLiveHeartRate(result.heartRate);
          setHeartRateTimestamp(result.timestamp);
          setSensorConnected(true);
        } else {
          setSensorConnected(false);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn(
            "HealthKit heart rate unavailable:",
            error,
          );

          setSensorConnected(false);
        }
      }
    }

    loadHeartRate();

    const interval = setInterval(
      loadHeartRate,
      2000,
    );

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [demoMode]);

  /*
   * -----------------------------------------
   * MULTIMODAL THRESHOLD DETECTOR
   *
   * Both signals must remain above threshold
   * for durationThreshold seconds.
   * -----------------------------------------
   */
  useEffect(() => {
    if (!candidate) {
      candidateStartRef.current = null;

      setHoldProgress(0);
      setEventDetected(false);

      eventLoggedRef.current = false;

      return;
    }

    if (candidateStartRef.current === null) {
      candidateStartRef.current = Date.now();
    }

    const interval = setInterval(() => {
      const elapsed =
        (Date.now() -
          candidateStartRef.current) /
        1000;

      const progress = Math.min(
        100,
        (elapsed / durationThreshold) * 100,
      );

      setHoldProgress(progress);

      if (
        elapsed >= durationThreshold &&
        !eventLoggedRef.current
      ) {
        setEventDetected(true);

        eventLoggedRef.current = true;

        if (patient) {
          addEvent(
            patient.id,
            "seizure",
            "Possible seizure detected: vision and heart-rate thresholds exceeded",
            {
              demo: demoMode,
              visionMotion: pose.motion,
              heartRate,
              visionThreshold,
              heartRateThreshold,
              requiredDuration:
                durationThreshold,
            },
          );
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [
    candidate,
    durationThreshold,
    patient,
    demoMode,
    pose.motion,
    heartRate,
    visionThreshold,
    heartRateThreshold,
  ]);

  function markFalseAlarm() {
    if (patient) {
      addEvent(
        patient.id,
        "falseAlarm",
        "Alert marked as false alarm",
        {
          demo: demoMode,
        },
      );
    }

    candidateStartRef.current = null;
    eventLoggedRef.current = false;

    setHoldProgress(0);
    setEventDetected(false);

    if (demoMode) {
      setDemoHeartRate(76);
    }
  }

  /*
   * Confidence is intentionally simple and
   * interpretable for the hackathon:
   *
   * 50% from visual motion
   * 50% from heart rate
   */
  const visionConfidence = clamp(
    (pose.motion / visionThreshold) * 50,
    0,
    50,
  );

  const heartConfidence =
    heartRate === null
      ? 0
      : clamp(
          (heartRate /
            heartRateThreshold) *
            50,
          0,
          50,
        );

  const combinedConfidence = Math.round(
    visionConfidence + heartConfidence,
  );

  let statusLabel = "NORMAL";
  let statusDescription =
    "Signals are below the configured detection thresholds.";

  if (candidate && !eventDetected) {
    statusLabel = "VERIFYING";

    statusDescription = `Both signals are elevated. Verifying for ${durationThreshold} seconds before alerting.`;
  }

  if (eventDetected) {
    statusLabel = "POSSIBLE SEIZURE";

    statusDescription =
      "Vision and heart-rate thresholds remained elevated long enough to confirm the event.";
  }

  return (
    <main>
      {/* SENSOR MODE BAR */}
      <div
        className="card"
        style={styles.modeBar}
      >
        <div style={styles.modeLeft}>
          <span
            style={{
              ...styles.modeDot,
              background: demoMode
                ? "#f4b860"
                : sensorConnected
                  ? "#31d6a6"
                  : "#78909b",
              boxShadow:
                demoMode || sensorConnected
                  ? `0 0 10px ${
                      demoMode
                        ? "#f4b860"
                        : "#31d6a6"
                    }`
                  : "none",
            }}
          />

          <div>
            <strong style={styles.modeTitle}>
              {demoMode
                ? "DEMO SENSOR STREAM"
                : "LIVE HEALTHKIT"}
            </strong>

            <div style={styles.modeSubtitle}>
              {demoMode
                ? "Heart rate is simulated · vision remains live"
                : sensorConnected
                  ? `Latest Apple Health sample ${formatAge(
                      heartRateTimestamp,
                    )}`
                  : "Waiting for Apple Health heart-rate sample"}
            </div>
          </div>
        </div>

        <span style={styles.shortcut}>
          ⌘D / Ctrl+D
        </span>
      </div>

      {/* ONLY APPEARS AFTER SECRET DEMO MODE IS ENABLED */}
      {demoMode && (
        <div
          className="demoControls"
          style={{
            marginTop: 12,
          }}
        >
          <span>Demo heart rate:</span>

          <button
            className={
              demoHeartRate === 76
                ? "selected"
                : ""
            }
            onClick={() =>
              setDemoHeartRate(76)
            }
          >
            Baseline · 76 bpm
          </button>

          <button
            className={
              demoHeartRate === 138
                ? "selected dangerButton"
                : ""
            }
            onClick={() =>
              setDemoHeartRate(138)
            }
          >
            Elevated · 138 bpm
          </button>
        </div>
      )}

      {/* ALERT */}
      {eventDetected && (
        <div className="alertBanner">
          <div>
            <strong>
              ⚠ Possible seizure detected
            </strong>

            <p>
              Vision and heart-rate signals
              exceeded their thresholds for{" "}
              {durationThreshold} seconds.
            </p>
          </div>

          <div className="alertActions">
            <a
              href="#/call"
              className="button"
            >
              Call Caregiver
            </a>

            <button
              className="secondary"
              onClick={markFalseAlarm}
            >
              False Alarm
            </button>
          </div>
        </div>
      )}

      <section className="grid">
        {/* CAMERA */}
        <div className="card cameraCard">
          <div className="cardHeader">
            <div>
              <h2>Live Vision</h2>

              <p>
                Computer vision movement
                analysis
              </p>
            </div>

            <div className="toggle">
              <button
                className={
                  !privacy ? "active" : ""
                }
                onClick={() =>
                  setPrivacy(false)
                }
              >
                Raw
              </button>

              <button
                className={
                  privacy ? "active" : ""
                }
                onClick={() =>
                  setPrivacy(true)
                }
              >
                Privacy
              </button>
            </div>
          </div>

          <div className="videoArea">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={
                privacy ? "hiddenVideo" : ""
              }
            />

            <canvas
              ref={canvasRef}
              className={`poseCanvas ${
                privacy ? "" : "hiddenCanvas"
              }`}
            />

            {privacy && (
              <div className="privacyCaption">
                Pose-only view · raw imagery
                hidden
              </div>
            )}

            {(cameraError ||
              pose.status !== "tracking") && (
              <div className="poseMessage">
                {poseMessage(
                  cameraError,
                  pose.status,
                )}
              </div>
            )}

            <div
              className={`visionBadge ${
                !cameraError &&
                pose.status === "tracking"
                  ? ""
                  : "idle"
              }`}
            >
              <span />

              {!cameraError &&
              pose.status === "tracking"
                ? `Tracking · motion ${pose.motion}%`
                : "Not tracking"}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="rightColumn">
          <div
            className={`card statusCard ${
              eventDetected
                ? "emergency"
                : ""
            }`}
          >
            <span className="eyebrow">
              CURRENT STATUS
            </span>

            <div className="statusRow">
              <div className="statusDot" />
              <h2>{statusLabel}</h2>
            </div>

            <p>{statusDescription}</p>

            {candidate &&
              !eventDetected && (
                <div
                  style={styles.verifyTrack}
                >
                  <div
                    style={{
                      ...styles.verifyFill,
                      width: `${holdProgress}%`,
                    }}
                  />
                </div>
              )}
          </div>

          {/* LIVE SIGNALS */}
          <div className="card">
            <h2>Live Signals</h2>

            <p>
              Apple Health + computer vision
            </p>

            <Metric
              label="Heart Rate"
              value={
                heartRate === null
                  ? "Waiting…"
                  : `${heartRate} bpm`
              }
              percent={
                heartRate === null
                  ? 0
                  : Math.min(
                      (heartRate / 180) * 100,
                      100,
                    )
              }
              passed={
                heartRateAboveThreshold
              }
            />

            <Metric
              label="Vision Motion"
              value={`${pose.motion}%`}
              percent={pose.motion}
              passed={
                visionAboveThreshold
              }
            />

            <div
              style={styles.freshness}
            >
              {demoMode
                ? "Simulated wearable input"
                : heartRateTimestamp
                  ? `HealthKit updated ${formatAge(
                      heartRateTimestamp,
                    )}`
                  : "No HealthKit sample received yet"}
            </div>
          </div>

          {/* DETECTION SETTINGS */}
          <div className="card">
            <h2>Detection Settings</h2>

            <p>
              Adjustable multimodal thresholds
            </p>

            <ThresholdControl
              label="Vision motion"
              value={visionThreshold}
              setValue={setVisionThreshold}
              min={5}
              max={100}
              step={5}
              unit="%"
              liveValue={pose.motion}
            />

            <ThresholdControl
              label="Heart rate"
              value={heartRateThreshold}
              setValue={setHeartRateThreshold}
              min={60}
              max={200}
              step={5}
              unit=" bpm"
              liveValue={heartRate}
            />

            <ThresholdControl
              label="Required duration"
              value={durationThreshold}
              setValue={setDurationThreshold}
              min={1}
              max={10}
              step={1}
              unit=" sec"
            />

            <div
              style={styles.logicSummary}
            >
              <div>
                <ThresholdState
                  passed={
                    visionAboveThreshold
                  }
                  label={`Vision ≥ ${visionThreshold}%`}
                />

                <ThresholdState
                  passed={
                    heartRateAboveThreshold
                  }
                  label={`HR ≥ ${heartRateThreshold} bpm`}
                />
              </div>

              <strong>
                BOTH for {durationThreshold}s
                → ALERT
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* BOTTOM */}
      <section className="bottomGrid">
        <div className="card">
          <div className="riskHeader">
            <div>
              <h2>
                Multimodal Event Confidence
              </h2>

              <p>
                Interpretable vision +
                physiological sensor fusion
              </p>
            </div>

            <div
              className={
                eventDetected
                  ? "risk dangerText"
                  : "risk"
              }
            >
              {combinedConfidence}%
            </div>
          </div>

          <div className="riskTrack">
            <div
              className={`riskFill ${
                eventDetected
                  ? "dangerFill"
                  : ""
              }`}
              style={{
                width: `${combinedConfidence}%`,
              }}
            />
          </div>

          <div className="signalBoxes">
            <Signal
              label="Vision Motion"
              value={`${pose.motion}%`}
              passed={
                visionAboveThreshold
              }
            />

            <Signal
              label="Heart Rate"
              value={
                heartRate === null
                  ? "Waiting"
                  : `${heartRate} bpm`
              }
              passed={
                heartRateAboveThreshold
              }
            />

            <Signal
              label="Vision Threshold"
              value={`${visionThreshold}%`}
            />

            <Signal
              label="HR Threshold"
              value={`${heartRateThreshold} bpm`}
            />
          </div>
        </div>

        <div className="card">
          <h2>Detection Logic</h2>

          <p>
            Current decision state
          </p>

          <Timeline
            time="Vision"
            text={`${pose.motion}% ${
              visionAboveThreshold
                ? "✓ above threshold"
                : "below threshold"
            }`}
            active={
              visionAboveThreshold
            }
          />

          <Timeline
            time="Heart"
            text={
              heartRate === null
                ? "Waiting for HealthKit"
                : `${heartRate} bpm ${
                    heartRateAboveThreshold
                      ? "✓ above threshold"
                      : "below threshold"
                  }`
            }
            active={
              heartRateAboveThreshold
            }
          />

          {candidate &&
            !eventDetected && (
              <Timeline
                time="Now"
                text={`Verifying multimodal event (${Math.round(
                  holdProgress,
                )}%)`}
                active
              />
            )}

          {eventDetected && (
            <Timeline
              time="Now"
              text="Multimodal event confirmed"
              danger
            />
          )}

          {!candidate &&
            !eventDetected && (
              <Timeline
                time="Now"
                text="No confirmed event"
                active
              />
            )}
        </div>
      </section>
    </main>
  );
}

function poseMessage(cameraError, status) {
  if (cameraError) {
    return "Camera unavailable. Check browser permissions.";
  }

  if (status === "loading") {
    return "Loading pose model…";
  }

  if (status === "error") {
    return "Pose model failed to load.";
  }

  return "No person in view";
}

function Metric({
  label,
  value,
  percent,
  passed,
}) {
  return (
    <div className="metric">
      <div className="metricRow">
        <span>{label}</span>

        <strong
          style={{
            color: passed
              ? "#f4b860"
              : undefined,
          }}
        >
          {value}
        </strong>
      </div>

      <div className="smallTrack">
        <div
          style={{
            width: `${clamp(
              percent,
              0,
              100,
            )}%`,
          }}
        />
      </div>
    </div>
  );
}

function Signal({
  label,
  value,
  passed = false,
}) {
  return (
    <div
      className="signalBox"
      style={
        passed
          ? {
              borderColor:
                "rgba(244,184,96,.65)",
            }
          : undefined
      }
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Timeline({
  time,
  text,
  active,
  danger,
}) {
  return (
    <div className="timeline">
      <div
        className={`timelineDot ${
          active ? "activeDot" : ""
        } ${
          danger ? "dangerDot" : ""
        }`}
      />

      <div>
        <span>{time}</span>
        <strong>{text}</strong>
      </div>
    </div>
  );
}

function ThresholdControl({
  label,
  value,
  setValue,
  min,
  max,
  step,
  unit,
  liveValue,
}) {
  function update(next) {
    setValue(
      clamp(
        Number(next),
        min,
        max,
      ),
    );
  }

  return (
    <div style={styles.threshold}>
      <div style={styles.thresholdHeader}>
        <span>{label}</span>

        <strong>
          {value}
          {unit}
        </strong>
      </div>

      {liveValue !== undefined && (
        <div style={styles.currentReading}>
          Current:{" "}
          {liveValue === null
            ? "waiting"
            : `${liveValue}${unit}`}
        </div>
      )}

      <div style={styles.thresholdControls}>
        <button
          type="button"
          style={styles.adjustButton}
          onClick={() =>
            update(value - step)
          }
        >
          −
        </button>

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) =>
            update(event.target.value)
          }
          style={{
            flex: 1,
            accentColor: "#31d6a6",
          }}
        />

        <button
          type="button"
          style={styles.adjustButton}
          onClick={() =>
            update(value + step)
          }
        >
          +
        </button>
      </div>
    </div>
  );
}

function ThresholdState({
  passed,
  label,
}) {
  return (
    <div style={styles.thresholdState}>
      <span
        style={{
          ...styles.miniDot,
          background: passed
            ? "#f4b860"
            : "#405761",
        }}
      />

      {label}
    </div>
  );
}

function clamp(value, min, max) {
  return Math.min(
    max,
    Math.max(min, value),
  );
}

function formatAge(timestamp) {
  if (!timestamp) return "unknown";

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  const seconds = Math.max(
    0,
    Math.round(
      (Date.now() - date.getTime()) /
        1000,
    ),
  );

  if (seconds < 5) return "just now";

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(
    seconds / 60,
  );

  return `${minutes}m ago`;
}

const styles = {
  modeBar: {
    padding: "13px 16px",
    marginBottom: "18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
  },

  modeLeft: {
    display: "flex",
    alignItems: "center",
    gap: "11px",
  },

  modeDot: {
    width: "9px",
    height: "9px",
    borderRadius: "50%",
    flexShrink: 0,
  },

  modeTitle: {
    display: "block",
    fontSize: "11px",
    letterSpacing: ".09em",
  },

  modeSubtitle: {
    marginTop: "3px",
    fontSize: "11px",
    color: "#78909b",
  },

  shortcut: {
    color: "#536f79",
    fontSize: "10px",
    border: "1px solid #17353f",
    borderRadius: "7px",
    padding: "5px 8px",
    whiteSpace: "nowrap",
  },

  verifyTrack: {
    height: "5px",
    borderRadius: "20px",
    background: "#051015",
    overflow: "hidden",
    marginTop: "17px",
  },

  verifyFill: {
    height: "100%",
    background:
      "linear-gradient(90deg, #f4b860, #ff6577)",
    transition: "width .1s linear",
  },

  freshness: {
    marginTop: "17px",
    fontSize: "10px",
    color: "#5b7781",
  },

  threshold: {
    marginTop: "18px",
  },

  thresholdHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "12px",
  },

  currentReading: {
    color: "#66828d",
    fontSize: "10px",
    marginTop: "3px",
  },

  thresholdControls: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    marginTop: "9px",
  },

  adjustButton: {
    width: "30px",
    height: "30px",
    border: "1px solid #1b3741",
    borderRadius: "7px",
    background: "#07141a",
    color: "#edf8fa",
    cursor: "pointer",
  },

  logicSummary: {
    marginTop: "20px",
    padding: "12px",
    border: "1px solid #17323b",
    borderRadius: "10px",
    background: "#07141a",
    fontSize: "10px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
  },

  thresholdState: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: "#87a0aa",
    margin: "3px 0",
  },

  miniDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
  },
};