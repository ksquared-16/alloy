#!/usr/bin/env python3
import json, sys
from collections import Counter
def loads(f):
    try: t=open(f).read()
    except Exception: return []
    dec=json.JSONDecoder(); P=[]; i=0
    while True:
        i=t.find('[SB] ', i)
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
S=sys.argv[1]
for mode,label in [('hover','PRIMARY — natural hover + click'),('nohover','CONTROL — click, no hover')]:
    P=[p for p in loads(f"{S}/sb-{mode}.txt") if not p.get('skipped')]
    sm=[s for p in P for s in p.get('samples',[]) if not s.get('skipped')]
    if not sm: print(f"=== {label}: no samples ==="); continue
    print(f"=== {label}  n={len(sm)} (batches={len(P)}, rows={P[0].get('rows')}) ===")
    for k,nm,t50,t95 in [('T3','row acknowledged',None,None),('T4','safe frame (subject=B)',None,None),
                         ('T5','FIRST ACTIONABLE',750,1250),('T6','ALL FIRST ORDER',1000,1500)]:
        xs=[s.get(k) for s in sm]; v=[x for x in xs if x is not None]
        verdict=''
        if t50: verdict = '  PASS' if (pct(xs,50)<t50 and pct(xs,95)<t95) else '  FAIL'
        print(f"  {nm:<24} n={len(v):>3} P50={str(pct(xs,50)):>6} P95={str(pct(xs,95)):>6} max={str(max(v) if v else None):>6}{verdict}")
    print(f"  wrong subject committed : {sum(1 for s in sm if not s.get('CORRECT'))}")
    print(f"  mixed-subject frames    : {sum(s.get('mixedFrames') or 0 for s in sm)}")
    print(f"  T6 never reached        : {sum(1 for s in sm if s.get('T6') is None)}")
    w=[s for s in sm if (s.get('warmCount') or 0)>0]
    print(f"  switches with a warm    : {len(w)}/{len(sm)}   in-flight at click: {sum(1 for s in sm if (s.get('warmInFlightAtClick') or 0)>0)}")
    print(f"  warm route reissued     : {sum(s.get('reissued') or 0 for s in sm)}")
    ret=[s for s in sm if s.get('returning')]; fresh=[s for s in sm if not s.get('returning')]
    print(f"  return-to-row  n={len(ret)} T6 P50={pct([s.get('T6') for s in ret],50)}   first-visit n={len(fresh)} T6 P50={pct([s.get('T6') for s in fresh],50)}")
    slow=[s for s in sm if (s.get('T6') or 10**9) > 1500]
    print(f"  MATERIAL MISSES (T6>1500ms): {len(slow)}")
    for s in slow:
        print(f"     T6={s.get('T6')} T5={s.get('T5')} slowestReqAfterClick={s.get('slowestAfterClick')} warm={s.get('warmCount')} inflight={s.get('warmInFlightAtClick')} reissued={s.get('reissued')}")
    print()
