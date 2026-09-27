/*
 * Temporary hackathon sensor bridge.
 *
 * GET  /api/heart-rate
 * POST /api/heart-rate
 *
 * POST example:
 *
 * {
 *   "heartRate": 87,
 *   "timestamp": "2026-09-27T04:15:00.000Z",
 *   "source": "HealthKit"
 * }
 *
 * This is intentionally in-memory for now.
 * Restarting Vite clears the latest sample.
 */

let latestSample = {
  heartRate: null,
  timestamp: null,
  source: null,
};

function send(res, status, value) {
  res.statusCode = status;

  res.setHeader(
    "Content-Type",
    "application/json",
  );

  res.end(JSON.stringify(value));
}

async function readBody(req) {
  let body = "";

  for await (const chunk of req) {
    body += chunk;
  }

  return body
    ? JSON.parse(body)
    : {};
}

async function handle(req, res) {
  if (req.method === "GET") {
    return send(
      res,
      200,
      latestSample,
    );
  }

  if (req.method === "POST") {
    const body = await readBody(req);

    const heartRate = Number(
      body.heartRate,
    );

    if (
      !Number.isFinite(heartRate) ||
      heartRate < 20 ||
      heartRate > 250
    ) {
      return send(res, 400, {
        error:
          "heartRate must be a number between 20 and 250 bpm",
      });
    }

    const suppliedTimestamp =
      body.timestamp
        ? new Date(body.timestamp)
        : new Date();

    if (
      Number.isNaN(
        suppliedTimestamp.getTime(),
      )
    ) {
      return send(res, 400, {
        error: "Invalid timestamp",
      });
    }

    latestSample = {
      heartRate: Math.round(
        heartRate,
      ),

      timestamp:
        suppliedTimestamp.toISOString(),

      source:
        String(
          body.source ??
            "HealthKit",
        ),
    };

    console.log(
      `[heart-rate] ${latestSample.heartRate} bpm from ${latestSample.source}`,
    );

    return send(
      res,
      200,
      latestSample,
    );
  }

  return send(res, 405, {
    error: "Method not allowed",
  });
}

function middleware(req, res, next) {
  const url = new URL(
    req.url,
    "http://localhost",
  );

  if (
    url.pathname !==
    "/api/heart-rate"
  ) {
    return next();
  }

  handle(req, res).catch((error) => {
    console.error(
      "[heart-rate api]",
      error,
    );

    send(
      res,
      error instanceof SyntaxError
        ? 400
        : 500,
      {
        error: error.message,
      },
    );
  });
}

export default function heartRateApi() {
  return {
    name: "heart-rate-api",

    configureServer(server) {
      server.middlewares.use(
        middleware,
      );
    },

    configurePreviewServer(server) {
      server.middlewares.use(
        middleware,
      );
    },
  };
}