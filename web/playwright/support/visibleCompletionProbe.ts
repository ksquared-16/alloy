/**
 * THE VISIBLE-COMPLETION PROBE — one implementation, used twice.
 *
 * Playwright serializes this function and runs it in the page, so it must be entirely
 * self-contained: no imports, no closure over module scope. That constraint is also what makes it
 * TESTABLE — the same function runs under jsdom, where a unit test can build a DOM, mutate it and
 * assert what the probe concluded.
 *
 * That matters because this logic has already been wrong twice in ways a deployed sample caught only
 * by accident: attributing to the nearest BLOCKING ancestor made the shell own the whole page, and
 * memoizing containment in both directions pinned the shell as a leaf before its children existed.
 * Neither is reachable by reading the code; both are trivial to state as a test. A probe that lives
 * only inside an init script cannot be certified, so it moved out here rather than being copied.
 *
 * Everything it records is hung off `window` under `__p076*` for the harness to read back.
 */
export function installVisibleCompletionProbe(): void {
    const w = window as unknown as { __p076?: { t0: number; last: number; count: number } };
    w.__p076 = { t0: Date.now(), last: Date.now(), count: 0 };
    /*
     * PER-REGION ATTRIBUTION, not DOM-wide quiescence.
     *
     * Every visible region carries data-alloy-section-id from the canonical section registry, so
     * each mutation can be attributed to the region that owns it. DOM-wide quiescence answers
     * WHEN the page stopped changing; it cannot say WHICH visible region changed last, and the
     * communications finding showed that distinction decides the whole programme.
     *
     * Mutations outside any registered section are recorded as "__unattributed" rather than
     * dropped — if completion is being set by unattributed churn, that is the finding.
     */
    const R = (window as unknown as { __p076r?: Record<string, {first:number;last:number;count:number}> });
    R.__p076r = {};
    const attribute = (n: Node | null): string => {
        let el: Node | null = n;
        while (el && el.nodeType !== 1) el = el.parentNode;
        let cur = el as Element | null;
        while (cur) {
            const id = cur.getAttribute?.("data-alloy-section-id");
            if (id) return id;
            cur = cur.parentElement;
        }
        return "__unattributed";
    };
    /*
     * ── METRIC V2: WHAT KIND OF CHANGE WAS THAT? ──
     *
     * V1 answered "when did the DOM stop changing for N ms". That is not a property of the
     * product: the same page measured 4,697ms at N=3s and 7,155ms at N=8s. The number tracked
     * the window, because a surface that animates, prewarms and polls NEVER goes quiet — so the
     * answer was always "the last background twitch", whenever the observer happened to give up.
     *
     * V2 asks a question the page can actually answer: WHEN DID THE LAST CHANGE THAT AN OPERATOR
     * WOULD CALL "STILL LOADING" HAPPEN, INSIDE A REGION THAT BLOCKS THE SURFACE?
     *
     * Two independent narrowings, and both are needed:
     *
     *   1. BLOCKING, read from `data-alloy-section-blocking`, which alloySectionMap emits. The
     *      registry is the one place that says what blocks; this file does not keep a second
     *      list to drift against it. Communications proved why: it churns for seconds after the
     *      surface is usable, and it is not first-paint — counting it was the whole error.
     *
     *   2. AUTHORITATIVE, not presentational. A fade settling is not the surface still arriving.
     */
    type Kind = "AUTHORITATIVE_DATA" | "AUTHORITATIVE_STRUCTURE" | "PRESENTATIONAL_ANIMATION";
    const ANIMATION_ATTRS = new Set(["class", "style", "aria-busy", "aria-hidden"]);
    const classify = (r: MutationRecord): Kind => {
        if (r.type === "attributes") {
            const n = r.attributeName ?? "";
            // class/style/aria-busy carry the transitions, skeleton swaps and busy flags. They
            // change constantly and none of them means "data is still arriving".
            if (ANIMATION_ATTRS.has(n) || /^data-(motion|anim|transition|framer)/.test(n)) {
                return "PRESENTATIONAL_ANIMATION";
            }
            return "AUTHORITATIVE_DATA";
        }
        if (r.type === "characterData") return "AUTHORITATIVE_DATA";
        // childList: an element appearing or leaving is structure; text-only churn is data.
        const els = [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)]
            .filter((n) => n.nodeType === 1).length;
        return els > 0 ? "AUTHORITATIVE_STRUCTURE" : "AUTHORITATIVE_DATA";
    };

    /*
     * THE OWNING SECTION, AND WHY "NEAREST BLOCKING ANCESTOR" WAS THE WRONG QUESTION.
     *
     * First cut walked up to the nearest ancestor marked blocking. Measured against deployed
     * staging that produced V2 == V1 to the millisecond on both windows (9306/9306, 9086/9086),
     * with every sample blaming WU-00 — because WU-00 is the persistent OS shell, an ancestor of
     * the entire page. "Inside a blocking section" was true of every mutation on the surface, so
     * the narrowing narrowed nothing and V2 was V1 wearing a different name.
     *
     * A section that CONTAINS another registered section is a container, not a region that
     * paints. So attribute each mutation to its LEAF-MOST section and ignore containers: churn
     * whose closest owner is the shell is, by construction, outside every content region.
     *
     * Derived live from the DOM — no id is named here, so this cannot drift from the registry
     * and needs no second list of "things that do not count".
     */
    /*
     * Memoize only the POSITIVE. "Is a container" is time-varying in one direction: the shell
     * exists before the regions inside it do, so the first mutation on WU-00 sees no descendant
     * section and a two-sided cache pins it as a leaf for the rest of the run — which is exactly
     * what happened, and left WU-00 driving completion again after the rule was added.
     * Once a section has contained another, it never stops having done so.
     */
    const knownContainer = new WeakSet<Element>();
    const isContainer = (el: Element): boolean => {
        // DECLARED by the registry. The structural test below cannot see that the persistent shell
        // is a wrapper while it happens to contain no identified section — which is exactly the
        // state a coverage regression produces, and it handed the whole surface back to WU-00.
        if (el.getAttribute("data-alloy-section-container") === "true") return true;
        if (knownContainer.has(el)) return true;
        if (el.querySelector("[data-alloy-section-id]")) {
            knownContainer.add(el);
            return true;
        }
        return false;
    };
    const blockingHost = (n: Node | null): string | null => {
        let el: Node | null = n;
        while (el && el.nodeType !== 1) el = el.parentNode;
        let cur = el as Element | null;
        while (cur) {
            const id = cur.getAttribute?.("data-alloy-section-id");
            if (id) {
                // Leaf-most section owns it. A container owns nothing it does not paint itself.
                if (isContainer(cur)) return null;
                return cur.getAttribute("data-alloy-section-blocking") === "true" ? id : null;
            }
            cur = cur.parentElement;
        }
        return null;
    };

    const V2 = window as unknown as {
        __p076v2?: {
            lastBlockingAuthoritativeMs: number;
            perSection: Record<string, {
                firstMs: number;
                lastMs: number;
                lastVisibleMs: number;
                data: number;
                structure: number;
                anim: number;
                imageExpected: boolean;
                imageFinalMs: number;
            }>;
            kinds: Record<Kind, number>;
            blockingSeen: string[];
        };
    };
    V2.__p076v2 = {
        lastBlockingAuthoritativeMs: -1,
        perSection: {},
        kinds: { AUTHORITATIVE_DATA: 0, AUTHORITATIVE_STRUCTURE: 0, PRESENTATIONAL_ANIMATION: 0 },
        blockingSeen: [],
    };

    const mark = (recs?: MutationRecord[]) => {
        const now = Date.now();
        w.__p076!.last = now; w.__p076!.count++;
        for (const r of recs ?? []) {
            const key = attribute(r.target);
            const t = now - w.__p076!.t0;
            const e = R.__p076r![key] ?? { first: t, last: t, count: 0 };
            e.last = t; e.count++;
            R.__p076r![key] = e;

            // ── V2 ──
            const kind = classify(r);
            const v2 = V2.__p076v2!;
            v2.kinds[kind]++;
            const host = blockingHost(r.target);
            if (host) {
                if (!v2.blockingSeen.includes(host)) v2.blockingSeen.push(host);
                const ps = v2.perSection[host] ?? { lastMs: -1, data: 0, structure: 0, anim: 0 };
                if (kind === "PRESENTATIONAL_ANIMATION") {
                    ps.anim++;
                } else {
                    if (kind === "AUTHORITATIVE_DATA") ps.data++; else ps.structure++;
                    ps.lastMs = t;
                    // THE METRIC. Only an authoritative change, only inside a blocking region.
                    if (t > v2.lastBlockingAuthoritativeMs) v2.lastBlockingAuthoritativeMs = t;
                }
                v2.perSection[host] = ps;
            }

            /*
             * WHAT mutated, not just where. WU-00 is an outer wrapper, so nearest-ancestor
             * attribution makes it a catch-all; without the target's identity we cannot tell
             * genuine late first-order content from shell churn, and that distinction is the
             * whole question.
             */
            const LATE = (window as unknown as { __p076late?: unknown[] });
            LATE.__p076late = LATE.__p076late || [];
            if (t > 4000 && (LATE.__p076late as unknown[]).length < 80) {
                const el = (r.target.nodeType === 1 ? r.target : r.target.parentElement) as Element | null;
                (LATE.__p076late as unknown[]).push({
                    t, region: key, kind, blocking: host,
                    type: r.type,
                    tag: el?.tagName ?? null,
                    cls: (el?.getAttribute?.("class") || "").slice(0, 70),
                    txt: (el?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
                    added: r.addedNodes?.length ?? 0,
                });
            }
        }
    };
    // addInitScript runs BEFORE the document is parsed, so documentElement can be null and
    // observe() then fails silently — which reported visibleComplete=0 on five straight samples.
    // Observing `document` works from the same point and survives the parse.
    const attach = () => {
        try {
            new MutationObserver((recs) => mark(recs)).observe(document, {
                childList: true, subtree: true, characterData: true, attributes: true,
            });
        } catch { /* retried below */ }
    };
    attach();
    document.addEventListener("DOMContentLoaded", attach, { once: true });
}
