import { withApi } from "@/lib/api";
import { aiStatus } from "@/lib/groq";
import { json } from "@/lib/server";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => json(await aiStatus()));
