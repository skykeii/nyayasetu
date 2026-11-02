import crypto from "crypto";
import fs from "fs";
import path from "path";
import { UPLOAD_DIR, supabaseClient } from "./store";
import type { DocRef } from "./types";

/** Uploads live outside /public and are only served through role-checked routes. */
export const MAX_UPLOAD = 4 * 1024 * 1024; // Vercel's request limit is about 4.5 MB
const BUCKET = "uploads";

const KINDS: { ext: RegExp; magic: number[]; suffix: string }[] = [
  { ext: /\.png$/i, magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], suffix: ".png" },
  { ext: /\.jpe?g$/i, magic: [0xff, 0xd8, 0xff], suffix: ".jpg" },
  { ext: /\.pdf$/i, magic: [0x25, 0x50, 0x44, 0x46, 0x2d], suffix: ".pdf" },
];

async function store(name: string, buf: Buffer) {
  const sb = supabaseClient();
  if (sb) {
    const { error } = await sb.storage.from(BUCKET).upload(name, buf, { contentType: "application/octet-stream" });
    if (error) throw error;
    return;
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
}

export async function readUpload(name: string): Promise<Buffer | null> {
  const safe = path.basename(name);
  const sb = supabaseClient();
  if (sb) {
    const { data, error } = await sb.storage.from(BUCKET).download(safe);
    return error || !data ? null : Buffer.from(await data.arrayBuffer());
  }
  const p = path.join(UPLOAD_DIR, safe);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

export async function saveUploads(files: FormDataEntryValue[]): Promise<{ docs: DocRef[]; error?: string }> {
  const prepared: { file: File; buf: Buffer; suffix: string }[] = [];
  for (const f of files) {
    if (typeof f === "string" || !f.size) continue;
    if (f.size > MAX_UPLOAD) return { docs: [], error: "Each file must be 4 MB or smaller" };
    const buf = Buffer.from(await f.arrayBuffer());
    const kind = KINDS.find((k) => k.ext.test(f.name) && k.magic.every((b, i) => buf[i] === b));
    if (!kind) return { docs: [], error: "Only PNG, JPG and PDF files are accepted, and the contents must match the file type" };
    prepared.push({ file: f, buf, suffix: kind.suffix });
  }
  if (prepared.reduce((s, p) => s + p.file.size, 0) > MAX_UPLOAD) return { docs: [], error: "Attachments must total 4 MB or less" };
  const docs: DocRef[] = [];
  for (const p of prepared) {
    const name = `${crypto.randomBytes(16).toString("hex")}${p.suffix}`;
    await store(name, p.buf);
    docs.push({ name: p.file.name.replace(/[^\w .()-]/g, "_").slice(-80), size: p.file.size, file: name });
  }
  return { docs };
}

export async function sendFile(name: string, doc: DocRef) {
  const buf = await readUpload(name);
  if (!buf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(buf), { headers: { "Content-Disposition": `attachment; filename="${doc.name.replace(/["\r\n]/g, "")}"`, "Content-Type": "application/octet-stream", "X-Content-Type-Options": "nosniff" } });
}
