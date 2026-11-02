// Smoke test: node scripts/smoke.mjs [baseUrl]
// Run against a server on fresh demo data, e.g. `npm run reseed && npm run build && npm start`.
import fs from "fs";

const B = process.argv[2] ?? "http://localhost:3000";
const PASSWORD = "Nyaya@Demo2026";
let fails = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!cond) fails++;
};
const JSONH = { "Content-Type": "application/json" };

function client() {
  let cookie = "";
  const call = async (path, init = {}) => {
    const res = await fetch(B + path, { redirect: "manual", ...init, headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) } });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const type = res.headers.get("content-type") ?? "";
    return { status: res.status, location: res.headers.get("location"), body: type.includes("json") ? await res.json().catch(() => null) : null };
  };
  return { get: (p, headers) => call(p, { headers }), post: (p, body) => call(p, { method: "POST", headers: JSONH, body: JSON.stringify(body) }), form: (p, f) => call(p, { method: "POST", body: f }) };
}

async function official(email, role) {
  const c = client();
  let r = await c.post("/api/auth/login", { email, password: PASSWORD, role });
  if (r.body?.twoFactor) r = await c.post("/api/auth/login", { challenge: r.body.challenge, code: "123456" });
  return { c, r };
}
async function student(apaarId, mobile) {
  const c = client();
  await c.post("/api/auth/student", { action: "request", apaarId, mobile, botToken: `mock-${Date.now()}` });
  const r = await c.post("/api/auth/student", { action: "verify", apaarId, mobile, otp: "123456" });
  return { c, r };
}

const ACCOUNTS = { ca: "a.k.mathur@nyayasetu.demo", rb: "kavita.deshpande@nyayasetu.demo", pgrc: "manoj.kulkarni@nyayasetu.demo", other: "neha.agarwal@nyayasetu.demo", ro: "revathi.krishnan@nyayasetu.demo", college: "nodal.krishna-tejaswi@nyayasetu.demo" };
const LANDING = { ca: "/", rb: "/desk", pgrc: "/desk", other: "/desk", ro: "/", college: "/college" };
const png = () => new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], "proof.png", { type: "image/png" });

// ---- login for each role
const s = {};
for (const role of Object.keys(ACCOUNTS)) {
  const { c, r } = await official(ACCOUNTS[role], role);
  s[role] = c;
  ok(`login ${role}`, r.status === 200 && r.body?.landing === LANDING[role], r.body?.landing);
  const me = await c.get("/api/meta");
  ok(`session role ${role}`, me.body?.viewer?.role?.key === role);
}
const stu1 = await student("APAAR-2046-1001", "9000000001");
ok("login student (OTP)", stu1.r.status === 200 && stu1.r.body?.landing === "/student");
for (const [id, m] of [["APAAR-2046-1002", "9000000002"], ["APAAR-2046-2001", "9000000003"]]) ok(`login ${id}`, (await student(id, m)).r.status === 200);
const anon = client();
const wrong = await anon.post("/api/auth/login", { email: ACCOUNTS.rb, password: "wrong", role: "rb" });
ok("wrong password refused with generic text", wrong.status === 401 && !/password/i.test(wrong.body.error), wrong.body?.error);
const noCode = await anon.post("/api/auth/login", { email: ACCOUNTS.ca, password: PASSWORD, role: "ca" });
ok("Competent Authority needs 2FA", !!noCode.body?.twoFactor);
const mismatch = await anon.post("/api/auth/login", { email: ACCOUNTS.rb, password: PASSWORD, role: "ca" });
ok("account must match the chosen role", mismatch.status === 401);
for (let i = 0; i < 5; i++) await anon.post("/api/auth/login", { email: "locked.user@nyayasetu.demo", password: "x", role: "rb" });
const locked = await anon.post("/api/auth/login", { email: "locked.user@nyayasetu.demo", password: PASSWORD, role: "rb" });
ok("lockout after 5 failures", locked.status === 401);

// ---- forged headers and guards
const none = client();
ok("no session: API 401", (await none.get("/api/cases")).status === 401);
const page = await none.get("/cases");
ok("no session: page redirects to /login", page.status === 307 && page.location?.endsWith("/login"));
ok("forged x-role ignored with no session", (await none.get("/api/audit", { "x-role": "ca" })).status === 401);
ok("forged _role query ignored", (await none.get("/api/audit?_role=ca")).status === 401);
const forged = await s.rb.get("/api/audit", { "x-role": "ca", "x-officer": "CA-1" });
ok("forged x-role ignored for an RB officer", forged.status === 403);
const forged2 = await s.rb.get("/api/meta", { "x-role": "ca", "x-nys-viewer": encodeURIComponent(JSON.stringify({ role: "ca", officerId: "CA-1", accountId: "CA-1", region: "Southern" })) });
ok("forged internal header ignored", forged2.body?.viewer?.role?.key === "rb");
for (const [who, path] of [["rb", "/api/audit"], ["rb", "/api/settings"], ["rb", "/api/reset"], ["ro", "/api/intake"], ["ro", "/api/simulate"], ["college", "/api/cases"], ["college", "/api/grievances"], ["college", "/api/heatmap"]]) {
  const r = path === "/api/reset" || path === "/api/intake" || path === "/api/simulate" ? await s[who].post(path, {}) : await s[who].get(path);
  ok(`403 ${who} ${path}`, r.status === 403, String(r.status));
}
ok("403 student /api/cases", (await stu1.c.get("/api/cases")).status === 403);
ok("student page guard", (await stu1.c.get("/cases")).location?.endsWith("/student"));
ok("college page guard", (await s.college.get("/cases")).location?.endsWith("/college"));
ok("officer settings page guard", (await s.rb.get("/settings")).location?.endsWith("/desk"));
ok("Origin check on mutations", (await fetch(`${B}/api/auth/logout`, { method: "POST", headers: { Origin: "https://evil.example" } })).status === 403);

// ---- seed data unchanged
const all = await s.ca.get("/api/cases?pageSize=1");
ok("344 seeded cases", all.body.total === 344, String(all.body.total));
const overlaps = (await s.ca.get("/api/overlaps")).body.items;
ok("15 cross-bureau clusters", overlaps.filter((o) => o.kind === "cross-bureau").length === 15);

// ---- demo students show every state
const me = (await stu1.c.get("/api/student/me")).body;
const states = new Set(me.complaints.map((c) => `${c.status}/${c.round}`));
ok("demo student states", ["With College/1", "Resolved - Pending Verification/1", "Escalated to AICTE/1", "Resolved - Pending Verification/2"].every((x) => states.has(x)), [...states].join(", "));
ok("verdict only where proof exists", me.complaints.filter((c) => c.status === "Resolved - Pending Verification").every((c) => c.proof));
ok("student view hides flags", !JSON.stringify(me).includes("overlapFlags") && !JSON.stringify(me).includes("suspicious"));

// ---- student 2-round loop
const noConsent = new FormData();
noConsent.set("text", "The library has been closed for three weeks and no books can be borrowed by anyone.");
noConsent.set("language", "en-IN");
ok("consent required", (await stu1.c.form("/api/student/complaints", noConsent)).status === 400);
const f = new FormData();
f.set("text", "My name is Sravani Yerramilli, roll no KTIT22CS041, phone 9000000001. The library has been closed for three weeks and no books can be borrowed.");
f.set("language", "en-IN");
f.set("consent", me.consent.current);
const filed = await stu1.c.form("/api/student/complaints", f);
const id = filed.body?.complaint?.id;
ok("new complaint is with the college at once", filed.body?.complaint?.status === "With College" && filed.body.complaint.reminders.length > 0 && filed.body.complaint.urgency.daysLeft > 0, id);
const again = new FormData();
for (const [k, v] of f.entries()) again.set(k, v);
const dup = await stu1.c.form("/api/student/complaints", again);
ok("similar own complaint warned", dup.status === 409 && !!dup.body?.similar);
const blockedVerdict = await stu1.c.post(`/api/student/complaints/${id}`, { decision: "done" });
ok("no verdict before proof", blockedVerdict.status === 400);
const college = (await s.college.get("/api/college")).body;
const raw = JSON.stringify(college);
for (const secret of ["Sravani", "Yerramilli", "KTIT22CS041", "9000000001", "APAAR-2046-1001", "overlapFlags", "suspicious"]) ok(`college cannot see ${secret}`, !raw.includes(secret));
const proof = async (note, file = png()) => {
  const p = new FormData();
  p.set("note", note);
  p.append("files", file);
  return s.college.form(`/api/college/${id}`, p);
};
ok("fake PNG refused by magic bytes", (await proof("Library reopened and staff assigned.", new File(["MZ not a png"], "x.png"))).status === 400);
ok("round 1 proof accepted", (await proof("Library reopened and staff assigned.")).body?.complaint?.status === "Resolved - Pending Verification");
ok("Not done needs a reason", (await stu1.c.post(`/api/student/complaints/${id}`, { decision: "not_done" })).status === 400);
const r1 = await stu1.c.post(`/api/student/complaints/${id}`, { decision: "not_done", reason: "The library is still locked." });
ok("round 1 Not done escalates", r1.body?.complaint?.status === "Escalated to AICTE" && !!r1.body.complaint.caseId, r1.body?.complaint?.caseId);
const caseId = r1.body.complaint.caseId;
const back = await s.ca.post("/api/grievances", { action: "return", id, directions: "Open the library and send dated photographs." });
ok("AICTE returns with directions", back.status === 200);
const round2 = (await stu1.c.get("/api/student/me")).body.complaints.find((c) => c.id === id);
ok("round 2 back with the college, no stale verdict", round2.round === 2 && round2.status === "With College" && !round2.proof);
ok("round 2 proof accepted", (await proof("Library open from 9 to 5, photographs attached.")).body?.complaint?.round === 2);
const r2 = await stu1.c.post(`/api/student/complaints/${id}`, { decision: "not_done", reason: "Open for one hour only." });
ok("verdict asked again in round 2", r2.status === 200 && r2.body.complaint.status === "Escalated to AICTE");
const desk = (await s.ca.get(`/api/grievances?filter=critical`)).body.items;
ok("2 Not done flags Critical on the desk", desk.some((c) => c.id === id && c.criticalFlag));
const c2 = (await s.ca.get(`/api/cases/${caseId}`)).body.case;
ok("AICTE case carries the pseudonym only", c2.complainantName.startsWith("Student #") && !JSON.stringify(c2).includes("Sravani"));
const reveal = await s.rb.post("/api/grievances", { action: "reveal", id, reason: "testing" });
ok("reveal refused to non-CA", reveal.status === 403 || reveal.status === 404);
const shown = await s.ca.post("/api/grievances", { action: "reveal", id, reason: "Abuse check" });
ok("CA reveal decrypts identity", shown.body?.identity?.name === "Sravani Yerramilli");
ok("reveal is audit-logged", (await s.ca.get("/api/audit?q=IDENTITY_REVEAL")).body.total === 1);

// ---- officer intake duplicate check
const preview = await s.rb.post("/api/intake", { action: "preview", text: "Krishna Tejaswi Institute of Technology has no working labs and runs from a rented building; practicals happen without equipment.", language: "en-IN", institutionText: "Krishna Tejaswi Institute of Technology" });
ok("intake pre-fills institution and category", !!preview.body?.institutionId && !!preview.body?.category, preview.body?.category);
ok("intake finds similar open cases", preview.body?.similar?.length > 0, preview.body?.similar?.map((x) => `${x.caseId} ${x.confidence}`).join(", "));
const target = preview.body.similar[0];
const payload = (decision) => {
  const fd = new FormData();
  fd.set("payload", JSON.stringify({ text: preview.body.original, language: "en-IN", translation: preview.body.translation, subject: preview.body.subject, institutionId: preview.body.institutionId, category: preview.body.category, severity: preview.body.severity, bureau: preview.body.routing.bureau, officerId: preview.body.routing.officerId, channel: "Letter", complainantType: "Parent", contact: "parent@example.com", decision }));
  return fd;
};
const noDecision = await s.rb.form("/api/intake", payload());
ok("save blocked until a decision", noDecision.status === 409 && noDecision.body?.similar?.length > 0);
ok("decision needs remarks", (await s.rb.form("/api/intake", payload({ type: "link", targetId: target.caseId, leadBureau: target.bureau, remarks: "" }))).status === 400);
const linked = await s.rb.form("/api/intake", payload({ type: "link", targetId: target.caseId, leadBureau: target.bureau, remarks: "Same labs issue, coordinating." }));
ok("link as related saved", linked.status === 200, linked.body?.id);
const lc = (await s.ca.get(`/api/cases/${linked.body.id}`)).body;
ok("decision on timeline and in a link group", !!lc.case.linkGroupId && lc.case.actions.some((a) => a.type === "Linked"));
ok("decision in audit trail", (await s.ca.get(`/api/audit?q=${linked.body.id}`)).body.items.some((a) => a.action === "INTAKE_CASE" && a.detail.includes("Linked")));
const dupOf = await s.rb.form("/api/intake", payload({ type: "duplicate", targetId: target.caseId, remarks: "Exact duplicate of the earlier letter." }));
ok("mark duplicate saved", dupOf.body?.duplicateOf === target.caseId);

// ---- AI layer falls back without a key
const status = await s.rb.get("/api/ai/status");
ok("AI status responds", typeof status.body?.live === "boolean", status.body?.live ? "Groq live" : "offline fallback");
const brief = await s.rb.post("/api/ai/brief", { id: target.caseId });
ok("case brief returned", brief.status === 200 && brief.body.brief.length > 20, brief.body?.source);

// ---- audit chain
const verify = await s.ca.post("/api/audit", {});
ok("audit chain verifies", verify.body?.ok === true, `${verify.body?.checked} entries`);

// ---- map
const paths = fs.readFileSync(new URL("../lib/india-paths.ts", import.meta.url), "utf8");
const count = (paths.match(/name: "/g) ?? []).length;
ok("map has 36 states and UTs", count === 36, String(count));
const hm = (await s.ca.get("/api/heatmap")).body;
ok("every data state has a map shape", hm.states.every((x) => paths.includes(`name: "${x.key}"`)), hm.states.filter((x) => !paths.includes(`name: "${x.key}"`)).map((x) => x.key).join(", "));
ok("map page renders for an officer", (await s.ca.get("/heatmap")).status === 200);

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
