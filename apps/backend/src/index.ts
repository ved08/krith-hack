import { serve } from "@hono/node-server";
import { env as agentEnv } from "@campus/agent";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env.js";
import { startAttendanceDailyCron } from "./jobs/attendance-cron.js";
import { admissionsRouter } from "./routes/admissions.js";
import { agentRouter } from "./routes/agent.js";
import { webhookRouter } from "./routes/webhook.js";

const app = new Hono();

// Global middleware. Order matters: logger first so we see every request,
// CORS next so preflight passes before route handlers run.
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*", // tighten to the dashboard origin for production
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/", (c) => c.json({ service: "campus-cortex-backend", status: "ok" }));
app.get("/health", (c) => c.json({ success: true, data: { status: "ok" } }));

// Twilio WhatsApp inbound — form-encoded, TwiML response.
app.route("/", webhookRouter);

// JSON entrypoint for dashboards and curl-based testing.
app.route("/", agentRouter);

// Admissions kiosk (Phase 2) LLM endpoints.
app.route("/", admissionsRouter);

serve({ fetch: app.fetch, port: env.PORT });

startAttendanceDailyCron({
  enabled: env.ATTENDANCE_CRON_ENABLED,
  expression: env.ATTENDANCE_CRON_EXPRESSION,
  timezone: env.ATTENDANCE_CRON_TIMEZONE,
});

console.log(
  `[campus-cortex-backend] listening on :${env.PORT} (MOCK_LLM=${agentEnv.MOCK_LLM})`,
);
