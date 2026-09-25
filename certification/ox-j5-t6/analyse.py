#!/usr/bin/env python3
"""OX J5 — convergence + tail forensics. Percentiles, per-sample disagreement, bounded cause."""
import json, sys

def pct(xs, p):
    xs = sorted(x for x in xs if x is not None)
    if not xs: return None
    if len(xs) == 1: return float(xs[0])
    h = (len(xs) - 1) * (p / 100.0); lo = int(h); hi = min(lo + 1, len(xs) - 1)
    return round(xs[lo] + (h - lo) * (xs[hi] - xs[lo]))

rows = []
skipped = 0
for ln in open(sys.argv[1]):
    if not ln.startswith("[t6] "): continue
    try:
        rows.append(json.loads(ln[5:]))
    except Exception:
        # A run still in flight leaves its last line half-written. Counted, never guessed at.
        skipped += 1
if skipped:
    print(f"NOTE: {skipped} unparseable line(s) skipped (a run still writing leaves a partial last line)")

valid = [r for r in rows if r.get("validSwitch")]
print(f"samples={len(rows)} valid={len(valid)} sha={ (valid[0].get('sha') if valid else None) } perLoad={ (valid[0].get('perLoad') if valid else None) }")
shas = sorted({r.get("sha") for r in valid})
print(f"served SHAs across the population: {shas}  (a mixed build invalidates the run)")
print(f"mixed-subject frames total: {sum(r.get('mixedFrames') or 0 for r in valid)}")
inst = [bool(r.get("canonicalInstrumentPresent")) for r in valid]
print(f"canonical instrument present on: {sum(inst)}/{len(inst)} samples  (false => the served build predates it)")
srv = [ (r.get("stream") or [{}])[0].get("serverDurationMs") for r in valid ]
srv = [x for x in srv if isinstance(x,(int,float))]
if srv: print(f"server __server_duration_ms: n={len(srv)} P50={pct(srv,50)} P95={pct(srv,95)} max={max(srv)}")

M = ["T4_snapshot","T5_action_enabled","T5_executable","T6_semantics","T6_carrier","T6_cardsubject","T6_canonical","T6_all_cells"]
print("\nmilestone            n   P50   P90   P95   max")
for k in M:
    xs = [r["milestones"].get(k) for r in valid if r.get("milestones")]
    xs = [x for x in xs if x is not None]
    print(f"  {k:<18} {len(xs):>3} {str(pct(xs,50)):>5} {str(pct(xs,90)):>5} {str(pct(xs,95)):>5} {str(max(xs) if xs else None):>6}")

print("\nCONFIGURED CELL KEYS (observed per sample):")
from collections import Counter
c = Counter(tuple(r.get("configuredKeys") or []) for r in valid)
for k, n in c.most_common(): print(f"  n={n}  {list(k)}")

print("\nPER-SAMPLE MILESTONE DISAGREEMENT (canonical - carrier, canonical - semantics):")
for r in valid:
    m = r.get("milestones") or {}
    a, b, cc = m.get("T6_carrier"), m.get("T6_semantics"), m.get("T6_canonical")
    print(f"  run={r['run']:>2} carrier={str(a):>6} sem={str(b):>6} canon={str(cc):>6} "
          f"d(canon-carrier)={str(None if (cc is None or a is None) else cc-a):>6} "
          f"d(canon-sem)={str(None if (cc is None or b is None) else cc-b):>6} sawReserved={r.get('sawReserved')}")

print("\nEND STATE — a required first-order key that never mounted is the interesting case:")
FO = ["current_work","business_process","household","children","readiness_kpi"]
for r in valid:
    e = r.get("endState") or {}
    conf = set(r.get("configuredKeys") or [])
    req = [k for k in FO if k in conf]
    unmet = [k for k in req if k not in set(e.get("mountedB") or [])]
    if unmet or e.get("nRes"): print(f"  run={r['run']:>2} unmetFirstOrder={unmet} nRes={e.get('nRes')} nNA={e.get('nNA')} reasons={e.get('reasons')}")

print("\nCLIENT SUPPORT (Part 6) — one line, from the population:")
sups = {json.dumps(r.get("sup"), sort_keys=True) for r in valid}
for s in sups: print("  " + s)

def clas(r, t6):
    m = r.get("milestones") or {}
    st = (r.get("stream") or [])
    lt = r.get("longtask") or {}
    nav = r.get("nav") or {}
    first = st[0] if st else None
    causes = []
    if first:
        if first.get("startedAt", 0) > 250: causes.append(("RESOURCE_SCHEDULING", f"fetch issued {first['startedAt']}ms after click"))
        if first.get("headersAt") is not None and first["headersAt"] > 0.5 * t6 and first["headersAt"] > 600:
            causes.append(("FIRST_BYTE_DELAY", f"headers at {first['headersAt']}ms of T6 {t6}ms"))
        lines = first.get("lines") or []
        if lines and first.get("headersAt") is not None:
            last = lines[-1]["rel"]
            if last - first["headersAt"] > 0.4 * t6 and last - first["headersAt"] > 400:
                causes.append(("STREAM_PHASE_DELAY", f"lines span {first['headersAt']}->{last}ms"))
        ph = first.get("phases") or {}
        tot = ph.get("total_ms")
        if isinstance(tot, (int, float)) and tot > 900: causes.append(("SERVER_REST_OUTLIER", f"server total_ms={tot}"))
    else:
        causes.append(("OTHER_MEASURED", "no phased drawer request observed for this click"))
    if (lt.get("maxMs") or 0) > 250: causes.append(("MAIN_THREAD_LONG_TASK", f"max longtask {lt.get('maxMs')}ms, total {lt.get('totalMs')}ms"))
    if nav and nav.get("loadEnd") and nav.get("clickSinceNav") and nav["loadEnd"] > nav["clickSinceNav"]:
        causes.append(("PAGE_INITIALIZATION_CONTENTION", f"loadEventEnd {nav['loadEnd']} > click {nav['clickSinceNav']}"))
    return causes or [("UNKNOWN", "no measured boundary exceeded a threshold")]

print("\nOVER-TARGET SAMPLES (canonical T6 > 1500ms or T5_executable > 1250ms):")
over = []
for r in valid:
    m = r.get("milestones") or {}
    t6 = m.get("T6_canonical") or m.get("T6_carrier")
    t5 = m.get("T5_executable")
    if (t6 and t6 > 1500) or (t5 and t5 > 1250):
        over.append(r)
        cs = clas(r, t6 or 0)
        st = (r.get("stream") or [{}])[0]
        print(f"\n  run={r['run']} T5_exec={t5} T6_canon={m.get('T6_canonical')} T6_carrier={m.get('T6_carrier')} T6_sem={m.get('T6_semantics')} T4={m.get('T4_snapshot')}")
        print(f"    stream: started={st.get('startedAt')} headers={st.get('headersAt')} done={st.get('doneAt')} lines={[(l['rel'], l['keys']) for l in (st.get('lines') or [])]}")
        print(f"    serverPhases: {json.dumps(st.get('phases'))}")
        print(f"    longtask: {json.dumps({k:v for k,v in (r.get('longtask') or {}).items() if k!='entries'})} entries={(r.get('longtask') or {}).get('entries')}")
        print(f"    nav: {json.dumps(r.get('nav'))}")
        print(f"    requests: {json.dumps((r.get('requests') or [])[:6])}")
        print(f"    CAUSES: {cs}")
print(f"\nover-target count = {len(over)} / {len(valid)}")

print("\nT5/T6 TAIL CORRELATION:")
both = [(r['run'], (r['milestones'] or {}).get('T5_executable'), (r['milestones'] or {}).get('T6_canonical')) for r in valid]
hi5 = {x[0] for x in both if x[1] and x[1] > 1250}
hi6 = {x[0] for x in both if x[2] and x[2] > 1500}
print(f"  T5 over-target runs: {sorted(hi5)}")
print(f"  T6 over-target runs: {sorted(hi6)}")
print(f"  intersection: {sorted(hi5 & hi6)}  (same samples => one owner)")

print("\nSERVER PHASES across ALL samples (P50/P95 of total_ms):")
tots = []
for r in valid:
    st = (r.get("stream") or [{}])[0]
    ph = st.get("phases") or {}
    if isinstance(ph.get("total_ms"), (int,float)): tots.append(ph["total_ms"])
print(f"  n={len(tots)} P50={pct(tots,50)} P95={pct(tots,95)} max={max(tots) if tots else None}")

print("\nLONGTASK across ALL samples:")
lts = [(r['run'], (r.get('longtask') or {}).get('count'), (r.get('longtask') or {}).get('totalMs'), (r.get('longtask') or {}).get('maxMs')) for r in valid]
print(f"  maxMs P50={pct([x[3] for x in lts],50)} P95={pct([x[3] for x in lts],95)} max={max([x[3] or 0 for x in lts]) if lts else None}")
