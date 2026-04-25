/**
 * Temporary smoke test: build a sample certificate PDF and upload it to
 * Supabase Storage under a per-user folder.
 *
 * Run with:
 *   bun run scripts/test-upload-certificate.ts
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env. Without them
 * the upload falls through as a dry-run (no network call).
 */

import { randomUUID } from "node:crypto";
import { buildCertificatePdf } from "../packages/agent/src/admissions/certificate.js";
import { sendCertificateWhatsApp } from "../packages/agent/src/notifications/whatsapp.js";
import { uploadCertificatePdf } from "../packages/agent/src/storage/supabase-storage.js";

// Set TEST_WHATSAPP_TO to a verified E.164 number to actually send the
// WhatsApp notification after upload. Leave unset to skip the send step.
const TEST_WHATSAPP_TO = process.env.TEST_WHATSAPP_TO;

async function main() {
  const evaluationId = randomUUID();
  const userId = `test-user-${Date.now()}`;

  console.log(`[test] building certificate for evaluation ${evaluationId}`);
  const pdf = await buildCertificatePdf({
    studentName: "Arjun Sharma",
    parentName: "Priya Sharma",
    schoolName: "Oakridge International School",
    currentClass: "Grade 5",
    overallScore: 82,
    readinessBand: "advanced",
    summary:
      "Arjun shows strong analytical reasoning and a curious disposition across STEM prompts.",
    strengths: [
      "Decomposes multi-step problems clearly",
      "Connects concepts across subjects",
      "Articulates reasoning in full sentences",
    ],
    growthAreas: [
      "Slow down before answering to avoid arithmetic slips",
      "Practice handwriting speed for timed responses",
    ],
    recommendedActions: [
      "Daily 10-minute mental math warm-up",
      "Weekly project-based STEM challenge",
      "Guided reading of age-appropriate non-fiction",
    ],
    certificateHeadline: "Advanced Learner — Analytical Thinker",
    evaluationId,
    evaluatedAtIso: new Date().toISOString(),
  });
  console.log(`[test] built PDF (${pdf.byteLength} bytes)`);

  console.log(`[test] uploading under folder "${userId}"`);
  const result = await uploadCertificatePdf(
    `evaluation-${evaluationId}.pdf`,
    pdf,
    userId,
  );

  console.log("[test] result:", result);
  if (result.kind === "UPLOADED") {
    console.log(`\n✓ public url: ${result.url}`);
  } else if (result.kind === "DRY_RUN") {
    console.log(
      "\n! dry-run — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env to actually upload",
    );
  } else {
    console.log(`\n✗ upload failed: ${result.message}`);
    process.exit(1);
  }

  if (!TEST_WHATSAPP_TO) {
    console.log(
      "\n[test] skipping WhatsApp — set TEST_WHATSAPP_TO=+<E164> to exercise the sender",
    );
    return;
  }
  if (result.kind !== "UPLOADED") {
    console.log("\n[test] skipping WhatsApp — no real certificate URL to send");
    return;
  }

  console.log(`\n[test] sending WhatsApp notification to ${TEST_WHATSAPP_TO}`);
  const send = await sendCertificateWhatsApp({
    parentPhoneE164: TEST_WHATSAPP_TO,
    parentName: "Priya Sharma",
    studentName: "Arjun Sharma",
    schoolName: "Oakridge International School",
    headline: "Advanced Learner — Analytical Thinker",
    overallScore: 82,
    readinessBand: "advanced",
    summary:
      "Arjun shows strong analytical reasoning and a curious disposition across STEM prompts.",
    strengths: [
      "Decomposes multi-step problems clearly",
      "Connects concepts across subjects",
      "Articulates reasoning in full sentences",
    ],
    growthAreas: [
      "Slow down before answering to avoid arithmetic slips",
      "Practice handwriting speed for timed responses",
    ],
    recommendedActions: [
      "Daily 10-minute mental math warm-up",
      "Weekly project-based STEM challenge",
      "Guided reading of age-appropriate non-fiction",
    ],
    certificateUrl: result.url,
  });
  console.log("[test] whatsapp result:", send);
  if (send.kind === "ERROR") process.exit(1);
}

main().catch((e) => {
  console.error("[test] fatal:", e);
  process.exit(1);
});
