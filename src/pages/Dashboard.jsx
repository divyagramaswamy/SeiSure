import {
  useEffect,
  useRef,
  useState,
} from "react";

import usePoseTracking from "../pose/usePoseTracking";

import useActivityRecorder from "../activity/useActivityRecorder";

import {
  addEvent,
} from "../activity/activityLog";

const DEFAULT_VISION_THRESHOLD = 45;
const DEFAULT_HR_THRESHOLD = 120;
const DEFAULT_DURATION_SECONDS = 4;

const PRE_EVENT_SECONDS = 60;

const REGION_LABELS = {
  leftArm: "Left arm",
  rightArm: "Right arm",
  leftLeg: "Left leg",
  rightLeg: "Right leg",
  torso: "Torso",
};

export default function Dashboard({
  patient,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [privacy, setPrivacy] =
    useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [
    cameraError,
    setCameraError,
  ] = useState(false);

  const [
    visionThreshold,
    setVisionThreshold,
  ] = useState(
    DEFAULT_VISION_THRESHOLD,
  );

  const [
    heartRateThreshold,
    setHeartRateThreshold,
  ] = useState(
    DEFAULT_HR_THRESHOLD,
  );

  const [
    durationThreshold,
    setDurationThreshold,
  ] = useState(
    DEFAULT_DURATION_SECONDS,
  );

  const [
    demoMode,
    setDemoMode,
  ] = useState(false);

  const [
    demoHeartRate,
    setDemoHeartRate,
  ] = useState(76);

  const [
    liveHeartRate,
    setLiveHeartRate,
  ] = useState(null);

  const [
    heartRateTimestamp,
    setHeartRateTimestamp,
  ] = useState(null);

  const [
    sensorConnected,
    setSensorConnected,
  ] = useState(false);

  const [
    holdProgress,
    setHoldProgress,
  ] = useState(0);

  const [
    eventDetected,
    setEventDetected,
  ] = useState(false);

  const pose =
    usePoseTracking(
      videoRef,
      canvasRef,
    );

  useActivityRecorder(
    patient?.id,
    pose,
  );

  const heartRate = demoMode
    ? demoHeartRate
    : liveHeartRate;

  const candidateStartRef =
    useRef(null);

  const eventLoggedRef =
    useRef(false);

  const rollingRef =
    useRef([]);

  const latestRef =
    useRef({});

  latestRef.current = {
    motion: pose.motion,
    regions: pose.regions,
    heartRate,
    posture: pose.posture,
  };

  const visionAboveThreshold =
    pose.status ===
      "tracking" &&
    pose.motion >=
      visionThreshold;

  const heartRateAboveThreshold =
    heartRate !== null &&
    heartRate >=
      heartRateThreshold;

  const candidate =
    visionAboveThreshold &&
    heartRateAboveThreshold;

  /*
  * Event Risk Index
  *
  * Each signal is normalized relative to its own
  * personalized threshold.
  *
  * We use the LOWER of the two normalized signals.
  *
  * Therefore:
  *   riskIndex < 100  = at least one signal is below threshold
  *   riskIndex >= 100 = BOTH signals are above threshold
  *
  * The alert itself still requires this condition to remain
  * true for durationThreshold seconds.
  */

  const ALERT_RISK_THRESHOLD = 100;

  const visionRatio =
    visionThreshold > 0
      ? pose.motion / visionThreshold
      : 0;

  const hrRatio =
    heartRate !== null && heartRateThreshold > 0
      ? heartRate / heartRateThreshold
      : 0;

  const riskIndex = Math.round(
    100 * Math.min(visionRatio, hrRatio)
  );

  const riskScaleMax = 150;

  const displayedRisk = clamp(
    riskIndex,
    0,
    riskScaleMax
  );

  const riskBarPercent =
    (displayedRisk / riskScaleMax) * 100;

  /*
  * Since the scale goes from 0–150 and the true
  * alert threshold is 100, the marker should always
  * sit at 100/150 = 66.7% of the bar.
  */
  const alertMarkerPercent =
    (ALERT_RISK_THRESHOLD / riskScaleMax) * 100;

  const activeRegion =
    Object.entries(
      pose.regions ?? {},
    ).sort(
      (a, b) =>
        b[1] - a[1],
    )[0] ?? [
      "torso",
      0,
    ];
    /*
 * Camera.
 *
 * Continuity Camera appears to the browser as a normal
 * videoinput device, so the exact same pipeline works
 * for either the MacBook camera or the iPhone camera.
 */
useEffect(() => {
  let stream;
  let cancelled = false;

  async function startCamera() {
    try {
      setCameraError(false);

      const constraints = selectedCameraId
        ? {
            video: {
              deviceId: {
                exact: selectedCameraId,
              },
            },
            audio: false,
          }
        : {
            video: true,
            audio: false,
          };

      stream =
        await navigator.mediaDevices.getUserMedia(
          constraints,
        );

      if (cancelled) {
        stream
          .getTracks()
          .forEach((track) =>
            track.stop(),
          );

        return;
      }

      if (videoRef.current) {
        videoRef.current.srcObject =
          stream;
      }

      const devices =
        await navigator.mediaDevices.enumerateDevices();

      const videoDevices =
        devices.filter(
          (device) =>
            device.kind === "videoinput",
        );

      setCameras(videoDevices);

      if (
        !selectedCameraId &&
        stream.getVideoTracks().length
      ) {
        const settings =
          stream
            .getVideoTracks()[0]
            .getSettings();

        if (settings.deviceId) {
          setSelectedCameraId(
            settings.deviceId,
          );
        }
      }
    } catch (err) {
      console.error(
        "Camera unavailable:",
        err,
      );

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
      .forEach((track) =>
        track.stop(),
      );
  };
}, [selectedCameraId]);

  /*
   * Camera.
   */
  // useEffect(() => {
  //   let stream;
  //   let cancelled = false;
    
    

  //   async function startCamera() {
  //     try {
  //       stream =
  //         await navigator.mediaDevices.getUserMedia(
  //           {
  //             video: true,
  //             audio: false,
  //           },
  //         );

  //       if (cancelled) {
  //         stream
  //           .getTracks()
  //           .forEach(
  //             (track) =>
  //               track.stop(),
  //           );

  //         return;
  //       }

  //       if (videoRef.current) {
  //         videoRef.current.srcObject =
  //           stream;
  //       }
  //     } catch (err) {
  //       console.error(
  //         "Camera unavailable:",
  //         err,
  //       );

  //       if (!cancelled) {
  //         setCameraError(true);
  //       }
  //     }
  //   }

  //   startCamera();

  //   return () => {
  //     cancelled = true;

  //     stream
  //       ?.getTracks()
  //       .forEach((track) =>
  //         track.stop(),
  //       );
  //   };
  // }, []);

  

  /*
   * Secret demo controls.
   *
   * Cmd/Ctrl+D = toggle
   * demo sensor mode
   *
   * N = normal HR
   * S = elevated HR
   */
  useEffect(() => {
    function handleKey(event) {
      const target =
        event.target;

      const typing =
        target instanceof
          HTMLInputElement ||
        target instanceof
          HTMLTextAreaElement ||
        target instanceof
          HTMLSelectElement ||
        target?.isContentEditable;

      if (typing) return;

      if (
        (event.metaKey ||
          event.ctrlKey) &&
        event.key.toLowerCase() ===
          "d"
      ) {
        event.preventDefault();

        setDemoMode(
          (current) =>
            !current,
        );

        return;
      }

      if (!demoMode) return;

      if (
        event.key.toLowerCase() ===
        "n"
      ) {
        setDemoHeartRate(76);
      }

      if (
        event.key.toLowerCase() ===
        "s"
      ) {
        setDemoHeartRate(138);
      }
    }

    window.addEventListener(
      "keydown",
      handleKey,
    );

    return () =>
      window.removeEventListener(
        "keydown",
        handleKey,
      );
  }, [demoMode]);

  /*
   * Poll newest HealthKit
   * sample.
   */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (demoMode) return;

      try {
        const response =
          await fetch(
            "/api/heart-rate",
          );

        if (!response.ok) {
          throw new Error(
            `Heart-rate API returned ${response.status}`,
          );
        }

        const result =
          await response.json();

        if (cancelled) {
          return;
        }

        if (
          result.heartRate !==
          null
        ) {
          setLiveHeartRate(
            result.heartRate,
          );

          setHeartRateTimestamp(
            result.timestamp,
          );

          setSensorConnected(
            true,
          );
        } else {
          setSensorConnected(
            false,
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.warn(
            "Heart rate unavailable:",
            error,
          );

          setSensorConnected(
            false,
          );
        }
      }
    }

    load();

    const timer =
      setInterval(load, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [demoMode]);

  /*
   * Rolling one-second
   * analytics buffer.
   */
  useEffect(() => {
    const timer =
      setInterval(() => {
        const now = Date.now();

        const latest =
          latestRef.current;

        rollingRef.current.push(
          {
            t: now,

            motion:
              latest.motion ??
              0,

            heartRate:
              latest.heartRate ??
              null,

            posture:
              latest.posture ??
              null,

            regions: {
              ...latest.regions,
            },
          },
        );

        const cutoff =
          now -
          PRE_EVENT_SECONDS *
            1000;

        rollingRef.current =
          rollingRef.current.filter(
            (sample) =>
              sample.t >=
              cutoff,
          );
      }, 1000);

    return () =>
      clearInterval(timer);
  }, []);

  /*
   * Threshold detector.
   */
  useEffect(() => {
    if (!candidate) {
      candidateStartRef.current = null;
      setHoldProgress(0);

      // Once an event has been confirmed, keep the alert latched
      // until the caregiver is called or "False Alarm" is pressed.
      if (!eventDetected) {
        eventLoggedRef.current = false;
      }

      return;
}

    if (
      candidateStartRef.current ===
      null
    ) {
      candidateStartRef.current =
        Date.now();
    }

    const timer =
      setInterval(() => {
        const onset =
          candidateStartRef.current;

        const elapsed =
          (Date.now() -
            onset) /
          1000;

        setHoldProgress(
          Math.min(
            100,
            (elapsed /
              durationThreshold) *
              100,
          ),
        );

        if (
          elapsed >=
            durationThreshold &&
          !eventLoggedRef.current
        ) {
          eventLoggedRef.current =
            true;

          setEventDetected(true);

          if (patient) {
            const window =
              rollingRef.current.map(
                (sample) => ({
                  ...sample,

                  offsetSec:
                    Math.round(
                      ((sample.t -
                        onset) /
                        1000) *
                        10,
                    ) / 10,
                }),
              );

            addEvent(
              patient.id,
              "seizure",
              "Possible seizure detected",
              {
                demo:
                  demoMode,

                riskIndex,

                visionMotion:
                  pose.motion,

                heartRate,

                visionThreshold,

                heartRateThreshold,

                requiredDuration:
                  durationThreshold,

                regions: {
                  ...pose.regions,
                },

                window,
              },
            );
          }
        }
      }, 100);

    return () =>
      clearInterval(timer);
  }, [
    candidate,
    durationThreshold,
    patient,
    demoMode,
    riskIndex,
    pose.motion,
    pose.regions,
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

    candidateStartRef.current =
      null;

    eventLoggedRef.current =
      false;

    setHoldProgress(0);
    setEventDetected(false);

    if (demoMode) {
      setDemoHeartRate(76);
    }
  }

  let statusLabel = "NORMAL";

  let statusDescription =
    "Curently, both heart rate and movement are below seizure thresholds.";

  if (
    candidate &&
    !eventDetected
  ) {
    statusLabel =
      "VERIFYING";

    statusDescription =
      `Vision and heart rate are elevated. Verifying for ${durationThreshold} seconds.`;
  }

  if (eventDetected) {
    statusLabel =
      "POSSIBLE SEIZURE";

    statusDescription =
      "Both signals remained above threshold long enough to trigger an alert.";
  }

  return (
    <main>
      <div
        className="card"
        style={
          styles.modeBar
        }
      >
        <div
          style={
            styles.modeLeft
          }
        >
          <span
            style={{
              ...styles.modeDot,

              background:
                demoMode
                  ? "#f4b860"
                  : sensorConnected
                    ? "#31d6a6"
                    : "#78909b",
            }}
          />

          <div>
            <strong
              style={
                styles.modeTitle
              }
            >
              {demoMode
                ? "DEMO SENSOR STREAM"
                : "LIVE HEALTHKIT"}
            </strong>

            <div
              style={
                styles.modeSubtitle
              }
            >
              {demoMode
                ? "Simulated wearable input · live vision unchanged"
                : sensorConnected
                  ? `Latest heart-rate sample`
                    // ? `Latest heart-rate sample ${formatAge(
                    //   heartRateTimestamp,
                    // )}`
                  : "Waiting for Apple Health sample"}
            </div>
          </div>
        </div>

        <span
          style={
            styles.shortcut
          }
        >
          ⌘D
        </span>
      </div>

      {eventDetected && (
        <div className="alertBanner">
          <div>
            <strong>
              ⚠ Possible seizure
              detected
            </strong>

            <p>
              Personalized vision
              and heart-rate
              thresholds were
              exceeded.
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
              onClick={
                markFalseAlarm
              }
            >
              False Alarm
            </button>
          </div>
        </div>
      )}

      <section className="grid">
        <div className="card cameraCard">
          <div className="cardHeader">
            <div>
              <h2>
                Live Vision
              </h2>

              <p>
                Computer vision
                movement analysis
              </p>
            </div>

            {/* <div className="toggle">
              <button
                className={
                  !privacy
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setPrivacy(false)
                }
              >
                Raw
              </button>

              <button
                className={
                  privacy
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setPrivacy(true)
                }
              >
                Privacy
              </button>
            </div> */}
            <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <select
                  value={selectedCameraId}
                  onChange={(event) =>
                    setSelectedCameraId(
                      event.target.value,
                    )
                  }
                  style={{
                    background: "#07141a",
                    color: "#edf8fa",
                    border: "1px solid #1b3741",
                    borderRadius: 8,
                    padding: "7px 10px",
                    fontSize: 11,
                    maxWidth: 190,
                  }}
                >
                  {cameras.length === 0 && (
                    <option value="">
                      Detecting cameras…
                    </option>
                  )}

                  {cameras.map(
                    (camera, index) => (
                      <option
                        key={camera.deviceId}
                        value={camera.deviceId}
                      >
                        {camera.label ||
                          `Camera ${index + 1}`}
                      </option>
                    ),
                  )}
                </select>

                <div className="toggle">
                  <button
                    className={
                      !privacy
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setPrivacy(false)
                    }
                  >
                    Raw
                  </button>

                  <button
                    className={
                      privacy
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setPrivacy(true)
                    }
                  >
                    Privacy
                  </button>
                </div>
              </div>
          </div>

          <div className="videoArea">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={
                privacy
                  ? "hiddenVideo"
                  : ""
              }
            />

            <canvas
              ref={canvasRef}
              className={`poseCanvas ${
                privacy
                  ? ""
                  : "hiddenCanvas"
              }`}
            />

            {privacy && (
              <div className="privacyCaption">
                Pose-only view ·
                raw imagery hidden
              </div>
            )}

            {(cameraError ||
              pose.status !==
                "tracking") && (
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
                pose.status ===
                  "tracking"
                  ? ""
                  : "idle"
              }`}
            >
              <span />

              {!cameraError &&
              pose.status ===
                "tracking"
                ? `Tracking · motion ${pose.motion}%`
                : "Not tracking"}
            </div>
          </div>
        </div>

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

              <h2>
                {statusLabel}
              </h2>
            </div>

            <p>
              {statusDescription}
            </p>

            {candidate &&
              !eventDetected && (
                <div
                  style={
                    styles.verifyTrack
                  }
                >
                  <div
                    style={{
                      ...styles.verifyFill,

                      width:
                        `${holdProgress}%`,
                    }}
                  />
                </div>
              )}
          </div>

          <div className="card">
            <h2>
              Live Signals
            </h2>

            <p>
              Apple Health +
              computer vision: these recorded measurements are used to determine whether a seizure event is happening
            </p>

            <Metric
              label="Heart Rate"
              value={
                heartRate ===
                null
                  ? "Waiting…"
                  : `${heartRate} bpm`
              }
              percent={
                heartRate ===
                null
                  ? 0
                  : Math.min(
                      (heartRate /
                        180) *
                        100,
                      100,
                    )
              }
            />

            <Metric
              label="Vision Motion"
              value={`${pose.motion}%`}
              percent={
                pose.motion
              }
            />
          </div>

          <div className="card">
            <h2>
              Personalized Detection
              Settings
            </h2>

            <p>
              An alert is triggered when BOTH signals stay above
              these thresholds for the required duration. As more data is collected for this user, these numbers can be changed to call for help either
              earlier into detection (lower time threshold) or with less heartrate + movement spike. 
            </p>

            <ThresholdControl
              label="Vision motion"
              value={
                visionThreshold
              }
              setValue={
                setVisionThreshold
              }
              min={5}
              max={100}
              step={5}
              unit="%"
            />

            <ThresholdControl
              label="Heart rate"
              value={
                heartRateThreshold
              }
              setValue={
                setHeartRateThreshold
              }
              min={60}
              max={200}
              step={5}
              unit=" bpm"
            />

            <ThresholdControl
              label="Required duration"
              value={
                durationThreshold
              }
              setValue={
                setDurationThreshold
              }
              min={1}
              max={10}
              step={1}
              unit=" sec"
            />
          </div>
        </div>
      </section>

      <section className="bottomGrid">
        <div className="card">
          <div className="riskHeader">
            <div>
              <h2>
                Seizure Risk Index
              </h2>

              <p>
                The score is based on the weaker of the two signals relative to its
                personalized threshold. A score of 100 means both vision and heart rate
                have reached their thresholds; the alert triggers only if they remain
                above threshold for the required duration.
              </p>
            </div>

            <div
              className={
                eventDetected
                  ? "risk dangerText"
                  : "risk"
              }
            >
              {riskIndex}
            </div>
          </div>

          <div
            style={
              styles.riskTrackOuter
            }
          >
            <div
              className={`riskFill ${
                eventDetected
                  ? "dangerFill"
                  : ""
              }`}
              style={{
                width:
                  `${riskBarPercent}%`,
              }}
            />

            <div
              style={{
                ...styles.thresholdMarker,

                left:
                  `${alertMarkerPercent}%`,
              }}
            >
              <span
                style={
                  styles.markerLabel
                }
              >
                Alert threshold
              </span>
            </div>
          </div>

          <div className="signalBoxes">
            <Signal
              label="Vision"
              value={`${pose.motion}%`}
            />

            <Signal
              label="Heart Rate"
              value={
                heartRate ===
                null
                  ? "Waiting"
                  : `${heartRate} bpm`
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

        <a
          href="#/analytics"
          className="card"
          style={
            styles.analyticsPreview
          }
        >
          <div>
            <span className="eyebrow">
              ANALYTICS PREVIEW
            </span>

            <h2
              style={{
                marginTop: 8,
              }}
            >
              Movement Insights
            </h2>

            <p>
              Explore historical
              events and
              patient-specific
              patterns.
            </p>
          </div>

          <div
            style={
              styles.previewStat
            }
          >
            <span>
              Most active region
              now
            </span>

            <strong>
              {
                REGION_LABELS[
                  activeRegion[0]
                ]
              }
            </strong>

            <b>
              {activeRegion[1]}%
            </b>
          </div>

          <div
            style={
              styles.previewRegions
            }
          >
            {Object.entries(
              pose.regions,
            ).map(
              ([
                region,
                value,
              ]) => (
                <div
                  key={region}
                >
                  <span>
                    {
                      REGION_LABELS[
                        region
                      ]
                    }
                  </span>

                  <div
                    style={
                      styles.previewTrack
                    }
                  >
                    <div
                      style={{
                        ...styles.previewFill,

                        width:
                          `${value}%`,
                      }}
                    />
                  </div>
                </div>
              ),
            )}
          </div>

          <strong
            style={
              styles.learnMore
            }
          >
            View full analytics →
          </strong>
        </a>
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  percent,
}) {
  return (
    <div className="metric">
      <div className="metricRow">
        <span>
          {label}
        </span>

        <strong>
          {value}
        </strong>
      </div>

      <div className="smallTrack">
        <div
          style={{
            width:
              `${clamp(
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
}) {
  return (
    <div className="signalBox">
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
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
    <div
      style={
        styles.threshold
      }
    >
      <div
        style={
          styles.thresholdHeader
        }
      >
        <span>
          {label}
        </span>

        <strong>
          {value}
          {unit}
        </strong>
      </div>

      <div
        style={
          styles.thresholdControls
        }
      >
        <button
          type="button"
          style={
            styles.adjustButton
          }
          onClick={() =>
            update(
              value - step,
            )
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
          onChange={(e) =>
            update(
              e.target.value,
            )
          }
          style={{
            flex: 1,
            accentColor:
              "#31d6a6",
          }}
        />

        <button
          type="button"
          style={
            styles.adjustButton
          }
          onClick={() =>
            update(
              value + step,
            )
          }
        >
          +
        </button>
      </div>
    </div>
  );
}

function poseMessage(
  cameraError,
  status,
) {
  if (cameraError) {
    return "Camera unavailable. Check browser permissions.";
  }

  if (
    status === "loading"
  ) {
    return "Loading pose model…";
  }

  if (
    status === "error"
  ) {
    return "Pose model failed to load.";
  }

  return "No person in view";
}

function clamp(
  value,
  min,
  max,
) {
  return Math.min(
    max,
    Math.max(min, value),
  );
}

function formatAge(
  timestamp,
) {
  if (!timestamp) {
    return "unknown";
  }

  const seconds =
    Math.max(
      0,
      Math.round(
        (Date.now() -
          new Date(
            timestamp,
          ).getTime()) /
          1000,
      ),
    );

  if (seconds < 5) {
    return "just now";
  }

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  return `${Math.floor(
    seconds / 60,
  )}m ago`;
}

const styles = {
  modeBar: {
    padding: "13px 16px",
    marginBottom: 18,
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "center",
  },

  modeLeft: {
    display: "flex",
    gap: 11,
    alignItems: "center",
  },

  modeDot: {
    width: 9,
    height: 9,
    borderRadius: "50%",
  },

  modeTitle: {
    display: "block",
    fontSize: 11,
    letterSpacing: ".09em",
  },

  modeSubtitle: {
    marginTop: 3,
    fontSize: 11,
    color: "#78909b",
  },

  shortcut: {
    color: "#536f79",
    fontSize: 10,
    border:
      "1px solid #17353f",
    borderRadius: 7,
    padding: "5px 8px",
  },

  verifyTrack: {
    height: 5,
    background: "#051015",
    borderRadius: 20,
    overflow: "hidden",
    marginTop: 16,
  },

  verifyFill: {
    height: "100%",
    background:
      "linear-gradient(90deg,#f4b860,#ff6577)",
  },

  threshold: {
    marginTop: 18,
  },

  thresholdHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    fontSize: 12,
  },

  thresholdControls: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginTop: 8,
  },

  adjustButton: {
    width: 30,
    height: 30,
    border:
      "1px solid #1b3741",
    borderRadius: 7,
    background: "#07141a",
    color: "#edf8fa",
  },

  riskTrackOuter: {
    position: "relative",
    height: 10,
    margin:
      "30px 0 26px",
    background: "#051015",
    borderRadius: 20,
  },

  thresholdMarker: {
    position: "absolute",
    top: -8,
    bottom: -8,
    width: 2,
    background: "#f4b860",
  },

  markerLabel: {
    position: "absolute",
    top: -20,
    left: "50%",
    transform:
      "translateX(-50%)",
    whiteSpace: "nowrap",
    fontSize: 9,
    color: "#f4b860",
  },

  analyticsPreview: {
    textDecoration: "none",
    color: "inherit",
    display: "block",
    cursor: "pointer",
  },

  previewStat: {
    display: "grid",
    gridTemplateColumns:
      "1fr auto auto",
    gap: 10,
    marginTop: 18,
    alignItems: "baseline",
  },

  previewRegions: {
    display: "grid",
    gap: 8,
    marginTop: 18,
    fontSize: 10,
    color: "#78909b",
  },

  previewTrack: {
    height: 4,
    background: "#051015",
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 3,
  },

  previewFill: {
    height: "100%",
    background:
      "linear-gradient(90deg,#31d6a6,#3ca7ff)",
  },

  learnMore: {
    display: "block",
    marginTop: 18,
    color: "#31d6a6",
    fontSize: 12,
  },
};