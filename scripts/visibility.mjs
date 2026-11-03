// Visibility, freshness, upload and notification test on NEW student complaints (not seeded data).
// node scripts/visibility.mjs [baseUrl]   Run on fresh demo data: it files complaints and changes their status.
const B = process.argv[2] ?? "http://localhost:3000";
const PASSWORD = "Nyaya@Demo2026";
const J = { "Content-Type": "application/json" };
let fails = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? ` (${extra})` : ""}`);
  if (!cond) fails++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  let cookie = "";
  const call = async (path, init = {}) => {
    const res = await fetch(B + path, { redirect: "manual", ...init, headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) } });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const type = res.headers.get("content-type") ?? "";
    const body = type.includes("json") ? await res.json().catch(() => null) : null;
    return { status: res.status, location: res.headers.get("location"), body, bytes: body === null && res.ok ? Buffer.from(await res.arrayBuffer()) : null };
  };
  return { get: (p) => call(p), post: (p, b) => call(p, { method: "POST", headers: J, body: JSON.stringify(b) }), form: (p, f) => call(p, { method: "POST", body: f }) };
}
async function official(email, role) {
  const c = client();
  let r = await c.post("/api/auth/login", { email, password: PASSWORD, role });
  if (r.body?.twoFactor) r = await c.post("/api/auth/login", { challenge: r.body.challenge, code: "123456" });
  if (r.status !== 200) throw new Error(`login ${role} ${email}: ${r.status}`);
  return c;
}
async function student(apaarId, mobile) {
  const c = client();
  await c.post("/api/auth/student", { action: "request", apaarId, mobile, botToken: `mock-${Date.now()}` });
  const r = await c.post("/api/auth/student", { action: "verify", apaarId, mobile, otp: "123456" });
  if (r.status !== 200) throw new Error(`student login ${apaarId}: ${r.status}`);
  return c;
}
const collegeEmail = (name) => `nodal.${name.split(" ").slice(0, 2).join("-").toLowerCase().replace(/[^a-z-]/g, "")}@nyayasetu.demo`;

const ACC = { ca: "a.k.mathur@nyayasetu.demo", rb: "kavita.deshpande@nyayasetu.demo", pgrc: "manoj.kulkarni@nyayasetu.demo", other: "neha.agarwal@nyayasetu.demo", ro: "revathi.krishnan@nyayasetu.demo", college: "nodal.krishna-tejaswi@nyayasetu.demo" };
const u = {};
for (const [role, email] of Object.entries(ACC)) u[role] = await official(email, role);
const s1 = await student("APAAR-2046-1001", "9000000001");
const s2 = await student("APAAR-2046-1002", "9000000002");
const s3 = await student("APAAR-2046-2001", "9000000003");
const me1 = (await s1.get("/api/student/me")).body;
const me3 = (await s3.get("/api/student/me")).body;
const INST = me1.student.institutionId;
const insts = (await u.ca.get("/api/institutions")).body.items;
const inst = insts.find((i) => i.id === INST);
const otherInst = insts.find((i) => i.id === me3.student.institutionId);
u.otherCollege = await official(collegeEmail(otherInst.name), "college");
ok("setup: student 1 and the college desk share an institution", (await u.college.get("/api/college")).body.college.id === INST, inst.name);
ok("setup: student 3 is at another college", otherInst.id !== INST, otherInst.name);

// ---- before
// anti-gaming: a student counts at most 3 times per institution, so a new complaint adds to the counts only below that
const priorCount = async (pseudonym) => (await u.ca.get(`/api/grievances?q=${encodeURIComponent(pseudonym)}`)).body.items.filter((x) => x.institutionId === INST && x.pseudonym === pseudonym).length;
const me2 = (await s2.get("/api/student/me")).body;
const counted = [me1, me2].map((m) => m.student.pseudonym);
const prior = [await priorCount(counted[0]), await priorCount(counted[1])];
const DELTA = prior.filter((n) => n < 3).length;
console.log(`students' earlier complaints here: ${prior.join(", ")}; expected change in capped counts: ${DELTA}`);
const stateRow = async (c) => (await c.get("/api/heatmap")).body.states.find((x) => x.key === inst.state);
const before = {
  dash: (await u.ca.get("/api/dashboard")).body.studentPortal,
  roDash: (await u.ro.get("/api/dashboard")).body.studentPortal,
  heatCa: await stateRow(u.ca),
  heatRo: await stateRow(u.ro),
  heatRb: await stateRow(u.rb),
  report: (await u.ca.get("/api/reports?type=institution")).body.students,
  risk: (await u.ca.get(`/api/institutions/${INST}`)).body.risk.context.countedComplaints,
  list: insts.find((i) => i.id === INST).total,
};

// ---- file two new complaints: text (student 1) and voice (student 2)
const t0 = Date.now();
const f1 = new FormData();
f1.set("text", `Visibility test ${t0}: the college bus on the Kakinada route has not run for two weeks. My phone is 9000000001 and students from villages miss classes.`);
f1.set("language", "en-IN");
f1.set("consent", me1.consent.current);
const a = await s1.form("/api/student/complaints", f1);
const f2 = new FormData();
f2.set("sampleId", "v-te-1");
f2.set("channel", "Voice");
f2.set("consent", me1.consent.current);
const b = await s2.form("/api/student/complaints", f2);
const A = a.body?.complaint?.id;
const Bid = b.body?.complaint?.id;
ok("student 1 files a text complaint", a.status === 200 && !!A, A ?? a.body?.error);
ok("student 2 files a voice complaint (sample audio)", b.status === 200 && !!Bid, Bid ?? b.body?.error);

// ---- freshness: other roles see it within ~6 s (requests land on any server instance)
const until = async (fn) => {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (await fn()) return Date.now() - t0;
    await wait(250);
  }
  return null;
};
const caMs = await until(async () => (await u.ca.get(`/api/grievances?q=${A}`)).body?.items?.some((x) => x.id === A));
const colMs = await until(async () => (await u.college.get("/api/college")).body?.items?.some((x) => x.id === Bid));
ok("Competent Authority sees the new complaint within 6 s", caMs !== null && caMs <= 6000, `${caMs} ms`);
ok("college sees the new complaint within 6 s", colMs !== null && colMs <= 6000, `${colMs} ms`);

// ---- student
const has = (list, id) => list.some((x) => x.id === id);
ok("student 1 sees own complaint, not student 2's", has((await s1.get("/api/student/me")).body.complaints, A) && !has((await s1.get("/api/student/me")).body.complaints, Bid));
ok("student 2 sees own complaint, not student 1's", has((await s2.get("/api/student/me")).body.complaints, Bid) && !has((await s2.get("/api/student/me")).body.complaints, A));
ok("a student at another college sees neither", !(await s3.get("/api/student/me")).body.complaints.some((x) => x.id === A || x.id === Bid));

// ---- college
const desk = (await u.college.get("/api/college")).body;
const colA = desk.items.find((x) => x.id === A);
ok("college desk lists both, masked", !!colA && has(desk.items, Bid) && !colA.text.includes("9000000001") && !("studentId" in colA), colA?.text.slice(-60));
ok("another college sees neither", !(await u.otherCollege.get("/api/college")).body.items.some((x) => x.id === A || x.id === Bid));

// ---- Competent Authority
const g = (await u.ca.get("/api/grievances?filter=college")).body;
ok("CA grievances, With college tab, lists both", has(g.items, A) && has(g.items, Bid));
ok("CA grievances text is masked", !g.items.find((x) => x.id === A).translatedText.includes("9000000001"));
const dash = (await u.ca.get("/api/dashboard")).body.studentPortal;
ok("CA command centre tile counts both", dash.total === before.dash.total + 2 && dash.withCollege === before.dash.withCollege + 2, `${before.dash.total} -> ${dash.total}`);
const caProfile = (await u.ca.get(`/api/institutions/${INST}`)).body;
ok("CA institution profile lists both", has(caProfile.studentComplaints, A) && has(caProfile.studentComplaints, Bid));
ok("profile entries are masked summaries", caProfile.studentComplaints.every((x) => !("studentId" in x) && !("originalText" in x) && !("translatedText" in x)));
ok("risk index counts them at once (capped)", caProfile.risk.context.countedComplaints === before.risk + DELTA, `${before.risk} -> ${caProfile.risk.context.countedComplaints}`);
ok("institution list counts them (capped)", (await u.ca.get("/api/institutions")).body.items.find((i) => i.id === INST).total === before.list + DELTA);
ok("CA heatmap counts them (capped)", (await stateRow(u.ca)).total === before.heatCa.total + DELTA, `${before.heatCa.total} -> ${(await stateRow(u.ca)).total}`);
const rep = (await u.ca.get("/api/reports?type=institution")).body.students;
ok("CA reports count them (capped)", rep.counted === before.report.counted + DELTA, `${before.report.counted} -> ${rep.counted}`);
const caBell = (await u.ca.get("/api/alerts?limit=200")).body.items;
ok("CA bell: new complaint with a deep link", caBell.some((x) => x.id === `new:${A}` && x.href === `/grievances?complaint=${A}`));
const reveal = await u.ca.post("/api/grievances", { action: "reveal", id: A, reason: "Visibility test check" });
ok("CA reveal works and is audit-logged", reveal.status === 200 && (await u.ca.get(`/api/audit?q=${A}`)).body.items?.some((x) => x.action === "IDENTITY_REVEAL"));

// ---- Regional Officer (the college's region)
ok("RO region: institution is in the Southern region", inst.region === "Southern", inst.region);
ok("RO command centre counts both in the region", (await u.ro.get("/api/dashboard")).body.studentPortal.total === before.roDash.total + 2);
ok("RO heatmap counts them (capped)", (await stateRow(u.ro)).total === before.heatRo.total + DELTA);
const roProfile = (await u.ro.get(`/api/institutions/${INST}`)).body;
ok("RO profile lists both, read-only", has(roProfile.studentComplaints, A) && has(roProfile.studentComplaints, Bid));
ok("RO has no grievance desk", (await u.ro.get("/api/grievances")).status === 403);
ok("RO cannot reveal or act", (await u.ro.post("/api/grievances", { action: "reveal", id: A, reason: "not allowed here" })).status === 403);

// ---- bureau officers: profile only while their unit has an open case there, nowhere else
const openBureaus = new Set(caProfile.cases.filter((c) => c.status !== "Disposed").map((c) => c.bureau));
const unit = { rb: ["RB"], pgrc: ["PGRC"], other: ["AB", "PAPB", "ARC"] };
for (const role of ["rb", "pgrc", "other"]) {
  const expect = unit[role].some((x) => openBureaus.has(x));
  const p = (await u[role].get(`/api/institutions/${INST}`)).body;
  ok(`${role}: profile shows them only if the unit has an open case here (${expect})`, has(p.studentComplaints ?? [], A) === expect);
  ok(`${role}: no grievance desk`, (await u[role].get("/api/grievances")).status === 403);
  ok(`${role}: no student tile`, (await u[role].get("/api/dashboard")).body.studentPortal === null);
  ok(`${role}: no student alerts`, !(await u[role].get("/api/alerts?limit=200")).body.items.some((x) => x.message.includes(A)));
}
ok("RB heatmap is cases only", (await stateRow(u.rb)).total === before.heatRb.total);

// ---- uploads as the college: progress note with PNG, proof with PDF
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const note = new FormData();
note.set("kind", "note");
note.set("note", "Bus contractor contacted; a replacement bus starts on Monday.");
note.append("files", new File([PNG], "bus-schedule.png", { type: "image/png" }));
const n = await u.college.form(`/api/college/${A}`, note);
const noteAct = n.body?.complaint?.actions?.find((x) => x.type === "College progress note");
ok("college adds a progress note with a PNG", n.status === 200 && noteAct?.docs?.length === 1 && n.body.complaint.status === "With College", n.body?.error);
const proof = new FormData();
proof.set("kind", "proof");
proof.set("note", "Replacement bus has run on the Kakinada route since Monday; attendance register attached.");
proof.append("files", new File([PDF], "attendance.pdf", { type: "application/pdf" }));
const pr = await u.college.form(`/api/college/${A}`, proof);
ok("college submits proof with a PDF", pr.status === 200 && pr.body.complaint.status === "Resolved - Pending Verification", pr.body?.error);
const fake = new FormData();
fake.set("kind", "note");
fake.set("note", "This file is not really a picture.");
fake.append("files", new File([new TextEncoder().encode("hello")], "fake.png", { type: "image/png" }));
const bad = await u.college.form(`/api/college/${A}`, fake);
ok("wrong file contents are refused with a clear message", bad.status === 400 && /PNG, JPG and PDF/.test(bad.body?.error ?? ""), bad.body?.error);
const big = new FormData();
big.set("kind", "note");
big.set("note", "Oversized attachment check.");
const bigBuf = new Uint8Array(4.2 * 1024 * 1024);
bigBuf.set(PNG);
big.append("files", new File([bigBuf], "big.png", { type: "image/png" }));
const tooBig = await u.college.form(`/api/college/${A}`, big);
ok("files over 4 MB are refused with a clear message", tooBig.status === 400 && /4 MB/.test(tooBig.body?.error ?? ""), tooBig.body?.error ?? tooBig.status);
const pdfName = pr.body.complaint.proof.docs[0].file;
const pngName = noteAct.docs[0].file;

// ---- the student sees the proof and the note's file; downloads are role-checked
const mine = (await s1.get("/api/student/me")).body;
const myA = mine.complaints.find((x) => x.id === A);
ok("student sees the proof awaiting their verdict", myA.status === "Resolved - Pending Verification" && myA.proof?.docs?.[0]?.file === pdfName);
ok("student notification for the proof, with a deep link", mine.notifications.some((x) => x.complaintId === A && /^Proof submitted/.test(x.title) && x.href === `/student?complaint=${A}`));
const dlS = await s1.get(`/api/student/files/${pdfName}`);
ok("student downloads the proof PDF", dlS.status === 200 && dlS.bytes?.subarray(0, 5).toString() === "%PDF-");
ok("student downloads the progress note PNG", (await s1.get(`/api/student/files/${pngName}`)).status === 200);
ok("another student cannot download it", (await s2.get(`/api/student/files/${pdfName}`)).status === 404);
ok("college downloads its own proof", (await u.college.get(`/api/files/${pdfName}`)).status === 200);
ok("another college cannot download it", (await u.otherCollege.get(`/api/files/${pdfName}`)).status === 403);
ok("CA can download it", (await u.ca.get(`/api/files/${pdfName}`)).status === 200);
const rbExpect = openBureaus.has("RB");
ok(`RB download follows profile visibility (${rbExpect})`, ((await u.rb.get(`/api/files/${pdfName}`)).status === 200) === rbExpect);

// ---- verdict and return notifications
const nd = await s1.post(`/api/student/complaints/${A}`, { decision: "not_done", reason: "The bus came for two days only." });
ok("student marks Not done", nd.status === 200 && nd.body.complaint.status === "Escalated to AICTE", nd.body?.error);
const colBell = (await u.college.get("/api/alerts?limit=200")).body.items;
ok("college bell: student verdict, deep link", colBell.some((x) => x.id.startsWith(`colv:${A}:`) && x.href === `/college?complaint=${A}`));
ok("CA bell: escalated after Not done", (await u.ca.get("/api/alerts?limit=200")).body.items.some((x) => x.id === `stu:${A}` && x.href === `/grievances?complaint=${A}`));
const ret = await u.ca.post("/api/grievances", { action: "return", id: A, directions: "Run the bus daily for a month and send the log." });
ok("CA returns it with directions", ret.status === 200, ret.body?.error);
const colBell2 = (await u.college.get("/api/alerts?limit=200")).body.items;
ok("college bell: AICTE return, deep link", colBell2.some((x) => x.id.startsWith(`colr:${A}:`) && x.href === `/college?complaint=${A}`));
const colA2 = (await u.college.get("/api/college")).body.items.find((x) => x.id === A);
ok("returned complaint shows directions and takes new proof", colA2.status === "With College" && colA2.round === 2 && !!colA2.directions);

// ---- deep links survive the sign-in
const anon = client();
const r1 = await anon.get(`/college?complaint=${A}`);
ok("signed-out deep link goes to login with next", r1.status === 307 && decodeURIComponent(r1.location ?? "").includes(`/login?next=/college?complaint=${A}`), r1.location);
const r2 = await u.college.get(`/login?next=${encodeURIComponent(`/college?complaint=${A}`)}`);
ok("after sign-in the college lands on the complaint", r2.status === 307 && (r2.location ?? "").endsWith(`/college?complaint=${A}`), r2.location);
const r3 = await u.college.get(`/login?next=${encodeURIComponent("//evil.example/x")}`);
ok("next cannot point off-site", r3.status === 307 && (r3.location ?? "").endsWith("/college"), r3.location);
const r4 = await u.rb.get(`/login?next=${encodeURIComponent(`/grievances?complaint=${A}`)}`);
ok("next to a page the role cannot open falls back to its landing", (r4.location ?? "").endsWith("/desk"), r4.location);

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
console.log(`FILES ${pdfName} ${pngName}`);
process.exit(fails ? 1 : 0);
