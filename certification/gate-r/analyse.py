#!/usr/bin/env python3
import json, sys
from collections import Counter
def loads(f):
    t=open(f).read(); dec=json.JSONDecoder(); P=[]; i=0
    while True:
        i=t.find('[GR] ', i)
        if i<0: break
        try: P.append(dec.raw_decode(t[i+5:])[0])
        except Exception: pass
        i+=5
    return P
def pct(xs,q):
    xs=sorted(x for x in xs if x is not None)
    if not xs: return None
    h=(len(xs)-1)*q/100.0; lo=int(h); hi=min(lo+1,len(xs)-1)
    return round(xs[lo]+(h-lo)*(xs[hi]-xs[lo]))
P=[p for p in loads(sys.argv[1]) if p.get('mode')=='session']
opens=[o for p in P for o in p.get('opens',[])]
events=[e for p in P for e in p.get('events',[])]
acts=sum(p.get('actions',0) for p in P)
cd=sum(p.get('contextDestroyed',0) for p in P)
shas={p.get('servedSha') for p in P} | {p.get('endSha') for p in P}
print(f"batches={len(P)}  total actions={acts}  work-unit opens={len(opens)}  contextDestroyed={cd}")
print(f"served SHA(s): {sorted(s for s in shas if s)}")
print()
print(f"{'milestone':<34}{'n':>4}{'P50':>7}{'P95':>8}{'max':>8}")
for k,nm in [('T4','T4 work-unit identity-safe'),('T6','T6 first actionable'),('T7','T7 all first order')]:
    xs=[o.get(k) for o in opens]; v=[x for x in xs if x is not None]
    print(f"  {nm:<32}{len(v):>4}{str(pct(xs,50)):>7}{str(pct(xs,95)):>8}{str(max(v) if v else None):>8}")
print()
units=Counter(o.get('href','?').split('/')[-1] for o in opens)
print("work unit types opened:", dict(units))
print()
SLOW=3000
slow=[o for o in opens if (o.get('T7') or 0) > SLOW or o.get('T7') is None]
print(f"MATERIALLY SLOW OPENS (T7 > {SLOW}ms or never reached): {len(slow)} of {len(opens)}")
for o in slow:
    print(f"  {o.get('href')}  T4={o.get('T4')} T6={o.get('T6')} T7={o.get('T7')} rows={o.get('rows')} subject={o.get('subject')}")
print()
print(f"NOTABLE EVENTS: {len(events)}")
kinds=Counter()
for e in events:
    for k in ('FULL_DOCUMENT_NAVIGATION','AUTH_REDIRECT','DEPLOYMENT_VERSION_TRANSITION','ERROR','REJECTION'):
        if e.get(k): kinds[k]+=1
    if e.get('wuRemounts'): kinds['wuRemount']+=e['wuRemounts']
print("  ", dict(kinds) if kinds else "none")
probe_hard=[e for e in events if 'PROBE_HARD_NAV' in str(e.get('label',''))]
prod_full=[e for e in events if e.get('FULL_DOCUMENT_NAVIGATION') and 'PROBE_HARD_NAV' not in str(e.get('label',''))]
print(f"  full-document navs attributable to the PROBE: {len(probe_hard)}")
print(f"  full-document navs NOT attributable to the probe (candidate product resets): {len(prod_full)}")
for e in prod_full[:8]: print("    ", json.dumps(e)[:200])
