import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  fetchLog,
} from "../activity/activityLog";

const ALL = "__all__";

const REGIONS = {
  leftArm: "Left arm",
  rightArm: "Right arm",
  leftLeg: "Left leg",
  rightLeg: "Right leg",
  torso: "Torso",
};

export default function Analytics({
  patient,
  patients = [],
}) {
  const [
    selected,
    setSelected,
  ] = useState(
    patient?.id ?? ALL,
  );

  const [logs, setLogs] =
    useState({});

  const [loading, setLoading] =
    useState(false);

  useEffect(() => {
    if (
      patient?.id &&
      selected !== ALL
    ) {
      setSelected(patient.id);
    }
  }, [patient?.id]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        const targets =
          selected === ALL
            ? patients
            : patients.filter(
                (p) =>
                  p.id ===
                  selected,
              );

        const entries =
          await Promise.all(
            targets.map(
              async (p) => [
                p.id,
                await fetchLog(
                  p.id,
                ),
              ],
            ),
          );

        if (!cancelled) {
          setLogs(
            Object.fromEntries(
              entries,
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [
    selected,
    patients,
  ]);

  const analysis =
    useMemo(
      () =>
        analyzeLogs(logs),
      [logs],
    );

  return (
    <main>
      <div
        className="card"
        style={
          styles.header
        }
      >
        <div>
          <span className="eyebrow">
            PATTERN ANALYSIS
          </span>

          <h2
            style={{
              marginTop: 8,
            }}
          >
            Patient Analytics
          </h2>

          <p>
            Movement and
            physiological trends
            surrounding recorded
            events.
          </p>
        </div>

        <label
          style={
            styles.selector
          }
        >
          <span>
            Analyze
          </span>

          <select
            value={selected}
            onChange={(e) =>
              setSelected(
                e.target.value,
              )
            }
          >
            <option
              value={ALL}
            >
              All patients
            </option>

            {patients.map(
              (p) => (
                <option
                  key={p.id}
                  value={p.id}
                >
                  {p.patientName ||
                    "Unnamed patient"}
                </option>
              ),
            )}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="card">
          Loading analytics…
        </div>
      ) : (
        <>
          <section
            style={
              styles.statsGrid
            }
          >
            <Stat
              label="Recorded events"
              value={
                analysis.eventCount
              }
            />

            <Stat
              label="Most active region"
              value={
                analysis.topRegion
              }
            />

            <Stat
              label="Avg. pre-event motion"
              value={`${analysis.preMotion}%`}
            />

            <Stat
              label="Avg. event motion"
              value={`${analysis.eventMotion}%`}
            />

            <Stat
              label="Average peak HR"
              value={
                analysis.peakHR
                  ? `${analysis.peakHR} bpm`
                  : "—"
              }
            />
          </section>

          <section
            className="bottomGrid"
            style={{
              marginTop: 18,
            }}
          >
            <div className="card">
              <h2>
                Movement by Body
                Region
              </h2>

              <p>
                Average motion
                across recorded
                event windows.
              </p>

              <div
                style={
                  styles.regionList
                }
              >
                {Object.entries(
                  analysis.regionAverages,
                )
                  .sort(
                    (a, b) =>
                      b[1] -
                      a[1],
                  )
                  .map(
                    ([
                      region,
                      value,
                    ]) => (
                      <RegionBar
                        key={
                          region
                        }
                        label={
                          REGIONS[
                            region
                          ]
                        }
                        value={
                          value
                        }
                      />
                    ),
                  )}
              </div>
            </div>

            <div className="card">
              <h2>
                Pre-event Motion
                Trend
              </h2>

              <p>
                Average movement
                relative to event
                onset.
              </p>

              <TrendChart
                points={
                  analysis.trend
                }
              />
            </div>
          </section>

          <section
            className="card"
            style={{
              marginTop: 18,
            }}
          >
            <h2>
              Interpretation
            </h2>

            <p>
              Early exploratory
              statistics only —
              patterns become more
              meaningful as more
              events are collected
              for each patient.
            </p>

            <div
              style={
                styles.insights
              }
            >
              <Insight
                title="Dominant movement"
                text={
                  analysis.eventCount
                    ? `${analysis.topRegion} shows the highest average motion during saved event windows.`
                    : "No event windows have been recorded yet."
                }
              />

              <Insight
                title="Pre-event change"
                text={
                  analysis.preMotion &&
                  analysis.eventMotion
                    ? `Average motion rises from ${analysis.preMotion}% before onset to ${analysis.eventMotion}% after onset.`
                    : "More event data is needed to estimate a pre-event movement trend."
                }
              />

              <Insight
                title="Personalization"
                text="These statistics can later be used to learn patient-specific baselines and automatically tune the detection thresholds."
              />
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function analyzeLogs(logs) {
  const seizureEvents =
    Object.values(logs)
      .flatMap(
        (log) =>
          log.events ?? [],
      )
      .filter(
        (event) =>
          event.type ===
            "seizure" &&
          Array.isArray(
            event.window,
          ),
      );

  const regionTotals =
    Object.fromEntries(
      Object.keys(REGIONS).map(
        (region) => [
          region,
          {
            sum: 0,
            count: 0,
          },
        ],
      ),
    );

  let preSum = 0;
  let preCount = 0;

  let eventSum = 0;
  let eventCount = 0;

  let peakHRSum = 0;
  let peakHRCount = 0;

  const trendBuckets =
    new Map();

  for (const event of seizureEvents) {
    let eventPeakHR = null;

    for (const sample of event.window) {
      if (
        sample.offsetSec < 0
      ) {
        preSum +=
          sample.motion ?? 0;

        preCount++;
      } else {
        eventSum +=
          sample.motion ?? 0;

        eventCount++;
      }

      if (
        sample.heartRate !==
        null &&
        sample.heartRate !==
        undefined
      ) {
        eventPeakHR =
          Math.max(
            eventPeakHR ?? 0,
            sample.heartRate,
          );
      }

      for (const region of Object.keys(
        REGIONS,
      )) {
        const value =
          sample.regions?.[
            region
          ];

        if (
          Number.isFinite(
            value,
          )
        ) {
          regionTotals[
            region
          ].sum += value;

          regionTotals[
            region
          ].count++;
        }
      }

      const bucket =
        Math.round(
          sample.offsetSec /
            5,
        ) * 5;

      if (
        bucket >= -60 &&
        bucket <= 10
      ) {
        const current =
          trendBuckets.get(
            bucket,
          ) ?? {
            sum: 0,
            count: 0,
          };

        current.sum +=
          sample.motion ?? 0;

        current.count++;

        trendBuckets.set(
          bucket,
          current,
        );
      }
    }

    if (
      eventPeakHR !== null
    ) {
      peakHRSum +=
        eventPeakHR;

      peakHRCount++;
    }
  }

  const regionAverages =
    Object.fromEntries(
      Object.entries(
        regionTotals,
      ).map(
        ([
          region,
          info,
        ]) => [
          region,
          info.count
            ? Math.round(
                info.sum /
                  info.count,
              )
            : 0,
        ],
      ),
    );

  const top =
    Object.entries(
      regionAverages,
    ).sort(
      (a, b) =>
        b[1] - a[1],
    )[0];

  const trend = [
    ...trendBuckets.entries(),
  ]
    .sort(
      (a, b) =>
        a[0] - b[0],
    )
    .map(
      ([
        second,
        info,
      ]) => ({
        second,
        motion:
          info.count
            ? info.sum /
              info.count
            : 0,
      }),
    );

  return {
    eventCount:
      seizureEvents.length,

    topRegion:
      top?.[1] > 0
        ? REGIONS[
            top[0]
          ]
        : "—",

    regionAverages,

    preMotion:
      preCount
        ? Math.round(
            preSum /
              preCount,
          )
        : 0,

    eventMotion:
      eventCount
        ? Math.round(
            eventSum /
              eventCount,
          )
        : 0,

    peakHR:
      peakHRCount
        ? Math.round(
            peakHRSum /
              peakHRCount,
          )
        : null,

    trend,
  };
}

function Stat({
  label,
  value,
}) {
  return (
    <div className="card">
      <span className="eyebrow">
        {label}
      </span>

      <strong
        style={
          styles.statValue
        }
      >
        {value}
      </strong>
    </div>
  );
}

function RegionBar({
  label,
  value,
}) {
  return (
    <div>
      <div
        style={
          styles.regionHeader
        }
      >
        <span>
          {label}
        </span>

        <strong>
          {value}%
        </strong>
      </div>

      <div className="smallTrack">
        <div
          style={{
            width:
              `${Math.min(
                100,
                value,
              )}%`,
          }}
        />
      </div>
    </div>
  );
}

function TrendChart({
  points,
}) {
  if (!points.length) {
    return (
      <div
        style={
          styles.emptyChart
        }
      >
        Record a detected event
        to populate this chart.
      </div>
    );
  }

  const width = 600;
  const height = 240;

  const minX =
    Math.min(
      ...points.map(
        (p) =>
          p.second,
      ),
    );

  const maxX =
    Math.max(
      ...points.map(
        (p) =>
          p.second,
      ),
    );

  const x = (second) =>
    ((second - minX) /
      Math.max(
        1,
        maxX - minX,
      )) *
      (width - 50) +
    30;

  const y = (motion) =>
    height -
    25 -
    (Math.min(
      100,
      motion,
    ) /
      100) *
      (height - 50);

  const polyline =
    points
      .map(
        (p) =>
          `${x(
            p.second,
          )},${y(
            p.motion,
          )}`,
      )
      .join(" ");

  const onsetX = x(0);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{
        width: "100%",
        marginTop: 20,
      }}
    >
      <line
        x1={onsetX}
        x2={onsetX}
        y1="15"
        y2={height - 25}
        stroke="#f4b860"
        strokeWidth="2"
        strokeDasharray="5 5"
      />

      <text
        x={onsetX + 6}
        y="24"
        fill="#f4b860"
        fontSize="11"
      >
        Event onset
      </text>

      <polyline
        points={polyline}
        fill="none"
        stroke="#31d6a6"
        strokeWidth="4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {points.map(
        (p) => (
          <circle
            key={
              p.second
            }
            cx={x(
              p.second,
            )}
            cy={y(
              p.motion,
            )}
            r="3"
            fill="#8fffe0"
          />
        ),
      )}

      <text
        x="30"
        y={height - 5}
        fill="#78909b"
        fontSize="10"
      >
        seconds relative to
        onset
      </text>
    </svg>
  );
}

function Insight({
  title,
  text,
}) {
  return (
    <div
      style={
        styles.insight
      }
    >
      <strong>
        {title}
      </strong>

      <p>
        {text}
      </p>
    </div>
  );
}

const styles = {
  header: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "center",
    gap: 20,
    marginBottom: 18,
  },

  selector: {
    display: "grid",
    gap: 5,
    fontSize: 11,
    color: "#78909b",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(150px,1fr))",
    gap: 14,
  },

  statValue: {
    display: "block",
    fontSize: 28,
    marginTop: 9,
  },

  regionList: {
    display: "grid",
    gap: 18,
    marginTop: 22,
  },

  regionHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    marginBottom: 7,
    fontSize: 12,
  },

  emptyChart: {
    display: "grid",
    placeItems: "center",
    minHeight: 220,
    marginTop: 20,
    border:
      "1px dashed #17353f",
    borderRadius: 12,
    color: "#78909b",
    fontSize: 12,
  },

  insights: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(220px,1fr))",
    gap: 12,
    marginTop: 18,
  },

  insight: {
    border:
      "1px solid #17323b",
    background: "#07141a",
    borderRadius: 10,
    padding: 14,
  },
};