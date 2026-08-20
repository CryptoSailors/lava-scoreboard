/**
 * Design tokens and the shared page shell.
 *
 * Two layers, and the rule that keeps them honest: components may only ever
 * reference the semantic names (--surface, --text, --accent-solid …). Nothing
 * outside this file may reference a primitive (--n-6, --a-9) or write a raw
 * colour. That is what makes the dark theme a re-pointing of primitives rather
 * than a second stylesheet to keep in sync.
 *
 * Contrast: every pair below was computed against WCAG 2.1 relative luminance,
 * not eyeballed. --border and --border-subtle sit under 3:1 deliberately — SC
 * 1.4.11 governs interactive boundaries, not decorative table rules, and
 * --border-strong exists for anything focusable.
 */

export const CSS = `
:root{
  color-scheme:light dark;

  --n-1:#fcfdfe; --n-2:#f5f8fa; --n-3:#ecf0f3; --n-4:#e3e9ed;
  --n-5:#dae0e5; --n-6:#cfd7dc; --n-7:#bec7cd; --n-8:#9fa9b1;
  --n-9:#76828b; --n-10:#67737c; --n-11:#505b63; --n-12:#0f1a21;
  --a-2:#eff9fe; --a-3:#dff2fc; --a-4:#ceeaf9; --a-6:#aad5eb; --a-7:#88c0dc;
  --a-8:#63a9c9; --a-9:#147396; --a-10:#0f6684; --a-11:#0d5570; --a-12:#062f42;
  --pos-3:#e4f6ea; --pos-6:#a9dcbc; --pos-9:#2e8a53; --pos-11:#1c6b3d;
  --warn-3:#feefdb; --warn-6:#f7d19c; --warn-9:#e09b23; --warn-11:#7d460b;
  --crit-3:#ffebe9; --crit-6:#f7c7c2; --crit-9:#c13234; --crit-11:#a01e23;
  --on-solid:#ffffff; --on-warn-solid:#0f1a21;

  --surface:var(--n-1); --surface-raised:var(--n-2); --surface-subtle:var(--n-3);
  --surface-hover:var(--n-3); --surface-active:var(--n-4); --surface-overlay:var(--n-1);
  --border-subtle:var(--n-5); --border:var(--n-6); --border-strong:var(--n-9);
  --text:var(--n-12); --text-muted:var(--n-11); --text-faint:var(--n-10);
  --text-on-solid:var(--on-solid);

  --accent-bg:var(--a-3); --accent-border:var(--a-7);
  --accent-solid:var(--a-9); --accent-hover:var(--a-10); --accent-text:var(--a-11);
  --pos-bg:var(--pos-3); --pos-border:var(--pos-6); --pos-solid:var(--pos-9); --pos-text:var(--pos-11);
  --warn-bg:var(--warn-3); --warn-border:var(--warn-6); --warn-solid:var(--warn-9); --warn-text:var(--warn-11);
  --crit-bg:var(--crit-3); --crit-border:var(--crit-6); --crit-solid:var(--crit-9); --crit-text:var(--crit-11);
  --neutral-bg:var(--n-3); --neutral-border:var(--n-6); --neutral-text:var(--n-11);
  --focus-ring:var(--a-9);

  --seg-track:var(--n-4);
  --seg-base:var(--n-7); --seg-uptime:var(--a-6); --seg-gov:var(--a-8);
  --seg-blk:var(--a-10); --seg-pen:var(--crit-9);

  --font-ui:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue","Noto Sans",Arial,sans-serif;
  --font-mono:ui-monospace,"SFMono-Regular","SF Mono","Cascadia Mono","Roboto Mono",Menlo,Consolas,monospace;
  --fs-50:11px;  --lh-50:16px;
  --fs-100:12px; --lh-100:16px;
  --fs-200:13px; --lh-200:20px;
  --fs-300:14px; --lh-300:20px;
  --fs-400:16px; --lh-400:24px;
  --fs-500:18px; --lh-500:28px;
  --fs-600:22px; --lh-600:28px;
  --fs-700:28px; --lh-700:36px;
  --fs-800:34px; --lh-800:40px;
  --fw-medium:500; --fw-semibold:600;
  --tracking-tight:-0.011em; --tracking-caps:0.06em;

  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:24px; --sp-6:32px; --sp-8:48px;
  --radius-sm:4px; --radius:8px; --radius-lg:12px; --radius-pill:999px;
  --topbar-h:52px; --row-h:44px; --page-max:1360px;
  --shadow-overlay:0 4px 8px -4px rgb(15 26 33/.14),0 12px 28px -8px rgb(15 26 33/.18),0 0 0 1px rgb(15 26 33/.06);
}

@media (prefers-color-scheme:dark){ :root:not([data-theme="light"]){
  --n-1:#0b1014; --n-2:#11171c; --n-3:#1a2026; --n-4:#22292f;
  --n-5:#2a3138; --n-6:#343c42; --n-7:#404950; --n-8:#555f67;
  --n-9:#77828c; --n-10:#86919a; --n-11:#aab2ba; --n-12:#f0f3f5;
  --a-2:#0d1a20; --a-3:#0c2834; --a-4:#0d3242; --a-6:#14485e; --a-7:#1b607c;
  --a-8:#23789b; --a-9:#2792bc; --a-10:#48a4cd; --a-11:#75caf2; --a-12:#cbeafb;
  --pos-3:#102a1a; --pos-6:#1f4d32; --pos-9:#3ca368; --pos-11:#80dba2;
  --warn-3:#2f210c; --warn-6:#563d16; --warn-9:#f5ae39; --warn-11:#fec766;
  --crit-3:#371b19; --crit-6:#62322f; --crit-9:#dc5e59; --crit-11:#ff958d;
  --on-solid:#0b1014;
  --surface-raised:var(--n-3); --surface-overlay:var(--n-4); --border-subtle:var(--n-4);
  --seg-base:var(--n-7); --seg-uptime:var(--a-7); --seg-gov:var(--a-9); --seg-blk:var(--a-11);
  --shadow-overlay:0 16px 32px -12px rgb(0 0 0/.6),0 0 0 1px rgb(255 255 255/.07);
}}
:root[data-theme="dark"]{
  --n-1:#0b1014; --n-2:#11171c; --n-3:#1a2026; --n-4:#22292f;
  --n-5:#2a3138; --n-6:#343c42; --n-7:#404950; --n-8:#555f67;
  --n-9:#77828c; --n-10:#86919a; --n-11:#aab2ba; --n-12:#f0f3f5;
  --a-2:#0d1a20; --a-3:#0c2834; --a-4:#0d3242; --a-6:#14485e; --a-7:#1b607c;
  --a-8:#23789b; --a-9:#2792bc; --a-10:#48a4cd; --a-11:#75caf2; --a-12:#cbeafb;
  --pos-3:#102a1a; --pos-6:#1f4d32; --pos-9:#3ca368; --pos-11:#80dba2;
  --warn-3:#2f210c; --warn-6:#563d16; --warn-9:#f5ae39; --warn-11:#fec766;
  --crit-3:#371b19; --crit-6:#62322f; --crit-9:#dc5e59; --crit-11:#ff958d;
  --on-solid:#0b1014;
  --surface-raised:var(--n-3); --surface-overlay:var(--n-4); --border-subtle:var(--n-4);
  --seg-base:var(--n-7); --seg-uptime:var(--a-7); --seg-gov:var(--a-9); --seg-blk:var(--a-11);
  --shadow-overlay:0 16px 32px -12px rgb(0 0 0/.6),0 0 0 1px rgb(255 255 255/.07);
}
:root[data-theme="light"]{ color-scheme:light; }

*,*::before,*::after{ box-sizing:border-box; }
html{ -webkit-text-size-adjust:100%; }
body{
  margin:0; background:var(--surface); color:var(--text);
  font-family:var(--font-ui); font-size:var(--fs-300); line-height:var(--lh-300);
  font-variant-numeric:tabular-nums slashed-zero;
  font-feature-settings:"tnum" 1,"zero" 1;
  -webkit-font-smoothing:antialiased;
}
a{ color:var(--accent-text); text-decoration:none; }
a:hover{ text-decoration:underline; }
:focus-visible{ outline:2px solid var(--focus-ring); outline-offset:2px; border-radius:var(--radius-sm); }
@media (forced-colors:active){ :focus-visible{ outline:3px solid CanvasText; } }
@media (prefers-reduced-motion:reduce){ *,*::before,*::after{ animation-duration:.01ms!important; transition-duration:.01ms!important; } }
.vh{ position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap; }

/* ── shell ───────────────────────────────────────────────────────────────── */
.topbar{
  position:sticky; top:0; z-index:20; height:var(--topbar-h);
  display:flex; align-items:center; gap:var(--sp-5);
  padding:0 var(--sp-5); background:var(--surface);
  border-bottom:1px solid var(--border-subtle);
}
.brand{ display:flex; align-items:center; gap:var(--sp-2); color:var(--text); font-weight:var(--fw-semibold); letter-spacing:var(--tracking-tight); }
.brand:hover{ text-decoration:none; }
.brand img{ width:24px; height:24px; border-radius:var(--radius-sm); }
.brand span{ font-size:var(--fs-300); }
.brand small{ display:block; font-size:var(--fs-50); line-height:1; color:var(--text-faint); font-weight:400; letter-spacing:var(--tracking-caps); text-transform:uppercase; }
.nav{ display:flex; gap:var(--sp-1); }
.nav a{
  padding:6px 10px; border-radius:var(--radius-sm); color:var(--text-muted);
  font-size:var(--fs-200); font-weight:var(--fw-medium);
}
.nav a:hover{ background:var(--surface-hover); color:var(--text); text-decoration:none; }
.nav a[aria-current="page"]{ background:var(--surface-active); color:var(--text); }
.topbar-end{ margin-left:auto; display:flex; align-items:center; gap:var(--sp-3); }
.freshness{ display:flex; align-items:center; gap:6px; font-size:var(--fs-100); color:var(--text-muted); }
.dot{ width:6px; height:6px; border-radius:50%; background:var(--pos-solid); flex:none; }
.dot.stale{ background:var(--warn-solid); }
.iconbtn{
  display:inline-flex; align-items:center; justify-content:center;
  width:30px; height:30px; padding:0; border:1px solid var(--border);
  border-radius:var(--radius-sm); background:var(--surface); color:var(--text-muted); cursor:pointer;
}
.iconbtn:hover{ background:var(--surface-hover); color:var(--text); }

.page{ max-width:var(--page-max); margin:0 auto; padding:var(--sp-6) var(--sp-5) var(--sp-8); }
.page-head{ margin-bottom:var(--sp-5); }
.page-head h1{ margin:0 0 var(--sp-1); font-size:var(--fs-700); line-height:var(--lh-700); letter-spacing:var(--tracking-tight); font-weight:var(--fw-semibold); }
.page-head p{ margin:0; color:var(--text-muted); font-size:var(--fs-400); line-height:var(--lh-400); max-width:70ch; }
.crumb{ margin:0 0 var(--sp-3); font-size:var(--fs-100); color:var(--text-faint); }
.crumb a{ color:var(--text-muted); }

footer.foot{
  max-width:var(--page-max); margin:0 auto; padding:var(--sp-5);
  border-top:1px solid var(--border-subtle); color:var(--text-faint);
  font-size:var(--fs-100); display:flex; gap:var(--sp-4); flex-wrap:wrap;
}

/* ── tiles ───────────────────────────────────────────────────────────────── */
.tiles{ display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr));
  border:1px solid var(--border-subtle); border-radius:var(--radius); overflow:hidden; margin-bottom:var(--sp-5); }
.tile{ padding:var(--sp-4) var(--sp-5); }
.tile+.tile{ border-left:1px solid var(--border-subtle); }
.tile dt{ margin:0 0 var(--sp-1); font-size:var(--fs-50); line-height:var(--lh-50); font-weight:var(--fw-semibold);
  letter-spacing:var(--tracking-caps); text-transform:uppercase; color:var(--text-faint); }
.tile dd{ margin:0; font-size:var(--fs-800); line-height:var(--lh-800); font-weight:var(--fw-semibold); letter-spacing:var(--tracking-tight); }
.tile .sub{ margin-top:var(--sp-1); font-size:var(--fs-100); line-height:var(--lh-100); color:var(--text-muted); }
@media(max-width:720px){ .tile+.tile{ border-left:0; border-top:1px solid var(--border-subtle); } }

/* ── score anatomy ───────────────────────────────────────────────────────── */
.anatomy{ position:relative; display:flex; height:8px; min-width:120px;
  border-radius:var(--radius-sm); overflow:hidden; background:var(--seg-track); }
.anatomy .seg{ width:calc(var(--w) * 1%); }
.seg-base{ background:var(--seg-base); } .seg-up{ background:var(--seg-uptime); }
.seg-gov{ background:var(--seg-gov); }   .seg-blk{ background:var(--seg-blk); }
.seg-pen{ background:var(--seg-pen); }
.anatomy .cutoff{ position:absolute; inset-block:0; left:calc(var(--at) * 1%); width:2px; background:var(--text); opacity:.5; }

.legend{ display:flex; flex-wrap:wrap; gap:var(--sp-4); margin-top:var(--sp-3); font-size:var(--fs-100); color:var(--text-muted); }
.legend i{ display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:6px; vertical-align:-1px; }

.explain{ border:1px solid var(--border-subtle); border-radius:var(--radius); padding:var(--sp-4) var(--sp-5); margin-bottom:var(--sp-5); }
.explain h2{ margin:0 0 var(--sp-2); font-size:var(--fs-500); line-height:var(--lh-500); font-weight:var(--fw-semibold); }
.explain p{ margin:0 0 var(--sp-3); color:var(--text-muted); font-size:var(--fs-300); max-width:80ch; }
.explain .formula{ font-family:var(--font-mono); font-size:var(--fs-200); color:var(--text);
  background:var(--surface-subtle); border-radius:var(--radius-sm); padding:var(--sp-2) var(--sp-3); display:inline-block; }

/* ── toolbar ─────────────────────────────────────────────────────────────── */
.toolbar{ display:flex; align-items:center; gap:var(--sp-2); margin-bottom:var(--sp-3); flex-wrap:wrap; }
.field{ position:relative; }
.field input{
  height:32px; width:260px; padding:0 var(--sp-3); border:1px solid var(--border);
  border-radius:var(--radius-sm); background:var(--surface); color:var(--text);
  font:inherit; font-size:var(--fs-200);
}
.field input::placeholder{ color:var(--text-faint); }
.chips{ display:flex; gap:var(--sp-1); }
.chip{
  height:32px; padding:0 var(--sp-3); border:1px solid var(--border); background:var(--surface);
  border-radius:var(--radius-sm); color:var(--text-muted); font:inherit; font-size:var(--fs-200);
  font-weight:var(--fw-medium); cursor:pointer;
}
.chip:hover{ background:var(--surface-hover); color:var(--text); }
.chip[aria-pressed="true"]{ background:var(--surface-active); color:var(--text); border-color:var(--border-strong); }
.count{ margin-left:auto; font-size:var(--fs-100); color:var(--text-muted); }

/* ── table ───────────────────────────────────────────────────────────────── */
.tablewrap{ border:1px solid var(--border-subtle); border-radius:var(--radius); overflow:auto; }
table.data{ width:100%; border-collapse:separate; border-spacing:0; font-size:var(--fs-200); line-height:var(--lh-200); }
table.data thead th{
  position:sticky; top:0; z-index:2; background:var(--surface-raised);
  text-align:left; font-size:var(--fs-50); line-height:var(--lh-50); font-weight:var(--fw-semibold);
  letter-spacing:var(--tracking-caps); text-transform:uppercase; color:var(--text-faint);
  padding:0; white-space:nowrap; box-shadow:inset 0 -1px 0 var(--border);
}
table.data thead th.num, table.data td.num{ text-align:right; }
.sortbtn{
  display:flex; align-items:center; gap:4px; width:100%; height:32px; padding:0 var(--sp-3);
  background:none; border:0; color:inherit; font:inherit; letter-spacing:inherit;
  text-transform:inherit; cursor:pointer;
}
th.num .sortbtn{ justify-content:flex-end; }
.sortbtn:hover{ color:var(--text); }
.sortbtn .arw{ opacity:.22; font-size:9px; line-height:1; }
th[aria-sort] .sortbtn .arw{ opacity:1; }
table.data tbody td{ padding:9px var(--sp-3); box-shadow:inset 0 -1px 0 var(--border-subtle); vertical-align:middle; }
table.data tbody tr:hover td{ background:var(--surface-hover); }
.val{ display:flex; align-items:center; gap:10px; min-width:0; }
.ident{ flex:none; width:24px; height:24px; border-radius:var(--radius-sm); }
.val .who{ min-width:0; }
.val .name{ display:block; font-weight:var(--fw-medium); color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:230px; }
.val .addr{ display:block; font-family:var(--font-mono); font-size:var(--fs-50); color:var(--text-faint); }
.score{ font-size:var(--fs-400); font-weight:var(--fw-semibold); }
.sub{ display:block; font-size:var(--fs-50); color:var(--text-faint); }
.pill{
  display:inline-flex; align-items:center; gap:5px; height:20px; padding:0 8px;
  border-radius:var(--radius-pill); font-size:var(--fs-50); font-weight:var(--fw-medium);
  background:var(--neutral-bg); color:var(--neutral-text); border:1px solid var(--neutral-border); white-space:nowrap;
}
.pill::before{ content:""; width:5px; height:5px; border-radius:50%; background:currentColor; flex:none; }
.pill.ok{ background:var(--pos-bg); color:var(--pos-text); border-color:var(--pos-border); }
.pill.warn{ background:var(--warn-bg); color:var(--warn-text); border-color:var(--warn-border); }
.pill.bad{ background:var(--crit-bg); color:var(--crit-text); border-color:var(--crit-border); }
.delta{ font-size:var(--fs-50); }
.delta.up{ color:var(--pos-text); } .delta.down{ color:var(--crit-text); }
.cutoff-row td{
  padding:6px var(--sp-3); font-size:var(--fs-50); letter-spacing:var(--tracking-caps);
  text-transform:uppercase; color:var(--text-muted); background:var(--surface-subtle);
  box-shadow:inset 0 1px 0 var(--border-strong),inset 0 -1px 0 var(--border-strong);
}
.empty,.errbox{ padding:var(--sp-8) var(--sp-5); text-align:center; color:var(--text-muted); }
.errbox{ background:var(--crit-bg); color:var(--crit-text); text-align:left; padding:var(--sp-3) var(--sp-4); }
.skel{ display:block; height:10px; border-radius:var(--radius-sm); background:var(--surface-subtle); animation:sk 1.2s linear infinite; }
@keyframes sk{ 50%{ opacity:.45; } }

@media(max-width:900px){
  .col-opt{ display:none; }
  .val .name{ max-width:150px; }
  .page{ padding:var(--sp-5) var(--sp-3) var(--sp-6); }
}

/* ── prose (methodology) ─────────────────────────────────────────────────── */
.prose{ max-width:78ch; }
.prose h2{ margin:var(--sp-6) 0 var(--sp-2); font-size:var(--fs-600); line-height:var(--lh-600); font-weight:var(--fw-semibold); letter-spacing:var(--tracking-tight); }
.prose h3{ margin:var(--sp-5) 0 var(--sp-2); font-size:var(--fs-400); font-weight:var(--fw-semibold); }
.prose p,.prose li{ color:var(--text-muted); font-size:var(--fs-400); line-height:var(--lh-400); }
.prose code{ font-family:var(--font-mono); font-size:.92em; background:var(--surface-subtle); padding:1px 5px; border-radius:var(--radius-sm); color:var(--text); }
.prose pre{ background:var(--surface-subtle); border:1px solid var(--border-subtle); border-radius:var(--radius); padding:var(--sp-4); overflow:auto; }
.prose pre code{ background:none; padding:0; font-size:var(--fs-200); line-height:20px; }
.prose table{ width:100%; border-collapse:separate; border-spacing:0; font-size:var(--fs-200); margin:var(--sp-3) 0; }
.prose table th{ text-align:left; font-size:var(--fs-50); text-transform:uppercase; letter-spacing:var(--tracking-caps); color:var(--text-faint); padding:6px var(--sp-3); box-shadow:inset 0 -1px 0 var(--border); }
.prose table td{ padding:8px var(--sp-3); box-shadow:inset 0 -1px 0 var(--border-subtle); color:var(--text-muted); }
`;

export type Nav = "standings" | "governance" | "methodology" | "";

/** One shell for every page: same top bar, same footer, same theme bootstrap. */
export function shell(opts: {
  title: string;
  nav: Nav;
  body: string;
  head?: string;
  script?: string;
}): string {
  const { title, nav, body, head = "", script = "" } = opts;
  const item = (href: string, label: string, key: Nav) =>
    `<a href="${href}"${nav === key ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="Polli's official Lava validator score, taken apart into the components it is made of.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23147396'/%3E%3Cpath d='M7 20h4v5H7zm7-8h4v13h-4zm7-6h4v19h-4z' fill='white'/%3E%3C/svg%3E">
<style>${CSS}</style>
${head}
</head>
<body>
<script>
  // Applied before first paint so the theme never flashes.
  try{ var t=localStorage.getItem('lsb.theme'); if(t) document.documentElement.dataset.theme=t; }catch(e){}
</script>
<header class="topbar">
  <a class="brand" href="/">
    <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="var(--accent-solid)"/><path d="M7 20h4v5H7zm7-8h4v13h-4zm7-6h4v19h-4z" fill="var(--text-on-solid)"/></svg>
    <span>Lava Scoreboard<small>by CryptoSailors</small></span>
  </a>
  <nav class="nav" aria-label="Primary">
    ${item("/", "Standings", "standings")}
    ${item("/governance", "Governance", "governance")}
    ${item("/methodology", "Methodology", "methodology")}
  </nav>
  <div class="topbar-end">
    <span class="freshness" id="freshness"></span>
    <button class="iconbtn" id="themebtn" type="button" aria-label="Switch colour theme" title="Switch colour theme">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
    </button>
  </div>
</header>
${body}
<footer class="foot">
  <span>Data: Polli public API and a Lava mainnet node operated by CryptoSailors.</span>
  <a href="https://github.com/CryptoSailors/lava-scoreboard">Source</a>
  <a href="/methodology">Methodology</a>
</footer>
<script>
(function(){
  var b=document.getElementById('themebtn');
  b&&b.addEventListener('click',function(){
    var r=document.documentElement;
    var cur=r.dataset.theme||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');
    var next=cur==='dark'?'light':'dark';
    r.dataset.theme=next; try{ localStorage.setItem('lsb.theme',next); }catch(e){}
  });
  window.lsbAgo=function(ms){
    var s=Math.max(0,Math.round((Date.now()-ms)/1000));
    if(s<90) return s+' s ago';
    var m=Math.round(s/60); if(m<90) return m+' min ago';
    var h=Math.round(m/60); if(h<48) return h+' h ago';
    return Math.round(h/24)+' d ago';
  };
  window.lsbFresh=function(ts,staleAfterMs){
    var el=document.getElementById('freshness'); if(!el||!ts) return;
    var stale=(Date.now()-ts)>staleAfterMs;
    el.innerHTML='<span class="dot'+(stale?' stale':'')+'"></span>Updated '+window.lsbAgo(ts)+(stale?' · feed may be stale':'');
  };
})();
</script>
${script}
</body>
</html>`;
}
