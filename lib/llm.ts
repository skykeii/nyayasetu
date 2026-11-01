import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { UPLOAD_DIR } from "./store";
import type { Category, DocRef, EvidenceReport, Severity } from "./types";
import { CATEGORIES } from "./types";

/** Optional LLM features. Every call returns null when no key is set or on any failure, and callers fall back. */
const MODEL = "claude-opus-5-5";
export const hasLlm = () => Boolean(process.env.ANTHROPIC_API_KEY);

async function askJson<T>(content: Anthropic.Beta.BetaContentBlockParam[], schema: Record<string, unknown>): Promise<T | null> {
  if (!hasLlm()) return null;
  try {
    const client = new Anthropic({ timeout: 30_000, maxRetries: 1 });
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: { type: "object", additionalProperties: false, required: Object.keys((schema as { properties: object }).properties), ...schema } } },
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason !== "end_turn") return null;
    const text = res.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
    return text ? (JSON.parse(text) as T) : null;
  } catch (e) {
    console.error("[nyayasetu] llm call failed, using fallback", e);
    return null;
  }
}

export interface Analysis {
  translation: string;
  category: Category;
  severity: Severity;
  reason: string;
}

export function analyzeComplaint(text: string, language: string) {
  return askJson<Analysis>(
    [{ type: "text", text: `This is a ${language} complaint about an Indian technical college, submitted to the regulator AICTE. Translate it faithfully into English without adding facts, then classify it. In "reason", give one short line on why the category and severity fit.\n\nComplaint:\n${text}` }],
    {
      properties: {
        translation: { type: "string" },
        category: { type: "string", enum: CATEGORIES },
        severity: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
        reason: { type: "string" },
      },
    }
  );
}

export async function checkEvidence(o: { complaint: string; category: Category; note: string; docs: DocRef[]; at: string }): Promise<EvidenceReport | null> {
  const images: Anthropic.Beta.BetaImageBlockParam[] = [];
  for (const d of o.docs) {
    const media = /\.png$/i.test(d.name) ? "image/png" : /\.jpe?g$/i.test(d.name) ? "image/jpeg" : /\.webp$/i.test(d.name) ? "image/webp" : null;
    if (media && d.file) images.push({ type: "image", source: { type: "base64", media_type: media, data: fs.readFileSync(path.join(UPLOAD_DIR, d.file)).toString("base64") } });
  }
  const out = await askJson<{ score: number; explanation: string }>(
    [
      ...images,
      { type: "text", text: `A college says it resolved this ${o.category} complaint.\n\nComplaint: ${o.complaint}\n\nCollege's note: ${o.note}\n\nJudge how well the attached proof${images.length ? "" : " (no image was attached)"} and note match the complaint. Score 0-100. Explain in two short sentences, stating what you could and could not confirm. This is advisory, not proof.` },
    ],
    { properties: { score: { type: "integer" }, explanation: { type: "string" } } }
  );
  if (!out) return null;
  const score = Math.max(0, Math.min(100, Math.round(out.score)));
  return { score, verdict: score >= 70 ? "Likely matches" : score >= 50 ? "Partial match" : "Weak match", explanation: out.explanation, source: "llm", at: o.at };
}
