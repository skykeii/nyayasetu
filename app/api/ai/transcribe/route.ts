import { z } from "zod";
import { ApiError, parseForm, validate, withApi } from "@/lib/api";
import { MAX_UPLOAD } from "@/lib/files";
import { transcribe } from "@/lib/groq";
import { LANGUAGES } from "@/lib/intake";
import { rateLimit } from "@/lib/ratelimit";
import { json, viewerFrom } from "@/lib/server";

export const dynamic = "force-dynamic";

const Fields = z.object({ language: z.enum(LANGUAGES.map((l) => l.code) as [string, ...string[]]), durationSec: z.coerce.number().min(0).max(61, "Recordings can be at most 60 seconds") });

export const POST = withApi(async (req) => {
  const v = viewerFrom(req);
  rateLimit(`ai:${v.accountId}`, 30, 60000);
  const form = await parseForm(req);
  const f = validate(Fields, { language: form.get("language"), durationSec: form.get("durationSec") });
  const audio = form.get("audio");
  if (!(audio instanceof File) || !audio.size) throw new ApiError(400, "No audio received");
  if (audio.size > MAX_UPLOAD) throw new ApiError(400, "Recordings can be at most 4 MB");
  if (!/^(audio|video)\//.test(audio.type)) throw new ApiError(400, "Unsupported audio format");
  const out = await transcribe(audio, audio.name || "voice.webm", f.language);
  if (!out) throw new ApiError(503, "AI transcription is unavailable. Use browser speech recognition, a sample, or type instead.");
  return json(out);
});
