#!/usr/bin/env python3
import json, sys, re
def pct(xs,p):
    xs=sorted(x for x in xs if x is not None)
    if not xs: return None
    h=(len(xs)-1)*p/100.0; lo=int(h); hi=min(lo+1,len(xs)-1)
    return round(xs[lo]+(h-lo)*(xs[hi]-xs[lo]),1)
# A retried run can leave more than one payload in the file; the LAST complete one is the run.
cands=[]
for ln in open(sys.argv[1]):
    if ln.startswith("[rt] "):
        try: cands.append(json.loads(ln[5:]))
        except Exception: pass
assert cands, "no parseable [rt] payload"
if len(cands) > 1: print(f"NOTE: {len(cands)} payloads in file; reporting the last")
d=cands[-1]
print("sha", d["sha"][:8], "siteLocation:", d["siteLocationIdPresent"])
by={}
for s in d["samples"]:
    if s.get("skipped"): by.setdefault(s["key"],[]).append(s); continue
    by.setdefault(s["key"],[]).append(s)
print()
print(f"{'route':<18}{'n':>3}{'status':>7}{'bytes':>8}{'ttfb':>7}{'srvTot':>8}{'RESID':>7}{'dl':>6}{'reuse':>7} proto  region")
for k,v in by.items():
    ok=[s for s in v if not s.get("skipped") and s.get("rt")]
    if not ok:
        print(f"  {k:<16} SKIPPED: {v[0].get('skipped')}"); continue
    def ttfb(s): return s["rt"]["responseStart"]-s["rt"]["requestStart"]
    def dl(s):   return s["rt"]["responseEnd"]-s["rt"]["responseStart"]
    def res(s):  return None if s.get("serverTotal") is None else round(ttfb(s)-s["serverTotal"],1)
    reuse=sum(1 for s in ok if s["rt"]["reused"])
    reg=(ok[0].get("vercelId") or "").split("::")[:2]
    print(f"  {k:<16}{len(ok):>3}{ok[0]['status']:>7}{pct([s['bytes'] for s in ok],50):>8}"
          f"{pct([ttfb(s) for s in ok],50):>7}{str(pct([s['serverTotal'] for s in ok],50)):>8}"
          f"{str(pct([res(s) for s in ok],50)):>7}{pct([dl(s) for s in ok],50):>6}{reuse}/{len(ok):<5}"
          f" {ok[0]['rt']['protocol']}  {'::'.join(reg)}")
print()
print("PER-ROUTE DETAIL (all samples, ms)")
for k,v in by.items():
    ok=[s for s in v if not s.get("skipped") and s.get("rt")]
    if not ok: continue
    print(f"  {k}")
    for s in ok:
        e=s["rt"]
        t=e["responseStart"]-e["requestStart"]
        r=None if s.get("serverTotal") is None else round(t-s["serverTotal"],1)
        print(f"    r{s['round']} ttfb={t:>7.1f} srv={str(s.get('serverTotal')):>7} resid={str(r):>7} "
              f"dl={e['responseEnd']-e['responseStart']:>6.1f} bytes={s['bytes']:>7} reused={e['reused']} "
              f"conn={e['connectEnd']-e['connectStart']:>5.1f} tls={e['secureConnectionStart']} cache={s.get('vercelCache')}")
