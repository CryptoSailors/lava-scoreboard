/**
 * Page bodies. The shell (top bar, theme, footer) lives in theme.ts.
 *
 * The organising idea of this dashboard: Polli publishes the score and the
 * fields that feed it, but never the breakdown. We publish the breakdown. So
 * the same five-segment bar appears on every row, in the same order, with the
 * same colours — by the fourth row a visitor has learned the metric without
 * reading a sentence.
 */
import { shell } from "./theme";

export type Tiles = {
  cutoff: number | null;
  cutoffDelta: number | null;
  scored: number;
  onchain: number;
  voted: number;
  zeroTiming: number;
  reconMatched: number;
  reconTotal: number;
  reconMaxErr: number;
  newcomers: number;
};

const fmt = (n: number | null | undefined, d = 1) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toFixed(d);

export function renderStandings(t: Tiles): string {
  const delta =
    t.cutoffDelta === null || t.cutoffDelta === 0
      ? ""
      : ` · ${t.cutoffDelta > 0 ? "▲" : "▼"}${Math.abs(t.cutoffDelta).toFixed(1)} vs previous refresh`;

  const body = `
<main class="page">
  <div class="page-head">
    <h1>Standings</h1>
    <p>Which validators are in line for Foundation delegation, and which part of the score is holding each one back.</p>
  </div>

  <dl class="tiles">
    <div class="tile">
      <dt>Top-25 line</dt>
      <dd>${fmt(t.cutoff)}</dd>
      <div class="sub">Score needed to reach the delegated set${delta}</div>
    </div>
    <div class="tile">
      <dt>Validators scored</dt>
      <dd>${t.scored}</dd>
      <div class="sub">of ${t.onchain} in the active set on-chain</div>
    </div>
    <div class="tile">
      <dt>Voted in governance</dt>
      <dd>${t.voted} / ${t.scored}</dd>
      <div class="sub">Worth 15 points. ${Math.max(0, t.scored - t.voted)} validators score zero here.</div>
    </div>
    <div class="tile">
      <dt>Zero on block timing</dt>
      <dd>${t.zeroTiming} / ${t.scored}</dd>
      <div class="sub">The largest component, worth 30 points.</div>
    </div>
  </dl>

  <section class="explain">
    <h2>What the bar shows</h2>
    <p>Polli publishes a single score and the fields behind it, but not the arithmetic that joins them.
       We reconstruct it and show the parts. Every bar on this page uses the same five segments in the same order.</p>
    <div class="formula">score = 35 + 0.20 × uptime + 0.15 × governance + 0.30 × block timing − 1.75 × jail events</div>
    <div class="legend" aria-hidden="true">
      <span><i style="background:var(--seg-base)"></i>Base 35 — every validator</span>
      <span><i style="background:var(--seg-uptime)"></i>Uptime, up to 20</span>
      <span><i style="background:var(--seg-gov)"></i>Governance, 15 or 0</span>
      <span><i style="background:var(--seg-blk)"></i>Block timing, up to 30</span>
      <span><i style="background:var(--seg-pen)"></i>Jail penalty</span>
    </div>
    <p style="margin-top:var(--sp-3);margin-bottom:0;font-size:var(--fs-100)">
      Our reconstruction matches Polli's published total for <strong>${t.reconMatched} of ${t.reconTotal}</strong>
      scored validators, with a maximum error of ${t.reconMaxErr.toFixed(3)}.${
        t.newcomers ? ` ${t.newcomers} validator${t.newcomers > 1 ? "s are" : " is"} excluded:
        Polli zeroes the score until a validator has a track record, whatever the components say.` : ""}
      <a href="/methodology">How this is computed</a>.
    </p>
  </section>

  <div class="toolbar">
    <div class="field">
      <label class="vh" for="q">Search validators</label>
      <input id="q" type="search" placeholder="Search validator or address" autocomplete="off">
    </div>
    <div class="chips" role="group" aria-label="Filter">
      <button class="chip" id="f-all"  type="button" aria-pressed="true">All</button>
      <button class="chip" id="f-top"  type="button" aria-pressed="false">Delegated set</button>
      <button class="chip" id="f-zero" type="button" aria-pressed="false">Zero block timing</button>
    </div>
    <span class="count" id="count"></span>
  </div>

  <div class="tablewrap">
    <table class="data" id="tbl">
      <caption class="vh">Lava validators ranked by Polli score, with the score broken into its components.</caption>
      <thead>
        <tr>
          <th class="num" style="width:64px"><button class="sortbtn" data-k="rank">#<span class="arw">▾</span></button></th>
          <th><button class="sortbtn" data-k="moniker">Validator<span class="arw">▾</span></button></th>
          <th class="num" style="width:96px"><button class="sortbtn" data-k="score">Score<span class="arw">▾</span></button></th>
          <th style="width:186px">Anatomy</th>
          <th class="num col-opt" style="width:100px"><button class="sortbtn" data-k="uptime">Uptime<span class="arw">▾</span></button></th>
          <th class="num col-opt" style="width:104px"><button class="sortbtn" data-k="gov">Governance<span class="arw">▾</span></button></th>
          <th class="num col-opt" style="width:110px"><button class="sortbtn" data-k="blk">Block timing<span class="arw">▾</span></button></th>
          <th class="num col-opt" style="width:76px"><button class="sortbtn" data-k="jail">Jail<span class="arw">▾</span></button></th>
          <th style="width:150px">State</th>
        </tr>
      </thead>
      <tbody id="tb"></tbody>
    </table>
  </div>
  <p aria-live="polite" class="vh" id="live"></p>
</main>`;

  const script = `<script>
(function(){
  var CUT = ${t.cutoff === null ? "null" : t.cutoff};
  var rows=[], sortK='rank', sortDir=1, filter='all', q='';

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  // Deterministic 24px identicon from the operator address — no network, no library.
  function identicon(addr){
    var h=0; for(var i=0;i<addr.length;i++){ h=(h*31+addr.charCodeAt(i))>>>0; }
    var hue=h%360, cells='';
    for(var y=0;y<5;y++) for(var x=0;x<3;x++){
      if(((h>>((y*3+x)%29))&1)===0) continue;
      cells+='<rect x="'+(x*8)+'" y="'+(y*8)+'" width="8" height="8"/>'
           +(x<2?'<rect x="'+((4-x)*8)+'" y="'+(y*8)+'" width="8" height="8"/>':'');
    }
    return '<svg class="ident" viewBox="0 0 40 40" aria-hidden="true">'
      +'<rect width="40" height="40" rx="6" fill="hsl('+hue+' 32% 88%)"/>'
      +'<g fill="hsl('+hue+' 45% 38%)">'+cells+'</g></svg>';
  }

  function parts(v){
    var up=0.20*(v.uptime_percentage_rate||0);
    var gov=0.15*(v.governance_participation_rate||0);
    var blk=0.30*(v.block_timing_score||0);
    var pen=1.75*(v.jailed_count||0);
    return {up:up,gov:gov,blk:blk,pen:pen};
  }

  function anatomy(v){
    var p=parts(v), sc=v.official_score;
    if(sc==null) return '<span class="sub">not scored</span>';
    var lbl='Score '+sc.toFixed(1)+' of 100. Base 35, uptime '+p.up.toFixed(1)
      +' of 20, governance '+p.gov.toFixed(0)+' of 15, block timing '+p.blk.toFixed(1)
      +' of 30, jail penalty '+p.pen.toFixed(1)+'.';
    return '<div class="anatomy" role="img" aria-label="'+esc(lbl)+'">'
      +'<i class="seg seg-base" style="--w:35"></i>'
      +'<i class="seg seg-up" style="--w:'+p.up+'"></i>'
      +'<i class="seg seg-gov" style="--w:'+p.gov+'"></i>'
      +'<i class="seg seg-blk" style="--w:'+p.blk+'"></i>'
      +'<i class="seg seg-pen" style="--w:'+p.pen+'"></i>'
      +(CUT?'<i class="cutoff" style="--at:'+CUT+'"></i>':'')+'</div>';
  }

  function statePill(v){
    if(v.tombstoned) return '<span class="pill bad">Tombstoned</span>';
    if(v.jailed) return '<span class="pill bad">Jailed</span>';
    var s=(v.status||'').replace('BOND_STATUS_','');
    var cls = s==='BONDED' ? 'ok' : '';
    var name = s==='BONDED' ? 'Active' : (s==='UNBONDING' ? 'Unbonding' : (s==='UNBONDED' ? 'Unbonded' : s||'Unknown'));
    var out='<span class="pill '+cls+'">'+name+'</span>';
    if(v.official_status==='NOT_RECOMMENDED')
      out+=' <span class="pill" title="'+esc(v.official_status_reason||'')+'">Flagged</span>';
    return out;
  }

  function shorten(a){ return a.length>22 ? a.slice(0,12)+'…'+a.slice(-6) : a; }

  function visible(){
    var out=rows.filter(function(v){
      if(filter==='top') return v.rank && v.rank<=25;
      if(filter==='zero') return v.official_score!=null && !(v.block_timing_score>0);
      return true;
    });
    if(q){ var s=q.toLowerCase();
      out=out.filter(function(v){
        return (v.moniker||'').toLowerCase().indexOf(s)>=0 ||
               (v.operator_address||'').toLowerCase().indexOf(s)>=0; }); }
    var key={rank:function(v){return v.rank||9999;},moniker:function(v){return (v.moniker||'').toLowerCase();},
      score:function(v){return v.official_score==null?-1:v.official_score;},
      uptime:function(v){return v.uptime_percentage_rate||0;},
      gov:function(v){return v.governance_participation_rate||0;},
      blk:function(v){return v.block_timing_score||0;},
      jail:function(v){return v.jailed_count||0;}}[sortK];
    out.sort(function(a,b){
      var x=key(a),y=key(b);
      if(x<y) return -1*sortDir; if(x>y) return 1*sortDir;
      return (b.official_score||0)-(a.official_score||0);
    });
    return out;
  }

  function draw(){
    var list=visible(), tb=document.getElementById('tb'), html='', cutDrawn=false;
    var isDefault = sortK==='rank' && sortDir===1 && filter==='all' && !q;
    if(!list.length){
      tb.innerHTML='<tr><td colspan="9"><div class="empty"><strong>No validators match these filters.</strong>'
        +'<br>Clear the search or switch back to “All”.</div></td></tr>';
    } else {
      for(var i=0;i<list.length;i++){
        var v=list[i], p=parts(v);
        if(isDefault && !cutDrawn && v.rank>25){
          html+='<tr class="cutoff-row"><td colspan="9">Top-25 delegation line'
            +(CUT?' · score '+CUT.toFixed(1):'')+'</td></tr>'; cutDrawn=true;
        }
        var d=v.rank_change;
        var dh = d ? '<span class="delta '+(d>0?'up':'down')+'">'+(d>0?'▲':'▼')+Math.abs(d)+'</span>' : '';
        html+='<tr>'
          +'<td class="num">'+(v.rank||'—')+' '+dh+'</td>'
          +'<td><div class="val">'+identicon(v.operator_address||'')
            +'<span class="who"><a class="name" href="/v/'+encodeURIComponent(v.operator_address)+'">'+esc(v.moniker||'—')+'</a>'
            +'<span class="addr">'+esc(shorten(v.operator_address||''))+'</span></span></div></td>'
          +'<td class="num"><span class="score">'+(v.official_score!=null?v.official_score.toFixed(1):'—')+'</span></td>'
          +'<td>'+anatomy(v)+'</td>'
          +'<td class="num col-opt">'+(v.official_score!=null?p.up.toFixed(1):'—')
            +'<span class="sub">'+(v.uptime_percentage_rate!=null?v.uptime_percentage_rate.toFixed(2)+'%':'')+'</span></td>'
          +'<td class="num col-opt">'+(v.official_score!=null?p.gov.toFixed(0):'—')+'</td>'
          +'<td class="num col-opt">'+(v.official_score!=null?p.blk.toFixed(1):'—')
            +'<span class="sub">'+(v.block_timing_score!=null?v.block_timing_score.toFixed(1):'')+'</span></td>'
          +'<td class="num col-opt">'+(p.pen>0?'<span style="color:var(--crit-text)">−'+p.pen.toFixed(1)+'</span>':'<span class="sub">—</span>')+'</td>'
          +'<td>'+statePill(v)+'</td>'
        +'</tr>';
      }
      tb.innerHTML=html;
    }
    document.getElementById('count').textContent=list.length+' of '+rows.length+' validators';
    document.getElementById('live').textContent='Sorted by '+sortK+', '+(sortDir<0?'descending':'ascending')+'. '+list.length+' validators.';
  }

  function load(){
    fetch('/api/validators?polli=true').then(function(r){
      if(!r.ok) throw new Error('HTTP '+r.status); return r.json();
    }).then(function(d){
      rows=d.validators||[];
      rows.forEach(function(v){ if(v.official_score!=null) v.official_score=Number(v.official_score); });
      window.lsbFresh(d.polli_ts||d.ts, 36*3600*1000);
      draw();
    }).catch(function(e){
      document.getElementById('tb').innerHTML='<tr><td colspan="9"><div class="errbox">'
        +'Could not load validator data ('+esc(e.message)+'). '
        +'<button class="chip" onclick="location.reload()">Retry</button></div></td></tr>';
    });
  }

  document.querySelectorAll('.sortbtn').forEach(function(b){
    b.addEventListener('click',function(){
      var k=b.dataset.k;
      if(sortK===k){ sortDir=-sortDir; }
      else { sortK=k; sortDir=(k==='moniker'||k==='rank'||k==='jail')?1:-1; }
      document.querySelectorAll('#tbl thead th').forEach(function(th){ th.removeAttribute('aria-sort'); });
      b.closest('th').setAttribute('aria-sort', sortDir<0?'descending':'ascending');
      draw();
    });
  });
  var qi=document.getElementById('q');
  qi.addEventListener('input',function(){ q=qi.value.trim(); draw(); });
  [['f-all','all'],['f-top','top'],['f-zero','zero']].forEach(function(pair){
    document.getElementById(pair[0]).addEventListener('click',function(){
      filter=pair[1];
      ['f-all','f-top','f-zero'].forEach(function(id){
        document.getElementById(id).setAttribute('aria-pressed', id===pair[0]?'true':'false'); });
      draw();
    });
  });
  load(); setInterval(load, 60000);
})();
</script>`;

  return shell({ title: "Standings · Lava Scoreboard", nav: "standings", body, script });
}

/* ── Methodology ─────────────────────────────────────────────────────────── */

export function renderMethodology(t: Tiles): string {
  const body = `
<main class="page">
  <div class="page-head">
    <h1>Methodology</h1>
    <p>Where the number comes from, and how to reproduce it without trusting us.</p>
  </div>
  <div class="prose">

    <h2>Whose score is this</h2>
    <p>The score on this site is <strong>Polli's</strong>. Polli computes it, the Lava Foundation
       delegates on it, and we do not adjust it. What we add is the arithmetic. Polli publishes the
       score and the fields that go into it, but not the breakdown, so we reconstruct it and check
       the reconstruction against their published total on every refresh.</p>
    <p>It currently matches for <strong>${t.reconMatched} of ${t.reconTotal}</strong> validators,
       with a maximum error of ${t.reconMaxErr.toFixed(3)}.</p>

    <h2 id="formula">The formula</h2>
    <pre><code>score = 35
      + 0.20 × uptimePercentageRate
      + 0.15 × governanceParticipationRate
      + 0.30 × blockTimingScore
      − 1.75 × jailedCount</code></pre>
    <p>It was not published anywhere. We derived it from Polli's public API by fitting the four
       fields against the published <code>scoringRate</code> across the whole active set, then
       verified it validator by validator.</p>

    <table>
      <thead><tr><th>Component</th><th>Weight</th><th>Range</th><th>What it measures</th></tr></thead>
      <tbody>
        <tr><td>Base</td><td>—</td><td>35</td><td>Granted to every scored validator.</td></tr>
        <tr id="uptime"><td>Uptime</td><td>0.20</td><td>0–20</td><td>Polli's <code>uptimePercentageRate</code>. Blocks signed over their window.</td></tr>
        <tr id="governance"><td>Governance</td><td>0.15</td><td>0 or 15</td><td>Binary. Participation in on-chain votes.</td></tr>
        <tr id="block-timing"><td>Block timing</td><td>0.30</td><td>0–30</td><td>The largest component. Polli does not document what it measures.</td></tr>
        <tr id="jailed"><td>Jail events</td><td>−1.75</td><td>penalty</td><td>Subtracted per jail event.</td></tr>
      </tbody>
    </table>

    <h2 id="block-timing-unknown">The part nobody can explain</h2>
    <p><code>blockTimingScore</code> decides more of the score than anything else, and
       ${t.zeroTiming} of ${t.scored} validators score exactly zero on it. We could not find a
       definition in Polli's documentation, in the Lava delegation programme announcement, or
       anywhere else public. The announcement mentions “block production compliance” as a future
       metric without defining it.</p>
    <p>We tested and ruled out the obvious explanations against the live set:</p>
    <table>
      <thead><tr><th>Hypothesis</th><th>Why it fails</th></tr></thead>
      <tbody>
        <tr><td>It reflects uptime</td><td>A validator at 70.5% uptime scores above zero; one at 98.5% scores zero.</td></tr>
        <tr><td>It needs a minimum stake</td><td>Validators with 153 and 602 LAVA score 51.5 and 57.4; one with 7,595 LAVA scores zero.</td></tr>
        <tr><td>It needs proposed blocks</td><td>Four validators scoring 51–60 proposed no blocks at all in a 20,000-block window.</td></tr>
        <tr><td>Commission, status or age</td><td>Recipients include 20% commission, <code>NOT_RECOMMENDED</code> status, and every validator shows the same 90 operating days.</td></tr>
      </tbody>
    </table>
    <p>If you know what it measures, we would like to hear from you — it is the single largest
       lever available to every operator on this board, including us.</p>

    <h2>Independent on-chain cross-check</h2>
    <p>Separately from Polli's feed, we recompute uptime and jail events directly from a Lava
       mainnet node using <code>lavad</code>. That number is never shown as a competing score.
       Its only job is to notice when Polli's feed goes stale — which it has: a collector of ours
       once served five-month-old figures while reporting them as current.</p>

    <h2>Refresh cadence</h2>
    <p>Polli's figures refresh roughly daily; on-chain figures every ten minutes. The timestamp in
       the header is the age of the newest Polli snapshot, and it turns amber past 36 hours.</p>

    <h2>Reproducing this</h2>
    <p>The collector, the scoring code and this page are
       <a href="https://github.com/CryptoSailors/lava-scoreboard">open source under MIT</a>.
       Every figure here comes from Polli's public API or from a public Lava RPC; there is no
       private data source.</p>
  </div>
</main>`;
  return shell({ title: "Methodology · Lava Scoreboard", nav: "methodology", body });
}

/* ── Governance ──────────────────────────────────────────────────────────── */

export type GovProposal = {
  proposal_id: number; title: string; status: string;
  voting_end_time: string | null;
  yes_count: string | null; no_count: string | null;
  abstain_count: string | null; no_with_veto_count: string | null;
};

const statusPill = (s: string) => {
  const n = (s || "").replace("PROPOSAL_STATUS_", "");
  const cls = n === "PASSED" ? "ok" : n === "REJECTED" ? "bad" : n === "VOTING_PERIOD" ? "warn" : "";
  const label = n === "VOTING_PERIOD" ? "Voting" : n.charAt(0) + n.slice(1).toLowerCase().replace(/_/g, " ");
  return `<span class="pill ${cls}">${label}</span>`;
};

function tallyBar(p: GovProposal): string {
  const n = (x: string | null) => Number(x || 0);
  const y = n(p.yes_count), no = n(p.no_count), a = n(p.abstain_count), v = n(p.no_with_veto_count);
  const tot = y + no + a + v;
  if (!tot) return `<span class="sub">no tally recorded</span>`;
  const pct = (x: number) => ((x / tot) * 100).toFixed(1);
  return `<div class="anatomy" role="img" aria-label="Yes ${pct(y)}%, no ${pct(no)}%, abstain ${pct(a)}%, veto ${pct(v)}%.">
    <i class="seg" style="--w:${pct(y)};background:var(--pos-solid)"></i>
    <i class="seg" style="--w:${pct(no)};background:var(--crit-solid)"></i>
    <i class="seg" style="--w:${pct(a)};background:var(--seg-base)"></i>
    <i class="seg" style="--w:${pct(v)};background:var(--warn-solid)"></i>
  </div><span class="sub">${pct(y)}% yes</span>`;
}

export function renderGovernance(rows: GovProposal[], votedCount: number, scored: number): string {
  const open = rows.filter((r) => (r.status || "").includes("VOTING_PERIOD"));
  const body = `
<main class="page">
  <div class="page-head">
    <h1>Governance</h1>
    <p>Participation is worth 15 points of the score and it is binary — you either voted in the
       window or you did not. ${scored - votedCount} of ${scored} scored validators currently take zero here.</p>
  </div>

  <dl class="tiles">
    <div class="tile"><dt>Open proposals</dt><dd>${open.length}</dd>
      <div class="sub">${open.length ? "Voting is worth 15 points" : "Nothing to vote on right now"}</div></div>
    <div class="tile"><dt>Proposals tracked</dt><dd>${rows.length}</dd>
      <div class="sub">Collected from chain since January 2026</div></div>
    <div class="tile"><dt>Validators with the points</dt><dd>${votedCount} / ${scored}</dd>
      <div class="sub">Per Polli's governanceParticipationRate</div></div>
  </dl>

  <div class="tablewrap">
    <table class="data">
      <caption class="vh">Lava governance proposals.</caption>
      <thead><tr>
        <th class="num" style="width:64px">#</th>
        <th>Proposal</th>
        <th style="width:130px">Status</th>
        <th style="width:190px" class="col-opt">Tally</th>
        <th style="width:130px" class="col-opt">Voting ended</th>
      </tr></thead>
      <tbody>
        ${rows.length ? rows.map((p) => `<tr>
          <td class="num">${p.proposal_id}</td>
          <td><a href="/governance/proposal/${p.proposal_id}">${escapeHtml(p.title || "Proposal " + p.proposal_id)}</a></td>
          <td>${statusPill(p.status)}</td>
          <td class="col-opt">${tallyBar(p)}</td>
          <td class="col-opt"><span class="sub">${(p.voting_end_time || "").slice(0, 10) || "—"}</span></td>
        </tr>`).join("") : `<tr><td colspan="5"><div class="empty">No proposals collected yet.</div></td></tr>`}
      </tbody>
    </table>
  </div>

  <p style="margin-top:var(--sp-4);font-size:var(--fs-100);color:var(--text-faint);max-width:80ch">
    Per-validator voting records are only available while a proposal is open: Cosmos removes
    individual votes from state once a proposal is finalised, so historical records cannot be
    reconstructed from a pruned node. We record them from the next open proposal onward.
  </p>
</main>`;
  return shell({ title: "Governance · Lava Scoreboard", nav: "governance", body });
}

export function renderProposal(p: GovProposal | null, id: string, description: string, votes: any[]): string {
  if (!p) {
    return shell({
      title: "Proposal not found · Lava Scoreboard", nav: "governance",
      body: `<main class="page"><div class="empty"><h1>Proposal ${escapeHtml(id)} not found</h1>
             <p><a href="/governance">Back to governance</a></p></div></main>`,
    });
  }
  const body = `
<main class="page">
  <p class="crumb"><a href="/governance">Governance</a> / Proposal #${p.proposal_id}</p>
  <div class="page-head">
    <h1>${escapeHtml(p.title || "Proposal " + p.proposal_id)}</h1>
    <p>${statusPill(p.status)} &nbsp; Voting ended ${(p.voting_end_time || "").slice(0, 10) || "—"}</p>
  </div>
  <section class="explain">
    <h2>Final tally</h2>
    ${tallyBar(p)}
  </section>
  ${description ? `<div class="prose"><h2>Summary</h2><p>${escapeHtml(description).slice(0, 4000)}</p></div>` : ""}
  ${votes.length ? `<div class="tablewrap" style="margin-top:var(--sp-5)">
    <table class="data"><thead><tr><th>Validator</th><th style="width:140px">Vote</th></tr></thead>
    <tbody>${votes.map((v) => `<tr><td>${escapeHtml(v.moniker || v.voter)}</td>
      <td><span class="pill">${escapeHtml((v.vote_option || "").replace("VOTE_OPTION_", ""))}</span></td></tr>`).join("")}
    </tbody></table></div>`
    : `<p style="margin-top:var(--sp-5);font-size:var(--fs-100);color:var(--text-faint);max-width:80ch">
        No per-validator records for this proposal. Cosmos removes individual votes from state once
        a proposal is finalised; we capture them only for proposals that were open while this
        collector was running.</p>`}
</main>`;
  return shell({ title: `Proposal #${p.proposal_id} · Lava Scoreboard`, nav: "governance", body });
}

/* ── Validator detail ────────────────────────────────────────────────────── */

export function renderValidator(v: any, jail: any[]): string {
  if (!v) {
    return shell({
      title: "Validator not found · Lava Scoreboard", nav: "",
      body: `<main class="page"><div class="empty"><h1>Validator not found</h1>
             <p><a href="/">Back to standings</a></p></div></main>`,
    });
  }
  const up = 0.2 * (v.uptime_percentage_rate || 0);
  const gov = 0.15 * (v.governance_participation_rate || 0);
  const blk = 0.3 * (v.block_timing_score || 0);
  const pen = 1.75 * (v.jailed_count || 0);
  const row = (label: string, points: string, raw: string, weight: string, anchor: string) => `
    <tr><td><a href="/methodology#${anchor}">${label}</a></td>
      <td class="num"><strong>${points}</strong></td>
      <td class="num"><span class="sub">${raw}</span></td>
      <td class="num"><span class="sub">${weight}</span></td></tr>`;

  const body = `
<main class="page">
  <p class="crumb"><a href="/">Standings</a> / ${escapeHtml(v.moniker || "")}</p>
  <div class="page-head">
    <h1>${escapeHtml(v.moniker || "Validator")}</h1>
    <p style="font-family:var(--font-mono);font-size:var(--fs-200)">${escapeHtml(v.operator_address || "")}</p>
  </div>

  <dl class="tiles">
    <div class="tile"><dt>Polli score</dt><dd>${v.official_score != null ? Number(v.official_score).toFixed(1) : "—"}</dd>
      <div class="sub">${v.official_status ? escapeHtml(v.official_status) : ""}</div></div>
    <div class="tile"><dt>Uptime</dt><dd>${v.uptime_percentage_rate != null ? Number(v.uptime_percentage_rate).toFixed(2) + "%" : "—"}</dd>
      <div class="sub">Polli's window</div></div>
    <div class="tile"><dt>Jail events</dt><dd>${v.jailed_count ?? 0}</dd>
      <div class="sub">−1.75 points each</div></div>
    <div class="tile"><dt>Commission</dt><dd>${v.commission_rate ? (Number(v.commission_rate) * 100).toFixed(0) + "%" : "—"}</dd>
      <div class="sub">Carries no weight in the score</div></div>
  </dl>

  <section class="explain">
    <h2>Where this score comes from</h2>
    <div class="anatomy" style="height:14px" role="img" aria-label="Base 35, uptime ${up.toFixed(1)}, governance ${gov.toFixed(0)}, block timing ${blk.toFixed(1)}, penalty ${pen.toFixed(1)}.">
      <i class="seg seg-base" style="--w:35"></i>
      <i class="seg seg-up" style="--w:${up}"></i>
      <i class="seg seg-gov" style="--w:${gov}"></i>
      <i class="seg seg-blk" style="--w:${blk}"></i>
      <i class="seg seg-pen" style="--w:${pen}"></i>
    </div>
    <div class="legend">
      <span><i style="background:var(--seg-base)"></i>Base 35</span>
      <span><i style="background:var(--seg-uptime)"></i>Uptime ${up.toFixed(1)}</span>
      <span><i style="background:var(--seg-gov)"></i>Governance ${gov.toFixed(0)}</span>
      <span><i style="background:var(--seg-blk)"></i>Block timing ${blk.toFixed(1)}</span>
      ${pen > 0 ? `<span><i style="background:var(--seg-pen)"></i>Penalty −${pen.toFixed(1)}</span>` : ""}
    </div>
    <table style="margin-top:var(--sp-4);width:100%;border-collapse:separate;border-spacing:0">
      <thead><tr>
        <th style="text-align:left;font-size:var(--fs-50);text-transform:uppercase;letter-spacing:var(--tracking-caps);color:var(--text-faint);padding:6px 0">Component</th>
        <th class="num" style="font-size:var(--fs-50);text-transform:uppercase;letter-spacing:var(--tracking-caps);color:var(--text-faint);padding:6px 0">Points</th>
        <th class="num" style="font-size:var(--fs-50);text-transform:uppercase;letter-spacing:var(--tracking-caps);color:var(--text-faint);padding:6px 0">Raw</th>
        <th class="num" style="font-size:var(--fs-50);text-transform:uppercase;letter-spacing:var(--tracking-caps);color:var(--text-faint);padding:6px 0">Max</th>
      </tr></thead>
      <tbody>
        ${row("Base", "35.0", "—", "35", "formula")}
        ${row("Uptime", up.toFixed(1), (v.uptime_percentage_rate ?? 0).toFixed(2) + "%", "20", "uptime")}
        ${row("Governance", gov.toFixed(0), String(v.governance_participation_rate ?? 0), "15", "governance")}
        ${row("Block timing", blk.toFixed(1), String(v.block_timing_score ?? 0), "30", "block-timing")}
        ${row("Jail penalty", pen > 0 ? "−" + pen.toFixed(1) : "0.0", String(v.jailed_count ?? 0) + " events", "—", "jailed")}
      </tbody>
    </table>
  </section>

  ${jail.length ? `<section class="explain"><h2>Jail history</h2>
    <table style="width:100%"><tbody>
      ${jail.slice(0, 12).map((j: any) => `<tr><td style="padding:6px 0"><span class="sub">${escapeHtml(String(j.jailed_at || j.ts || ""))}</span></td></tr>`).join("")}
    </tbody></table></section>` : ""}

  ${v.official_status_reason ? `<p style="font-size:var(--fs-100);color:var(--text-faint)">
    Polli status note: ${escapeHtml(v.official_status_reason)}</p>` : ""}
</main>`;
  return shell({ title: `${v.moniker || "Validator"} · Lava Scoreboard`, nav: "", body });
}

export function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
