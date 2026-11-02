// npm run reseed: clears demo state. The next request regenerates the deterministic seed.
import fs from "fs";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (url && key) {
  const res = await fetch(`${url}/rest/v1/app_state?id=eq.1`, { method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    console.error(`Could not reset the Supabase row (${res.status})`);
    process.exit(1);
  }
  console.log("Supabase app_state row removed; the next request reseeds it");
} else {
  fs.rmSync("data/db.json", { force: true });
  console.log("db.json removed; restart the server to reseed");
}
