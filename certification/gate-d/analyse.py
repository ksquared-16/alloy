#!/usr/bin/env python3
import json, sys
def pct(xs,p):
    xs=sorted(x for x in xs if x is not None)
    if not xs: return None
    h=(len(xs)-1)*p/100.0; lo=int(h); hi=min(lo+1,len(xs)-1)
    return round(xs[lo]+(h-lo)*(xs[hi]-xs[lo]))
txt=open(sys.argv[1]).read()
dec=json.JSONDecoder(); payloads=[]; i=0
while True:
    i=txt.find('[GATED] ', i)
    if i<0: break
    try: payloads.append(dec.raw_decode(txt[i+8:])[0])
    except Exception: pass
    i+=8
samples=[s for p in payloads for s in p.get('samples',[]) if not s.get('skipped')]
shas={p.get('sha') for p in payloads}
print(f"batches={len(payloads)}  samples={len(samples)}  sha={[str(s)[:8] for s in shas]}  accounts={payloads[0].get('accountCount') if payloads else None}")
warm=[s for s in samples if s.get('warm')]; cold=[s for s in samples if not s.get('warm')]
print(f"warm={len(warm)} cold={len(cold)}")
print()
print(f"{'milestone':<28}{'n':>4}{'P50':>7}{'P95':>8}{'max':>8}")
for k,label in [('T2','T2 row acknowledged'),('T3','T3 detail names account'),('T6','T6 usable Details floor')]:
    xs=[s.get(k) for s in samples]
    print(f"  {label:<26}{len([x for x in xs if x is not None]):>4}{str(pct(xs,50)):>7}{str(pct(xs,95)):>8}{str(max([x for x in xs if x is not None], default=None)):>8}")
print()
for grp,name in [(cold,'COLD (first visit)'),(warm,'WARM (revisit)')]:
    if not grp: continue
    xs=[s.get('T6') for s in grp]
    print(f"  {name:<22} n={len(grp):<3} T6 P50={pct(xs,50)} P95={pct(xs,95)} max={max([x for x in xs if x is not None], default=None)}")
print()
print("CORRECTNESS")
print("  wrong account in detail        :", sum(1 for s in samples if not s.get('CORRECT_ACCOUNT')))
print("  hydrated PREVIOUS account frames:", sum(s.get('staleHydratedFrames') or 0 for s in samples))
print("  samples with any stale frame    :", sum(1 for s in samples if (s.get('staleHydratedFrames') or 0)>0))
print("  return_to_visited correct       :", sum(1 for s in samples if s.get('kind')=='return_to_visited' and s.get('CORRECT_ACCOUNT')), "/", sum(1 for s in samples if s.get('kind')=='return_to_visited'))
print("  rapid_after_B correct           :", sum(1 for s in samples if s.get('kind')=='rapid_after_B' and s.get('CORRECT_ACCOUNT')), "/", sum(1 for s in samples if s.get('kind')=='rapid_after_B'))
print()
THRESH=1500
slow=[s for s in samples if (s.get('T6') or 0) > THRESH or s.get('T6') is None]
print(f"MATERIAL MISSES (T6 > {THRESH}ms or never reached): {len(slow)} of {len(samples)}")
for s in slow:
    print(f"  id={s['id'][:8]} kind={s.get('kind')} warm={s.get('warm')} T2={s.get('T2')} T3={s.get('T3')} T6={s.get('T6')} reqs={s.get('requestCount')} correct={s.get('CORRECT_ACCOUNT')}")
    for r in (s.get('requests') or [])[:5]: print(f"      {r['kind']:<26} rel={r['rel']:>5} dur={r['dur']:>5} {r['path']}")
