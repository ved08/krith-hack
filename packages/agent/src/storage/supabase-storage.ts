import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

/**
 * Thin Supabase Storage wrapper for certificate uploads.
 *
 * Dry-run fallback mirrors the other IO modules in this package — if the
 * SUPABASE_* env vars are missing, uploads return `{ kind: "DRY_RUN" }`
 * with a synthetic URL instead of throwing.
 */

export type UploadResult =
  | { kind: "UPLOADED"; url: string; path: string }
  | { kind: "DRY_RUN"; path: string }
  | { kind: "ERROR"; message: string };

let cachedClient: SupabaseClient | null = null;
let bucketEnsured = false;

function getClient(): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!cachedClient) {
    cachedClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedClient;
}

/** Create the certificates bucket if missing. Idempotent. */
async function ensureBucket(client: SupabaseClient): Promise<void> {
  if (bucketEnsured) return;
  const name = env.SUPABASE_CERTIFICATES_BUCKET;
  const { data: existing } = await client.storage.getBucket(name);
  if (existing) {
    bucketEnsured = true;
    return;
  }
  const { error } = await client.storage.createBucket(name, {
    public: true,
    fileSizeLimit: "10MB",
    allowedMimeTypes: ["application/pdf"],
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`ensureBucket: ${error.message}`);
  }
  bucketEnsured = true;
}

/**
 * Upload a PDF buffer and return its public URL.
 *
 * The final object key is `<folder>/<filename>` when `folder` is supplied,
 * otherwise just `<filename>`. The folder is sanitized to keep the bucket
 * layout predictable (alnum + `._-` only).
 *
 * @param filename object filename (e.g. `evaluation-<id>.pdf`)
 * @param pdf      buffer of a generated PDF
 * @param folder   optional subfolder — typically a user / student id
 */
export async function uploadCertificatePdf(
  filename: string,
  pdf: Buffer | Uint8Array,
  folder?: string | null,
): Promise<UploadResult> {
  const safeFolder = folder ? folder.replace(/[^A-Za-z0-9._-]/g, "_") : "";
  const path = safeFolder ? `${safeFolder}/${filename}` : filename;

  const client = getClient();
  if (!client) {
    console.log(`[storage] (dry-run) would upload ${path} (${pdf.byteLength} bytes)`);
    return { kind: "DRY_RUN", path };
  }

  try {
    await ensureBucket(client);
    const bucket = env.SUPABASE_CERTIFICATES_BUCKET;
    const { error: uploadErr } = await client.storage
      .from(bucket)
      .upload(path, pdf, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadErr) {
      console.error(`[storage] upload failed: ${uploadErr.message}`);
      return { kind: "ERROR", message: uploadErr.message };
    }
    const { data } = client.storage.from(bucket).getPublicUrl(path);
    console.log(`[storage] uploaded ${path} → ${data.publicUrl}`);
    return { kind: "UPLOADED", url: data.publicUrl, path };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[storage] unexpected failure: ${message}`);
    return { kind: "ERROR", message };
  }
}
