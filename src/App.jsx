import { useEffect, useRef, useState } from "react";
import "./App.css";

const scenarios = {
  normal: {
    label: "NORMAL",
    hr: 76,
    hrv: 48,
    vision: 12,
    wearable: 9,
    risk: 10,
  },
  falsePositive: {
    label: "VERIFYING",
    hr: 82,
    hrv: 44,
    vision: 86,
    wearable: 14,
    risk: 34,
  },
  seizure: {
    label: "POSSIBLE SEIZURE",
    hr: 142,
    hrv: 19,
    vision: 94,
    wearable: 91,
    risk: 95,
  },
};

export default function App() {
  const videoRef = useRef(null);

  const [privacy, setPrivacy] = useState(false);
  const [scenario, setScenario] = useState("normal");

  const data = scenarios[scenario];
  const emergency = scenario === "seizure";

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera unavailable:", err);
      }
    }

    startCamera();
  }, []);

  return (
    <div className="app">
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

        <div className="live">
          <span />
          LIVE MONITORING
        </div>
      </header>

      <main>
        <div className="demoControls">
          <span>Demo:</span>

          <button
            onClick={() => setScenario("normal")}
            className={scenario === "normal" ? "selected" : ""}
          >
            Normal
          </button>

          <button
            onClick={() => setScenario("falsePositive")}
            className={scenario === "falsePositive" ? "selected" : ""}
          >
            False Positive
          </button>

          <button
            onClick={() => setScenario("seizure")}
            className={scenario === "seizure" ? "selected dangerButton" : ""}
          >
            Seizure Event
          </button>
        </div>

        {emergency && (
          <div className="alertBanner">
            <div>
              <strong>⚠ Possible seizure detected</strong>
              <p>
                Vision and wearable signals agree. Caregiver escalation started.
              </p>
            </div>

            <div className="alertActions">
              <button>Call Caregiver</button>
              <button className="secondary">False Alarm</button>
            </div>
          </div>
        )}

        <section className="grid">
          <div className="card cameraCard">
            <div className="cardHeader">
              <div>
                <h2>Live Vision</h2>
                <p>Computer vision movement analysis</p>
              </div>

              <div className="toggle">
                <button
                  className={!privacy ? "active" : ""}
                  onClick={() => setPrivacy(false)}
                >
                  Raw
                </button>

                <button
                  className={privacy ? "active" : ""}
                  onClick={() => setPrivacy(true)}
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
                className={privacy ? "hiddenVideo" : ""}
              />

              {privacy && (
                <div className="privacyView">
                  <div className="person">
                    <div className="head" />
                    <div className="torso" />
                    <div className="arm armLeft" />
                    <div className="arm armRight" />
                    <div className="leg legLeft" />
                    <div className="leg legRight" />
                  </div>

                  <p>Pose-only processing</p>
                  <span>Raw imagery hidden</span>
                </div>
              )}

              <div className="visionBadge">
                <span />
                Tracking active
              </div>
            </div>
          </div>

          <div className="rightColumn">
            <div className={`card statusCard ${emergency ? "emergency" : ""}`}>
              <span className="eyebrow">CURRENT STATUS</span>

              <div className="statusRow">
                <div className="statusDot" />
                <h2>{data.label}</h2>
              </div>

              <p>
                {scenario === "normal" &&
                  "No seizure-like activity detected."}

                {scenario === "falsePositive" &&
                  "High visual motion, but wearable signals do not confirm an event."}

                {scenario === "seizure" &&
                  "Multiple modalities indicate a possible seizure event."}
              </p>
            </div>

            <div className="card">
              <h2>Live Signals</h2>
              <p>Apple Watch + vision measurements</p>

              <Metric
                label="Heart Rate"
                value={`${data.hr} bpm`}
                percent={Math.min(data.hr / 1.7, 100)}
              />

              <Metric
                label="HRV"
                value={`${data.hrv} ms`}
                percent={data.hrv}
              />

              <Metric
                label="Vision Motion"
                value={`${data.vision}%`}
                percent={data.vision}
              />

              <Metric
                label="Watch Motion"
                value={`${data.wearable}%`}
                percent={data.wearable}
              />
            </div>
          </div>
        </section>

        <section className="bottomGrid">
          <div className="card">
            <div className="riskHeader">
              <div>
                <h2>Multimodal Event Confidence</h2>
                <p>Vision + physiological sensor fusion</p>
              </div>

              <div className={emergency ? "risk dangerText" : "risk"}>
                {data.risk}%
              </div>
            </div>

            <div className="riskTrack">
              <div
                className={`riskFill ${emergency ? "dangerFill" : ""}`}
                style={{ width: `${data.risk}%` }}
              />
            </div>

            <div className="signalBoxes">
              <Signal label="Vision" score={data.vision} />
              <Signal label="Heart Rate" score={emergency ? 88 : 11} />
              <Signal label="HRV" score={emergency ? 82 : 13} />
              <Signal label="Watch Motion" score={data.wearable} />
            </div>
          </div>

          <div className="card">
            <h2>Incident Timeline</h2>
            <p>Latest monitoring activity</p>

            <Timeline time="18:41:12" text="Monitoring started" />
            <Timeline time="18:41:18" text="Wearable connected" />

            {scenario === "falsePositive" && (
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
              <Timeline time="Now" text="Signals within baseline" active />
            )}
          </div>
        </section>
      </main>
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
        <div style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Signal({ label, score }) {
  return (
    <div className="signalBox">
      <span>{label}</span>
      <strong>{score}%</strong>
    </div>
  );
}

function Timeline({ time, text, active, danger }) {
  return (
    <div className="timeline">
      <div
        className={`timelineDot ${active ? "activeDot" : ""} ${
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