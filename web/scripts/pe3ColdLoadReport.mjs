/**
 * PE-3 aggregation — median / range / %-of-total per phase, per cell.
 * Reads /tmp/pe3/*.json written by pe3ColdLoadHarness.mjs.
 */
import fs from "fs";

const files = fs.readdirSync("/tmp/pe3").filter((f) => /^(cold|warmproc|warm)-.*\.json$/.test(f));
const runs = files.map((f) => JSON.parse(fs.readFileSync("/tmp/pe3/" + f, "utf8")));

const cellOf = (r) => `${r.mode}/${r.variant}`;
const cells = [...new Set(runs.map(cellOf))].sort();

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2); };
const rng = (a) => `${Math.min(...a)}–${Math.max(...a)}`;

// Phase boundaries, in request order. Each is [label, fn -> absolute ms from navigationStart].
const POINTS = [
  ["connect_end", (r) => r.nav.connectEnd],
  ["TTFB (responseStart)", (r) => r.nav.responseStart],
  ["html_responseEnd", (r) => r.nav.responseEnd],
  ["domInteractive", (r) => r.nav.domInteractive],
  ["runtime_root", (r) => mk(r, "runtime_root")],
  ["focus_panel_shell", (r) => mk(r, "focus_panel_shell")],
  ["first_card_truthful", (r) => mk(r, "first_card_truthful")],
  ["all_published_cards", (r) => mk(r, "all_published_cards_present")],
];
const mk = (r, n) => r.milestones.find((m) => m.name === n)?.t ?? null;

for (const cell of cells) {
  const rs = runs.filter((r) => cellOf(r) === cell);
  console.log(`\n${"=".repeat(78)}\n${cell}   n=${rs.length}\n${"=".repeat(78)}`);

  const totals = rs.map((r) => mk(r, "all_published_cards_present") ?? r.nav.domComplete).filter(Boolean);
  const totalMed = totals.length ? med(totals) : 0;

  console.log(`${"milestone".padEnd(24)} ${"median".padStart(8)} ${"range".padStart(14)}  ${"%oftotal".padStart(9)}`);
  let prevMed = 0;
  for (const [label, fn] of POINTS) {
    const vals = rs.map(fn).filter((v) => v != null);
    if (!vals.length) { console.log(`${label.padEnd(24)} ${"—".padStart(8)}`); continue; }
    const m = med(vals);
    const deltaPct = totalMed ? (((m - prevMed) / totalMed) * 100).toFixed(1) : "-";
    console.log(`${label.padEnd(24)} ${String(m).padStart(8)} ${rng(vals).padStart(14)}  ${String(deltaPct + "%").padStart(9)}  (+${m - prevMed}ms since prev)`);
    prevMed = m;
  }

  // server-side split
  const st = rs.map((r) => r.serverTimings).filter(Boolean);
  if (st.length) {
    const k = (key) => med(st.map((s) => Math.round(s[key] ?? 0)));
    console.log(`\n  server compose (embedded ProvisioningTimings — presentation_ms/records_ms are RESIDUAL WAITS, do not sum):`);
    console.log(`    total_ms=${k("total_ms")}  work_unit=${k("work_unit_ms")}  configuration=${k("configuration_ms")}  composition=${k("composition_ms")}  presentation=${k("presentation_ms")}  records=${k("records_ms")}  projection=${k("projection_ms")}  authorization=${k("authorization_ms")}`);
  }
  const rt = rs.map((r) => r.routeTiming).filter(Boolean);
  if (rt.length) {
    const k = (key) => med(rt.map((s) => Math.round(s[key] ?? 0)));
    console.log(`  route spans: mw_to_layout=${k("mw_to_layout_ms")}  route_meta=${k("route_meta_ms")}  compose_wall=${k("compose_wall_ms")}  layout_total=${k("layout_total_ms")}  seeded=${rt[0].seeded}`);
  }
  const mw = rs.map((r) => r.mwAuthMs).filter((v) => v != null);
  if (mw.length) console.log(`  middleware getUser(): median ${med(mw)}ms  range ${rng(mw)}`);

  // unattributed TTFB
  if (st.length) {
    const ttfb = med(rs.map((r) => r.nav.responseStart));
    const compose = med(st.map((s) => Math.round(s.total_ms ?? 0)));
    console.log(`  >> TTFB ${ttfb}ms − compose ${compose}ms = ${ttfb - compose}ms NOT explained by ProvisioningTimings`);
  }

  // duplicates
  const dup = {};
  rs.forEach((r) => r.duplicates.forEach((d) => { dup[d.path] = Math.max(dup[d.path] ?? 0, d.count); }));
  if (Object.keys(dup).length) {
    console.log(`  duplicate requests (max seen): ` + Object.entries(dup).map(([p, c]) => `${c}× ${p.replace("/api/admin/", "")}`).join("  |  "));
  }

  // heaviest client requests
  const all = rs.flatMap((r) => r.api);
  const byPath = {};
  all.forEach((a) => { const k = a.path.split("?")[0].replace("/api/admin/", ""); (byPath[k] ??= []).push(a.dur); });
  const heavy = Object.entries(byPath).map(([p, ds]) => [p, med(ds), ds.length]).sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`  heaviest client requests (median dur):`);
  heavy.forEach(([p, d, n]) => console.log(`    ${String(d).padStart(6)}ms  ×${n}  ${p.slice(0, 70)}`));
}

// startup
const startups = fs.readdirSync("/tmp/pe3").filter((f) => f.startsWith("startup-"));
if (startups.length) {
  const v = startups.map((f) => JSON.parse(fs.readFileSync("/tmp/pe3/" + f, "utf8")).spawn_to_listen_ms);
  console.log(`\nserver spawn → port listening: median ${med(v)}ms  range ${rng(v)}  n=${v.length}`);
  console.log("(TCP-accept only — route modules are NOT loaded until the first HTTP request, so module load is inside TTFB.)");
}
