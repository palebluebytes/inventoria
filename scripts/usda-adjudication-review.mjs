#!/usr/bin/env node
/**
 * Read and ratify the #143 gold-set adjudications in a browser.
 *
 *   pnpm usda:review            # serves on 4143
 *   pnpm usda:review --port N
 *
 * The judgements in `143-gold-set.json` were proposed by an LLM. Research note
 * #143 §8.3 requires a human to ratify every one of them before a ranking key is
 * written, because #130's correction block shows what happens otherwise: its 914
 * adjudications stood, but its two most load-bearing verdict classes were never
 * independently read and the sizing derived from them had to be overturned.
 *
 * Fifty cases is a sitting. A page is the only affordable way to read them,
 * because judging one means seeing the ranked rows and their key values — a tie
 * has to LOOK like a tie rather than be asserted in a column of prose.
 *
 * Verdicts are written back into the JSON in place, on the PUT, one case at a
 * time. There is deliberately no download-and-merge step: that is where
 * judgements get lost, and this file exists to protect judgements.
 *
 * Node built-ins only, like `usda-ranking-audit.mjs`, and it imports the
 * ranking rather than restating it — it shows the order that ships or it shows
 * nothing. It binds its own port and never 5173: reusing the app's dev port is
 * how a stale `pnpm dev` silently serves old code.
 */

import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readReferenceFoodName,
  compileReferenceFoodQuery,
  compareRelevance,
} from "../src/lib/food/reference-food-ranking.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GOLD = join(ROOT, "docs", "research", "143-gold-set.json");
const INDEX = join(ROOT, "public", "usda", "search-index.json");
/** Not 5173. See the header. */
const DEFAULT_PORT = 4143;

/** #130 §3.2's vocabulary, unchanged so the two notes stay comparable. */
const VERDICTS = ["correct", "miss", "peers", "implausible-query"];
/** How many ranked rows a card shows. Enough to see the tie and its neighbours. */
const SHOWN = 12;

const corpus = JSON.parse(readFileSync(INDEX, "utf8")).foods.map((f) => ({
  description: f.description,
  name: readReferenceFoodName(f.description),
}));

/**
 * The ranked rows for one head query, with each row's five key values and
 * whether it is tied with the leader — which is the whole point of the card.
 */
function ranked(head) {
  const score = compileReferenceFoodQuery(head);
  const rows = corpus
    .map((f) => ({ description: f.description, key: score(f.name) }))
    .filter((r) => r.key.tier > 0)
    .sort((a, b) => compareRelevance(a.key, b.key));
  const tied = rows.filter((r) => compareRelevance(rows[0].key, r.key) === 0);
  return {
    total: rows.length,
    tiedAtTop: tied.length,
    rows: rows.slice(0, SHOWN).map((r, i) => ({
      description: r.description,
      tied: i < tied.length,
      ...r.key,
    })),
  };
}

const readGold = () => JSON.parse(readFileSync(GOLD, "utf8"));

/**
 * Applies one ratification. Only the three fields a human sets are writable;
 * the case identity, its shapes and its measured counts are not, so a stray PUT
 * cannot rewrite what the sweep measured.
 */
function saveVerdict({ head, verdict, should_lead, note, ratified }) {
  const gold = readGold();
  const kase = gold.cases.find((c) => c.head === head);
  if (!kase) return { ok: false, error: `unknown case: ${head}` };
  if (verdict !== undefined && !VERDICTS.includes(verdict) && verdict !== null)
    return { ok: false, error: `unknown verdict: ${verdict}` };
  if (verdict !== undefined) kase.verdict = verdict;
  if (should_lead !== undefined) kase.should_lead = should_lead;
  if (note !== undefined) kase.note = note;
  if (ratified !== undefined) kase.ratified = ratified;
  gold.adjudication.tally = [
    "correct",
    "miss",
    "peers",
    "implausible-query",
  ].reduce(
    (o, v) => ((o[v] = gold.cases.filter((c) => c.verdict === v).length), o),
    {}
  );
  gold.adjudication.ratified_count = gold.cases.filter(
    (c) => c.ratified
  ).length;
  gold.adjudication.ratified_by_maintainer =
    gold.adjudication.ratified_count === gold.cases.length;
  writeFileSync(GOLD, JSON.stringify(gold, null, 1) + "\n");
  return { ok: true, ratified_count: gold.adjudication.ratified_count };
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<title>#143 gold set — ratify</title>
<style>
 :root{--ink:#111;--paper:#fff;--edge:#111;--dim:#666;--tie:#fffbe6;--ok:#e8f5e9;--warn:#fdecea}
 @media (prefers-color-scheme:dark){:root{--ink:#eee;--paper:#141414;--edge:#eee;--dim:#999;--tie:#2a2612;--ok:#12301a;--warn:#33161a}}
 *{box-sizing:border-box} body{margin:0;padding:1rem;font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink);background:var(--paper)}
 header{position:sticky;top:0;background:var(--paper);border-bottom:2px solid var(--edge);padding:.5rem 0;margin-bottom:1rem;z-index:2}
 .card{border:2px solid var(--edge);padding:.75rem;margin-bottom:1rem}
 .card.done{background:var(--ok)}
 h2{margin:0 0 .5rem;font-size:1rem}
 .meta{color:var(--dim)}
 table{border-collapse:collapse;width:100%;margin:.5rem 0;font-size:12px}
 td,th{border-bottom:1px solid var(--dim);padding:.15rem .4rem;text-align:left;vertical-align:top}
 th{color:var(--dim);font-weight:normal}
 tr.tied{background:var(--tie)}
 tr.pick{outline:2px solid var(--edge)}
 td.d{cursor:pointer} td.d:hover{text-decoration:underline}
 td.n{text-align:right;color:var(--dim);white-space:nowrap}
 button{font:inherit;border:2px solid var(--edge);background:var(--paper);color:var(--ink);padding:.2rem .6rem;cursor:pointer}
 button[aria-pressed=true]{background:var(--ink);color:var(--paper)}
 input[type=text]{font:inherit;width:100%;padding:.3rem;border:2px solid var(--edge);background:var(--paper);color:var(--ink)}
 .ro{opacity:.75} .row{display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;margin:.4rem 0}
 .lead{background:var(--warn);padding:.2rem .4rem}
</style></head><body>
<header><strong>#143 gold set</strong> — <span id="count"></span> ratified.
Click a row to designate it <em>should lead</em>. Every change saves immediately.</header>
<main id="app"></main>
<script>
const VERDICTS=${JSON.stringify(VERDICTS)};
let data=null;
const esc=(s)=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function save(head,patch){
  const r=await fetch("/verdict",{method:"PUT",headers:{"content-type":"application/json"},
    body:JSON.stringify({head,...patch})});
  const j=await r.json();
  if(!j.ok){alert(j.error);return}
  document.getElementById("count").textContent=j.ratified_count+" of "+data.cases.length;
}
function card(c){
  const r=c.ranked;
  const rows=r.rows.map(x=>
    '<tr class="'+(x.tied?"tied ":"")+(x.description===c.should_lead?"pick":"")+'">'+
    '<td class="d" data-head="'+esc(c.head)+'" data-d="'+esc(x.description)+'">'+esc(x.description)+'</td>'+
    '<td class="n">'+x.tier+'</td><td class="n">'+x.raw+'</td><td class="n">'+x.head+'</td>'+
    '<td class="n">'+x.position+'</td><td class="n">'+x.simplicity+'</td></tr>').join("");
  return '<section class="card'+(c.ratified?" done":"")+'" id="c-'+esc(c.head)+'">'+
    '<h2>'+esc(c.head)+' <span class="meta">— '+r.total+' hits, '+r.tiedAtTop+' tied at top'+
    (c.shapes.length?" ["+c.shapes.join("+")+"]":"")+'</span></h2>'+
    '<div class="meta">leads today: <span class="lead">'+esc(c.lead_today)+'</span></div>'+
    '<table><thead><tr><th>row</th><th>tier</th><th>raw</th><th>head</th><th>pos</th><th>simp</th></tr></thead>'+
    '<tbody>'+rows+'</tbody></table>'+
    '<div class="row">'+VERDICTS.map(v=>'<button data-v="'+v+'" data-head="'+esc(c.head)+'" aria-pressed="'+
      (c.verdict===v)+'">'+v+'</button>').join("")+'</div>'+
    '<div class="row"><span class="meta">should lead:</span> '+
      (c.should_lead?esc(c.should_lead):'<em class="meta">none</em>')+'</div>'+
    '<div class="row"><input type="text" data-note="'+esc(c.head)+'" value="'+esc(c.note||"")+'" placeholder="note"></div>'+
    '<div class="row"><button data-r="'+esc(c.head)+'" aria-pressed="'+(!!c.ratified)+'">ratified</button></div>'+
    '</section>';
}
function render(){
  document.getElementById("count").textContent=data.cases.filter(c=>c.ratified).length+" of "+data.cases.length;
  document.getElementById("app").innerHTML=data.cases.map(card).join("")+
    '<section class="card ro"><h2>Unreached cases</h2><div class="meta">'+
    'The 135 tie queries no candidate shape reaches are routed in §9 of the research note '+
    '(filter escapes to #144, category and ethnic-designated heads to #134, varietal peers to a written verdict). '+
    'They are not adjudicated here on purpose: §8.3 keeps ratification to one sitting.</div></section>';
}
document.addEventListener("click",async(e)=>{
  const t=e.target;
  if(t.dataset.v){const c=data.cases.find(x=>x.head===t.dataset.head);c.verdict=t.dataset.v;await save(c.head,{verdict:c.verdict});render()}
  else if(t.dataset.r){const c=data.cases.find(x=>x.head===t.dataset.r);c.ratified=!c.ratified;await save(c.head,{ratified:c.ratified});render()}
  else if(t.dataset.d){const c=data.cases.find(x=>x.head===t.dataset.head);
    c.should_lead=(c.should_lead===t.dataset.d)?null:t.dataset.d;await save(c.head,{should_lead:c.should_lead});render()}
});
document.addEventListener("change",async(e)=>{
  if(e.target.dataset.note){const c=data.cases.find(x=>x.head===e.target.dataset.note);
    c.note=e.target.value||null;await save(c.head,{note:c.note})}
});
fetch("/data").then(r=>r.json()).then(j=>{data=j;render()});
</script></body></html>`;

const port = Number(
  process.argv.includes("--port")
    ? process.argv[process.argv.indexOf("--port") + 1]
    : DEFAULT_PORT
);

createServer((req, res) => {
  const send = (code, type, body) =>
    res.writeHead(code, { "content-type": type }).end(body);
  if (req.method === "GET" && req.url === "/")
    return send(200, "text/html; charset=utf-8", PAGE);
  if (req.method === "GET" && req.url === "/data") {
    const gold = readGold();
    gold.cases = gold.cases.map((c) => ({ ...c, ranked: ranked(c.head) }));
    return send(200, "application/json", JSON.stringify(gold));
  }
  if (req.method === "PUT" && req.url === "/verdict") {
    let body = "";
    req.on("data", (d) => (body += d));
    return req.on("end", () => {
      try {
        send(
          200,
          "application/json",
          JSON.stringify(saveVerdict(JSON.parse(body)))
        );
      } catch (err) {
        send(
          400,
          "application/json",
          JSON.stringify({ ok: false, error: String(err) })
        );
      }
    });
  }
  send(404, "text/plain", "not found");
}).listen(port, () => {
  console.log(`#143 gold set — ratify at http://localhost:${port}`);
  console.log(`writing to ${GOLD}`);
});
