// Browser check of deep links and the college upload for three roles, driving headless Chrome over CDP.
// node scripts/browser-check.mjs [baseUrl] [outDir]   Needs Chrome; run on fresh demo data.
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const B = process.argv[2] ?? "http://localhost:3000";
const OUT = path.resolve(process.argv[3] ?? path.join(os.tmpdir(), "nyayasetu-browser-check"));
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${OUT}/profile`, "--window-size=1400,1000", "about:blank"], { stdio: "ignore" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? ` (${extra})` : ""}`);
  if (!cond) fails++;
};

let target;
for (let i = 0; i < 40 && !target; i++) {
  await wait(500);
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
  } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    pending.get(d.id)(d);
    pending.delete(d.id);
  }
  if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description?.slice(0, 160) ?? d.params.exceptionDetails.text);
};
const cdp = (method, params = {}) =>
  new Promise((res) => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("DOM.enable");
const js = async (expression) => (await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const go = async (p, ms = 3000) => {
  await cdp("Page.navigate", { url: B + p });
  await wait(ms);
};
const shot = async (name) => fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
const until = async (expr, ms = 12000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await js(expr)) return true;
    await wait(300);
  }
  return false;
};
const logout = () => js("fetch('/api/auth/logout',{method:'POST'}).then(()=>1)");
const official = (email, role) => js(`(async()=>{const p=(b)=>fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});let r=await p({email:'${email}',password:'Nyaya@Demo2026',role:'${role}'});let j=await r.json();if(j.twoFactor){r=await p({challenge:j.challenge,code:'123456'});}return r.status})()`);
const studentLogin = (id, m) => js(`(async()=>{const p=(b)=>fetch('/api/auth/student',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});await p({action:'request',apaarId:'${id}',mobile:'${m}',botToken:'mock-'+Date.now()});return (await p({action:'verify',apaarId:'${id}',mobile:'${m}',otp:'123456'})).status})()`);

// a NEW complaint from student 1, filed in the browser session
await go("/login", 2000);
await studentLogin("APAAR-2046-1001", "9000000001");
const A = await js(`(async()=>{const me=await (await fetch('/api/student/me')).json();const f=new FormData();f.set('text','Browser check '+Date.now()+': the drinking water cooler in block C has been broken for ten days.');f.set('language','en-IN');f.set('consent',me.consent.current);const r=await fetch('/api/student/complaints',{method:'POST',body:f});return (await r.json()).complaint?.id})()`);
ok("student files a new complaint", !!A, A);
await logout();

// 1. signed out: the deep link survives the sign-in
await go(`/college?complaint=${A}`, 2000);
const loginUrl = await js("location.pathname+location.search");
ok("signed-out deep link lands on login with next", loginUrl === `/login?next=${encodeURIComponent(`/college?complaint=${A}`)}`, loginUrl);
await official("nodal.krishna-tejaswi@nyayasetu.demo", "college");
await go(`/login?next=${encodeURIComponent(`/college?complaint=${A}`)}`, 3500);
ok("after sign-in the college is on the complaint", (await js("location.pathname+location.search")) === `/college?complaint=${A}`);
ok("college: the complaint panel is open", await until(`!!document.querySelector('#complaint-${A} [aria-expanded=true]') && document.querySelector('#complaint-${A}').innerText.includes('Mark resolved, send to student')`));
const panel = await js(`document.querySelector('#complaint-${A}').innerText`);
ok("panel shows urgency, SLA, timeline and both forms", /Urgency/.test(panel) && /Disposal date \(SLA\)/.test(panel) && /Timeline/.test(panel) && /Add progress note/.test(panel));

// upload a PNG through the progress-note form
const png = path.join(OUT, "progress-photo.png");
fs.writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const doc = (await cdp("DOM.getDocument", { depth: -1 })).result.root.nodeId;
const input = (await cdp("DOM.querySelector", { nodeId: doc, selector: `#complaint-${A} input[aria-label="Progress note files"]` })).result.nodeId;
await cdp("DOM.setFileInputFiles", { nodeId: input, files: [png] });
await js(`(()=>{const t=[...document.querySelectorAll('#complaint-${A} textarea')].at(-1);const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,'Plumber booked; the cooler is being repaired this week.');t.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await wait(300);
await js(`[...document.querySelectorAll('#complaint-${A} button')].find(b=>b.innerText.includes('Add progress note')).click()`);
ok("uploaded file appears in the timeline with a download link", await until(`[...document.querySelectorAll('#complaint-${A} a[href^="/api/files/"]')].some(a=>a.innerText.includes('progress-photo.png'))`));
const href = await js(`[...document.querySelectorAll('#complaint-${A} a[href^="/api/files/"]')].find(a=>a.innerText.includes('progress-photo.png')).getAttribute('href')`);
ok("the download link works for the college", (await js(`fetch('${href}').then(r=>r.status)`)) === 200);
await shot("college-deep-link");
// wrong type is refused in the browser before upload
const txt = path.join(OUT, "notes.txt");
fs.writeFileSync(txt, "plain text");
await cdp("DOM.setFileInputFiles", { nodeId: (await cdp("DOM.querySelector", { nodeId: (await cdp("DOM.getDocument", { depth: -1 })).result.root.nodeId, selector: `#complaint-${A} input[aria-label="Progress note files"]` })).result.nodeId, files: [txt] });
ok("a wrong file type shows a clear error", await until(`[...document.querySelectorAll('#complaint-${A} [role=alert]')].some(e=>/only PNG, JPG and PDF/.test(e.innerText))`, 4000));
// a KPI tile opens its most urgent complaint
await js(`[...document.querySelectorAll('button[aria-pressed]')].find(b=>b.innerText.startsWith('Open')).click()`);
await wait(1200);
ok("Open tile filters and opens a complaint", /status=open&complaint=SC-/.test(await js("location.search")));
// a reminder log entry opens its complaint
await js(`[...document.querySelectorAll('button')].find(b=>b.innerText.includes('${A}') && b.innerText.includes('SMS to')).click()`);
await wait(1200);
ok("reminder log entry opens its complaint", (await js("location.search")) === `?complaint=${A}`);
// the bell links to the complaint
await js(`document.querySelector('button[aria-label=Notifications]').click()`);
await wait(800);
ok("bell entry links to the complaint", await js(`[...document.querySelectorAll('a')].some(a=>a.getAttribute('href')==='/college?complaint=${A}')`));
await logout();

// 2. Competent Authority: grievance desk deep link
await go("/login", 1500);
await official("a.k.mathur@nyayasetu.demo", "ca");
await go(`/grievances?complaint=${A}`, 3500);
ok("CA: deep link opens the complaint on the grievance desk", await until(`document.body.innerText.includes('${A}') && [...document.querySelectorAll('[aria-expanded=true]')].some(b=>b.innerText.includes('${A}'))`));
ok("CA: tabs are With college / Awaiting verdict / Escalated / Closed", await js(`['With college','Awaiting verdict','Escalated','Closed'].every(t=>[...document.querySelectorAll('button')].some(b=>b.innerText.startsWith(t)))`));
await shot("ca-grievances-deep-link");
await go("/", 3500);
ok("CA: command centre has the Student-portal complaints tile", await until(`document.body.innerText.includes('Student-portal complaints')`));
ok("CA: shows an updated indicator", await until(`/Updated (just now|\\d+ s ago)/.test(document.body.innerText)`));
await logout();

// 3. student: the proof notification deep link
await go("/login", 1500);
await studentLogin("APAAR-2046-1001", "9000000001");
await go(`/student?complaint=${A}`, 3500);
ok("student: deep link focuses the complaint and shows the college's note and file", await until(`(document.getElementById('complaint-${A}')?.closest('div.rounded-2xl,div[class*=ring-2]')?.innerText ?? document.body.innerText).includes('College progress note') && !!document.querySelector('a[href^="/api/student/files/"]')`));
await shot("student-deep-link");
ok("no uncaught page errors", errors.length === 0, errors.slice(0, 2).join(" | "));

chrome.kill();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
console.log(`COMPLAINT ${A} SCREENSHOTS ${OUT}`);
process.exit(fails ? 1 : 0);
