import { serve } from "@hono/node-server";
import { env as agentEnv } from "@campus/agent";
import { Hono } from "hono";
import { env } from "./env.js";
import { admissionsRouter } from "./routes/admissions.js";
import { agentRouter } from "./routes/agent.js";
import { webhookRouter } from "./routes/webhook.js";

const app = new Hono();

app.get("/", (c) => c.json({ service: "campus-cortex-backend", status: "ok" }));
app.get("/health", (c) => c.json({ success: true, data: { status: "ok" } }));

// Twilio WhatsApp inbound — form-encoded, TwiML response.
app.route("/", webhookRouter);

// JSON entrypoint for dashboards and curl-based testing.
app.route("/", agentRouter);

// Admissions kiosk (Phase 2) LLM endpoints.
app.route("/", admissionsRouter);

serve({ fetch: app.fetch, port: env.PORT });

console.log(
  `[campus-cortex-backend] listening on :${env.PORT} (MOCK_LLM=${agentEnv.MOCK_LLM})`,
);
