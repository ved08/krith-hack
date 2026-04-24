/**
 * Thin re-export so the backend webhook keeps its existing import path
 * while the single implementation lives in `@campus/agent` (where it can
 * also be called by the admissions flow).
 */
export { sendWhatsAppMessage } from "@campus/agent";
export type { WhatsAppSendResult } from "@campus/agent";
