import { useEffect, useState } from "react";
import PoseCamera from "./PoseCamera";
import "./App.css";

import PatientProfile from "./pages/PatientProfile";
import CallCaregiver from "./pages/CallCaregiver";

const scenarios = {
  normal: {
    label: "NORMAL",
    hr: 76,
    hrv: 48,
    wearable: 9,
    risk: 10,
  },

  falsePositive: {
    label: "VERIFYING",
    hr: 82,
    hrv: 44,
    wearable: 14,
    risk: 34,
  },

  seizure: {
    label: "POSSIBLE SEIZURE",
    hr: 142,
    hrv: 19,
    wearable: 91,
    risk: 95,
  },
};

const validPaths = ["/", "/profile", "/call"];

function currentPath() {
  const path = window.location.hash.replace(/^#/, "") || "/";
  return validPaths.includes(path) ? path : "/";
}

export default function App() {
  // Routing
  const [path, setPath] = useState(currentPath());

  // Dashboard state
  const [privacy, setPrivacy] = useState(false);
  const [scenario, setScenario] = useState("normal");
  const [visionScore, setVisionScore] = useState(0);

  const data = scenarios[scenario];
  const emergency = scenario === "seizure";

  useEffect(() => {
    const onHashChange = () => {
      setPath(currentPath());
    };

    window.addEventListener("hashchange", onHashChange);

    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  return (
    <div className="app">
      {/* GLOBAL HEADER */}
      <header className="navbar">
        <div>
          <div className="brand">
            <div className="logo">N</div>

            <div>
              <h1>NeuroGuard</h1>
              <p>Multimodal seizure monitoring</p>
            </div>
          </div>
        </div>

        <nav className="navLinks">
          <a
            href="#/"
            className={path === "/" ? "current" : ""}
          >
            Monitor
          </a>

          <a
            href="#/profile"
            className={path === "/profile" ? "current" : ""}
          >
            Patient Profile
          </a>
        </nav>

        <div className="live">
          <span />
          LIVE MONITORING
        </div>
      </header>

      {/* ROUTED PAGES */}
      {path === "/profile" ? (
        <PatientProfile />
      ) : path === "/call" ? (
        <CallCaregiver />
      ) : (
        <main>
          {/* DEMO CONTROLS */}
          <div className="demoControls">
            <span>Demo:</span>

            <button
              onClick={() => setScenario("normal")}
              className={
                scenario === "normal" ? "selected" : ""
              }
            >
              Normal
            </button>

            <button
              onClick={() =>
                setScenario("falsePositive")
              }
              className={
                scenario === "falsePositive"
                  ? "selected"
                  : ""
              }
            >
              False Positive
            </button>

            <button
              onClick={() => setScenario("seizure")}
              className={
                scenario === "seizure"
                  ? "selected dangerButton"
                  : ""
              }
            >
              Seizure Event
            </button>
          </div>

          {/* EMERGENCY BANNER */}
          {emergency && (
            <div className="alertBanner">
              <div>
                <strong>
                  ⚠ Possible seizure detected
                </strong>

                <p>
                  Vision and wearable signals agree.
                  Caregiver escalation started.
                </p>
              </div>

              <div className="alertActions">
                <button
                  onClick={() => {
                    window.location.hash = "/call";
                  }}
                >
                  Call Caregiver
                </button>

                <button
                  className="secondary"
                  onClick={() =>
                    setScenario("normal")
                  }
                >
                  False Alarm
                </button>
              </div>
            </div>
          )}

          {/* MAIN DASHBOARD */}
          <section className="grid">
            {/* CAMERA */}
            <div className="card cameraCard">
              <div className="cardHeader">
                <div>
                  <h2>Live Vision</h2>
                  <p>
                    Computer vision movement analysis
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
                <PoseCamera
                  privacy={privacy}
                  onVisionScore={setVisionScore}
                />

                <div className="visionBadge">
                  <span />
                  Pose tracking active
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="rightColumn">
              <div
                className={`card statusCard ${
                  emergency ? "emergency" : ""
                }`}
              >
                <span className="eyebrow">
                  CURRENT STATUS
                </span>

                <div className="statusRow">
                  <div className="statusDot" />
                  <h2>{data.label}</h2>
                </div>

                <p>
                  {scenario === "normal" &&
                    "No seizure-like activity detected."}

                  {scenario ===
                    "falsePositive" &&
                    "High visual motion, but wearable signals do not confirm an event."}

                  {scenario === "seizure" &&
                    "Multiple modalities indicate a possible seizure event."}
                </p>
              </div>

              <div className="card">
                <h2>Live Signals</h2>

                <p>
                  Apple Watch + vision measurements
                </p>

                <Metric
                  label="Heart Rate"
                  value={`${data.hr} bpm`}
                  percent={Math.min(
                    data.hr / 1.7,
                    100
                  )}
                />

                <Metric
                  label="HRV"
                  value={`${data.hrv} ms`}
                  percent={data.hrv}
                />

                <Metric
                  label="Vision Motion"
                  value={`${visionScore}%`}
                  percent={visionScore}
                />

                <Metric
                  label="Watch Motion"
                  value={`${data.wearable}%`}
                  percent={data.wearable}
                />
              </div>
            </div>
          </section>

          {/* LOWER DASHBOARD */}
          <section className="bottomGrid">
            {/* MULTIMODAL CONFIDENCE */}
            <div className="card">
              <div className="riskHeader">
                <div>
                  <h2>
                    Multimodal Event Confidence
                  </h2>

                  <p>
                    Vision + physiological sensor
                    fusion
                  </p>
                </div>

                <div
                  className={
                    emergency
                      ? "risk dangerText"
                      : "risk"
                  }
                >
                  {data.risk}%
                </div>
              </div>

              <div className="riskTrack">
                <div
                  className={`riskFill ${
                    emergency ? "dangerFill" : ""
                  }`}
                  style={{
                    width: `${data.risk}%`,
                  }}
                />
              </div>

              <div className="signalBoxes">
                <Signal
                  label="Vision"
                  score={visionScore}
                />

                <Signal
                  label="Heart Rate"
                  score={emergency ? 88 : 11}
                />

                <Signal
                  label="HRV"
                  score={emergency ? 82 : 13}
                />

                <Signal
                  label="Watch Motion"
                  score={data.wearable}
                />
              </div>
            </div>

            {/* INCIDENT TIMELINE */}
            <div className="card">
              <h2>Incident Timeline</h2>
              <p>Latest monitoring activity</p>

              <Timeline
                time="18:41:12"
                text="Monitoring started"
              />

              <Timeline
                time="18:41:18"
                text="Wearable connected"
              />

              {scenario ===
                "falsePositive" && (
                <Timeline
                  time="Now"
                  text="Visual anomaly rejected by sensor fusion"
                  active
                />
              )}

              {scenario === "seizure" && (
                <>
                  <Timeline
                    time="Now"
                    text="Multimodal event detected"
                    danger
                  />

                  <Timeline
                    time="+ 5 sec"
                    text="Caregiver notification initiated"
                    danger
                  />
                </>
              )}

              {scenario === "normal" && (
                <Timeline
                  time="Now"
                  text="Signals within baseline"
                  active
                />
              )}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

function Metric({ label, value, percent }) {
  return (
    <div className="metric">
      <div className="metricRow">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>

      <div className="smallTrack">
        <div
          style={{
            width: `${Math.min(
              Math.max(percent, 0),
              100
            )}%`,
          }}
        />
      </div>
    </div>
  );
}

function Signal({ label, score }) {
  return (
    <div className="signalBox">
      <span>{label}</span>
      <strong>{Math.round(score)}%</strong>
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
        } ${danger ? "dangerDot" : ""}`}
      />

      <div>
        <span>{time}</span>
        <strong>{text}</strong>
      </div>
    </div>
  );
}