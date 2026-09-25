#!/usr/bin/env python3
"""Turn the mounted sample into the tables sections 5-8 ask for.

Two rules, enforced here rather than remembered:
  - parallel branches are never summed; the list waits on max()
  - a phase's cost is read from COMPLETION OFFSETS, so overlapping work is not
    reported as serial merely because its durations overlap
"""
import json, sys, statistics as st
from collections import defaultdict

path = sys.argv[1] if len(sys.argv) > 1 else "certification/financials/accounts-shell/mounted-sample.json"
data = json.load(open(path))

def p50(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return round(st.median(xs), 1) if xs else None

def table(title, rows, cols):
    print(f"\n{title}")
    w = [max(len(str(r[i])) for r in [cols] + rows) for i in range(len(cols))]
    print("  " + "  ".join(str(c).ljust(w[i]) for i, c in enumerate(cols)))
    print("  " + "  ".join("-" * w[i] for i in range(len(cols))))
    for r in rows:
        print("  " + "  ".join(str(c).ljust(w[i]) for i, c in enumerate(r)))

for kind in ("cold", "warm"):
    S = [d for d in data if d["kind"] == kind]
    if not S:
        continue
    print(f"\n{'='*78}\n{kind.upper()}  n={len(S)}\n{'='*78}")

    ms = ["acknowledgement", "geometry", "listVisible", "listInteractive", "selectedAccount", "settled"]
    table("CLIENT MILESTONES (ms from click)",
          [[m, p50(d[m] for d in S), min((d[m] for d in S if d[m] is not None), default=None),
            max((d[m] for d in S if d[m] is not None), default=None)] for m in ms],
          ["milestone", "P50", "min", "max"])

    # per-route phase offsets
    for route in ("/api/admin/financials/subjects", "/api/admin/financials/position"):
        offs, dels, tot = defaultdict(list), defaultdict(list), []
        for d in S:
            for r in d["routes"]:
                if r["url"] != route:
                    continue
                tot.append(r["ms"])
                for k, v in r["offsets"].items():
                    offs[k].append(v)
                for k, v in r["phases"].items():
                    dels[k].append(v)
        if not offs:
            print(f"\n{route}: NOT OBSERVED")
            continue
        order = sorted(offs, key=lambda k: p50(offs[k]) or 0)
        rows = []
        prev = 0.0
        for k in order:
            o = p50(offs[k])
            rows.append([k, o, p50(dels.get(k, [])), round((o or 0) - prev, 1)])
            prev = o or prev
        table(f"{route}  (wire P50 {p50(tot)}ms, n={len(tot)})", rows,
              ["phase", "offset P50", "delta P50", "gap from prev"])

    # slower branch + critical path
    slower = defaultdict(int)
    both = []
    for d in S:
        by = {r["url"]: r["ms"] for r in d["routes"]}
        s, p = by.get("/api/admin/financials/subjects"), by.get("/api/admin/financials/position")
        if s is None or p is None:
            continue
        both.append((s, p, d.get("listInteractive")))
        slower["subjects" if s > p else "position"] += 1
    if both:
        print(f"\nSLOWER BRANCH: {dict(slower)}   (of {len(both)} openings where both were seen)")
        print(f"  subjects P50 {p50(x[0] for x in both)}ms   position P50 {p50(x[1] for x in both)}ms")
        print(f"  max(branch) P50 {p50(max(x[0], x[1]) for x in both)}ms  <- the list's data wait; NEVER the sum")
        print(f"  click -> interactive P50 {p50(x[2] for x in both)}ms")
        gate = p50(max(x[0], x[1]) for x in both)
        inter = p50(x[2] for x in both)
        if gate and inter:
            print(f"  data wait is {100*gate/inter:.0f}% of click -> interactive; the remaining {inter-gate:.0f}ms is client/host")

    # WHERE click -> interactive ACTUALLY GOES: mount, data, render
    seg = []
    for d in S:
        rs = [r for r in d["routes"] if r["url"].endswith(("/subjects", "/position"))]
        if not rs or d.get("listInteractive") is None:
            continue
        if not all("startedAt" in r for r in rs):
            continue
        first_start = min(r["startedAt"] for r in rs)
        last_end = max(r["endedAt"] for r in rs)
        seg.append((first_start, last_end - first_start, d["listInteractive"] - last_end, d["listInteractive"]))
    if seg:
        table("CLICK -> INTERACTIVE, DECOMPOSED (P50 ms)",
              [["click -> first request starts", p50(x[0] for x in seg), "client: tab mount + effects"],
               ["data wait (max of both branches)", p50(x[1] for x in seg), "server + network"],
               ["last response -> interactive", p50(x[2] for x in seg), "client: join + render"],
               ["TOTAL", p50(x[3] for x in seg), ""]],
              ["segment", "P50", "owned by"])
        m, dw, rd = p50(x[0] for x in seg), p50(x[1] for x in seg), p50(x[2] for x in seg)
        tot = p50(x[3] for x in seg)
        if tot:
            biggest = max([("client mount", m), ("data", dw), ("client render", rd)], key=lambda x: x[1] or 0)
            print(f"  LARGEST SEGMENT: {biggest[0]} at {biggest[1]:.0f}ms ({100*(biggest[1] or 0)/tot:.0f}% of click -> interactive)")
            if biggest[0] != "data":
                print("  *** The cohort branches are NOT the pole. A cohort repair cannot reach this. ***")

    # per-route start/end offsets
    rows = []
    for route in ("/api/admin/financials/subjects", "/api/admin/financials/position"):
        starts = [r["startedAt"] for d in S for r in d["routes"] if r["url"] == route and "startedAt" in r]
        ends = [r["endedAt"] for d in S for r in d["routes"] if r["url"] == route and "endedAt" in r]
        if starts:
            rows.append([route.rsplit("/", 1)[-1], p50(starts), p50(ends), p50([e - b for b, e in zip(starts, ends)])])
    if rows:
        table("ROUTE TIMELINE (ms from click)", rows, ["route", "starts P50", "ends P50", "wire P50"])

    # placement-chain classification, against the branch it lives on
    subj = defaultdict(list)
    for d in S:
        for r in d["routes"]:
            if r["url"].endswith("/subjects"):
                for k, v in r["offsets"].items():
                    subj[k].append(v)
    if subj:
        def off(name):
            for k in subj:
                if k == name or k.startswith(name):
                    return p50(subj[k])
            return None
        households = off("households") or 0
        end_all = max((p50(v) for v in subj.values()), default=None)   # serialize / assemble
        parallel = (end_all or 0) - households                          # the whole concurrent region

        """
        THE CHAIN'S OWN SPAN, NOT THE WINDOW IT SITS IN.

        The sites branch and the facet chain run CONCURRENTLY after the households land, so the
        window households->pl_rooms contains both and over-attributes to whichever finishes last.
        The chain's own cost is measured from the read it waits on (members) to its last wave, and
        what matters for the list is how far past its sibling branch it reaches: if the site branch
        finishes later, shortening the chain moves nothing at all.
        """
        chain_start = off("members")
        chain_end = off("pl_rooms") or off("pl_programs") or off("pl_instances")
        sites_end = off("agreement_sites") or off("sites_members")

        if chain_start is not None and chain_end is not None:
            chain = chain_end - chain_start
            print(f"\n{'-'*70}\nPLACEMENT CHAIN")
            print(f"  members@{chain_start:.0f} -> last wave@{chain_end:.0f}  = {chain:.0f}ms of its own")
            print(f"  concurrent region (households@{households:.0f} -> end@{end_all:.0f}) = {parallel:.0f}ms")
            if sites_end is not None:
                overhang = chain_end - sites_end
                print(f"  sibling site branch ends @{sites_end:.0f}; chain overhang = {overhang:+.0f}ms")
                print("    (overhang is the ONLY part removing the chain could recover)")
                recoverable = max(0.0, overhang)
            else:
                recoverable = chain
            share = 100 * recoverable / parallel if parallel else 0
            cls = ("DOMINANT" if share >= 50 else "MATERIAL CONTRIBUTOR" if share >= 20
                   else "MINOR" if share >= 5 else "NOT MATERIAL")
            print(f"  recoverable {recoverable:.0f}ms = {share:.0f}% of the concurrent region -> {cls}")
            if slower and max(slower, key=slower.get) != "subjects":
                print("  NOTE: subjects is NOT the slower branch, so repairing this alone cannot move the list.")
