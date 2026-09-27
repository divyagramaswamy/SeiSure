import { useState } from "react";
import {
  EVENT_TYPES,
  LEVELS,
  addDemoHistory,
  clearLog,
  groupByDay,
  hasDemoData,
  loadLog,
  motionLevel,
  summarize,
} from "./activityLog";

const HOUR_LABELS = ["12a", "6a", "12p", "6p"];

function percent(part, whole) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

function formatHours(minutes) {
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

function formatTime(t) {
  return new Date(t).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayLabel(start) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysAgo = Math.round((today.getTime() - start) / 86400000);

  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return new Date(start).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function ActivityHistory() {
  const [log, setLog] = useState(loadLog);

  const summary = summarize(log);
  const days = groupByDay(log);
  const isEmpty = !log.samples.length && !log.events.length;
  const falseAlarms = summary.events.falseAlarm + summary.events.verifying;
  const postureTotal = summary.postures.upright + summary.postures.lying;

  function loadSample() {
    addDemoHistory();
    setLog(loadLog());
  }

  function clearHistory() {
    if (window.confirm("Delete all recorded activity for this patient?")) {
      clearLog();
      setLog(loadLog());
    }
  }

  return (
    <section className="card activityCard">
      <div className="cardHeader">
        <div>
          <h2>Activity History</h2>
          <p>Movement and alerts from the last 7 days</p>
        </div>

        <div className="activityActions">
          {!log.samples.some((s) => s.demo) && (
            <button type="button" onClick={loadSample}>
              Load sample data
            </button>
          )}
          {!isEmpty && (
            <button type="button" onClick={clearHistory}>
              Clear
            </button>
          )}
        </div>
      </div>

      {hasDemoData(log) && (
        <p className="demoNote">
          Includes sample data. Clear it before real monitoring.
        </p>
      )}

      {isEmpty ? (
        <p className="emptyState">
          No activity recorded yet. Activity is recorded while the Monitor page
          is open and the patient is in view of the camera.
        </p>
      ) : (
        <>
          <div className="activityTiles">
            <Tile
              label="Possible seizures"
              value={summary.events.seizure}
              danger={summary.events.seizure > 0}
            />
            <Tile
              label="Intense movement"
              value={summary.events.intense}
              danger={summary.events.intense > 0}
            />
            <Tile label="False alarms" value={falseAlarms} />
            <Tile label="Monitored" value={formatHours(summary.minutes)} />
          </div>

          <h3 className="activityHeading">Most common movement</h3>
          {LEVELS.map((level) => (
            <div className="metric" key={level.key}>
              <div className="metricRow">
                <span>{level.label}</span>
                <strong>
                  {percent(summary.levels[level.key], summary.minutes)}%
                </strong>
              </div>
              <div className={`smallTrack level-${level.key}`}>
                <div
                  style={{
                    width: `${percent(summary.levels[level.key], summary.minutes)}%`,
                  }}
                />
              </div>
            </div>
          ))}

          {postureTotal > 0 && (
            <p className="postureNote">
              Upright {percent(summary.postures.upright, postureTotal)}% · Lying
              down {percent(summary.postures.lying, postureTotal)}% of tracked
              time
            </p>
          )}

          <div className="dayHeader">
            <h3 className="activityHeading">Daily timeline</h3>
            <div className="levelLegend">
              {LEVELS.map((level) => (
                <span key={level.key}>
                  <i className={`hourCell level-${level.key}`} />
                  {level.label.replace(" movement", "")}
                </span>
              ))}
            </div>
          </div>

          {days.map((day) => (
            <Day key={day.start} day={day} />
          ))}
        </>
      )}
    </section>
  );
}

function Tile({ label, value, danger }) {
  return (
    <div className="signalBox">
      <span>{label}</span>
      <strong className={danger ? "dangerText" : ""}>{value}</strong>
    </div>
  );
}

function Day({ day }) {
  const alarmingHours = new Set(
    day.events
      .filter((e) => EVENT_TYPES[e.type]?.alarming)
      .map((e) => new Date(e.t).getHours()),
  );
  const alarmingCount = day.events.filter(
    (e) => EVENT_TYPES[e.type]?.alarming,
  ).length;

  return (
    <div className="day">
      <div className="dayTitle">
        <strong>{dayLabel(day.start)}</strong>
        <span>
          {formatHours(day.minutes)} monitored
          {alarmingCount > 0 && (
            <em>
              {" "}
              · {alarmingCount} alarming event{alarmingCount > 1 ? "s" : ""}
            </em>
          )}
        </span>
      </div>

      <div className="hourStrip">
        {day.hours.map((motion, hour) => (
          <div
            key={hour}
            className={`hourCell ${
              motion === null ? "noData" : `level-${motionLevel(motion)}`
            } ${alarmingHours.has(hour) ? "alarmHour" : ""}`}
            title={
              motion === null
                ? `${hour}:00 · no data`
                : `${hour}:00 · average motion ${Math.round(motion)}%`
            }
          />
        ))}
      </div>
      <div className="hourAxis">
        {HOUR_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      {day.events.map((event) => {
        const alarming = EVENT_TYPES[event.type]?.alarming;
        return (
          <div className="timeline" key={`${event.t}-${event.type}`}>
            <div
              className={`timelineDot ${alarming ? "dangerDot" : "activeDot"}`}
            />
            <div>
              <span>
                {formatTime(event.t)} · {EVENT_TYPES[event.type]?.label}
                {event.demo && " · sample"}
              </span>
              <strong>{event.text}</strong>
            </div>
          </div>
        );
      })}

      {day.events.length === 0 && (
        <p className="noEvents">No alerts or alarming activity</p>
      )}
    </div>
  );
}
