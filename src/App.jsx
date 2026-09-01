/* ============================================================
   SPORTS STOCK APP — Crystal Palace FC
   Single-file React app. Drop into src/App.jsx of a Vite React project.

   QUICK START
   -----------
   npm create vite@latest sports-stock -- --template react
   cd sports-stock && npm install
   (replace src/App.jsx with this file)
   npm run dev          → local test
   Push to GitHub → import at vercel.com → live URL

   NOTES
   -----
   • Data persists in browser localStorage. Each device has its own copy.
     For shared multi-user data you need a backend (Supabase recommended).
   • Item photos are kept in a SEPARATE localStorage key so that if photo
     storage fills up, your stock data is unaffected.
   • AI features (auto-categorise, BNF dose lookup, photo pill counting)
     call an endpoint defined in AI_ENDPOINT below. They fail gracefully
     to manual entry if not configured. See "AI SETUP" at the bottom.
   • SharePoint sync posts to a Power Automate webhook (Admin → Backup).
   • The Medication module is OFF by default. Turn it on in
     Admin → Branding → Modules when you're ready to use it.
   ============================================================ */

import { useState, useEffect, useRef } from "react";

/* ── CONFIG ────────────────────────────────────────────────── */
const CLUB_DOMAIN = "cpfc.co.uk";     // required email domain
const AI_ENDPOINT = "";               // e.g. "/api/ai" — leave "" to disable AI
const STORE_KEY   = "sportsstock_v1";
const PHOTO_KEY   = "sportsstock_v1_photos";

/* Text colours — darkened for pitch-side readability */
const T_MUTED = "#4b5563";   // secondary text (was #6b7280)
const T_FAINT = "#64748b";   // tertiary text (was #9ca3af)

const TEAMS = ["Women's First Team", "Men's First Team", "Academy"];
const ROLES = { super_admin: "Super Admin", doctor: "Doctor", physiotherapist: "Physiotherapist", sports_therapist: "Sports Therapist" };
const ROLE_COL = { super_admin: "#7c3aed", doctor: "#1d4ed8", physiotherapist: "#0369a1", sports_therapist: "#0f766e" };

/* No pre-set locations — these are added by you in Locations */
const MED_LOCS = [];
const INV_LOCS = [];

const DEFAULT_CATS = [
  { k: "A", label: "A — Airway", col: "#fee2e2", fg: "#991b1b" },
  { k: "B", label: "B — Breathing", col: "#dbeafe", fg: "#1e40af" },
  { k: "C", label: "C — Circulation", col: "#fce7f3", fg: "#9d174d" },
  { k: "D", label: "D — Disability", col: "#ede9fe", fg: "#6d28d9" },
  { k: "E", label: "E — Everything Else", col: "#f3f4f6", fg: "#374151" },
  { k: "Trauma", label: "Trauma", col: "#ffedd5", fg: "#9a3412" },
  { k: "Medications", label: "Medications", col: "#dcfce7", fg: "#166534" },
  { k: "Supplements", label: "Supplements", col: "#ecfccb", fg: "#3f6212" },
  { k: "Diagnostics", label: "Diagnostics", col: "#cffafe", fg: "#0e7490" },
  { k: "Other", label: "Other", col: "#e2e8f0", fg: "#334155" },
];
const CAT_PALETTE = [
  { col: "#e0e7ff", fg: "#3730a3" }, { col: "#fae8ff", fg: "#86198f" }, { col: "#d1fae5", fg: "#065f46" },
  { col: "#fef3c7", fg: "#92400e" }, { col: "#e2e8f0", fg: "#334155" }, { col: "#ccfbf1", fg: "#115e59" },
];
const catsOf = d => (d.cats?.length ? d.cats : DEFAULT_CATS);
const catOf = (k, cats = DEFAULT_CATS) =>
  cats.find(c => c.k === k) || { k: k || "?", label: k || "Uncategorised", col: "#f3f4f6", fg: "#374151" };

/* Elements photographed and individually verified at audit */
const KINDS = [
  { k: "name", label: "Product name" },
  { k: "expiry", label: "Expiry date" },
  { k: "qty", label: "Amount / strip count" },
  { k: "batch", label: "Batch / lot no." },
];

/* Ordered tightest window first — alertOf returns the first band an item falls
   inside, so this MUST stay ascending or everything lands in the widest band. */
const LEVELS = [
  { d: 0, label: "Expired", bg: "#fee2e2", fg: "#7f1d1d", br: "#dc2626" },
  { d: 30, label: "1 month", bg: "#fee2e2", fg: "#991b1b", br: "#f87171" },
  { d: 60, label: "2 months", bg: "#ffedd5", fg: "#9a3412", br: "#fb923c" },
  { d: 180, label: "6 months", bg: "#fef3c7", fg: "#92400e", br: "#fcd34d" },
  { d: 365, label: "1 year", bg: "#fef9c3", fg: "#854d0e", br: "#fde047" },
];

/* ── HELPERS ──────────────────────────────────────────────── */
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const nowISO = () => new Date().toISOString();
const code6 = () => String(Math.floor(100000 + Math.random() * 900000));

const parseExp = s => {
  if (!s) return null; const t = String(s).trim(); let m;
  if ((m = t.match(/^(\d{1,2})[/\-.](\d{4})$/))) return { d: new Date(+m[2], +m[1], 0), monthOnly: true };
  if ((m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/))) return { d: new Date(+m[3], +m[2] - 1, +m[1]), monthOnly: false };
  if ((m = t.match(/^(\d{4})-(\d{1,2})$/))) return { d: new Date(+m[1], +m[2], 0), monthOnly: true };
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return { d: new Date(+m[1], +m[2] - 1, +m[3]), monthOnly: false };
  return null;
};
const expValid = s => { const p = parseExp(s); return !!p && !isNaN(p.d); };
const fmtD = s => { const p = parseExp(s); if (!p || isNaN(p.d)) return s || "—"; return p.monthOnly ? p.d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : p.d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); };
const dLeft = s => { const p = parseExp(s); return p && !isNaN(p.d) ? Math.ceil((p.d - new Date()) / 86400000) : 9999; };
const fmtDT = d => { try { return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } };
const alertOf = e => { const n = dLeft(e); return n === 9999 ? null : LEVELS.find(l => n <= l.d) || null; };

const pwCheck = p => {
  const c = [
    { ok: p.length >= 7, t: "At least 7 characters" },
    { ok: /[a-z]/.test(p), t: "A lowercase letter" },
    { ok: /[A-Z]/.test(p), t: "An uppercase letter" },
    { ok: /[0-9]/.test(p), t: "A number" },
    { ok: /[^a-zA-Z0-9]/.test(p), t: "A symbol (!@#$…)" },
  ];
  return { checks: c, valid: c.filter(x => x.ok).length >= 4 && p.length >= 7 };
};

/* AI helper — returns null if disabled or fails */
const askAI = async (system, msg, img) => {
  if (!AI_ENDPOINT) return null;
  try {
    const imgs = Array.isArray(img) ? img : img ? [img] : [];
    const content = imgs.length
      ? [...imgs.map(b => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b } })), { type: "text", text: msg }]
      : msg;
    const r = await fetch(AI_ENDPOINT, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 800, system, messages: [{ role: "user", content }] })
    });
    const j = await r.json();
    const txt = j.content?.[0]?.text || "";
    return JSON.parse(txt.replace(/```json|```/g, "").trim());
  } catch { return null; }
};

const shrink = f => new Promise((ok, no) => {
  const r = new FileReader();
  r.onload = e => { const i = new Image(); i.onload = () => { const s = Math.min(900 / i.width, 900 / i.height, 1), c = document.createElement("canvas"); c.width = i.width * s; c.height = i.height * s; c.getContext("2d").drawImage(i, 0, 0, c.width, c.height); ok(c.toDataURL("image/jpeg", .82).split(",")[1]); }; i.onerror = no; i.src = e.target.result; };
  r.onerror = no; r.readAsDataURL(f);
});
/* Stored photo — smaller and more compressed, kept readable for expiry/batch text */
const shrinkPhoto = f => new Promise((ok, no) => {
  const r = new FileReader();
  r.onload = e => { const i = new Image(); i.onload = () => { const s = Math.min(820 / i.width, 820 / i.height, 1), c = document.createElement("canvas"); c.width = i.width * s; c.height = i.height * s; c.getContext("2d").drawImage(i, 0, 0, c.width, c.height); ok(c.toDataURL("image/jpeg", .58)); }; i.onerror = no; i.src = e.target.result; };
  r.onerror = no; r.readAsDataURL(f);
});
const toDataURL = f => new Promise((ok, no) => {
  const r = new FileReader();
  r.onload = e => { const i = new Image(); i.onload = () => { const s = Math.min(120 / i.width, 120 / i.height, 1), c = document.createElement("canvas"); c.width = i.width * s; c.height = i.height * s; c.getContext("2d").drawImage(i, 0, 0, c.width, c.height); ok(c.toDataURL("image/png")); }; i.onerror = no; i.src = e.target.result; };
  r.onerror = no; r.readAsDataURL(f);
});

/* ── STYLE PRIMITIVES ─────────────────────────────────────── */
const IN = { width: "100%", padding: "13px 14px", border: "1.5px solid #94a3b8", borderRadius: 11, fontSize: 17, fontWeight: 500, boxSizing: "border-box", background: "#fff", fontFamily: "inherit", outline: "none", color: "#000", WebkitTextFillColor: "#000", opacity: 1 };
const LB = { display: "block", fontSize: 15, fontWeight: 700, color: "#1f2937", marginBottom: 7 };
const Card = ({ children, s = {} }) => <div style={{ background: "#fff", borderRadius: 15, padding: "18px 20px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,.07)", ...s }}>{children}</div>;
const Tag = ({ t, bg = "#e5e7eb", fg = "#1f2937" }) => <span style={{ fontSize: 13, fontWeight: 700, background: bg, color: fg, padding: "4px 10px", borderRadius: 99, display: "inline-block" }}>{t}</span>;
const Empty = ({ t }) => <div style={{ textAlign: "center", padding: "40px 0", color: "#4b5563", fontSize: 16 }}>{t}</div>;
const Dot = ({ n }) => n > 0 ? <span style={{ background: "#dc2626", color: "#fff", borderRadius: 99, fontSize: 12, fontWeight: 700, padding: "2px 7px", marginLeft: 5 }}>{n}</span> : null;
const Btn = ({ t, on, bg = "#1e3a8a", fg = "#fff", full, sm, dis }) => <button onClick={dis ? undefined : on} style={{ padding: sm ? "10px 16px" : "14px 20px", background: bg, color: fg, border: "none", borderRadius: 11, fontSize: sm ? 15 : 17, fontWeight: 700, cursor: dis ? "default" : "pointer", opacity: dis ? .45 : 1, width: full ? "100%" : undefined, minHeight: sm ? 40 : 48 }}>{t}</button>;
const Field = ({ label, hint, ...p }) => <div><label style={LB}>{label}</label><input style={IN} {...p} />{hint && <div style={{ fontSize: 13.5, color: T_MUTED, marginTop: 5 }}>{hint}</div>}</div>;
const H1 = ({ t }) => <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 17, color: "#0f172a" }}>{t}</div>;
const H2 = ({ t }) => <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 13, color: "#0f172a" }}>{t}</div>;
const Logo = ({ d, size = 54 }) => d.logo?.startsWith?.("data:")
  ? <img src={d.logo} alt="" style={{ width: size, height: size, borderRadius: size * .27, objectFit: "cover", background: "#fff", border: "1px solid #e5e7eb" }} />
  : <div style={{ width: size, height: size, background: "#1e3a8a", borderRadius: size * .27, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * .48 }}>{d.logo || "⚽"}</div>;

const BLANK = { users: [], pending: [], meds: [], recs: [], reqs: [], audit: [], items: [], checks: [], orders: [], medLocs: [...MED_LOCS], invLocs: [...INV_LOCS], cats: DEFAULT_CATS, modules: { med: false }, cfg: {}, ledger: [], logo: "⚽", clubName: "Crystal Palace FC", sync: { url: "", enabled: false, lastAt: null, lastCount: 0 } };

/* ── PHOTO BLOCK ──────────────────────────────────────────── */
/* Used when adding an item and again during audit. One or more photos per
   element, so the name, expiry, amount and batch are all evidenced. */
function PhotoBlock({ shots, onAdd, onDel, busy }) {
  const ref = useRef();
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 11, padding: "11px 13px", background: shots.length ? "#f0fdf4" : "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1f2937" }}>
          {shots.length ? `${shots.length} photo${shots.length !== 1 ? "s" : ""} on file` : "No photos yet"}
        </div>
        <input type="file" accept="image/*" capture="environment" multiple ref={ref} style={{ display: "none" }}
          onChange={e => { if (e.target.files?.length) onAdd(e.target.files); e.target.value = ""; }} />
        <button onClick={() => ref.current?.click()} disabled={busy}
          style={{ background: "#1e3a8a", color: "#fff", border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", opacity: busy ? .5 : 1, whiteSpace: "nowrap" }}>
          {busy ? "…" : "\ud83d\udcf7 Add photo"}
        </button>
      </div>
      {shots.length > 0 && <div style={{ display: "flex", gap: 7, marginTop: 10, overflowX: "auto", paddingBottom: 2 }}>
        {shots.map(s => <div key={s.id} style={{ position: "relative", flexShrink: 0 }}>
          <img src={s.data} alt="" style={{ width: 78, height: 78, objectFit: "cover", borderRadius: 9, border: "1px solid #e2e8f0" }} />
          <button onClick={() => onDel(s.id)} style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 99, background: "#dc2626", color: "#fff", border: "2px solid #fff", fontSize: 12, lineHeight: 1, cursor: "pointer", fontWeight: 700 }}>\u00d7</button>
        </div>)}
      </div>}
    </div>
  );
}

/* ── ROOT ─────────────────────────────────────────────────── */
export default function App() {
  const [storeErr, setStoreErr] = useState("");
  const [d, setD] = useState(() => {
    try { const s = localStorage.getItem(STORE_KEY); return s ? { ...BLANK, ...JSON.parse(s) } : BLANK; }
    catch { return BLANK; }
  });
  /* Photos live in their own key so a full photo store never risks stock data */
  const [ph, setPh] = useState(() => {
    try { const s = localStorage.getItem(PHOTO_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  // Restore the signed-in session so a refresh doesn't log you out
  const [user, setUser] = useState(() => {
    try { const s = localStorage.getItem(STORE_KEY + "_session"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [page, setPage] = useState(() => {
    try { return localStorage.getItem(STORE_KEY + "_session") ? "app" : "login"; } catch { return "login"; }
  });
  const [msg, setMsg] = useState(null);

  // Persist data
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); setStoreErr(""); }
    catch (e) {
      setStoreErr(String(e).includes("quota") || String(e).includes("Quota")
        ? "Storage full — remove the uploaded logo in Admin → Branding, or clear old records."
        : "Saving failed. If you're in Private Browsing, switch to a normal Safari tab.");
    }
  }, [d]);

  // Persist photos separately
  useEffect(() => {
    try { localStorage.setItem(PHOTO_KEY, JSON.stringify(ph)); }
    catch { setStoreErr("Photo storage is full — delete some item photos, or export and clear old records."); }
  }, [ph]);

  // Persist session
  useEffect(() => {
    try { user ? localStorage.setItem(STORE_KEY + "_session", JSON.stringify(user)) : localStorage.removeItem(STORE_KEY + "_session"); } catch {}
  }, [user]);

  const say = (m, t = "ok") => { setMsg({ m, t }); setTimeout(() => setMsg(null), 4000); };
  const up = fn => setD(p => fn(p));
  const rec = (x, action, detail, team) => ({ ...x, ledger: [...x.ledger, { id: uid(), ts: nowISO(), user: user?.name || "system", role: user ? ROLES[user.role] : "-", team: team || "-", action, detail }] });
  const logIt = (act, det, tm) => up(x => rec({ ...x, audit: [...x.audit, { id: uid(), act, det, by: user?.name || "-", tm, ts: nowISO() }] }, act, det, tm));
  const P = { d, up, user, say, logIt, rec, ph, setPh };

  return (
    <div style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", background: "#f9fafb", minHeight: "100vh", color: "#111" }}>
      <style>{`
        input, select, textarea {
          color: #000 !important;
          -webkit-text-fill-color: #000 !important;
          opacity: 1 !important;
          font-weight: 500;
        }
        input::placeholder, textarea::placeholder {
          color: #64748b !important;
          -webkit-text-fill-color: #64748b !important;
          opacity: 1 !important;
          font-weight: 400;
        }
        select { font-weight: 600; }
        input:focus, select:focus, textarea:focus {
          border-color: #1e3a8a !important;
          box-shadow: 0 0 0 3px rgba(30,58,138,.12);
        }
        body { -webkit-text-size-adjust: 100%; }
      `}</style>
      {storeErr && <div style={{ background: "#fef2f2", borderBottom: "1px solid #fca5a5", color: "#991b1b", padding: "12px 16px", fontSize: 14, fontWeight: 500, textAlign: "center" }}>⚠ {storeErr}</div>}
      {page === "login" && <Login {...P} setUser={setUser} setPage={setPage} />}
      {page === "reg" && <Register {...P} setPage={setPage} />}
      {page === "app" && user && <Shell {...P} setUser={setUser} setPage={setPage} />}
      {msg && <div onClick={() => setMsg(null)} style={{ position: "fixed", bottom: "calc(20px + env(safe-area-inset-bottom))", left: 16, right: 16, maxWidth: 380, margin: "0 auto", background: msg.t === "error" ? "#fef2f2" : msg.t === "warn" ? "#fffbeb" : "#f0fdf4", border: `1px solid ${msg.t === "error" ? "#fca5a5" : msg.t === "warn" ? "#fde047" : "#86efac"}`, color: msg.t === "error" ? "#991b1b" : msg.t === "warn" ? "#92400e" : "#166534", padding: "15px 18px", borderRadius: 13, fontSize: 16, fontWeight: 500, zIndex: 999, textAlign: "center", cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,.1)" }}>{msg.m}</div>}
    </div>
  );
}

/* ── AUTH ─────────────────────────────────────────────────── */
function Login({ d, setUser, setPage, say }) {
  const [e, setE] = useState(""); const [p, setP] = useState("");
  const go = () => {
    const em = e.trim().toLowerCase();
    if (d.pending.find(u => u.email.toLowerCase() === em)) return say("Account awaiting admin approval", "warn");
    const u = d.users.find(x => x.email.toLowerCase() === em && x.pw === p);
    if (!u) return say("Incorrect email or password", "error");
    setUser(u); setPage("app");
  };
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div style={{ marginBottom: 12 }}><Logo d={d} /></div>
          <div style={{ fontSize: 11, letterSpacing: 2, color: T_FAINT, textTransform: "uppercase", fontWeight: 600 }}>{d.clubName}</div>
          <div style={{ fontSize: 25, fontWeight: 700, marginTop: 3 }}>Sports Stock App</div>
        </div>
        <Card><div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Club Email" type="email" value={e} onChange={ev => setE(ev.target.value)} placeholder={`you@${CLUB_DOMAIN}`} />
          <Field label="Password" type="password" value={p} onChange={ev => setP(ev.target.value)} placeholder="••••••••" />
          <Btn t="Sign In" on={go} full />
          <div style={{ textAlign: "center", fontSize: 14, color: T_MUTED }}>No account? <button onClick={() => setPage("reg")} style={{ background: "none", border: "none", color: "#1e3a8a", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Register</button></div>
        </div></Card>
        {!d.users.length && <div style={{ marginTop: 14, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "12px 14px", fontSize: 12, color: "#1e40af" }}><b>First-time setup:</b> the first account registered becomes Super Admin and is approved automatically.</div>}
      </div>
    </div>
  );
}

function Register({ d, up, setPage, say, rec }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ name: "", email: "", pw: "", pw2: "", role: "sports_therapist", teams: [] });
  const [sent, setSent] = useState(""); const [entered, setEntered] = useState("");
  const sf = k => v => setF(p => ({ ...p, [k]: v }));
  const tog = t => setF(p => ({ ...p, teams: p.teams.includes(t) ? p.teams.filter(x => x !== t) : [...p.teams, t] }));
  const pw = pwCheck(f.pw); const isFirst = d.users.length === 0;

  const step1 = () => {
    if (!f.name.trim()) return say("Enter your full name", "error");
    const em = f.email.trim().toLowerCase();
    if (!em.endsWith("@" + CLUB_DOMAIN)) return say(`Must be a club email ending @${CLUB_DOMAIN}`, "error");
    if (d.users.find(u => u.email.toLowerCase() === em) || d.pending.find(u => u.email.toLowerCase() === em)) return say("Email already registered", "error");
    if (!pw.valid) return say("Password does not meet requirements", "error");
    if (f.pw !== f.pw2) return say("Passwords do not match", "error");
    if (!isFirst && !f.teams.length) return say("Select at least one team", "error");
    setSent(code6()); setStep(2); say(`Verification code sent to ${em}`);
  };
  const step2 = () => {
    if (entered.trim() !== sent) return say("Incorrect verification code", "error");
    const u = { id: uid(), name: f.name.trim(), email: f.email.trim().toLowerCase(), pw: f.pw, role: isFirst ? "super_admin" : f.role, teams: isFirst ? [...TEAMS] : f.teams, requestedRole: f.role, at: nowISO() };
    if (isFirst) { up(x => rec({ ...x, users: [...x.users, u] }, "USER_CREATED", `Super Admin created: ${u.name}`, "-")); say("Super Admin created — please sign in"); setPage("login"); }
    else { up(x => rec({ ...x, pending: [...x.pending, u] }, "USER_PENDING", `Registration submitted: ${u.name}`, "-")); setStep(3); }
  };

  if (step === 3) return (<Wrap><Card><div style={{ textAlign: "center", padding: "10px 0" }}>
    <div style={{ fontSize: 44, marginBottom: 10 }}>⏳</div><div style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>Awaiting Approval</div>
    <p style={{ fontSize: 14, color: T_MUTED, margin: "0 0 6px" }}>Your email is verified and registration submitted.</p>
    <p style={{ fontSize: 13, color: T_MUTED }}>An administrator must approve your account and confirm your role and team access before you can sign in.</p>
    <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px", marginTop: 14, textAlign: "left", fontSize: 12, color: "#374151" }}><div><b>Name:</b> {f.name}</div><div><b>Email:</b> {f.email}</div><div><b>Requested role:</b> {ROLES[f.role]}</div><div><b>Teams:</b> {f.teams.join(", ")}</div></div>
    <div style={{ marginTop: 16 }}><Btn t="Back to Sign In" on={() => setPage("login")} full /></div></div></Card></Wrap>);

  if (step === 2) return (<Wrap>
    <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: T_MUTED, fontSize: 14, marginBottom: 14, cursor: "pointer" }}>← Back</button>
    <Card><H2 t="Verify Your Email" /><p style={{ fontSize: 13, color: T_MUTED, marginBottom: 14 }}>We've sent a 6-digit code to <b style={{ color: "#111" }}>{f.email}</b>.</p>
      <div style={{ background: "#fffbeb", border: "1px solid #fde047", borderRadius: 10, padding: "10px 13px", marginBottom: 14, fontSize: 12, color: "#92400e" }}><b>Demo mode:</b> code is <span style={{ fontFamily: "monospace", fontSize: 17, fontWeight: 700, letterSpacing: 2 }}>{sent}</span><br /><span style={{ fontSize: 11 }}>Live version emails this and never displays it.</span></div>
      <input value={entered} onChange={e => setEntered(e.target.value.replace(/\D/g, "").slice(0, 6))} style={{ ...IN, fontSize: 26, textAlign: "center", letterSpacing: 8, fontFamily: "monospace", fontWeight: 700 }} placeholder="000000" inputMode="numeric" />
      <div style={{ marginTop: 14 }}><Btn t="Verify & Continue" on={step2} full dis={entered.length !== 6} /></div>
      <div style={{ textAlign: "center", marginTop: 10 }}><button onClick={() => { setSent(code6()); say("New code sent"); }} style={{ background: "none", border: "none", color: "#1e3a8a", fontSize: 13, cursor: "pointer" }}>Resend code</button></div></Card></Wrap>);

  return (<Wrap>
    <button onClick={() => setPage("login")} style={{ background: "none", border: "none", color: T_MUTED, fontSize: 14, marginBottom: 14, cursor: "pointer" }}>← Back to sign in</button>
    <Card><div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      <div><div style={{ fontSize: 20, fontWeight: 700 }}>Create Account</div><div style={{ fontSize: 12, color: T_MUTED, marginTop: 3 }}>Step 1 of {isFirst ? 2 : 3}</div></div>
      {isFirst && <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "10px 13px", fontSize: 12, color: "#6d28d9" }}><b>You're the first user</b> — created as Super Admin with all teams.</div>}
      <Field label="Full Name" value={f.name} onChange={e => sf("name")(e.target.value)} placeholder="Dr Jane Smith" />
      <Field label="Club Email" type="email" value={f.email} onChange={e => sf("email")(e.target.value)} placeholder={`you@${CLUB_DOMAIN}`} hint={`Must end in @${CLUB_DOMAIN}`} />
      <div><Field label="Password" type="password" value={f.pw} onChange={e => sf("pw")(e.target.value)} placeholder="Choose a strong password" />
        {f.pw && <div style={{ marginTop: 8, background: "#f8fafc", borderRadius: 9, padding: "9px 12px" }}>{pw.checks.map(c => <div key={c.t} style={{ fontSize: 11.5, color: c.ok ? "#16a34a" : T_FAINT, marginBottom: 2 }}>{c.ok ? "✓" : "○"} {c.t}</div>)}</div>}</div>
      <div><Field label="Confirm Password" type="password" value={f.pw2} onChange={e => sf("pw2")(e.target.value)} placeholder="Re-enter password" />
        {f.pw2 && <div style={{ fontSize: 11.5, marginTop: 5, color: f.pw === f.pw2 ? "#16a34a" : "#dc2626" }}>{f.pw === f.pw2 ? "✓ Passwords match" : "✕ Passwords do not match"}</div>}</div>
      {!isFirst && <>
        <div><label style={LB}>Requested Role</label><select value={f.role} onChange={e => sf("role")(e.target.value)} style={IN}>{["doctor", "physiotherapist", "sports_therapist"].map(k => <option key={k} value={k}>{ROLES[k]}</option>)}</select><div style={{ fontSize: 11, color: T_FAINT, marginTop: 4 }}>An admin will confirm or change this</div></div>
        <div><label style={LB}>Teams</label>{TEAMS.map(x => <label key={x} style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 15, marginBottom: 9, cursor: "pointer" }}><input type="checkbox" checked={f.teams.includes(x)} onChange={() => tog(x)} style={{ width: 19, height: 19, accentColor: "#1e3a8a" }} />{x}</label>)}</div></>}
      <Btn t="Continue →" on={step1} full />
    </div></Card></Wrap>);
}
const Wrap = ({ children }) => <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}><div style={{ width: "100%", maxWidth: 430 }}>{children}</div></div>;

/* ── SHELL ────────────────────────────────────────────────── */
function Shell({ d, up, user, say, logIt, rec, ph, setPh, setUser, setPage }) {
  const medOn = !!d.modules?.med;
  const [mod, setMod] = useState(medOn ? "med" : "inv");
  const [tab, setTab] = useState(medOn ? "dash" : "idash");
  const [team, setTeam] = useState(user.teams[0]);
  const isAdmin = user.role === "super_admin"; const isDoc = ["doctor", "super_admin"].includes(user.role);
  const canApprove = isAdmin || user.role === "doctor";
  const pendUsers = canApprove ? d.pending.filter(p => isAdmin || p.teams.some(t => user.teams.includes(t))).length : 0;
  const pend = isDoc ? d.reqs.filter(r => user.teams.includes(r.team) && r.status === "pending").length : 0;
  const ordN = d.orders.filter(o => !o.done).length;

  // If the medication module is switched off while you're inside it, bounce out
  useEffect(() => { if (!medOn && mod === "med") { setMod("inv"); setTab("idash"); } }, [medOn, mod]);

  const P = { d, up, user, team, say, logIt, rec, ph, setPh };
  const medT = [["dash", "Dashboard"], ["inv", "Inventory"], ["pills", "Pill Count"], ["disp", "Dispense"], ["trend", "Trends"], ...(isDoc ? [["req", "Requests", pend], ["aud", "Audit"], ["cfg", "Settings"]] : [])];
  const invT = [["idash", "Dashboard"], ["chk", "Stock Audit"], ["add", "Add"], ["loc", "Locations"], ["cats", "Sections"], ["exp", "Alerts", d.items.filter(i => alertOf(i.expiry)).length], ["ord", "Orders", ordN], ["hist", "History"]];
  const admT = [["users", "Approvals", pendUsers], ["team", "Team"], ["brand", "Branding"], ["backup", "Backup"]];
  const tabs = mod === "med" ? medT : mod === "inv" ? invT : admT;
  const sw = m => { setMod(m); setTab(m === "med" ? "dash" : m === "inv" ? "idash" : "users"); };
  const mods = [...(medOn ? [["med", "💊 Medication", pend]] : []), ["inv", "📦 Inventory", ordN], ...(canApprove ? [["adm", "🔐 Admin", pendUsers]] : [])];

  return (
    <div>
      <div style={{ background: "#fff", borderBottom: "1px solid #eee", padding: "12px 16px", position: "sticky", top: 0, zIndex: 90 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Logo d={d} size={46} />
            <div><div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.15, color: "#1e3a8a" }}>{team}</div>
              <div style={{ fontSize: 13, color: T_MUTED, marginTop: 2 }}>{user.name} · <span style={{ color: ROLE_COL[user.role], fontWeight: 600 }}>{ROLES[user.role]}</span></div></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {user.teams.length > 1 && <select value={team} onChange={e => setTeam(e.target.value)} style={{ fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 8, padding: "7px 8px", maxWidth: 110 }}>{user.teams.map(t => <option key={t}>{t}</option>)}</select>}
            <button onClick={() => { setUser(null); setPage("login"); }} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: T_MUTED, cursor: "pointer", minHeight: 40 }}>Out</button>
          </div>
        </div>
      </div>
      <div style={{ background: "#1e3a8a", display: "flex" }}>{mods.map(([id, lb, n]) => <button key={id} onClick={() => sw(id)} style={{ flex: 1, padding: "15px 4px", background: "none", border: "none", borderBottom: mod === id ? "3px solid #fff" : "3px solid transparent", color: mod === id ? "#fff" : "rgba(255,255,255,.6)", fontWeight: mod === id ? 700 : 500, fontSize: 15, cursor: "pointer", minHeight: 52 }}>{lb}<Dot n={n} /></button>)}</div>
      <div style={{ background: "#fff", borderBottom: "1px solid #eee", display: "flex", overflowX: "auto", padding: "0 10px", WebkitOverflowScrolling: "touch" }}>{tabs.map(([id, lb, n]) => <button key={id} onClick={() => setTab(id)} style={{ padding: "15px 14px", fontSize: 15, fontWeight: tab === id ? 600 : 500, color: tab === id ? "#1e3a8a" : T_MUTED, background: "none", border: "none", borderBottom: tab === id ? "3px solid #1e3a8a" : "3px solid transparent", cursor: "pointer", whiteSpace: "nowrap", minHeight: 50 }}>{lb}<Dot n={n} /></button>)}</div>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 16px 90px" }}>
        {medOn && mod === "med" && tab === "dash" && <Dash {...P} />}
        {medOn && mod === "med" && tab === "inv" && <MedInv {...P} />}
        {medOn && mod === "med" && tab === "pills" && <Pills {...P} />}
        {medOn && mod === "med" && tab === "disp" && <Disp {...P} />}
        {medOn && mod === "med" && tab === "trend" && <Trend {...P} />}
        {medOn && mod === "med" && tab === "req" && <Reqs {...P} />}
        {medOn && mod === "med" && tab === "aud" && <AudLog {...P} />}
        {medOn && mod === "med" && tab === "cfg" && <Cfg {...P} />}
        {mod === "inv" && tab === "idash" && <InvDash {...P} />}
        {mod === "inv" && tab === "chk" && <StockAudit {...P} />}
        {mod === "inv" && tab === "add" && <AddItems {...P} />}
        {mod === "inv" && tab === "loc" && <Locs {...P} />}
        {mod === "inv" && tab === "cats" && <Sections {...P} />}
        {mod === "inv" && tab === "exp" && <Expiry {...P} />}
        {mod === "inv" && tab === "ord" && <Orders {...P} />}
        {mod === "inv" && tab === "hist" && <Hist {...P} />}
        {mod === "adm" && tab === "users" && <Approvals {...P} />}
        {mod === "adm" && tab === "team" && <TeamMgmt {...P} />}
        {mod === "adm" && tab === "brand" && <Branding {...P} />}
        {mod === "adm" && tab === "backup" && <Backup {...P} />}
      </div>
    </div>
  );
}

/* ── MEDICATION MODULE ────────────────────────────────────── */
function Dash({ d, user, team }) {
  const m = d.meds.filter(x => x.team === team), r = d.recs.filter(x => x.team === team);
  const q = d.reqs.filter(x => x.team === team && x.status === "pending"), low = m.filter(x => x.qty <= x.thr);
  const isDoc = ["doctor", "super_admin"].includes(user.role);
  return (<div><H1 t="Medication Dashboard" />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>{[["Medications", m.length, "#1e3a8a"], ["Dispensed", r.reduce((s, x) => s + x.qty, 0), "#16a34a"], ["Low Stock", low.length, "#dc2626"], ["Expiring ≤90d", m.filter(x => dLeft(x.expiry) <= 90).length, "#d97706"]].map(([l, v, c]) => <Card key={l} s={{ textAlign: "center", padding: "14px 8px" }}><div style={{ fontSize: 25, fontWeight: 700, color: c }}>{v}</div><div style={{ fontSize: 12, color: T_MUTED, marginTop: 3 }}>{l}</div></Card>)}</div>
    {isDoc && q.length > 0 && <Card s={{ borderLeft: "4px solid #f59e0b", background: "#fffbeb", marginBottom: 11 }}><div style={{ fontWeight: 700, color: "#92400e", marginBottom: 5 }}>⏳ {q.length} pending request{q.length !== 1 ? "s" : ""}</div>{q.slice(0, 3).map(x => <div key={x.id} style={{ fontSize: 13, color: "#78350f" }}>• {x.medName} × {x.qty} — {x.by}</div>)}</Card>}
    {low.length > 0 && isDoc && <Card s={{ borderLeft: "4px solid #ef4444", background: "#fef2f2" }}><div style={{ fontWeight: 700, color: "#991b1b", marginBottom: 5 }}>🔴 Low stock</div>{low.map(x => <div key={x.id} style={{ fontSize: 13, color: "#7f1d1d" }}>• {x.name} — {x.qty} left</div>)}</Card>}
    {!low.length && !q.length && <Card><div style={{ textAlign: "center", color: T_MUTED, fontSize: 14 }}>All good — no alerts</div></Card>}
  </div>);
}

function MedInv({ d, up, user, team, say, logIt }) {
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ name: "", dose: "", type: "OTC", qty: "", expiry: "", thr: "20", loc: "" });
  const [nl, setNl] = useState(""); const [showNl, setShowNl] = useState(false); const [filt, setFilt] = useState("All");
  const sf = k => v => setF(p => ({ ...p, [k]: v }));
  const meds = d.meds.filter(m => m.team === team); const isDoc = ["doctor", "super_admin"].includes(user.role);
  const add = () => {
    if (!f.name || !f.qty) return say("Name and quantity required", "error");
    if (!expValid(f.expiry)) return say("Enter expiry as MM/YYYY or DD/MM/YYYY", "error");
    if (!f.loc) return say("Select a location", "error");
    up(x => ({ ...x, meds: [...x.meds, { id: uid(), team, ...f, qty: +f.qty, thr: +f.thr || 20, by: user.name }] }));
    logIt("ADD_MED", `Added ${f.name} ${f.dose} (${f.qty}) at ${f.loc}`, team);
    setF({ name: "", dose: "", type: "OTC", qty: "", expiry: "", thr: "20", loc: "" }); setShow(false); say("Medication added");
  };
  const del = m => { up(x => ({ ...x, meds: x.meds.filter(y => y.id !== m.id) })); logIt("DEL_MED", `Deleted ${m.name}`, team); say("Removed"); };
  const used = [...new Set(meds.map(m => m.loc))]; const list = filt === "All" ? meds : meds.filter(m => m.loc === filt);
  return (<div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><H1 t="Inventory" /><Btn t={show ? "Cancel" : "+ Add"} on={() => setShow(!show)} sm /></div>
    {show && <Card s={{ marginBottom: 14 }}><H2 t="Add Medication" /><div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      <Field label="Name" value={f.name} onChange={e => sf("name")(e.target.value)} placeholder="e.g. Ibuprofen" />
      <Field label="Dose / Strength" value={f.dose} onChange={e => sf("dose")(e.target.value)} placeholder="e.g. 400mg" />
      <div><label style={LB}>Type</label><select value={f.type} onChange={e => sf("type")(e.target.value)} style={IN}><option>OTC</option><option>POM</option></select></div>
      <Field label="Quantity *" type="number" value={f.qty} onChange={e => sf("qty")(e.target.value)} placeholder="84" />
      <Field label="Expiry" value={f.expiry} onChange={e => sf("expiry")(e.target.value)} placeholder="MM/YYYY or DD/MM/YYYY" hint={f.expiry ? (expValid(f.expiry) ? `✓ ${fmtD(f.expiry)}` : "⚠ Invalid format") : ""} />
      <Field label="Low Stock Threshold" type="number" value={f.thr} onChange={e => sf("thr")(e.target.value)} />
      <div><label style={LB}>Location *</label><select value={showNl ? "_new" : f.loc} onChange={e => e.target.value === "_new" ? setShowNl(true) : (sf("loc")(e.target.value), setShowNl(false))} style={IN}><option value="">Select…</option>{d.medLocs.map(l => <option key={l}>{l}</option>)}<option value="_new">+ Add new…</option></select>
        {showNl && <div style={{ display: "flex", gap: 7, marginTop: 8 }}><input value={nl} onChange={e => setNl(e.target.value)} style={{ ...IN, flex: 1 }} placeholder="New location" autoFocus /><Btn t="✓" on={() => { if (nl.trim()) { up(x => ({ ...x, medLocs: [...x.medLocs, nl.trim()] })); sf("loc")(nl.trim()); setNl(""); setShowNl(false); } }} sm /></div>}
        {!d.medLocs.length && !showNl && <div style={{ fontSize: 12, color: "#92400e", marginTop: 6 }}>No locations yet — choose "+ Add new…" to create your first.</div>}</div>
      <Btn t="Save Medication" on={add} full /></div></Card>}
    {meds.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>{["All", ...used].map(l => <button key={l} onClick={() => setFilt(l)} style={{ padding: "4px 10px", borderRadius: 99, border: `1px solid ${filt === l ? "#1e3a8a" : "#e5e7eb"}`, background: filt === l ? "#eff6ff" : "#fff", color: filt === l ? "#1e3a8a" : T_MUTED, fontSize: 12, fontWeight: filt === l ? 600 : 400, cursor: "pointer" }}>{l}</button>)}</div>}
    {!meds.length && <Empty t="No medications yet — tap + Add" />}
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>{list.map(m => { const low = m.qty <= m.thr, exp = dLeft(m.expiry) <= 90; return (<Card key={m.id} s={{ borderLeft: `3px solid ${low ? "#ef4444" : exp ? "#f59e0b" : "#e5e7eb"}` }}><div style={{ display: "flex", justifyContent: "space-between" }}><div><div style={{ fontWeight: 600, fontSize: 14 }}>{m.name} {m.dose && <span style={{ color: T_MUTED, fontWeight: 500 }}>{m.dose}</span>}</div><div style={{ display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap" }}><Tag t={m.type} bg={m.type === "POM" ? "#dbeafe" : "#dcfce7"} fg={m.type === "POM" ? "#1e40af" : "#166534"} /><Tag t={"📍 " + m.loc} /><Tag t={"Exp " + fmtD(m.expiry)} bg={exp ? "#fef3c7" : "#f3f4f6"} fg={exp ? "#92400e" : "#374151"} /></div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: 23, fontWeight: 700, color: low ? "#ef4444" : "#111" }}>{m.qty}</div><div style={{ fontSize: 10, color: T_FAINT }}>units</div>{isDoc && <button onClick={() => del(m)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, marginTop: 3 }}>🗑</button>}</div></div></Card>); })}</div>
  </div>);
}

function Pills({ d, up, user, team, say, logIt }) {
  const [id, setId] = useState(""); const [mode, setMode] = useState("add"); const [n, setN] = useState("");
  const [busy, setBusy] = useState(false); const [res, setRes] = useState(null); const fr = useRef();
  const meds = d.meds.filter(m => m.team === team); const med = meds.find(m => m.id === id);
  const scan = async e => {
    const f = e.target.files[0]; if (!f) return; if (!id) return say("Select a medication first", "error");
    if (!AI_ENDPOINT) return say("AI scanning not configured — enter count manually", "warn");
    setBusy(true); setRes(null);
    const b64 = await shrink(f);
    const r = await askAI('Count pills visible in this blister strip photo. Respond ONLY with JSON no markdown: {"count":0,"desc":"","confidence":"high|medium|low"}', `Expected: ${med.name} ${med.dose || ""}`, b64);
    if (r) { setRes(r); setN(String(r.count)); } else say("Could not read image", "error");
    setBusy(false); e.target.value = "";
  };
  const apply = () => {
    if (!med || n === "") return say("Select a medication and enter a count", "error");
    const nq = mode === "add" ? med.qty + +n : +n;
    up(x => ({ ...x, meds: x.meds.map(m => m.id === id ? { ...m, qty: nq } : m) }));
    logIt("PILL_COUNT", `${mode === "add" ? "Added" : "Set"} ${n} for ${med.name} → ${nq}`, team);
    say(`Updated — new total: ${nq}`); setN(""); setRes(null);
  };
  return (<div><H1 t="Pill Count" />
    <p style={{ fontSize: 13, color: T_MUTED, marginBottom: 14 }}>Photograph blister strips for an exact count, or enter manually.</p>
    <Card s={{ marginBottom: 12 }}><H2 t="1. Select Medication" /><select value={id} onChange={e => { setId(e.target.value); setRes(null); setN(""); }} style={IN}><option value="">Select…</option>{meds.map(m => <option key={m.id} value={m.id}>{m.name} {m.dose} — {m.loc} (stock: {m.qty})</option>)}</select>
      {med && <div style={{ marginTop: 10, background: "#f8fafc", borderRadius: 9, padding: "10px 12px", display: "flex", gap: 16 }}><div><div style={{ fontSize: 10, color: T_FAINT, textTransform: "uppercase", fontWeight: 600 }}>Stock</div><div style={{ fontSize: 20, fontWeight: 700, color: "#1e3a8a" }}>{med.qty}</div></div><div><div style={{ fontSize: 10, color: T_FAINT, textTransform: "uppercase", fontWeight: 600 }}>Expiry</div><div style={{ fontSize: 13 }}>{fmtD(med.expiry)}</div></div></div>}</Card>
    {med && <><Card s={{ marginBottom: 12 }}><H2 t="2. Count Mode" /><div style={{ display: "flex", gap: 9 }}>{[["add", "➕ Add", "Add to current total"], ["set", "🔄 Replace", "Full recount"]].map(([v, l, s]) => <button key={v} onClick={() => setMode(v)} style={{ flex: 1, padding: "10px 11px", borderRadius: 11, border: `2px solid ${mode === v ? "#1e3a8a" : "#e5e7eb"}`, background: mode === v ? "#eff6ff" : "#fff", cursor: "pointer", textAlign: "left" }}><div style={{ fontWeight: 600, fontSize: 13, color: mode === v ? "#1e3a8a" : "#374151" }}>{l}</div><div style={{ fontSize: 11, color: T_MUTED }}>{s}</div></button>)}</div></Card>
      <Card><H2 t="3. Count Strips" /><input type="file" accept="image/*" capture="environment" ref={fr} onChange={scan} style={{ display: "none" }} />
        <Btn t={busy ? "⏳ Counting…" : "📷 Photograph Strip"} on={() => fr.current.click()} dis={busy} full />
        {res && <div style={{ marginTop: 11, background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "11px 13px" }}><div style={{ fontSize: 30, fontWeight: 800, color: "#1e3a8a" }}>{res.count} <span style={{ fontSize: 13, fontWeight: 500, color: T_MUTED }}>pills</span></div><div style={{ fontSize: 12, color: "#374151" }}>{res.desc}</div><div style={{ marginTop: 6 }}><Tag t={`Confidence: ${res.confidence}`} bg={res.confidence === "high" ? "#dcfce7" : "#fef3c7"} /></div></div>}
        <div style={{ marginTop: 11 }}><Field label="Pills counted (edit if needed)" type="number" value={n} onChange={e => setN(e.target.value)} placeholder="e.g. 6" /></div>
        {n !== "" && <div style={{ marginTop: 9, background: "#eff6ff", borderRadius: 10, padding: "10px 13px", fontSize: 13, color: "#1e3a8a" }}>New total: <b>{mode === "add" ? `${med.qty} + ${n} = ${med.qty + +n}` : n}</b></div>}
        <div style={{ marginTop: 12 }}><Btn t="Apply Count" on={apply} full /></div></Card></>}
  </div>);
}

function Disp({ d, up, user, team, say, logIt }) {
  const [f, setF] = useState({ id: "", qty: "", init: "", ind: "" }); const sf = k => v => setF(p => ({ ...p, [k]: v }));
  const meds = d.meds.filter(m => m.team === team); const isDoc = ["doctor", "super_admin"].includes(user.role);
  const recs = d.recs.filter(r => r.team === team && (isDoc || r.by === user.name));
  const go = () => {
    if (!f.id || !f.qty || !f.init || !f.ind) return say("Fill in all fields", "error");
    const m = d.meds.find(x => x.id === f.id); if (+f.qty > m.qty) return say("Insufficient stock", "error");
    up(x => ({ ...x, reqs: [...x.reqs, { id: uid(), team, medId: f.id, medName: `${m.name} ${m.dose || ""}`.trim(), qty: +f.qty, init: f.init.toUpperCase(), ind: f.ind, by: user.name, status: "pending", at: nowISO() }] }));
    logIt("DISP_REQ", `${user.name} requested ${f.qty}× ${m.name} for ${f.init.toUpperCase()}`, team);
    setF({ id: "", qty: "", init: "", ind: "" }); say("Request submitted — awaiting doctor approval");
  };
  return (<div><H1 t="Dispense Medication" />
    <Card s={{ marginBottom: 16 }}><H2 t="New Request" /><div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      <div><label style={LB}>Medication</label><select value={f.id} onChange={e => sf("id")(e.target.value)} style={IN}><option value="">Select…</option>{meds.map(m => <option key={m.id} value={m.id}>{m.name} {m.dose} ({m.qty} available)</option>)}</select></div>
      <Field label="Quantity" type="number" value={f.qty} onChange={e => sf("qty")(e.target.value)} placeholder="No. of tablets" />
      <Field label="Patient Initials" value={f.init} onChange={e => sf("init")(e.target.value.toUpperCase())} maxLength={4} placeholder="e.g. JB" />
      <div><label style={LB}>Indication</label><textarea value={f.ind} onChange={e => sf("ind")(e.target.value)} style={{ ...IN, minHeight: 64, resize: "vertical" }} placeholder="Reason for dispensing…" /></div>
      <Btn t="Submit Request" on={go} full /></div></Card>
    <H2 t={isDoc ? "All Records" : "My Records"} />
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{!recs.length && <Empty t="No dispensing records yet" />}{[...recs].reverse().map(r => <Card key={r.id} s={{ padding: "11px 14px" }}><div style={{ display: "flex", justifyContent: "space-between" }}><div><div style={{ fontWeight: 600 }}>{r.medName}</div><div style={{ fontSize: 11, color: T_MUTED }}>{r.by} · {fmtDT(r.at)}</div>{isDoc && <div style={{ fontSize: 12, color: "#374151", marginTop: 2 }}>Patient: <b>{r.init}</b> · {r.ind}</div>}</div><div style={{ textAlign: "right" }}><div style={{ fontSize: 18, fontWeight: 700 }}>{r.qty}</div><Tag t="Approved" bg="#dcfce7" fg="#166534" /></div></div></Card>)}</div>
  </div>);
}

function Trend({ d, user, team }) {
  const meds = d.meds.filter(m => m.team === team), recs = d.recs.filter(r => r.team === team);
  const isDoc = ["doctor", "super_admin"].includes(user.role);
  const mo = {}; recs.forEach(r => { const k = new Date(r.at).toLocaleString("en-GB", { month: "short", year: "2-digit" }); mo[k] = (mo[k] || 0) + r.qty; });
  const mx = Math.max(...Object.values(mo), 1); const us = {}; recs.forEach(r => us[r.medName] = (us[r.medName] || 0) + r.qty);
  const csv = () => { const rows = [["Date", "Medication", "Qty", "By", ...(isDoc ? ["Patient", "Indication"] : [])]]; recs.forEach(r => rows.push([fmtDT(r.at), r.medName, r.qty, r.by, ...(isDoc ? [r.init, r.ind] : [])])); dl(rows, "dispensing.csv"); };
  return (<div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><H1 t="Trends" /><Btn t="Export CSV" on={csv} bg="#f3f4f6" fg="#374151" sm /></div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9, marginBottom: 14 }}>{[["Meds", meds.length, "#1e3a8a"], ["Dispensed", recs.reduce((s, r) => s + r.qty, 0), "#16a34a"], ["Low", meds.filter(m => m.qty <= m.thr).length, "#dc2626"]].map(([l, v, c]) => <Card key={l} s={{ textAlign: "center", padding: "12px 6px" }}><div style={{ fontSize: 21, fontWeight: 700, color: c }}>{v}</div><div style={{ fontSize: 11, color: T_MUTED }}>{l}</div></Card>)}</div>
    <Card s={{ marginBottom: 12 }}><H2 t="Monthly Usage" />{!Object.keys(mo).length && <Empty t="No usage data yet" />}{Object.entries(mo).map(([m, c]) => <div key={m} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}><span style={{ width: 46, fontSize: 11, color: T_MUTED }}>{m}</span><div style={{ flex: 1, background: "#f3f4f6", borderRadius: 99, height: 20 }}><div style={{ width: `${c / mx * 100}%`, background: "#1e3a8a", height: "100%", borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 7, minWidth: 24 }}><span style={{ color: "#fff", fontSize: 10, fontWeight: 600 }}>{c}</span></div></div></div>)}</Card>
    <Card><H2 t="Top Medications" />{!Object.keys(us).length && <Empty t="No data" />}{Object.entries(us).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}><span>{n}</span><b style={{ color: "#1e3a8a" }}>{c}</b></div>)}</Card>
  </div>);
}

function Reqs({ d, up, user, say, rec }) {
  const pend = d.reqs.filter(r => user.teams.includes(r.team) && r.status === "pending");
  const ok = req => {
    const m = d.meds.find(x => x.id === req.medId); if (!m) return say("Medication not found", "error");
    if (req.qty > m.qty) return say("Insufficient stock", "error");
    up(x => rec({ ...x, meds: x.meds.map(y => y.id === req.medId ? { ...y, qty: y.qty - req.qty } : y), recs: [...x.recs, { id: uid(), team: req.team, medName: req.medName, qty: req.qty, init: req.init, ind: req.ind, by: req.by, at: nowISO() }], reqs: x.reqs.map(y => y.id === req.id ? { ...y, status: "approved" } : y), audit: [...x.audit, { id: uid(), act: "APPROVE", det: `Approved ${req.qty}× ${req.medName} for ${req.init}`, by: user.name, tm: req.team, ts: nowISO() }] }, "DISPENSE_APPROVED", `${user.name} approved ${req.qty}× ${req.medName} for ${req.init} (requested by ${req.by})`, req.team));
    say("Approved: " + req.medName);
    if (m.qty - req.qty <= m.thr) setTimeout(() => say(`⚠ Low stock: ${m.name}`, "warn"), 600);
  };
  const no = req => { up(x => rec({ ...x, reqs: x.reqs.map(y => y.id === req.id ? { ...y, status: "rejected" } : y), audit: [...x.audit, { id: uid(), act: "REJECT", det: `Rejected ${req.medName}`, by: user.name, tm: req.team, ts: nowISO() }] }, "DISPENSE_REJECTED", `${user.name} rejected ${req.medName}`, req.team)); say("Rejected"); };
  const done = d.reqs.filter(r => user.teams.includes(r.team) && r.status !== "pending").slice(-8).reverse();
  return (<div><H1 t="Pending Requests" />{!pend.length && <Empty t="No pending requests" />}
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>{pend.map(r => <Card key={r.id} s={{ borderLeft: "3px solid #f59e0b" }}><div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{r.medName}</div><div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}><Tag t={r.team} bg="#ede9fe" fg="#6d28d9" /><Tag t={`Patient: ${r.init}`} /><Tag t={`Qty: ${r.qty}`} /></div><div style={{ fontSize: 12, color: "#374151" }}>{r.ind}</div><div style={{ fontSize: 11, color: T_FAINT, marginBottom: 10 }}>{r.by} · {fmtDT(r.at)}</div><div style={{ display: "flex", gap: 8 }}><Btn t="✓ Approve" on={() => ok(r)} bg="#16a34a" sm /><Btn t="✕ Reject" on={() => no(r)} bg="#dc2626" sm /></div></Card>)}</div>
    <H2 t="Recent Decisions" /><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{!done.length && <Empty t="No decisions yet" />}{done.map(r => <Card key={r.id} s={{ padding: "10px 14px" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontSize: 13, fontWeight: 500 }}>{r.medName} · {r.qty}</div><div style={{ fontSize: 11, color: T_FAINT }}>{r.by}</div></div><Tag t={r.status === "approved" ? "Approved" : "Rejected"} bg={r.status === "approved" ? "#dcfce7" : "#fee2e2"} fg={r.status === "approved" ? "#166534" : "#991b1b"} /></div></Card>)}</div>
  </div>);
}

function AudLog({ d, user }) {
  const es = d.audit.filter(a => user.teams.includes(a.tm)).slice().reverse();
  return (<div><H1 t="Audit Trail" />{!es.length && <Empty t="No audit entries yet" />}<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{es.map(a => <Card key={a.id} s={{ padding: "10px 14px" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 9 }}><div style={{ flex: 1 }}><Tag t={a.act} /><div style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>{a.det}</div><div style={{ fontSize: 11, color: T_FAINT, marginTop: 2 }}>{a.by}</div></div><div style={{ fontSize: 10, color: T_FAINT, textAlign: "right" }}>{fmtDT(a.ts)}</div></div></Card>)}</div></div>);
}

function Cfg({ d, up, user, team, say }) {
  const c = d.cfg[team] || {};
  const [n, setN] = useState(c.name || ""); const [e, setE] = useState(c.email || ""); const [t, setT] = useState(c.tmpl || "");
  const low = d.meds.filter(m => m.team === team && m.qty <= m.thr);
  const send = () => {
    if (!e) return say("Set pharmacist email first", "error");
    const items = low.map(m => `- ${m.name} ${m.dose || ""}: ${m.qty} remaining`).join("\n");
    const body = (t || "Dear {pharmacist},\n\nPlease supply:\n\n{items}\n\nKind regards,\n{doctor}").replace("{pharmacist}", n || "Pharmacist").replace("{team}", team).replace("{items}", items).replace("{doctor}", user.name);
    window.open(`mailto:${e}?subject=${encodeURIComponent("Medication Order — " + team)}&body=${encodeURIComponent(body)}`);
  };
  return (<div><H1 t={`Settings — ${team}`} />
    <Card s={{ marginBottom: 13 }}><H2 t="Pharmacist Details" /><div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      <Field label="Pharmacist Name" value={n} onChange={ev => setN(ev.target.value)} placeholder="e.g. Boots Pharmacy" />
      <Field label="Pharmacist Email" type="email" value={e} onChange={ev => setE(ev.target.value)} placeholder="pharmacy@example.com" />
      <div><label style={LB}>Order Template</label><textarea value={t} onChange={ev => setT(ev.target.value)} style={{ ...IN, minHeight: 100, resize: "vertical" }} placeholder={"Dear {pharmacist},\n\nPlease supply for {team}:\n\n{items}\n\nKind regards,\n{doctor}"} /></div>
      <Btn t="Save Settings" on={() => { up(x => ({ ...x, cfg: { ...x.cfg, [team]: { name: n, email: e, tmpl: t } } })); say("Settings saved"); }} full /></div></Card>
    <Card><H2 t="Low Stock Order" />{!low.length ? <p style={{ fontSize: 13, color: T_MUTED }}>No medications below threshold.</p> : <>{low.map(m => <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}><span>{m.name} {m.dose}</span><b style={{ color: "#dc2626" }}>{m.qty} left</b></div>)}<div style={{ marginTop: 11 }}><Btn t="📧 Send Order Email" on={send} full /></div></>}</Card>
  </div>);
}

/* ── INVENTORY MODULE ─────────────────────────────────────── */
function InvDash({ d }) {
  const cats = catsOf(d); const items = d.items;
  const byLevel = LEVELS.map(l => ({ ...l, n: items.filter(i => alertOf(i.expiry)?.label === l.label).length }));
  const byLoc = d.invLocs.map(l => { const c = [...d.checks].filter(x => x.loc === l).sort((a, b) => new Date(b.at) - new Date(a.at))[0]; return { loc: l, last: c, days: c ? Math.floor((new Date() - new Date(c.at)) / 86400000) : null, n: items.filter(i => i.locs.some(x => x.name === l)).length }; });
  const byCat = cats.map(c => ({ ...c, n: items.filter(i => i.cat === c.k).length })).filter(c => c.n > 0);
  const mmLocs = d.invLocs.map(l => ({ loc: l, n: d.checks.filter(c => c.loc === l).reduce((s, c) => s + (c.mm?.length || 0), 0) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  const recent = [...d.checks].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5);
  return (<div><H1 t="Inventory Dashboard" />
    {!d.invLocs.length && <Card s={{ marginBottom: 12, borderLeft: "4px solid #1e3a8a", background: "#eff6ff" }}><div style={{ fontWeight: 700, color: "#1e40af", marginBottom: 4 }}>Start here</div><div style={{ fontSize: 13, color: "#1e40af" }}>Add your storage locations in the <b>Locations</b> tab, then start adding items.</div></Card>}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>{[["Total Items", items.length, "#1e3a8a"], ["Locations", d.invLocs.length, "#0369a1"], ["Low Stock (≤5)", items.filter(i => i.qty <= 5).length, "#dc2626"], ["Expiry Alerts", items.filter(i => alertOf(i.expiry)).length, "#d97706"]].map(([l, v, c]) => <Card key={l} s={{ textAlign: "center", padding: "14px 8px" }}><div style={{ fontSize: 25, fontWeight: 700, color: c }}>{v}</div><div style={{ fontSize: 12, color: T_MUTED, marginTop: 3 }}>{l}</div></Card>)}</div>
    {byCat.length > 0 && <Card s={{ marginBottom: 12 }}><H2 t="By Section" /><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{byCat.map(c => <div key={c.k} style={{ background: c.col, borderRadius: 9, padding: "8px 12px" }}><div style={{ fontSize: 18, fontWeight: 700, color: c.fg }}>{c.n}</div><div style={{ fontSize: 11, color: c.fg, fontWeight: 600 }}>{c.label}</div></div>)}</div></Card>}
    <Card s={{ marginBottom: 12 }}><H2 t="Expiry Pipeline" /><div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{byLevel.map(l => <div key={l.label} style={{ flex: "1 1 45%", background: l.bg, border: `1px solid ${l.br}`, borderRadius: 10, padding: "10px 12px" }}><div style={{ fontSize: 21, fontWeight: 700, color: l.fg }}>{l.n}</div><div style={{ fontSize: 11.5, color: l.fg, fontWeight: 600 }}>within {l.label}</div></div>)}</div></Card>
    {byLoc.length > 0 && <Card s={{ marginBottom: 12 }}><H2 t="Audit Compliance" /><div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{byLoc.map(x => { const od = x.days === null || x.days > 30; return <div key={x.loc} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 11px", background: od ? "#fef2f2" : "#f0fdf4", borderRadius: 9, border: `1px solid ${od ? "#fecaca" : "#bbf7d0"}` }}><div><div style={{ fontSize: 13, fontWeight: 600 }}>{x.loc}</div><div style={{ fontSize: 11, color: T_MUTED }}>{x.n} item{x.n !== 1 ? "s" : ""}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: 12.5, fontWeight: 700, color: od ? "#991b1b" : "#166534" }}>{x.days === null ? "Never audited" : x.days === 0 ? "Today" : `${x.days}d ago`}</div>{x.last && <div style={{ fontSize: 10, color: T_FAINT }}>{x.last.by}</div>}</div></div>; })}</div></Card>}
    {mmLocs.length > 0 && <Card s={{ marginBottom: 12, borderLeft: "4px solid #f59e0b" }}><H2 t="Discrepancy Watch" /><p style={{ fontSize: 12, color: T_MUTED, margin: "0 0 9px" }}>Locations with recurring count mismatches.</p>{mmLocs.map(x => <div key={x.loc} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}><span>{x.loc}</span><b style={{ color: "#d97706" }}>{x.n} mismatch{x.n !== 1 ? "es" : ""}</b></div>)}</Card>}
    <Card><H2 t="Recent Audits" />{!recent.length && <Empty t="No audits completed yet" />}{recent.map(c => <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}><div><div style={{ fontSize: 13, fontWeight: 500 }}>{c.loc}</div><div style={{ fontSize: 11, color: T_FAINT }}>{c.by} · {fmtDT(c.at)}</div></div><Tag t={`${c.n} items`} bg="#dbeafe" fg="#1e40af" /></div>)}</Card>
  </div>);
}

/* Stock Audit — every recorded element is verified individually */
function StockAudit({ d, up, user, team, say, logIt, ph, setPh }) {
  const cats = catsOf(d);
  const [loc, setLoc] = useState(""); const [on, setOn] = useState(false); const [c, setC] = useState({});
  const [warn, setWarn] = useState(false); const [busy, setBusy] = useState(false); const [sm, setSm] = useState("");
  const [open, setOpen] = useState(null); const fr = useRef();
  const items = d.items.filter(i => i.locs.some(x => x.name === loc));
  const qtyAt = i => i.locs.find(x => x.name === loc)?.qty ?? i.qty;
  const last = [...d.checks].filter(x => x.loc === loc).sort((a, b) => new Date(b.at) - new Date(a.at))[0];
  const mm = items.filter(i => { const s = c[i.id]; return s?.on && s.qty !== "" && +s.qty !== qtyAt(i); });

  /* Which elements apply to this item — every one of them must be ticked */
  const els = i => KINDS.filter(k => k.k === "name" || k.k === "qty" || (k.k === "expiry" && i.expiry) || (k.k === "batch" && i.batch));
  const elOK = (i, k) => !!c[i.id]?.el?.[k];
  const full = i => els(i).every(k => elOK(i, k.k));
  const shotsOf = i => (ph[i.pg] || []);
  const started = items.filter(i => c[i.id]?.on);
  const verified = started.filter(full);

  const tog = id => setC(p => ({ ...p, [id]: { ...p[id], on: !p[id]?.on, qty: p[id]?.qty ?? "", note: p[id]?.note || "", el: p[id]?.el || {} } }));
  const togEl = (i, k) => setC(p => ({ ...p, [i.id]: { ...p[i.id], on: true, qty: p[i.id]?.qty ?? "", el: { ...(p[i.id]?.el || {}), [k]: !p[i.id]?.el?.[k] } } }));
  const allEl = i => setC(p => ({ ...p, [i.id]: { ...p[i.id], on: true, qty: p[i.id]?.qty ?? "", el: Object.fromEntries(els(i).map(k => [k.k, true])) } }));
  const setQ = (id, v) => setC(p => ({ ...p, [id]: { ...p[id], on: true, qty: v, el: p[id]?.el || {} } }));
  const setNo = (id, v) => setC(p => ({ ...p, [id]: { ...p[id], note: v } }));

  /* Add evidence photos mid-audit */
  const attach = async (item, files) => {
    let pg = item.pg;
    if (!pg) { pg = uid(); up(x => ({ ...x, items: x.items.map(y => y.id === item.id ? { ...y, pg } : y) })); }
    const add = [];
    for (const f of Array.from(files)) { try { add.push({ id: uid(), data: await shrinkPhoto(f), at: nowISO(), by: user.name }); } catch {} }
    setPh(p => ({ ...p, [pg]: [...(p[pg] || []), ...add] }));
    say(`${add.length} photo${add.length !== 1 ? "s" : ""} added`);
  };
  const detach = (item, id) => setPh(p => ({ ...p, [item.pg]: (p[item.pg] || []).filter(s => s.id !== id) }));

  const scan = async e => {
    const f = e.target.files[0]; if (!f) return;
    if (!AI_ENDPOINT) return say("AI scanning not configured — tick items manually", "warn");
    setBusy(true); setSm("Reading image…");
    const b64 = await shrink(f);
    const known = items.map(i => `${i.name}${i.dose ? " " + i.dose : ""} (qty ${qtyAt(i)})`).join("; ");
    const r = await askAI('Auditing medical stock. Photo may show a package (front/back) OR blister strips. Extract details; if strips visible count remaining pills. Respond ONLY with JSON no markdown: {"name":"","dose":"","batch":"","expiry":"","count":null,"is_strip":false,"confidence":"high|medium|low"}', `Known items here: ${known || "none"}`, b64);
    if (!r) { say("Could not read image", "error"); setSm(""); setBusy(false); return; }
    const match = items.find(i => r.name && i.name.toLowerCase().includes(String(r.name).toLowerCase().split(" ")[0]));
    if (match) { const q = r.count != null ? r.count : qtyAt(match); setC(p => ({ ...p, [match.id]: { on: true, qty: String(q), note: r.batch ? `Batch ${r.batch}` : "", el: p[match.id]?.el || {} } })); setOpen(match.id); setSm(`✓ ${match.name} — ${r.is_strip ? `counted ${r.count} pills` : "package identified"}${r.batch ? ` · batch ${r.batch}` : ""} — now confirm each element below`); say(`Matched: ${match.name}`); }
    else { setSm(`⚠ Read "${r.name || "unknown"}" — no match at ${loc}`); say("No match here", "warn"); }
    setBusy(false); e.target.value = "";
  };

  const fin = () => {
    if (!started.length) return say("No items checked", "error");
    const partial = started.filter(i => !full(i));
    if (partial.length) return say(`${partial.length} item${partial.length !== 1 ? "s" : ""} still have elements to confirm`, "error");
    if (mm.length) return setWarn(true);
    go(verified);
  };
  const go = done => {
    const rows = done.map(i => { const en = c[i.id]?.qty === "" ? qtyAt(i) : +c[i.id].qty; const pv = last?.items.find(x => x.id === i.id); return { id: i.id, name: i.name, dose: i.dose, expiry: i.expiry, batch: i.batch || "", qty: qtyAt(i), entered: en, note: c[i.id]?.note || "", el: c[i.id]?.el || {}, used: pv ? (pv.entered ?? pv.qty) - en : null }; });
    up(x => ({ ...x, checks: [...x.checks, { id: uid(), loc, at: nowISO(), by: user.name, n: done.length, items: rows, mm: mm.map(m => ({ name: m.name, exp: qtyAt(m), act: +c[m.id].qty })) }], items: x.items.map(i => { const r = rows.find(y => y.id === i.id); return r ? { ...i, locs: i.locs.map(l => l.name === loc ? { ...l, qty: r.entered } : l), checked: nowISO() } : i; }) }));
    logIt("AUDIT", `Stock audit at ${loc} — ${done.length} items fully verified${mm.length ? `, ${mm.length} mismatches` : ""}`, team);
    say(`Audit saved — ${done.length} items`); setOn(false); setC({}); setLoc(""); setWarn(false); setSm(""); setOpen(null);
  };

  const valueOf = (i, k) => k === "name" ? `${i.name}${i.dose ? " " + i.dose : ""}` : k === "expiry" ? fmtD(i.expiry) : k === "batch" ? (i.batch || "—") : `Registered ${qtyAt(i)}${c[i.id]?.qty !== "" && c[i.id]?.qty != null ? ` · counted ${c[i.id].qty}` : ""}`;

  return (<div><H1 t="Stock Audit" />
    {!on ? <Card><H2 t="Start New Audit" /><label style={LB}>Location</label>
      {!d.invLocs.length ? <p style={{ fontSize: 13, color: "#92400e", margin: 0 }}>No locations yet — add them in the Locations tab first.</p> : <>
        <select value={loc} onChange={e => setLoc(e.target.value)} style={IN}><option value="">Select…</option>{d.invLocs.map(l => <option key={l}>{l}</option>)}</select>
        {loc && !items.length && <p style={{ fontSize: 12, color: "#d97706", marginTop: 8 }}>⚠ No items registered here — add via the Add tab first.</p>}
        {loc && last && <p style={{ fontSize: 12, color: T_MUTED, marginTop: 8 }}>Last audit: {fmtDT(last.at)} by {last.by}</p>}
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 13px", fontSize: 12.5, color: "#1e40af", marginTop: 11 }}>Each item is signed off element by element — product name, expiry, amount and batch. An item only counts as audited once all of its elements are confirmed.</div>
        <div style={{ marginTop: 12 }}><Btn t="Start Audit" on={() => { if (!loc) return say("Select a location", "error"); setOn(true); setC({}); }} dis={!loc || !items.length} full /></div></>}</Card>
      : <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><div><div style={{ fontWeight: 700, fontSize: 16 }}>{loc}</div><div style={{ fontSize: 11.5, color: T_MUTED }}>{items.length} registered · {verified.length} fully verified{started.length > verified.length ? ` · ${started.length - verified.length} part-done` : ""}</div></div><Btn t="✓ Finish" on={fin} bg="#16a34a" sm /></div>
        <Card s={{ marginBottom: 11, background: "#f8fafc" }}><input type="file" accept="image/*" capture="environment" ref={fr} onChange={scan} style={{ display: "none" }} />
          <Btn t={busy ? "⏳ Reading photo…" : "📷 Photograph Item or Strip"} on={() => fr.current.click()} dis={busy} full />
          <div style={{ fontSize: 11.5, color: T_MUTED, marginTop: 7, textAlign: "center" }}>Photograph the package or blister strips to jump to that item</div>
          {sm && <div style={{ marginTop: 9, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 9, padding: "9px 12px", fontSize: 12, color: "#374151" }}>{sm}</div>}</Card>
        {mm.length > 0 && <Card s={{ borderLeft: "4px solid #f59e0b", background: "#fffbeb", marginBottom: 10 }}><div style={{ fontWeight: 700, color: "#92400e", marginBottom: 4 }}>⚠ {mm.length} mismatch{mm.length !== 1 ? "es" : ""}</div>{mm.map(m => <div key={m.id} style={{ fontSize: 12, color: "#78350f" }}>• {m.name} — expected {qtyAt(m)}, counted {c[m.id]?.qty}</div>)}</Card>}
        {warn && <Card s={{ border: "2px solid #f59e0b", marginBottom: 10 }}><div style={{ fontWeight: 700, marginBottom: 8 }}>Save with mismatches?</div><div style={{ fontSize: 12, color: T_MUTED, marginBottom: 10 }}>Registered quantities will update to counted values and be flagged in history.</div><div style={{ display: "flex", gap: 8 }}><Btn t="Save Anyway" on={() => go(verified)} bg="#d97706" sm /><Btn t="Go Back" on={() => setWarn(false)} bg="#f3f4f6" fg="#374151" sm /></div></Card>}
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>{items.map(i => {
          const st = c[i.id] || {}; const a = alertOf(i.expiry); const reg = qtyAt(i); const bad = st.on && st.qty !== "" && st.qty != null && +st.qty !== reg;
          const pv = last?.items.find(x => x.id === i.id); const used = pv && st.qty !== "" && st.qty != null ? (pv.entered ?? pv.qty) - +st.qty : null; const co = catOf(i.cat, cats);
          const done = full(i); const openThis = open === i.id || st.on;
          return (<Card key={i.id} s={{ borderLeft: `3px solid ${bad ? "#f59e0b" : done ? "#16a34a" : st.on ? "#0369a1" : a ? a.br : "#e5e7eb"}`, background: bad ? "#fffbeb" : done ? "#f0fdf4" : "#fff" }}>
            <div style={{ display: "flex", gap: 10 }}><input type="checkbox" checked={!!st.on} onChange={() => tog(i.id)} style={{ width: 19, height: 19, marginTop: 2, accentColor: "#16a34a" }} />
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{i.name} {i.dose && <span style={{ color: T_MUTED, fontWeight: 500 }}>{i.dose}</span>}</div>
                <div style={{ fontSize: 11.5, color: T_MUTED, marginTop: 3 }}><Tag t={co.label} bg={co.col} fg={co.fg} /> Registered: <b>{reg}</b> · Exp: {fmtD(i.expiry)}{i.batch ? ` · Batch ${i.batch}` : ""}</div>
                {openThis && <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 11, marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: done ? "#166534" : "#92400e" }}>{done ? "✓ All elements confirmed" : `${els(i).filter(k => elOK(i, k.k)).length}/${els(i).length} elements confirmed`}</div>
                    <button onClick={() => allEl(i)} style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "5px 10px", fontSize: 11.5, fontWeight: 700, color: "#1e3a8a", cursor: "pointer" }}>Confirm all</button></div>
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 9, padding: "9px 11px", marginBottom: 7, background: "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 9 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{shotsOf(i).length ? `${shotsOf(i).length} photo${shotsOf(i).length !== 1 ? "s" : ""} on file` : "No photos on file"}</div>
                      <AuditShot onPick={files => attach(i, files)} />
                    </div>
                    {shotsOf(i).length > 0
                      ? <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto" }}>{shotsOf(i).map(s => <div key={s.id} style={{ position: "relative", flexShrink: 0 }}>
                          <img src={s.data} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }} />
                          <button onClick={() => detach(i, s.id)} style={{ position: "absolute", top: -5, right: -5, width: 19, height: 19, borderRadius: 99, background: "#dc2626", color: "#fff", border: "2px solid #fff", fontSize: 11, lineHeight: 1, cursor: "pointer", fontWeight: 700 }}>\u00d7</button></div>)}</div>
                      : <div style={{ fontSize: 11, color: "#d97706", marginTop: 6 }}>Tap \ud83d\udcf7 to capture the item \u2014 one shot showing name, expiry, amount and batch is enough</div>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{els(i).map(k => {
                    const okd = elOK(i, k.k);
                    return (<div key={k.k} style={{ border: `1px solid ${okd ? "#bbf7d0" : "#e2e8f0"}`, background: okd ? "#f0fdf4" : "#fff", borderRadius: 9, padding: "8px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <input type="checkbox" checked={okd} onChange={() => togEl(i, k.k)} style={{ width: 18, height: 18, accentColor: "#16a34a", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600 }}>{k.label}</div><div style={{ fontSize: 12, color: T_MUTED, overflow: "hidden", textOverflow: "ellipsis" }}>{valueOf(i, k.k)}</div></div>
                      </div>
                    </div>);
                  })}</div>
                  <div style={{ marginTop: 9, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                    <div><label style={{ ...LB, fontSize: 11 }}>Counted qty</label><input type="number" value={st.qty ?? ""} onChange={e => setQ(i.id, e.target.value)} style={{ ...IN, padding: "6px 9px", fontSize: 14, borderColor: bad ? "#f59e0b" : "#94a3b8" }} placeholder={`Registered: ${reg}`} />
                      {bad && <div style={{ fontSize: 10.5, color: "#d97706", marginTop: 2 }}>⚠ Expected {reg}</div>}
                      {used != null && used !== 0 && <div style={{ fontSize: 10.5, color: used > 0 ? "#0369a1" : "#16a34a", marginTop: 2 }}>{used > 0 ? `${used} used since last audit` : `${-used} added`}</div>}</div>
                    <div><label style={{ ...LB, fontSize: 11 }}>Notes</label><input value={st.note || ""} onChange={e => setNo(i.id, e.target.value)} style={{ ...IN, padding: "6px 9px", fontSize: 14 }} placeholder="Optional" /></div></div>
                </>}
              </div>{a && <Tag t={dLeft(i.expiry) < 0 ? "EXPIRED" : `${dLeft(i.expiry)}d`} bg={a.bg} fg={a.fg} />}</div></Card>);
        })}</div>
      </div>}
  </div>);
}
/* Small camera button used inside each audit element row */
function AuditShot({ onPick }) {
  const r = useRef();
  return (<>
    <input type="file" accept="image/*" capture="environment" multiple ref={r} style={{ display: "none" }} onChange={e => { if (e.target.files?.length) onPick(e.target.files); e.target.value = ""; }} />
    <button onClick={() => r.current?.click()} style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 9px", fontSize: 13, cursor: "pointer", flexShrink: 0 }}>📷</button>
  </>);
}

function AddItems({ d, up, user, say, ph, setPh }) {
  const cats = catsOf(d);
  const [sel, setSel] = useState([]); const [filt, setFilt] = useState("All"); const [show, setShow] = useState(false);
  const [name, setName] = useState(""); const [dose, setDose] = useState(""); const [cat, setCat] = useState("");
  const [catBusy, setCatBusy] = useState(false); const [catAuto, setCatAuto] = useState(false); const [filled, setFilled] = useState("");
  const [qty, setQty] = useState(""); const [sameAll, setSameAll] = useState(null);
  const [expiry, setExpiry] = useState(""); const [batch, setBatch] = useState("");
  const [variants, setVariants] = useState([]); const [locQty, setLocQty] = useState({});
  const [pics, setPics] = useState([]); const [picBusy, setPicBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false); const [scanMsg, setScanMsg] = useState(""); const scanRef = useRef();
  const [doses, setDoses] = useState([]); const [dl2, setDl2] = useState(false);
  const [xf, setXf] = useState(null); const [xt, setXt] = useState(""); const [xc, setXc] = useState("");
  const isMed = cat === "Medications"; const totalQty = +qty || 0;
  const allocated = Object.values(locQty).reduce((s, n) => s + n, 0);
  const remaining = Math.max(0, totalQty - allocated);
  const variantTotal = variants.reduce((s, v) => s + (+v.qty || 0), 0);

  /* Autocomplete from everything already registered */
  const prior = [...new Map(d.items.map(i => [i.name.toLowerCase(), i])).values()];
  const onName = v => {
    setName(v); setCatAuto(false);
    const m = prior.find(p => p.name.toLowerCase() === v.trim().toLowerCase());
    if (m) { if (!cat) setCat(m.cat); if (!dose && m.dose) setDose(m.dose); setFilled(m.name); }
    else setFilled("");
  };

  const autoCat = async () => {
    if (!name.trim() || cat || catAuto || !AI_ENDPOINT) return;
    setCatBusy(true);
    const list = cats.map(c => c.k).join(", ");
    const r = await askAI(`Classify a medical/sports-medicine item into ONE of these section keys: ${list}. A/B/C/D/E follow the ABCDE trauma framework (E = everything else). Respond ONLY with JSON no markdown: {"cat":"<one key>"}`, `Item: ${name}`);
    if (r?.cat && cats.find(c => c.k === r.cat)) { setCat(r.cat); setCatAuto(true); say(`Suggested section: ${catOf(r.cat, cats).label}`); }
    setCatBusy(false);
  };
  const lookupDoses = async () => {
    if (!name.trim()) return say("Enter a medication name first", "error");
    if (!AI_ENDPOINT) return say("BNF lookup not configured — enter dose manually", "warn");
    setDl2(true); setDoses([]);
    const r = await askAI('UK BNF assistant. List licensed UK strengths. Respond ONLY with JSON no markdown: {"doses":["400mg tablets"]}', `Medication: ${name}`);
    if (r?.doses?.length) { setDoses(r.doses); say(`${r.doses.length} BNF strengths found`); } else say("None found — enter manually", "warn");
    setDl2(false);
  };
  /* Allocation can never exceed the quantity entered */
  const bumpLoc = l => { if (!totalQty) return say("Enter a quantity first", "error"); if (remaining <= 0) return say(`All ${totalQty} already allocated`, "warn"); setLocQty(p => ({ ...p, [l]: (p[l] || 0) + 1 })); };
  const dropLoc = l => setLocQty(p => { const c = (p[l] || 0) - 1; const n = { ...p }; if (c <= 0) delete n[l]; else n[l] = c; return n; });
  const setVariantCount = n => setVariants(Array.from({ length: n }, (_, i) => variants[i] || { qty: "1", expiry: "", batch: "" }));
  const addPics = async files => {
    setPicBusy(true); const add = [];
    for (const f of Array.from(files)) { try { add.push({ id: uid(), data: await shrinkPhoto(f), at: nowISO(), by: user.name }); } catch {} }
    setPics(p => [...p, ...add]); setPicBusy(false);
  };
  const reset = () => { setName(""); setDose(""); setCat(""); setCatAuto(false); setFilled(""); setQty(""); setSameAll(null); setExpiry(""); setBatch(""); setVariants([]); setLocQty({}); setPics([]); setDoses([]); setScanMsg(""); setShow(false); };

  /* Scan to fill — reads the label and populates the fields. Images are never stored. */
  const scanFill = async files => {
    if (!AI_ENDPOINT) return say("Scanning needs the AI endpoint — see AI SETUP at the foot of App.jsx", "warn");
    setScanBusy(true); setScanMsg("");
    const imgs = [];
    for (const f of Array.from(files).slice(0, 4)) { try { imgs.push(await shrink(f)); } catch {} }
    if (!imgs.length) { setScanBusy(false); return say("Could not open those photos", "error"); }
    const known = prior.slice(0, 40).map(p => p.name).join("; ");
    const r = await askAI(
      'You are reading photos of a medical or sports-medicine stock item — packaging, a printed label, or blister strips. Extract ONLY what is clearly legible and never guess. Dates: copy exactly as printed, as DD/MM/YYYY when a day is shown, otherwise MM/YYYY. If blister strips are visible, count the units remaining. Use null or "" for anything you cannot read confidently. Respond ONLY with JSON, no markdown: {"name":"","dose":"","expiry":"","batch":"","total":null,"remaining":null}',
      `Read this item.${known ? ` If the product matches one of these already in the register, use that exact spelling: ${known}` : ""}`,
      imgs);
    setScanBusy(false);
    if (!r) return say("Could not read that — fill the fields in manually", "error");
    const got = [], kept = [], missed = [];
    const rd = v => (v == null ? "" : String(v).trim());
    if (rd(r.name)) { if (name.trim()) kept.push("name"); else { onName(rd(r.name)); got.push(`name (${rd(r.name)})`); } } else missed.push("name");
    if (rd(r.dose)) { if (!dose) { setDose(rd(r.dose)); got.push(`dose (${rd(r.dose)})`); } else kept.push("dose"); }
    if (rd(r.expiry)) {
      if (!expValid(rd(r.expiry))) missed.push(`expiry (read "${rd(r.expiry)}" — not a date the app accepts)`);
      else if (expiry) kept.push("expiry");
      else { setExpiry(rd(r.expiry)); got.push(`expiry (${fmtD(rd(r.expiry))})`); }
    } else missed.push("expiry");
    if (rd(r.batch)) { if (batch) kept.push("batch"); else { setBatch(rd(r.batch)); got.push(`batch (${rd(r.batch)})`); } } else missed.push("batch / lot");
    const count = r.remaining ?? r.total;
    if (count != null && !isNaN(+count)) {
      if (qty) kept.push("quantity");
      else { setQty(String(+count)); setSameAll(null); setVariants([]); setLocQty({}); got.push(`quantity (${+count}${r.remaining != null && r.total != null && r.total !== r.remaining ? ` remaining of ${r.total}` : ""})`); }
    } else missed.push("quantity");
    setScanMsg([
      got.length ? `Filled in: ${got.join(", ")}.` : "Nothing could be filled in from that.",
      kept.length ? `Left alone because you'd already typed them: ${kept.join(", ")}.` : "",
      missed.length ? `Couldn't read: ${missed.join(", ")} — add by hand.` : "",
      "Check every field against the packaging before saving.",
    ].filter(Boolean).join(" "));
    if (got.length) say(`${got.length} field${got.length !== 1 ? "s" : ""} filled in`);
  };

  const add = () => {
    if (!name.trim()) return say("Item name required", "error");
    if (!cat) return say("Choose a section", "error");
    if (!totalQty) return say("Enter the quantity being added", "error");
    const locs = Object.entries(locQty).filter(([, n]) => n > 0).map(([nm, n]) => ({ name: nm, qty: n }));
    if (!locs.length) return say("Assign the item to at least one location", "error");
    if (allocated !== totalQty) return say(`${remaining} of ${totalQty} still to allocate`, "error");
    const pg = pics.length ? uid() : null;
    if (pg) setPh(p => ({ ...p, [pg]: pics }));
    if (sameAll === false && variants.length) {
      if (variants.find(v => !expValid(v.expiry))) return say("Each batch needs a valid expiry", "error");
      variants.forEach((v, idx) => {
        up(x => ({ ...x, items: [...x.items, { id: uid(), name: name.trim(), dose, cat, expiry: v.expiry, batch: v.batch, qty: +v.qty || 1, locs: idx === 0 ? locs : [locs[0]], pg, added: nowISO(), checked: nowISO() }] }));
        const a = alertOf(v.expiry); if (a) up(x => ({ ...x, orders: [...x.orders, { id: uid(), name: `${name} ${dose || ""}`.trim(), loc: locs.map(l => l.name).join(", "), expiry: v.expiry, lvl: a.label, done: false }] }));
      });
      say(`${variants.length} batches added`); reset(); return;
    }
    if (!expValid(expiry)) return say("Enter expiry as MM/YYYY or DD/MM/YYYY", "error");
    up(x => ({ ...x, items: [...x.items, { id: uid(), name: name.trim(), dose, cat, expiry, batch, qty: totalQty, locs, pg, added: nowISO(), checked: nowISO() }] }));
    const a = alertOf(expiry); if (a) up(x => ({ ...x, orders: [...x.orders, { id: uid(), name: `${name} ${dose || ""}`.trim(), loc: locs.map(l => l.name).join(", "), expiry, lvl: a.label, done: false }] }));
    say(`Added to ${locs.length} location${locs.length !== 1 ? "s" : ""}${pics.length ? ` with ${pics.length} photo${pics.length !== 1 ? "s" : ""}` : ""}`); reset();
  };
  const del = i => { up(x => ({ ...x, items: x.items.filter(y => y.id !== i.id) })); say("Removed"); };
  const move = () => {
    if (!xt && !xc) return say("Choose a location or a section to move to", "error");
    up(x => ({ ...x, items: x.items.map(i => i.id === xf.id ? { ...i, ...(xt ? { locs: [{ name: xt, qty: i.qty }] } : {}), ...(xc ? { cat: xc } : {}) } : i) }));
    say(`${xf.name} moved${xt ? ` → ${xt}` : ""}${xc ? ` → ${catOf(xc, cats).label}` : ""}`);
    setXf(null); setXt(""); setXc("");
  };
  const usedCats = [...new Set(d.items.map(i => i.cat))];
  const grp = sel.reduce((a, l) => { const it = d.items.filter(i => i.locs.some(x => x.name === l) && (filt === "All" || i.cat === filt)); if (it.length) a[l] = it; return a; }, {});

  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 13 }}><H1 t="Item Register" /><Btn t={show ? "Cancel" : "+ Add"} on={() => show ? reset() : setShow(true)} sm /></div>
    {show && <Card s={{ marginBottom: 13 }}><H2 t="Add Item" /><div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 12, padding: "13px 14px" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1e40af" }}>Scan to fill</div>
        <div style={{ fontSize: 13.5, color: "#1e40af", marginTop: 4, marginBottom: 10, lineHeight: 1.45 }}>
          Photograph the packaging, the printed expiry, the strips and the batch number — front and back, up to four shots at once. Whatever is legible drops into the fields below. These shots are read and discarded, not stored.
        </div>
        <input type="file" accept="image/*" capture="environment" multiple ref={scanRef} style={{ display: "none" }}
          onChange={e => { if (e.target.files?.length) scanFill(e.target.files); e.target.value = ""; }} />
        <Btn t={scanBusy ? "⏳ Reading…" : "📷 Scan product"} on={() => scanRef.current?.click()} dis={scanBusy || !AI_ENDPOINT} full />
        {!AI_ENDPOINT && <div style={{ fontSize: 12.5, color: "#92400e", marginTop: 9, lineHeight: 1.45 }}>Scanning is switched off until AI_ENDPOINT is set — see AI SETUP at the foot of this file. Fill the fields in by hand meanwhile.</div>}
        {scanMsg && <div style={{ marginTop: 10, background: "#fff", border: "1px solid #bfdbfe", borderRadius: 9, padding: "10px 12px", fontSize: 12.5, color: "#1f2937", lineHeight: 1.5 }}>{scanMsg}</div>}
      </div>
      <div><label style={LB}>Item Name</label>
        <input list="prioritems" value={name} onChange={e => onName(e.target.value)} onBlur={autoCat} style={IN} placeholder="e.g. Guedel airway, Whey protein, Tubigrip" />
        <datalist id="prioritems">{prior.map(p => <option key={p.id} value={p.name}>{catOf(p.cat, cats).label}</option>)}</datalist>
        <div style={{ fontSize: 13, color: filled ? "#16a34a" : T_MUTED, marginTop: 5 }}>{filled ? `✓ Matched a previous entry — section and dose filled in` : prior.length ? `Suggestions from ${prior.length} item${prior.length !== 1 ? "s" : ""} already registered` : "First item — no suggestions yet"}</div></div>
      <div><label style={LB}>Section <span style={{ color: "#ef4444" }}>*</span> {catBusy && <span style={{ color: "#1e3a8a", fontSize: 11 }}>· suggesting…</span>}{catAuto && !catBusy && <span style={{ color: "#16a34a", fontSize: 11 }}>· suggested</span>}</label>
        <select value={cat} onChange={e => { setCat(e.target.value); setCatAuto(false); }} style={{ ...IN, background: cat ? catOf(cat, cats).col : "#fff", color: cat ? catOf(cat, cats).fg : "#000", fontWeight: 600 }}>
          <option value="">Choose a section…</option>{cats.map(c => <option key={c.k} value={c.k}>{c.label}</option>)}</select>
        <div style={{ fontSize: 13, color: T_MUTED, marginTop: 5 }}>Add or remove sections in the Sections tab.</div></div>
      {isMed && <div><label style={LB}>Dose / Strength</label><div style={{ display: "flex", gap: 7 }}>
        {doses.length ? <select value={dose} onChange={e => setDose(e.target.value)} style={{ ...IN, flex: 1 }}><option value="">Select strength…</option>{doses.map(x => <option key={x}>{x}</option>)}</select> : <input value={dose} onChange={e => setDose(e.target.value)} style={{ ...IN, flex: 1 }} placeholder="e.g. 400mg" />}
        <Btn t={dl2 ? "…" : "BNF"} on={lookupDoses} dis={dl2} bg="#f3f4f6" fg="#1e3a8a" sm /></div></div>}
      <Field label="Quantity *" type="number" value={qty} onChange={e => { setQty(e.target.value); setSameAll(null); setVariants([]); setLocQty({}); }} placeholder="How many units are you adding?" hint="This is the maximum you can spread across locations below" />
      {totalQty > 1 && <div style={{ background: "#f8fafc", borderRadius: 11, padding: "12px 14px", border: "1px solid #e5e7eb" }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 9 }}>You've entered {totalQty} units. Do they all share the same expiry and batch/lot number?</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setSameAll(true); setVariants([]); }} style={{ flex: 1, padding: "9px", borderRadius: 9, border: `2px solid ${sameAll === true ? "#16a34a" : "#e5e7eb"}`, background: sameAll === true ? "#f0fdf4" : "#fff", fontWeight: 600, fontSize: 13, color: sameAll === true ? "#166534" : "#374151", cursor: "pointer" }}>Yes — all identical</button>
          <button onClick={() => { setSameAll(false); setVariantCount(2); }} style={{ flex: 1, padding: "9px", borderRadius: 9, border: `2px solid ${sameAll === false ? "#d97706" : "#e5e7eb"}`, background: sameAll === false ? "#fffbeb" : "#fff", fontWeight: 600, fontSize: 13, color: sameAll === false ? "#92400e" : "#374151", cursor: "pointer" }}>No — they differ</button></div></div>}
      {(totalQty <= 1 || sameAll === true) && <>
        <Field label="Expiry" value={expiry} onChange={e => setExpiry(e.target.value)} placeholder="MM/YYYY or DD/MM/YYYY" hint={expiry ? (expValid(expiry) ? `✓ ${fmtD(expiry)} · ${dLeft(expiry)} days` : "⚠ Use MM/YYYY or DD/MM/YYYY") : "Month & year alone is fine"} />
        <Field label="Batch / Lot No." value={batch} onChange={e => setBatch(e.target.value)} placeholder="Optional" /></>}
      {sameAll === false && <div style={{ background: "#fffbeb", borderRadius: 11, padding: "12px 14px", border: "1px solid #fde047" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#92400e" }}>Batch details ({variantTotal}/{totalQty})</div>
          <div style={{ display: "flex", gap: 6 }}><button onClick={() => setVariantCount(Math.max(2, variants.length - 1))} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #fcd34d", background: "#fff", cursor: "pointer", fontWeight: 700 }}>−</button><button onClick={() => setVariantCount(variants.length + 1)} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #fcd34d", background: "#fff", cursor: "pointer", fontWeight: 700 }}>+</button></div></div>
        {variants.map((v, i) => <div key={i} style={{ background: "#fff", borderRadius: 9, padding: "10px 12px", marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 7 }}>Batch {i + 1}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
            <div><label style={{ ...LB, fontSize: 11 }}>Quantity</label><input type="number" value={v.qty} onChange={e => setVariants(p => p.map((x, k) => k === i ? { ...x, qty: e.target.value } : x))} style={{ ...IN, padding: "7px 10px", fontSize: 14 }} /></div>
            <div><label style={{ ...LB, fontSize: 11 }}>Batch / Lot</label><input value={v.batch} onChange={e => setVariants(p => p.map((x, k) => k === i ? { ...x, batch: e.target.value } : x))} style={{ ...IN, padding: "7px 10px", fontSize: 14 }} placeholder="Optional" /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={{ ...LB, fontSize: 11 }}>Expiry</label><input value={v.expiry} onChange={e => setVariants(p => p.map((x, k) => k === i ? { ...x, expiry: e.target.value } : x))} style={{ ...IN, padding: "7px 10px", fontSize: 14, borderColor: v.expiry && !expValid(v.expiry) ? "#f87171" : "#94a3b8" }} placeholder="MM/YYYY or DD/MM/YYYY" />
              {v.expiry && expValid(v.expiry) && <div style={{ fontSize: 10.5, color: "#16a34a", marginTop: 3 }}>✓ {fmtD(v.expiry)}</div>}</div></div></div>)}</div>}

      {/* Locations — capped at the quantity entered */}
      <div><label style={LB}>Locations <span style={{ color: "#ef4444" }}>*</span></label>
        {!d.invLocs.length ? <div style={{ background: "#fffbeb", border: "1px solid #fde047", borderRadius: 10, padding: "11px 13px", fontSize: 13, color: "#92400e" }}>No locations yet — add them in the <b>Locations</b> tab, then come back.</div> : <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: remaining === 0 && totalQty > 0 ? "#f0fdf4" : "#f8fafc", border: `1px solid ${remaining === 0 && totalQty > 0 ? "#bbf7d0" : "#e2e8f0"}`, borderRadius: 10, padding: "10px 13px", marginBottom: 9 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>{allocated} of {totalQty || 0} allocated</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: totalQty === 0 ? T_MUTED : remaining === 0 ? "#166534" : "#d97706" }}>{totalQty === 0 ? "Enter a quantity first" : remaining === 0 ? "✓ All placed" : `${remaining} left to place`}</div></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{d.invLocs.map(l => { const n = locQty[l] || 0; const canAdd = totalQty > 0 && remaining > 0; return (
            <div key={l} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${n ? "#1e3a8a" : "#e2e8f0"}`, background: n ? "#eff6ff" : "#fff", borderRadius: 11, padding: "9px 12px" }}>
              <div style={{ fontSize: 15, fontWeight: n ? 700 : 500, color: n ? "#1e3a8a" : "#1f2937" }}>📍 {l}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <button onClick={() => dropLoc(l)} disabled={!n} style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid #cbd5e1", background: "#fff", fontSize: 19, fontWeight: 700, cursor: n ? "pointer" : "default", opacity: n ? 1 : .35 }}>−</button>
                <div style={{ minWidth: 26, textAlign: "center", fontSize: 17, fontWeight: 700, color: n ? "#1e3a8a" : T_FAINT }}>{n}</div>
                <button onClick={() => bumpLoc(l)} disabled={!canAdd} style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid #cbd5e1", background: canAdd ? "#1e3a8a" : "#fff", color: canAdd ? "#fff" : T_FAINT, fontSize: 19, fontWeight: 700, cursor: canAdd ? "pointer" : "default", opacity: canAdd ? 1 : .4 }}>+</button>
              </div></div>); })}</div></>}</div>

      {/* Photo evidence */}
      <div><label style={LB}>Photos</label>
        <div style={{ fontSize: 13, color: T_MUTED, marginTop: -3, marginBottom: 9 }}>One shot showing the name, expiry, amount remaining and batch number is usually enough \u2014 add more only where something is unreadable or printed elsewhere on the pack. These are the evidence shown at audit.</div>
        <PhotoBlock shots={pics} busy={picBusy} onAdd={addPics} onDel={id => setPics(p => p.filter(s => s.id !== id))} />
        {pics.length > 0 && <div style={{ fontSize: 12, color: "#16a34a", marginTop: 7, fontWeight: 600 }}>{pics.length} photo{pics.length !== 1 ? "s" : ""} attached</div>}</div>

      <Btn t="Save Item" on={add} full />
    </div></Card>}

    <Card s={{ marginBottom: 10 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><span style={{ fontWeight: 700, fontSize: 14 }}>Show items stored in</span><div style={{ display: "flex", gap: 10 }}><button onClick={() => setSel([...d.invLocs])} style={{ background: "none", border: "none", color: "#1e3a8a", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>All</button><button onClick={() => setSel([])} style={{ background: "none", border: "none", color: T_MUTED, fontSize: 13, cursor: "pointer" }}>None</button></div></div>
      {!d.invLocs.length ? <div style={{ fontSize: 13, color: T_MUTED }}>No locations set up yet.</div> :
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{d.invLocs.map(l => { const on = sel.includes(l); const n = d.items.filter(i => i.locs.some(x => x.name === l)).length; return <button key={l} onClick={() => setSel(p => on ? p.filter(x => x !== l) : [...p, l])} style={{ padding: "7px 13px", borderRadius: 99, border: `1.5px solid ${on ? "#1e3a8a" : "#cbd5e1"}`, background: on ? "#1e3a8a" : "#fff", color: on ? "#fff" : "#334155", fontSize: 13.5, fontWeight: on ? 700 : 500, cursor: "pointer" }}>{on ? "✓ " : ""}{l} ({n})</button>; })}</div>}</Card>
    {usedCats.length > 1 && <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>{["All", ...usedCats].map(c => { const co = c === "All" ? { col: "#f3f4f6", fg: "#374151" } : catOf(c, cats); return <button key={c} onClick={() => setFilt(c)} style={{ padding: "5px 11px", borderRadius: 99, border: `1px solid ${filt === c ? co.fg : "#cbd5e1"}`, background: filt === c ? co.col : "#fff", color: filt === c ? co.fg : T_MUTED, fontSize: 12.5, fontWeight: filt === c ? 700 : 400, cursor: "pointer" }}>{c === "All" ? "All sections" : co.label}</button>; })}</div>}
    {xf && <Card s={{ marginBottom: 10, border: "2px solid #1e3a8a" }}><H2 t="Move Item" /><p style={{ fontSize: 13, margin: "0 0 11px" }}><b>{xf.name}</b> — currently in {catOf(xf.cat, cats).label}, at {xf.locs.map(l => l.name).join(", ")}</p>
      <label style={{ ...LB, fontSize: 13 }}>Move to location</label><select value={xt} onChange={e => setXt(e.target.value)} style={IN}><option value="">Leave where it is</option>{d.invLocs.map(l => <option key={l}>{l}</option>)}</select>
      <label style={{ ...LB, fontSize: 13, marginTop: 11 }}>Move to section</label><select value={xc} onChange={e => setXc(e.target.value)} style={IN}><option value="">Leave in {catOf(xf.cat, cats).label}</option>{cats.filter(c => c.k !== xf.cat).map(c => <option key={c.k} value={c.k}>{c.label}</option>)}</select>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}><Btn t="Move" on={move} sm /><Btn t="Cancel" on={() => { setXf(null); setXt(""); setXc(""); }} bg="#f3f4f6" fg="#374151" sm /></div></Card>}
    {!d.items.length && <Empty t="No items registered yet — tap + Add" />}
    {d.items.length > 0 && !sel.length && <Empty t="Choose one or more locations above to see your items" />}
    {sel.length > 0 && !Object.keys(grp).length && <Empty t="No items match your filters" />}
    {Object.entries(grp).map(([l, its]) => <div key={l} style={{ marginBottom: 17 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#1f2937", marginBottom: 7 }}>📍 {l} <span style={{ color: T_FAINT, fontWeight: 400 }}>({its.length})</span></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{its.map(i => { const a = alertOf(i.expiry); const co = catOf(i.cat, cats); const here = i.locs.find(x => x.name === l); const shots = ph[i.pg] || []; return <Card key={i.id + l} s={{ padding: "10px 13px", borderLeft: `3px solid ${a ? a.br : "#e5e7eb"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{i.name} {i.dose && <span style={{ color: T_MUTED, fontWeight: 500 }}>{i.dose}</span>}</div>
          <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap" }}><Tag t={co.label} bg={co.col} fg={co.fg} /><Tag t={`Exp: ${fmtD(i.expiry)}`} /><Tag t={`Qty here: ${here?.qty ?? i.qty}`} />{i.batch && <Tag t={`Batch: ${i.batch}`} />}{shots.length > 0 && <Tag t={`📷 ${shots.length}`} bg="#dcfce7" fg="#166534" />}</div>
          {i.locs.length > 1 && <div style={{ fontSize: 11, color: T_FAINT, marginTop: 3 }}>Also at: {i.locs.filter(x => x.name !== l).map(x => `${x.name} (${x.qty})`).join(", ")}</div>}
          {shots.length > 0 && <div style={{ display: "flex", gap: 5, marginTop: 7, overflowX: "auto" }}>{shots.slice(0, 6).map(s => <img key={s.id} src={s.data} alt="" style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 7, border: "1px solid #e2e8f0", flexShrink: 0 }} />)}</div>}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>{a && <Tag t={`⚠ ${a.label}`} bg={a.bg} fg={a.fg} />}
            <div style={{ display: "flex", gap: 5 }}><button onClick={() => { setXf(i); setXt(""); setXc(""); }} style={{ background: "#eff6ff", border: "none", borderRadius: 7, padding: "4px 9px", cursor: "pointer", color: "#1e3a8a", fontWeight: 700 }}>→</button><button onClick={() => del(i)} style={{ background: "#fee2e2", border: "none", borderRadius: 7, padding: "4px 8px", cursor: "pointer" }}>🗑</button></div></div></div></Card>; })}</div>
    </div>)}
  </div>);
}

/* Sections — add and remove your own categories */
function Sections({ d, up, say }) {
  const cats = catsOf(d);
  const [n, setN] = useState(""); const [cf, setCf] = useState(null);
  const count = k => d.items.filter(i => i.cat === k).length;
  const add = () => {
    const t = n.trim(); if (!t) return say("Enter a section name", "error");
    if (cats.some(c => c.k.toLowerCase() === t.toLowerCase() || c.label.toLowerCase() === t.toLowerCase())) return say("That section already exists", "error");
    const p = CAT_PALETTE[cats.length % CAT_PALETTE.length];
    up(x => ({ ...x, cats: [...catsOf(x), { k: t, label: t, col: p.col, fg: p.fg }] }));
    setN(""); say(`"${t}" added`);
  };
  const rm = k => { up(x => ({ ...x, cats: catsOf(x).filter(c => c.k !== k) })); setCf(null); say("Section removed"); };
  return (<div><H1 t="Sections" />
    <Card s={{ marginBottom: 13 }}><H2 t="Add Section" /><div style={{ display: "flex", gap: 8 }}><input value={n} onChange={e => setN(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} style={{ ...IN, flex: 1 }} placeholder="e.g. Strapping, Nutrition, GK Kit" /><Btn t="Add" on={add} sm /></div>
      <div style={{ fontSize: 13, color: T_MUTED, marginTop: 9 }}>Sections group your items on the dashboard, in the register and at audit. A section holding items can't be removed — move those items to another section first.</div></Card>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{cats.map(c => { const n2 = count(c.k); return <Card key={c.k} s={{ padding: "11px 14px", borderLeft: `4px solid ${c.fg}` }}>
      {cf === c.k ? <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 13, color: "#991b1b", fontWeight: 500 }}>Remove "{c.label}"?</span><div style={{ display: "flex", gap: 7 }}><Btn t="Remove" on={() => rm(c.k)} bg="#dc2626" sm /><Btn t="Cancel" on={() => setCf(null)} bg="#f3f4f6" fg="#374151" sm /></div></div>
        : <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><Tag t={c.label} bg={c.col} fg={c.fg} /><span style={{ fontSize: 12.5, color: T_MUTED, marginLeft: 9 }}>{n2} item{n2 !== 1 ? "s" : ""}</span></div>
          <button onClick={() => n2 ? say("Move its items to another section first", "warn") : setCf(c.k)} style={{ background: n2 ? "#f1f5f9" : "#fee2e2", border: "none", borderRadius: 7, padding: "6px 10px", cursor: "pointer", opacity: n2 ? .5 : 1 }}>🗑</button></div>}
    </Card>; })}</div>
  </div>);
}

function Expiry({ d }) {
  const list = d.items.map(i => ({ ...i, a: alertOf(i.expiry) })).filter(i => i.a).sort((x, y) => dLeft(x.expiry) - dLeft(y.expiry));
  return (<div><H1 t="Expiry Alerts" />
    <div style={{ display: "flex", gap: 7, marginBottom: 15, flexWrap: "wrap" }}>{LEVELS.map(l => <div key={l.label} style={{ background: l.bg, border: `1px solid ${l.br}`, color: l.fg, borderRadius: 9, padding: "6px 11px", fontSize: 12, fontWeight: 600 }}>{l.label}: {list.filter(i => i.a.label === l.label).length}</div>)}</div>
    {!list.length && <Empty t="No expiry alerts — all items within date" />}
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>{list.map(i => <Card key={i.id} s={{ borderLeft: `4px solid ${i.a.br}`, background: i.a.bg }}><div style={{ display: "flex", justifyContent: "space-between" }}><div><div style={{ fontWeight: 700, fontSize: 14 }}>{i.name} {i.dose}</div><div style={{ fontSize: 12, color: "#374151", marginTop: 3 }}>📍 {i.locs.map(l => `${l.name} (${l.qty})`).join(", ")} · Expires {fmtD(i.expiry)}</div><div style={{ fontSize: 11, color: T_MUTED }}>Batch: {i.batch || "—"}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: 22, fontWeight: 800, color: i.a.fg }}>{Math.abs(dLeft(i.expiry))}</div><div style={{ fontSize: 10, color: i.a.fg }}>{dLeft(i.expiry) < 0 ? "days ago" : dLeft(i.expiry) === 0 ? "today" : "days"}</div></div></div></Card>)}</div>
  </div>);
}

function Orders({ d, up, say }) {
  const [e, setE] = useState(""); const [n, setN] = useState("");
  const pend = d.orders.filter(o => !o.done);
  const exp = () => { const txt = ["ORDER", `Date: ${fmtDT(nowISO())}`, "", ...pend.map(o => `- ${o.name} (${o.loc}, expires ${fmtD(o.expiry)}, ${o.lvl} alert)`), "", `Total: ${pend.length}`].join("\n"); const a = document.createElement("a"); a.href = "data:text/plain;charset=utf-8," + encodeURIComponent(txt); a.download = "order.txt"; a.click(); say("Exported"); };
  const mail = () => { if (!e) return say("Enter supplier email", "error"); window.open(`mailto:${e}?subject=${encodeURIComponent("Equipment Order")}&body=${encodeURIComponent(`Dear ${n || "Supplier"},\n\n${pend.map(o => `- ${o.name} (${o.loc})`).join("\n")}\n\nKind regards`)}`); };
  return (<div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 13 }}><H1 t="Order List" /><span style={{ fontSize: 12, color: T_MUTED }}>{pend.length} pending</span></div>
    <Card s={{ marginBottom: 13 }}><H2 t="Supplier Details" /><div style={{ display: "flex", flexDirection: "column", gap: 10 }}><Field label="Supplier Name" value={n} onChange={ev => setN(ev.target.value)} placeholder="e.g. Alliance Healthcare" /><Field label="Supplier Email" type="email" value={e} onChange={ev => setE(ev.target.value)} placeholder="orders@supplier.com" /><div style={{ display: "flex", gap: 8 }}><Btn t="Export" on={exp} bg="#f3f4f6" fg="#374151" sm /><Btn t="📧 Send Email" on={mail} sm /></div></div></Card>
    {!d.orders.length && <Empty t="No items in order list — added automatically as items approach expiry" />}
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>{d.orders.map(o => <Card key={o.id} s={{ opacity: o.done ? .5 : 1, borderLeft: `3px solid ${o.done ? "#e5e7eb" : "#f59e0b"}` }}><div style={{ display: "flex", justifyContent: "space-between" }}><div><div style={{ fontWeight: 600, fontSize: 14 }}>{o.name}</div><div style={{ fontSize: 12, color: T_MUTED, marginTop: 2 }}>📍 {o.loc} · Exp {fmtD(o.expiry)}</div><div style={{ marginTop: 5 }}><Tag t={`${o.lvl} alert`} bg="#fef3c7" fg="#92400e" /></div></div><div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>{!o.done && <Btn t="✓ Done" on={() => up(x => ({ ...x, orders: x.orders.map(y => y.id === o.id ? { ...y, done: true } : y) }))} bg="#16a34a" sm />}<button onClick={() => { up(x => ({ ...x, orders: x.orders.filter(y => y.id !== o.id) })); say("Removed"); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>🗑</button></div></div></Card>)}</div>
  </div>);
}

function Hist({ d }) {
  const [sort, setSort] = useState("new"); const [sel, setSel] = useState([]); const [op, setOp] = useState(null);
  const locs = [...new Set(d.checks.map(c => c.loc))];
  let cs = [...d.checks]; if (sel.length) cs = cs.filter(c => sel.includes(c.loc));
  cs.sort((a, b) => sort === "new" ? new Date(b.at) - new Date(a.at) : sort === "old" ? new Date(a.at) - new Date(b.at) : sort === "name" ? a.by.localeCompare(b.by) : sort === "loc" ? a.loc.localeCompare(b.loc) : sort === "mm" ? (b.mm?.length || 0) - (a.mm?.length || 0) : b.n - a.n);
  const elTxt = el => el ? KINDS.filter(k => el[k.k]).map(k => k.label.split(" /")[0]).join(", ") : "";
  return (<div><H1 t="Audit History" />
    <Card s={{ marginBottom: 13 }}><label style={LB}>Sort by</label><select value={sort} onChange={e => setSort(e.target.value)} style={IN}><option value="new">Newest first</option><option value="old">Oldest first</option><option value="name">Staff name</option><option value="loc">Location</option><option value="items">Most items</option><option value="mm">Mismatches first</option></select>
      {locs.length > 0 && <div style={{ marginTop: 11 }}><label style={LB}>Filter by location</label><div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{locs.map(l => { const on = sel.includes(l); return <button key={l} onClick={() => setSel(p => on ? p.filter(x => x !== l) : [...p, l])} style={{ padding: "5px 11px", borderRadius: 99, border: `1px solid ${on ? "#1e3a8a" : "#cbd5e1"}`, background: on ? "#eff6ff" : "#fff", color: on ? "#1e3a8a" : T_MUTED, fontSize: 12, cursor: "pointer" }}>{l}</button>; })}</div></div>}</Card>
    {!cs.length && <Empty t="No completed audits yet" />}
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>{cs.map(c => <Card key={c.id}>
      <div onClick={() => setOp(op === c.id ? null : c.id)} style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }}><div><div style={{ fontWeight: 600, fontSize: 14 }}>{c.loc}</div><div style={{ fontSize: 12, color: T_MUTED, marginTop: 2 }}>{fmtDT(c.at)} · {c.by}</div>{c.mm?.length > 0 && <div style={{ fontSize: 11, color: "#d97706", fontWeight: 600, marginTop: 2 }}>⚠ {c.mm.length} mismatch{c.mm.length !== 1 ? "es" : ""}</div>}</div><div style={{ textAlign: "right" }}><Tag t={`${c.n} items`} bg="#dbeafe" fg="#1e40af" /><div style={{ fontSize: 10, color: T_FAINT, marginTop: 4 }}>{op === c.id ? "▲" : "▼"}</div></div></div>
      {op === c.id && <div style={{ marginTop: 12, borderTop: "1px solid #f3f4f6", paddingTop: 11 }}>{c.mm?.length > 0 && <div style={{ background: "#fffbeb", border: "1px solid #fde047", borderRadius: 8, padding: "8px 11px", marginBottom: 9 }}>{c.mm.map((m, i) => <div key={i} style={{ fontSize: 12, color: "#78350f" }}>• {m.name} — expected {m.exp}, counted {m.act} ({m.act - m.exp > 0 ? "+" : ""}{m.act - m.exp})</div>)}</div>}
        {c.items.map((i, k) => <div key={k} style={{ padding: "7px 0", borderBottom: "1px solid #f9fafb", fontSize: 12 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span>{i.name} {i.dose} <span style={{ color: T_FAINT }}>· Counted: {i.entered}{i.used != null && i.used !== 0 ? ` · ${i.used > 0 ? i.used + " used" : -i.used + " added"}` : ""}</span></span><span style={{ color: T_MUTED }}>{fmtD(i.expiry)}</span></div>{i.el && <div style={{ fontSize: 10.5, color: "#166534", marginTop: 2 }}>✓ Verified: {elTxt(i.el)}</div>}</div>)}</div>}
    </Card>)}</div>
  </div>);
}

function Locs({ d, up, say }) {
  const [n, setN] = useState(""); const [ed, setEd] = useState(null); const [ev, setEv] = useState(""); const [cf, setCf] = useState(null);
  const add = () => { if (!n.trim()) return say("Enter a name", "error"); if (d.invLocs.some(l => l.toLowerCase() === n.trim().toLowerCase())) return say("Already exists", "error"); up(x => ({ ...x, invLocs: [...x.invLocs, n.trim()] })); setN(""); say("Location added"); };
  const sv = () => { if (!ev.trim()) return say("Cannot be empty", "error"); const old = d.invLocs[ed]; up(x => ({ ...x, invLocs: x.invLocs.map((l, i) => i === ed ? ev.trim() : l), items: x.items.map(i => ({ ...i, locs: i.locs.map(l => l.name === old ? { ...l, name: ev.trim() } : l) })) })); setEd(null); say("Updated"); };
  const rm = l => { up(x => ({ ...x, invLocs: x.invLocs.filter(y => y !== l), items: x.items.map(i => ({ ...i, locs: i.locs.filter(y => y.name !== l) })).filter(i => i.locs.length) })); setCf(null); say("Removed"); };
  return (<div><H1 t="Locations" />
    <Card s={{ marginBottom: 13 }}><H2 t="Add Location" /><div style={{ display: "flex", gap: 8 }}><input value={n} onChange={e => setN(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} style={{ ...IN, flex: 1 }} placeholder="e.g. Treatment room cabinet" /><Btn t="Add" on={add} sm /></div>
      <div style={{ fontSize: 13, color: T_MUTED, marginTop: 9 }}>These are the places you actually keep stock. Nothing is pre-set — add your own.</div></Card>
    {!d.invLocs.length && <Empty t="No locations yet — add your first above" />}
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{d.invLocs.map((l, i) => <Card key={l} s={{ padding: "11px 14px" }}>
      {ed === i ? <div style={{ display: "flex", gap: 7 }}><input value={ev} onChange={e => setEv(e.target.value)} style={{ ...IN, flex: 1 }} autoFocus /><Btn t="✓" on={sv} sm /><Btn t="✕" on={() => setEd(null)} bg="#f3f4f6" fg="#374151" sm /></div>
        : cf === l ? <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 13, color: "#991b1b", fontWeight: 500 }}>Remove "{l}"?</span><div style={{ display: "flex", gap: 7 }}><Btn t="Remove" on={() => rm(l)} bg="#dc2626" sm /><Btn t="Cancel" on={() => setCf(null)} bg="#f3f4f6" fg="#374151" sm /></div></div>
          : <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ fontSize: 14.5 }}>📍 <b style={{ fontWeight: 600 }}>{l}</b> <span style={{ fontSize: 12, color: T_FAINT }}>({d.items.filter(x => x.locs.some(y => y.name === l)).length})</span></div><div style={{ display: "flex", gap: 6 }}><button onClick={() => { setEd(i); setEv(l); }} style={{ background: "#f3f4f6", border: "none", borderRadius: 7, padding: "5px 9px", cursor: "pointer" }}>✏️</button><button onClick={() => setCf(l)} style={{ background: "#fee2e2", border: "none", borderRadius: 7, padding: "5px 9px", cursor: "pointer" }}>🗑</button></div></div>}
    </Card>)}</div>
  </div>);
}

/* ── ADMIN MODULE ─────────────────────────────────────────── */
function Approvals({ d, up, user, say, rec }) {
  const isAdmin = user.role === "super_admin";
  const queue = d.pending.filter(p => isAdmin || p.teams.some(t => user.teams.includes(t)));
  const [edits, setEdits] = useState({});
  const setRole = (id, r) => setEdits(p => ({ ...p, [id]: { ...p[id], role: r } }));
  const togTeam = (id, t, cur) => setEdits(p => { const l = p[id]?.teams ?? cur; return { ...p, [id]: { ...p[id], teams: l.includes(t) ? l.filter(x => x !== t) : [...l, t] } }; });
  const approve = u => {
    const role = edits[u.id]?.role ?? u.requestedRole; const teams = edits[u.id]?.teams ?? u.teams;
    if (role === "super_admin" && !isAdmin) return say("Only a Super Admin can grant Super Admin", "error");
    if (!teams.length) return say("You must assign at least one team", "error");
    up(x => rec({ ...x, pending: x.pending.filter(p => p.id !== u.id), users: [...x.users, { ...u, role, teams, approvedBy: user.name, approvedAt: nowISO() }] }, "USER_APPROVED", `${user.name} approved ${u.name} as ${ROLES[role]} for ${teams.join(", ")}`, "-"));
    say(`${u.name} approved for ${teams.length} team${teams.length !== 1 ? "s" : ""}`);
  };
  const reject = u => { up(x => rec({ ...x, pending: x.pending.filter(p => p.id !== u.id) }, "USER_REJECTED", `${user.name} rejected ${u.name}`, "-")); say("Registration rejected"); };
  return (<div><H1 t="Pending Approvals" />
    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "11px 14px", fontSize: 12, color: "#1e40af", marginBottom: 15 }}>{isAdmin ? "Assign each user to one or more teams. They only see data for teams you grant." : "You can approve staff for your own teams only."}</div>
    {!queue.length && <Empty t="No registrations awaiting approval" />}
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>{queue.map(u => {
      const role = edits[u.id]?.role ?? u.requestedRole; const teams = edits[u.id]?.teams ?? u.teams;
      return (<Card key={u.id} s={{ borderLeft: "3px solid #f59e0b" }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{u.name}</div><div style={{ fontSize: 12, color: T_MUTED, marginTop: 2 }}>{u.email}</div>
        <div style={{ display: "flex", gap: 5, marginTop: 7, flexWrap: "wrap" }}><Tag t="✓ Email verified" bg="#dcfce7" fg="#166534" /><Tag t={`Requested: ${ROLES[u.requestedRole]}`} /></div>
        <div style={{ marginTop: 12, background: "#f8fafc", borderRadius: 10, padding: "11px 13px" }}>
          <label style={{ ...LB, fontSize: 12 }}>Assign role</label>
          <select value={role} onChange={e => setRole(u.id, e.target.value)} style={{ ...IN, fontSize: 14 }}>
            <option value="sports_therapist">Sports Therapist</option><option value="physiotherapist">Physiotherapist</option>
            <option value="doctor" disabled={!isAdmin}>Doctor{!isAdmin ? " (Super Admin only)" : ""}</option>
            <option value="super_admin" disabled={!isAdmin}>Super Admin{!isAdmin ? " (Super Admin only)" : ""}</option></select>
          <label style={{ ...LB, fontSize: 12, marginTop: 10 }}>Grant team access <span style={{ color: "#ef4444" }}>*</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{TEAMS.filter(t => isAdmin || user.teams.includes(t)).map(t => { const on = teams.includes(t); return <button key={t} onClick={() => togTeam(u.id, t, u.teams)} style={{ padding: "6px 11px", borderRadius: 99, border: `1px solid ${on ? "#1e3a8a" : "#e5e7eb"}`, background: on ? "#eff6ff" : "#fff", color: on ? "#1e3a8a" : T_MUTED, fontSize: 11.5, fontWeight: on ? 600 : 400, cursor: "pointer" }}>{on ? "✓ " : ""}{t}</button>; })}</div>
          {!teams.length && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 6 }}>⚠ At least one team must be granted</div>}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}><Btn t="✓ Approve" on={() => approve(u)} bg="#16a34a" sm dis={!teams.length} /><Btn t="✕ Reject" on={() => reject(u)} bg="#dc2626" sm /></div>
      </Card>); })}</div>
  </div>);
}

function TeamMgmt({ d, up, user, say, rec }) {
  const isAdmin = user.role === "super_admin";
  const list = d.users.filter(u => isAdmin || u.teams.some(t => user.teams.includes(t)));
  const [ed, setEd] = useState(null);
  const revoke = u => { if (u.id === user.id) return say("You cannot remove your own account", "error"); up(x => rec({ ...x, users: x.users.filter(y => y.id !== u.id) }, "USER_REVOKED", `${user.name} revoked ${u.name}`, "-")); say("Access revoked"); };
  const setTeams = (u, t) => { const nt = u.teams.includes(t) ? u.teams.filter(x => x !== t) : [...u.teams, t]; if (!nt.length) return say("User must have at least one team", "error"); up(x => rec({ ...x, users: x.users.map(y => y.id === u.id ? { ...y, teams: nt } : y) }, "TEAMS_CHANGED", `${user.name} set ${u.name} teams to ${nt.join(", ")}`, "-")); };
  const setRole = (u, r) => { if (!isAdmin) return say("Super Admin only", "error"); up(x => rec({ ...x, users: x.users.map(y => y.id === u.id ? { ...y, role: r } : y) }, "ROLE_CHANGED", `${user.name} changed ${u.name} to ${ROLES[r]}`, "-")); say(`${u.name} is now ${ROLES[r]}`); };
  return (<div><H1 t="Team Members" /><div style={{ fontSize: 12, color: T_MUTED, marginBottom: 14 }}>{list.length} active account{list.length !== 1 ? "s" : ""}</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>{list.map(u => (<Card key={u.id}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{u.name} {u.id === user.id && <span style={{ fontSize: 11, color: T_FAINT, fontWeight: 400 }}>(you)</span>}</div>
          <div style={{ fontSize: 12, color: T_MUTED, marginTop: 2 }}>{u.email}</div>
          <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}><Tag t={ROLES[u.role]} bg={u.role === "super_admin" ? "#ede9fe" : u.role === "doctor" ? "#dbeafe" : "#f3f4f6"} fg={ROLE_COL[u.role]} />{u.teams.map(t => <Tag key={t} t={t} />)}</div></div>
        {isAdmin && u.id !== user.id && <button onClick={() => setEd(ed === u.id ? null : u.id)} style={{ background: "#f3f4f6", border: "none", borderRadius: 7, padding: "5px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>{ed === u.id ? "Close" : "Manage"}</button>}
      </div>
      {ed === u.id && <div style={{ marginTop: 12, borderTop: "1px solid #f3f4f6", paddingTop: 11 }}>
        <label style={{ ...LB, fontSize: 12 }}>Role</label><select value={u.role} onChange={e => setRole(u, e.target.value)} style={{ ...IN, fontSize: 14 }}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <label style={{ ...LB, fontSize: 12, marginTop: 10 }}>Team access</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{TEAMS.map(t => { const on = u.teams.includes(t); return <button key={t} onClick={() => setTeams(u, t)} style={{ padding: "6px 11px", borderRadius: 99, border: `1px solid ${on ? "#1e3a8a" : "#e5e7eb"}`, background: on ? "#eff6ff" : "#fff", color: on ? "#1e3a8a" : T_MUTED, fontSize: 11.5, fontWeight: on ? 600 : 400, cursor: "pointer" }}>{on ? "✓ " : ""}{t}</button>; })}</div>
        <div style={{ marginTop: 11 }}><Btn t="Revoke Access" on={() => revoke(u)} bg="#dc2626" sm /></div></div>}
    </Card>))}</div>
  </div>);
}

function Branding({ d, up, user, say, ph, setPh }) {
  const fr = useRef(); const [name, setName] = useState(d.clubName);
  if (user.role !== "super_admin") return <Empty t="Super Admin access required" />;
  const medOn = !!d.modules?.med;
  const photoCount = Object.values(ph).reduce((s, a) => s + a.length, 0);
  const upload = async e => { const f = e.target.files[0]; if (!f) return; try { const url = await toDataURL(f); up(x => ({ ...x, logo: url })); say("Logo updated"); } catch { say("Upload failed", "error"); } e.target.value = ""; };
  return (<div><H1 t="Club Branding" />
    <Card s={{ marginBottom: 13, borderLeft: `4px solid ${medOn ? "#16a34a" : "#94a3b8"}` }}><H2 t="Modules" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div><div style={{ fontSize: 15, fontWeight: 600 }}>💊 Medication module</div><div style={{ fontSize: 13, color: T_MUTED, marginTop: 3 }}>Dispensing, pill counts, requests and pharmacist orders. Hidden for everyone while it's off — your data is kept.</div></div>
        <Btn t={medOn ? "On" : "Off"} on={() => { up(x => ({ ...x, modules: { ...(x.modules || {}), med: !medOn } })); say(medOn ? "Medication module hidden" : "Medication module enabled"); }} bg={medOn ? "#16a34a" : "#94a3b8"} sm /></div></Card>
    <Card s={{ marginBottom: 13 }}><H2 t="Club Logo" />
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
        <Logo d={d} size={70} />
        <div style={{ flex: 1 }}><input type="file" accept="image/*" ref={fr} onChange={upload} style={{ display: "none" }} /><Btn t="Upload Logo" on={() => fr.current.click()} sm />
          {d.logo?.startsWith?.("data:") && <div style={{ marginTop: 7 }}><button onClick={() => { up(x => ({ ...x, logo: "⚽" })); say("Logo reset"); }} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 12, cursor: "pointer" }}>Remove logo</button></div>}</div></div>
      <label style={LB}>Or choose an icon</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{["⚽", "🦅", "🏥", "💊", "🩺", "🏉", "🏀", "⚕️"].map(x => <button key={x} onClick={() => { up(y => ({ ...y, logo: x })); say("Icon set"); }} style={{ width: 42, height: 42, fontSize: 21, borderRadius: 11, border: `2px solid ${d.logo === x ? "#1e3a8a" : "#e5e7eb"}`, background: d.logo === x ? "#eff6ff" : "#fff", cursor: "pointer" }}>{x}</button>)}</div></Card>
    <Card s={{ marginBottom: 13 }}><H2 t="Club Name" /><div style={{ display: "flex", gap: 8 }}><input value={name} onChange={e => setName(e.target.value)} style={{ ...IN, flex: 1 }} placeholder="Crystal Palace FC" /><Btn t="Save" on={() => { up(x => ({ ...x, clubName: name })); say("Club name updated"); }} sm /></div></Card>
    <Card><H2 t="Item Photos" /><p style={{ fontSize: 13, color: T_MUTED, margin: "0 0 11px" }}>{photoCount} photo{photoCount !== 1 ? "s" : ""} stored on this device. Photos are the largest thing the app keeps — clear them if storage fills up. Item records are not affected.</p>
      <Btn t="Delete all item photos" on={() => { if (!photoCount) return say("No photos stored", "warn"); setPh({}); say("All item photos deleted"); }} bg="#fee2e2" fg="#991b1b" sm /></Card>
  </div>);
}

const dl = (rows, filename) => { const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(rows.map(r => r.join(",")).join("\n")); a.download = filename; a.click(); };

function Backup({ d, up, user, say }) {
  const cats = catsOf(d);
  const sync = d.sync || { url: "", enabled: false, lastAt: null, lastCount: 0 };
  const [url, setUrl] = useState(sync.url); const [testing, setTesting] = useState(false);
  const [pushing, setPushing] = useState(false); const [guide, setGuide] = useState(false);
  const isAdmin = user.role === "super_admin";
  const setSync = patch => up(x => ({ ...x, sync: { ...(x.sync || sync), ...patch } }));
  const post = async (rows, type) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "SportsStockApp", club: d.clubName, type, sentAt: nowISO(), sentBy: user.name, rowCount: rows.length, rows }) });
    if (!res.ok) throw new Error("HTTP " + res.status); return true;
  };
  const test = async () => {
    if (!url.trim()) return say("Paste your Power Automate URL first", "error");
    setTesting(true);
    try { await post([{ ts: nowISO(), user: user.name, role: ROLES[user.role], team: "-", action: "CONNECTION_TEST", detail: "Test row from Sports Stock App" }], "test"); setSync({ url: url.trim(), enabled: true, lastAt: nowISO() }); say("✓ Connected — test row sent"); }
    catch { setSync({ url: url.trim() }); say("Connection failed — check the URL and flow", "error"); }
    finally { setTesting(false); }
  };
  const pushLedger = async () => {
    if (!sync.enabled) return say("Connect SharePoint first", "error");
    if (!d.ledger.length) return say("Nothing to sync yet", "warn");
    setPushing(true);
    try { await post(d.ledger.map(l => ({ ts: l.ts, user: l.user, role: l.role, team: l.team, action: l.action, detail: l.detail })), "ledger"); setSync({ lastAt: nowISO(), lastCount: d.ledger.length }); say(`${d.ledger.length} ledger rows sent`); }
    catch { say("Sync failed", "error"); } finally { setPushing(false); }
  };
  const pushSnapshot = async () => {
    if (!sync.enabled) return say("Connect SharePoint first", "error");
    setPushing(true);
    const rows = [...d.meds.map(m => ({ type: "Medication", name: m.name, dose: m.dose || "", category: "Medications", locations: m.loc, qty: m.qty, expiry: m.expiry, batch: "", team: m.team })), ...d.items.map(i => ({ type: "Inventory", name: i.name, dose: i.dose || "", category: catOf(i.cat, cats).label, locations: i.locs.map(l => `${l.name} (${l.qty})`).join("; "), qty: i.qty, expiry: i.expiry, batch: i.batch || "", team: "-" }))];
    try { await post(rows, "snapshot"); setSync({ lastAt: nowISO() }); say(`${rows.length} stock rows sent`); }
    catch { say("Sync failed", "error"); } finally { setPushing(false); }
  };
  const csv = () => { const rows = [["Timestamp", "User", "Role", "Team", "Action", "Detail"]]; d.ledger.forEach(l => rows.push([l.ts, l.user, l.role, l.team, l.action, `"${(l.detail || "").replace(/"/g, "'")}"`])); dl(rows, `Ledger-${new Date().toISOString().split("T")[0]}.csv`); say("Ledger exported"); };
  const snap = () => { const rows = [["Type", "Name", "Dose", "Section", "Locations", "Qty", "Expiry", "Batch"]]; d.meds.forEach(m => rows.push(["Medication", m.name, m.dose || "", "Medications", m.loc, m.qty, m.expiry, ""])); d.items.forEach(i => rows.push(["Inventory", i.name, i.dose || "", catOf(i.cat, cats).label, `"${i.locs.map(l => `${l.name} (${l.qty})`).join(", ")}"`, i.qty, i.expiry, i.batch || ""])); dl(rows, `Snapshot-${new Date().toISOString().split("T")[0]}.csv`); say("Snapshot exported"); };
  const unsynced = d.ledger.length - (sync.lastCount || 0);
  const recent = [...d.ledger].reverse().slice(0, 15);

  return (<div><H1 t="Backup & SharePoint Sync" />
    <Card s={{ marginBottom: 13, borderLeft: `4px solid ${sync.enabled ? "#16a34a" : "#94a3b8"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><H2 t="SharePoint Sync" /><Tag t={sync.enabled ? "● Connected" : "○ Not connected"} bg={sync.enabled ? "#dcfce7" : "#f3f4f6"} fg={sync.enabled ? "#166534" : "#374151"} /></div>
      {!isAdmin ? <p style={{ fontSize: 13, color: T_MUTED, margin: 0 }}>Only a Super Admin can configure SharePoint sync.</p> : <>
        <p style={{ fontSize: 13, color: T_MUTED, margin: "0 0 12px", lineHeight: 1.5 }}>Connect a Power Automate flow so every change is written to an Excel file in the club's SharePoint.</p>
        <label style={LB}>Power Automate HTTP URL</label>
        <input value={url} onChange={e => setUrl(e.target.value)} style={{ ...IN, fontSize: 13, fontFamily: "monospace" }} placeholder="https://prod-00.uksouth.logic.azure.com/workflows/..." />
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}><Btn t={testing ? "⏳ Testing…" : "🔗 Test & Connect"} on={test} dis={testing} sm />{sync.enabled && <Btn t="Disconnect" on={() => { setSync({ enabled: false }); say("Disconnected"); }} bg="#f3f4f6" fg="#374151" sm />}</div>
        {sync.enabled && <><div style={{ marginTop: 13, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "11px 13px" }}>
          <div style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>Last sync: {sync.lastAt ? fmtDT(sync.lastAt) : "never"}</div>
          {unsynced > 0 && <div style={{ fontSize: 12, color: "#92400e", marginTop: 3 }}>⚠ {unsynced} new entr{unsynced === 1 ? "y" : "ies"} not yet synced</div>}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 11, flexWrap: "wrap" }}><Btn t={pushing ? "⏳ Sending…" : "⬆ Sync Ledger"} on={pushLedger} dis={pushing} bg="#16a34a" sm /><Btn t="⬆ Sync Stock Snapshot" on={pushSnapshot} dis={pushing} bg="#0369a1" sm /></div></>}
        <button onClick={() => setGuide(!guide)} style={{ background: "none", border: "none", color: "#1e3a8a", fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginTop: 12, padding: 0 }}>{guide ? "▲ Hide setup instructions" : "▼ How do I set this up? (send to IT)"}</button>
        {guide && <div style={{ marginTop: 11, background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 11, padding: "14px 16px", fontSize: 12.5, color: "#374151", lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, marginBottom: 9, fontSize: 13 }}>Setup — approx. 15 minutes</div>
          {[["1", "Create the Excel file", "In SharePoint create SportsStock-Backup.xlsx with two sheets: Ledger and Snapshot. Ledger headers: Timestamp, User, Role, Team, Action, Detail. Snapshot headers: Type, Name, Dose, Section, Locations, Qty, Expiry, Batch. Format each as a Table named LedgerTable and SnapshotTable."],
          ["2", "Create the flow", "make.powerautomate.com → Create → Instant cloud flow → trigger 'When an HTTP request is received'."],
          ["3", "Set the request schema", "Paste the sample JSON below into 'Use sample payload to generate schema'."],
          ["4", "Add the Excel action", "Add 'Apply to each' over rows, and inside it 'Add a row into a table' (Excel Online Business). Point at the workbook and LedgerTable, then map each field."],
          ["5", "Save and copy the URL", "Saving generates the HTTP POST URL. Paste it above and press Test & Connect."]].map(([n, t, b]) => (
            <div key={n} style={{ display: "flex", gap: 10, marginBottom: 11 }}>
              <div style={{ width: 21, height: 21, borderRadius: 99, background: "#1e3a8a", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{n}</div>
              <div><div style={{ fontWeight: 600 }}>{t}</div><div style={{ color: T_MUTED, marginTop: 2 }}>{b}</div></div></div>))}
          <div style={{ fontWeight: 700, marginTop: 13, marginBottom: 6, fontSize: 12.5 }}>Sample payload for step 3</div>
          <pre style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", fontSize: 10.5, overflowX: "auto", margin: 0, fontFamily: "monospace", lineHeight: 1.5 }}>{`{
  "source": "SportsStockApp",
  "club": "Crystal Palace FC",
  "type": "ledger",
  "sentAt": "2026-01-01T12:00:00Z",
  "sentBy": "Dr Smith",
  "rowCount": 1,
  "rows": [{
    "ts": "2026-01-01T12:00:00Z",
    "user": "Dr Smith",
    "role": "Doctor",
    "team": "Women's First Team",
    "action": "ADD_ITEM",
    "detail": "Added Tubigrip size D"
  }]
}`}</pre>
          <div style={{ marginTop: 12, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 9, padding: "10px 12px", color: "#1e40af" }}><b>Tip for IT:</b> branch on <code>type</code> — route <code>ledger</code> to LedgerTable (append only) and <code>snapshot</code> to SnapshotTable (clear then append).</div>
        </div>}</>}
    </Card>
    <Card s={{ marginBottom: 13 }}><H2 t="Manual Export" /><p style={{ fontSize: 13, color: T_MUTED, margin: "0 0 12px" }}>Download an offline copy at any time.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Btn t="📊 Full Ledger" on={csv} bg="#f3f4f6" fg="#374151" sm /><Btn t="📦 Stock Snapshot" on={snap} bg="#f3f4f6" fg="#374151" sm /></div>
      <div style={{ fontSize: 12, color: T_MUTED, marginTop: 10 }}>Note: item photos are not included in CSV exports — they stay on this device until you move to a hosted database.</div></Card>
    <Card><H2 t={`Recent Activity (${d.ledger.length} entries)`} />{!recent.length && <Empty t="No activity yet" />}
      {recent.map(l => <div key={l.id} style={{ padding: "9px 0", borderBottom: "1px solid #f3f4f6" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><div style={{ flex: 1 }}><Tag t={l.action} /><div style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>{l.detail}</div><div style={{ fontSize: 10.5, color: T_FAINT, marginTop: 2 }}>{l.user} · {l.role}</div></div><div style={{ fontSize: 10, color: T_FAINT, whiteSpace: "nowrap" }}>{fmtDT(l.ts)}</div></div></div>)}</Card>
  </div>);
}

/* ============================================================
   AI SETUP (optional)
   ------------------------------------------------------------
   The three AI features — section suggestion, BNF dose lookup and
   photo pill counting — need a server endpoint that holds your
   Anthropic API key. Never put the key in this file.

   On Vercel, create /api/ai.js:

     export default async function handler(req, res) {
       const r = await fetch("https://api.anthropic.com/v1/messages", {
         method: "POST",
         headers: {
           "Content-Type": "application/json",
           "x-api-key": process.env.ANTHROPIC_API_KEY,
           "anthropic-version": "2023-06-01"
         },
         body: JSON.stringify(req.body)
       });
       res.status(r.status).json(await r.json());
     }

   Then in Vercel → Settings → Environment Variables add
   ANTHROPIC_API_KEY, and set AI_ENDPOINT = "/api/ai" at the top
   of this file. Without it the app works fine — those three
   features simply fall back to manual entry.
   ============================================================ */
