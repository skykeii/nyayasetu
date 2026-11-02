import crypto from "crypto";

/** Field-level encryption for student identity in stored state. */
const DEV_KEY = "6e7961796173657475206465762d6f6e6c792066616c6c6261636b206b657921"; // public: never use outside local development
const PREFIX = "enc:v1:";
let warned = false;

function key() {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (raw && /^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  if (!warned) {
    warned = true;
    console.warn(`[nyayasetu] DATA_ENCRYPTION_KEY is ${raw ? "not 64 hex characters" : "not set"}; using the development fallback`);
  }
  return Buffer.from(DEV_KEY, "hex");
}

export function encryptField(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${PREFIX}${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${data.toString("base64")}`;
}

export function decryptField(stored: string) {
  if (!stored.startsWith(PREFIX)) return stored;
  const [iv, tag, data] = stored.slice(PREFIX.length).split(".");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

/** Keyed hash, so a mobile number can be matched at sign-in without decrypting anything. */
export const blindIndex = (value: string) => crypto.createHmac("sha256", key()).update(value).digest("hex");
