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
    /*
     * ONE CLOCK: performance.now().
     *
     * This used to be Date.now() minus a t0 captured when the init script ran — which is AFTER
     * navigation starts. The readiness chain stamps performance.now() (origin: navigationStart)
     * and the Playwright driver stamped Date.now() in NODE before page.goto. Three origins, freely
     * compared, and the comparison produced a headline contradiction: the drawer VM response
     * appeared to land ~563-949ms AFTER the completion it causes. That was the offset between the
     * origins, not a fact about the product. Everything here is now on the page's performance
     * clock, so a probe timestamp and a chain timestamp are the same instant when they are equal.
     */
    w.__p076 = { t0: 0, last: performance.now(), count: 0 };
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
     * ── METRIC V2.1: "REACT WROTE AN ATTRIBUTE" IS NOT "NEW TRUTH ARRIVED" ──
     *
     * V2 above classifies every attribute outside the small animation set as AUTHORITATIVE_DATA.
     * Deployed evidence shows what that costs: at the render that mounts the participant cards,
     * business_process receives only a data-focus-panel-settlement rewrite and financials only a
     * data-financials-subject rewrite. Neither area's visible truth changes, and both had their
     * final-authoritative time reset to that moment. The metric was reporting the last React write,
     * not the last arrival of operator-visible truth.
     *
     * The correction needs a rule, not an exclusion list for the two attributes we caught. The
     * question an attribute has to answer is: DOES ANYTHING RENDER YOU? There are exactly two ways
     * to say yes, and the page can be asked both:
     *
     *   1. The browser itself renders it, or exposes it as state to the accessibility tree —
     *      disabled, open, value, src, aria-expanded and friends.
     *   2. A stylesheet SELECTS on it, so its value decides how the element paints.
     *
     * An attribute that is neither is a passive stamp: nothing reads it to draw anything. That is
     * what "diagnostic" means, and it covers identity stamps, routing attributes, section ids,
     * generation markers and settlement flags without naming any of them here. The set is read
     * from the product's own stylesheets for the same reason `blocking` is read from the registry:
     * a second hardcoded list in this file would drift, and drift is how the first two defects got
     * in.
     */
    const STYLED_ATTRS: { set: Set<string> | null } = { set: null };
    const styledAttributes = (): Set<string> => {
        // Rebuilt while empty: this probe installs before any stylesheet exists, so the first
        // caller would otherwise cache "nothing is styled" for the whole run.
        if (STYLED_ATTRS.set && STYLED_ATTRS.set.size > 0) return STYLED_ATTRS.set;
        const out = new Set<string>();
        const walk = (rules: CSSRuleList | undefined, depth: number) => {
            if (!rules || depth > 4) return;
            for (let i = 0; i < rules.length; i++) {
                const rule = rules[i] as CSSStyleRule & { cssRules?: CSSRuleList };
                const rawSel = typeof rule.selectorText === "string" ? rule.selectorText : "";
                /*
                 * STRIP CSS ESCAPES BEFORE LOOKING FOR ATTRIBUTE SELECTORS.
                 *
                 * The harvester treated every "[" as the start of an attribute selector. Tailwind
                 * arbitrary variants produce CLASS names containing escaped brackets — the live
                 * sheet carries `.\[name\:redacted\]` — so "name" was harvested as a styled
                 * attribute when nothing styles it at all.
                 *
                 * That single misparse made WU-04 the apparent owner of ~4.4s of "authoritative
                 * visible state": the late mutation there is the removal of `name` from an INPUT,
                 * and removing it was measured on the deployed page to produce ZERO computed-style
                 * and ZERO geometry difference. An identity attribute was being scored as visible
                 * truth.
                 *
                 * Removing each backslash-escaped character leaves genuine attribute selectors
                 * intact (`input[name="x"]`, `[data-state="open"]` carry no escapes) while an
                 * escaped class name collapses to a plain token with no bracket left to match.
                 * This is a parsing repair, not a relaxation: no attribute that actually styles
                 * the surface stops counting.
                 */
                const sel = rawSel.replace(/\\./g, "");
                const re = /\[\s*([A-Za-z_:][-\w:.]*)/g;
                let m: RegExpExecArray | null = re.exec(sel);
                while (m !== null) { out.add(m[1].toLowerCase()); m = re.exec(sel); }
                if (rule.cssRules) walk(rule.cssRules, depth + 1); // @media, @supports, @layer
            }
        };
        for (let i = 0; i < document.styleSheets.length; i++) {
            try { walk((document.styleSheets[i] as CSSStyleSheet).cssRules, 0); }
            catch { /* cross-origin sheet: unreadable, and not one of ours */ }
        }
        STYLED_ATTRS.set = out;
        return out;
    };

    /** Attributes the browser renders or publishes as state without anyone styling them. */
    const NATIVE_VISIBLE_STATE = new Set([
        "disabled", "checked", "selected", "open", "hidden", "readonly", "required", "multiple",
        "value", "placeholder", "src", "srcset", "href", "alt", "title", "label", "for",
        "colspan", "rowspan", "role", "contenteditable",
    ]);
    const isVisibleStateAttr = (name: string): boolean => {
        // aria-busy and aria-hidden stay with the animation set: they are the busy flag and the
        // fade, and V2 already established that neither means data is still arriving.
        if (ANIMATION_ATTRS.has(name)) return false;
        if (name.startsWith("aria-")) return true;
        if (NATIVE_VISIBLE_STATE.has(name)) return true;
        return styledAttributes().has(name);
    };

    /*
     * SEMANTIC FINGERPRINT — what the operator sees, and nothing else.
     *
     * Used for one question only: when React replaces a subtree, did anything VISIBLE differ
     * between what left and what arrived? So it carries visible text, the visible child shape, and
     * the visible-state attributes of the node and its descendants. It deliberately excludes
     * class, style, every inert stamp and React node identity — including any of those would make
     * an identical rerender look like new truth again, which is the defect being repaired.
     *
     * It is not a second truth model and it is not a DOM hash: bounded, observation-only, and it
     * never decides anything except "same or different".
     */
    const fingerprint = (n: Node | null): string => {
        if (!n) return "";
        if (n.nodeType === 3) return (n.nodeValue || "").replace(/\s+/g, " ").trim();
        if (n.nodeType !== 1) return "";
        const el = n as Element;
        const state: string[] = [];
        const collect = (e: Element) => {
            const attrs = e.attributes;
            for (let i = 0; i < attrs.length; i++) {
                const a = attrs[i];
                if (isVisibleStateAttr(a.name)) state.push(e.tagName + "/" + a.name + "=" + a.value);
            }
        };
        collect(el);
        // Descendants too: an <input value> or an aria-expanded one level down is visible truth,
        // and a top-level-only fingerprint would call its change an identical rerender.
        const deep = el.querySelectorAll ? el.querySelectorAll("*") : null;
        if (deep) for (let i = 0; i < deep.length && i < 60; i++) collect(deep[i]);
        state.sort();
        const kids = el.children;
        const shape: string[] = [];
        for (let i = 0; i < kids.length && i < 40; i++) shape.push(kids[i].tagName);
        return [
            el.tagName,
            (el.textContent || "").replace(/\s+/g, " ").trim(),
            shape.join(">"),
            state.join(","),
        ].join("|");
    };
    const fingerprintList = (nodes: NodeList | Node[]): string =>
        Array.from(nodes as ArrayLike<Node>).map(fingerprint).filter((x) => x !== "").join("~");

    type Kind21 =
        | "AUTHORITATIVE_CONTENT_CHANGE"
        | "AUTHORITATIVE_STRUCTURE_CHANGE"
        | "AUTHORITATIVE_VISIBLE_STATE_CHANGE"
        | "IDENTICAL_RERENDER"
        | "DIAGNOSTIC_ATTRIBUTE_CHANGE"
        | "PRESENTATIONAL_ANIMATION"
        | "STAGE2_ENRICHMENT";
    /** Only a change in operator-visible authoritative truth may move FINAL_AUTHORITATIVE_MS. */
    const ADVANCES_FINALITY: Record<Kind21, boolean> = {
        AUTHORITATIVE_CONTENT_CHANGE: true,
        AUTHORITATIVE_STRUCTURE_CHANGE: true,
        AUTHORITATIVE_VISIBLE_STATE_CHANGE: true,
        IDENTICAL_RERENDER: false,
        DIAGNOSTIC_ATTRIBUTE_CHANGE: false,
        PRESENTATIONAL_ANIMATION: false,
        /*
         * STAGE 2 MAY ADD DETAIL; IT MAY NOT CORRECT STAGE 1.
         *
         * The first-order projection contract names the exclusions outright — "nested surfaces,
         * Recent activity, payment applications, rails, expanded contacts, avatars, drawer
         * content". A subtree the product has declared Stage-2 therefore cannot decide when the
         * FIRST-ORDER surface became authoritative, however late it arrives.
         *
         * This is NOT a way to silence an inconvenient mutation. It applies only where the
         * renderer has marked a subtree `data-alloy-stage2-enrichment`, and that marking is itself
         * a product statement that the operator's first-order decision does not depend on it.
         * Mark something first-order with it and the metric WILL go quiet about a real correction,
         * which is why the guard test asserts the marker's reach is exactly its subtree.
         */
        STAGE2_ENRICHMENT: false,
    };
    /*
     * THE SAME REPLACEMENT, SPLIT ACROSS TWO RECORDS.
     *
     * The per-record rule below only sees a replacement when React puts the removal and the
     * insertion in ONE MutationRecord. It frequently does not: an unmount and a remount of the
     * same subtree can arrive as two one-sided records in the same observer batch, and each one
     * alone looks like a bare structure change.
     *
     * So the question is asked once per PARENT per batch, over everything that left and everything
     * that arrived. If the visible semantic fingerprints match, nothing the operator can see
     * changed and it is a rerender.
     *
     * This does NOT suppress real structure: a parent that gained a child, lost one, or exchanged
     * one for a different one has unequal fingerprint lists and still advances finality. Only
     * like-for-like is excused, and only within a single batch — a replacement observed across two
     * batches is a genuinely later arrival and is deliberately left alone.
     */
    /*
     * STABLE PER-NODE IDENTITY, for one open question.
     *
     * The WU-07 "Work: 1" chip is appended TWICE, as two one-sided records in separate batches.
     * Two readings fit equally: two compact-header INSTANCES each appending once, or one header
     * appending twice. `cls` and `txt` are identical in both cases, so the existing record cannot
     * tell them apart and neither can a reader. A WeakMap-assigned id can: same parent id twice
     * means one header; two parent ids means two headers.
     *
     * Observation only — nothing is written to the DOM and no product behaviour depends on it.
     */
    const nodeIds = new WeakMap<Node, number>();
    let nodeIdSeq = 0;
    const nodeId = (n: Node | null | undefined): number | null => {
        if (!n) return null;
        let id = nodeIds.get(n);
        if (id === undefined) { id = ++nodeIdSeq; nodeIds.set(n, id); }
        return id;
    };
    /** Nearest ancestor (inclusive) carrying an attribute, and that attribute's value. */
    const nearestAttr = (n: Node | null | undefined, attr: string): string | null => {
        let el: Element | null = n
            ? (n.nodeType === 1 ? (n as Element) : n.parentElement)
            : null;
        while (el) {
            const v = el.getAttribute?.(attr);
            if (v !== null && v !== undefined) return v || "(present)";
            el = el.parentElement;
        }
        return null;
    };
    let batchSeq = 0;

    const identicalRerenderParents = (recs: MutationRecord[]): Set<Node> => {
        const byParent = new Map<Node, { added: Node[]; removed: Node[] }>();
        for (const r of recs) {
            if (r.type !== "childList") continue;
            const e = byParent.get(r.target) ?? { added: [], removed: [] };
            for (const n of Array.from(r.addedNodes)) e.added.push(n);
            for (const n of Array.from(r.removedNodes)) e.removed.push(n);
            byParent.set(r.target, e);
        }
        const out = new Set<Node>();
        byParent.forEach((e, parent) => {
            if (e.added.length > 0 && e.removed.length > 0 &&
                fingerprintList(e.added) === fingerprintList(e.removed)) {
                out.add(parent);
            }
        });
        return out;
    };

    /** Nearest ancestor (or self) declared Stage-2 enrichment by the renderer. */
    const inStage2Enrichment = (n: Node | null): boolean => {
        let cur: Element | null = n
            ? (n.nodeType === 1 ? (n as Element) : n.parentElement)
            : null;
        while (cur) {
            if (cur.getAttribute?.("data-alloy-stage2-enrichment") === "true") return true;
            cur = cur.parentElement;
        }
        return false;
    };

    const classify21 = (r: MutationRecord, batchIdentical?: Set<Node>): Kind21 => {
        /*
         * Asked FIRST, and before the mutation type is even considered: a Stage-2 subtree's
         * arrival is detail by product contract, whatever shape the mutation takes.
         */
        if (inStage2Enrichment(r.target)) return "STAGE2_ENRICHMENT";
        if (r.type === "attributes") {
            const raw = r.attributeName ?? "";
            const name = raw.toLowerCase();
            const el = r.target.nodeType === 1 ? (r.target as Element) : null;
            const next = el ? el.getAttribute(raw) : null;
            /*
             * SAME VALUE IN, SAME VALUE OUT. Asked before anything else, because the answer can
             * never depend on which attribute it was: a write that did not change the value cannot
             * represent newly arrived truth, whatever the attribute means.
             *
             * If attributeOldValue was not enabled, oldValue is always null and this degrades to
             * V2's behaviour rather than to a false "nothing changed".
             */
            if (r.oldValue === next) return "IDENTICAL_RERENDER";
            if (ANIMATION_ATTRS.has(name) || /^data-(motion|anim|transition|framer)/.test(name)) {
                return "PRESENTATIONAL_ANIMATION";
            }
            return isVisibleStateAttr(name)
                ? "AUTHORITATIVE_VISIBLE_STATE_CHANGE"
                : "DIAGNOSTIC_ATTRIBUTE_CHANGE";
        }
        if (r.type === "characterData") {
            const now = (r.target.nodeValue || "").replace(/\s+/g, " ").trim();
            const was = (r.oldValue || "").replace(/\s+/g, " ").trim();
            return now === was ? "IDENTICAL_RERENDER" : "AUTHORITATIVE_CONTENT_CHANGE";
        }
        // The batch answer first: it sees both halves of a split replacement, the per-record rule
        // below only sees a replacement that arrived whole.
        if (batchIdentical && batchIdentical.has(r.target)) return "IDENTICAL_RERENDER";
        const added = Array.from(r.addedNodes);
        const removed = Array.from(r.removedNodes);
        /*
         * A REPLACEMENT THAT REPLACES LIKE WITH LIKE is a rerender, not an arrival. This is the
         * parent-rerender case from section 9: React discards a subtree and rebuilds an identical
         * one, and counting it reset the finality of every area underneath.
         */
        if (added.length > 0 && removed.length > 0 &&
            fingerprintList(added) === fingerprintList(removed)) {
            return "IDENTICAL_RERENDER";
        }
        const els = [...added, ...removed].filter((n) => n.nodeType === 1).length;
        return els > 0 ? "AUTHORITATIVE_STRUCTURE_CHANGE" : "AUTHORITATIVE_CONTENT_CHANGE";
    };

    /*
     * RESERVED GEOMETRY IS NOT DATA (Track-A finality).
     *
     * Track-A reserves the card's space first and fills it when the answer resolves. Both are
     * structural mutations, so a rule counting "any authoritative mutation" marks the section final
     * the moment the EMPTY BOX appears — the one moment an operator would certainly not call it
     * done. The product already says which state it is in; these are its own markers, not invented
     * ones: data-settlement-reserved, *-skeleton, data-*-pending, data-placeholder.
     */
    const PLACEHOLDER_ATTR = /(^data-placeholder$)|(-skeleton(-[a-z]+)?$)|(-reserved$)|(-pending$)/;
    const isPlaceholderNode = (n: Node | null): boolean => {
        let el: Node | null = n;
        while (el && el.nodeType !== 1) el = el.parentNode;
        let cur = el as Element | null;
        let hops = 0;
        while (cur && hops < 6) {
            const attrs = cur.attributes;
            for (let i = 0; i < attrs.length; i++) {
                const a = attrs[i];
                if (PLACEHOLDER_ATTR.test(a.name) && a.value !== "false") return true;
            }
            if (cur.getAttribute("data-alloy-section-id")) break;
            cur = cur.parentElement;
            hops++;
        }
        return false;
    };

    /*
     * DESTINATION GENERATION.
     *
     * On A -> B -> C the earlier subjects' requests are still in flight and their answers still
     * mutate the DOM. Counting them lets a stale subject's late data declare the CURRENT
     * destination complete — "finished" while showing a record the operator already left. The panel
     * stamps its own subject; that stamp is the generation.
     */
    /** The destination the surface is settling on RIGHT NOW, read from the live DOM. */
    const currentGeneration = (): string | null =>
        document.querySelector("[data-inline-focus-panel-subject]")
            ?.getAttribute("data-inline-focus-panel-subject") ?? null;

    const generationOf = (n: Node | null): string | null => {
        let el: Node | null = n;
        while (el && el.nodeType !== 1) el = el.parentNode;
        let cur = el as Element | null;
        while (cur) {
            const g = cur.getAttribute?.("data-inline-focus-panel-subject");
            if (g) return g;
            cur = cur.parentElement;
        }
        return null;
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

    /*
     * PER-AREA ATTRIBUTION, using identity the product already emits.
     *
     * FocusPanelCardRenderer stamps data-universal-card-key on every MOUNTED card; reserved cells
     * carry none. So this attributes only cards that actually mounted — the distinction that
     * matters here, because a card is not mounted at all until its readiness is "ready" or
     * "self_loading", and the three self-loading areas own their own reads. No parallel card list
     * is introduced: the DOM is asked.
     */
    const cardKeysFor = (n: Node | null): string[] => {
        let el: Node | null = n;
        while (el && el.nodeType !== 1) el = el.parentNode;
        const start = el as Element | null;
        if (!start) return [];
        // 1) The mutation happened INSIDE a card.
        let cur: Element | null = start;
        while (cur) {
            const k = cur.getAttribute?.("data-universal-card-key");
            if (k) return [k];
            cur = cur.parentElement;
        }
        /*
         * 2) The mutation ADDED a subtree CONTAINING cards.
         *
         * This is the case that matters and the one an upward-only walk silently drops: the Summary
         * burst attaches a whole grid subtree in one record, so the added node is an ANCESTOR of the
         * cards. Walking up from it finds no key, and only cards that later mutate individually get
         * attributed — which reported 2 areas out of the five visibly painting, while the
         * max-per-area reconciliation still passed because those two happened to land in the same
         * batch. Coverage has to be asked for downward as well.
         */
        const found = start.querySelectorAll?.("[data-universal-card-key]");
        if (!found || found.length === 0) return [];
        const keys: string[] = [];
        found.forEach((e) => {
            const k = e.getAttribute("data-universal-card-key");
            if (k && !keys.includes(k)) keys.push(k);
        });
        return keys;
    };

    const V2 = window as unknown as {
        __p076v2?: {
            /** OLD V2, kept computing unchanged so one sample yields both numbers (section 15). */
            lastBlockingAuthoritativeMs: number;
            /** METRIC V2.1 — semantic authoritative finality. */
            finalAuthoritativeMs: number;
            perSection: Record<string, {
                firstMs: number;
                lastMs: number;
                lastVisibleMs: number;
                data: number;
                structure: number;
                anim: number;
                imageExpected: boolean;
                imageFinalMs: number;
                // ── V2.1, per area ──
                contentMs: number;
                structureMs: number;
                visibleStateMs: number;
                finalAuthMs: number;
                identicalRerenders: number;
                diagnosticWrites: number;
            }>;
            kinds: Record<Kind, number>;
            kinds21: Record<Kind21, number>;
            blockingSeen: string[];
            latestGeneration: string | null;
            staleGenerationSuppressed: number;
            placeholderSuppressed: number;
            /*
             * HOW MANY ATTRIBUTES THE PRODUCT SAYS IT PAINTS.
             *
             * The V2.1 rule reads the live stylesheets. If they are unreadable — a cross-origin
             * sheet, or none parsed yet — the set is empty and EVERY data attribute silently
             * becomes diagnostic. That is a FALSE correction that looks exactly like a real one:
             * the number goes down and nothing errors. Reported so a sample that measured nothing
             * cannot be read as a sample that measured zero.
             */
            styledAttrCount: number;
            perCard: Record<string, { firstMs: number; lastMs: number; auth: number; anim: number }>;
        };
    };
    V2.__p076v2 = {
        lastBlockingAuthoritativeMs: -1,
        finalAuthoritativeMs: -1,
        perSection: {},
        kinds: { AUTHORITATIVE_DATA: 0, AUTHORITATIVE_STRUCTURE: 0, PRESENTATIONAL_ANIMATION: 0 },
        kinds21: {
            AUTHORITATIVE_CONTENT_CHANGE: 0, AUTHORITATIVE_STRUCTURE_CHANGE: 0,
            AUTHORITATIVE_VISIBLE_STATE_CHANGE: 0, IDENTICAL_RERENDER: 0,
            DIAGNOSTIC_ATTRIBUTE_CHANGE: 0, PRESENTATIONAL_ANIMATION: 0,
            STAGE2_ENRICHMENT: 0,
        },
        blockingSeen: [],
        latestGeneration: null,
        staleGenerationSuppressed: 0,
        placeholderSuppressed: 0,
        styledAttrCount: 0,
        perCard: {},
    };

    /*
     * POST-COMPLETE RECORDS (P0-7.6 — the double-commit causal chain).
     *
     * `postCompleteVisibleMutationCount` has always been a delta of the RAW V1 counter, so it
     * answers "how many visible mutations happened after the quiet window" — not the metric that
     * is actually gated, POST_COMPLETE_VISIBLE_AUTHORITATIVE_MUTATIONS. The V2.1 classifier
     * already knows which kinds advance finality; it was simply never consulted here.
     *
     * This records each post-complete record WITH the classification the unchanged classifier
     * gives it, plus the identity needed to correlate it to a React commit: batch id, section,
     * generation, and the before/after fingerprints. Recording is armed by the harness at the
     * settle point, so nothing is captured during normal first-order assembly.
     */
    const postRecords: Array<Record<string, unknown>> = [];
    (window as unknown as { __p076post?: { armed: boolean; records: Array<Record<string, unknown>> } }).__p076post = {
        armed: false,
        records: postRecords,
    };

    const mark = (recs?: MutationRecord[]) => {
        const now = performance.now();
        w.__p076!.last = now; w.__p076!.count++;
        // Once per batch, not once per record: the question is about the parent, not the record.
        const batchIdentical = identicalRerenderParents(recs ?? []);
        const batchId = ++batchSeq;
        for (const r of recs ?? []) {
            const key = attribute(r.target);
            const t = now - w.__p076!.t0;
            const e = R.__p076r![key] ?? { first: t, last: t, count: 0 };
            e.last = t; e.count++;
            R.__p076r![key] = e;

            // ── V2 ──
            const kind = classify(r);
            const kind21 = classify21(r, batchIdentical);
            V2.__p076v2!.styledAttrCount = styledAttributes().size;
            const v2 = V2.__p076v2!;
            v2.kinds[kind]++;
            v2.kinds21[kind21]++;
            /*
             * A childList record's `target` is the PARENT. Judging the parent asks "where did
             * something change", when finality is a question about WHAT ARRIVED — the reserved
             * wrapper and the stale-subject block are the added nodes, and inspecting their
             * container silently classified both as ordinary content.
             *
             * Computed once here because BOTH the section and the per-area paths need the same
             * answer; deriving it twice would let them disagree.
             */
            const arrived = Array.from(r.addedNodes).filter((n) => n.nodeType === 1);
            const judged: Node[] = arrived.length ? arrived : [r.target];

            const live = currentGeneration();
            if (live) v2.latestGeneration = live;
            const genOfMutation = generationOf(judged[0]);
            const stale = genOfMutation !== null && live !== null && genOfMutation !== live;

            const post = (window as unknown as { __p076post?: { armed: boolean; records: Array<Record<string, unknown>> } }).__p076post;
            if (post?.armed && post.records.length < 400) {
                const el = (r.target.nodeType === 1 ? r.target : r.target.parentElement) as Element | null;
                post.records.push({
                    t: Math.round(now - w.__p076!.t0),
                    batchId,
                    kind,
                    kind21,
                    advancesFinality: ADVANCES_FINALITY[kind21] === true,
                    type: r.type,
                    attributeName: r.attributeName ?? null,
                    sectionId: blockingHost(r.target) ?? attribute(r.target),
                    parentPath: el ? `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}` : null,
                    componentId: el?.closest?.("[data-alloy-section-id]")?.getAttribute("data-alloy-section-id") ?? null,
                    addedFp: fingerprintList(r.addedNodes),
                    removedFp: fingerprintList(r.removedNodes),
                    /*
                     * A characterData mutation has NO added or removed nodes, so `identical`
                     * below is vacuously true for it. Downstream analysis that compared only
                     * those fingerprints therefore scored a real "1" -> "2" as same-value, and a
                     * genuine authoritative correction read as convergence for two runs.
                     *
                     * The classifier above always compared the text (it has
                     * `characterDataOldValue`); what was missing was the EVIDENCE in the record.
                     * These two fields are that evidence.
                     */
                    textBefore: r.type === "characterData" ? (r.oldValue ?? "").replace(/\s+/g, " ").trim() : null,
                    textAfter: r.type === "characterData"
                        ? (r.target.nodeValue ?? "").replace(/\s+/g, " ").trim()
                        : null,
                    /** Only meaningful for childList; null where it cannot decide. */
                    identical: r.type === "characterData"
                        ? null
                        : fingerprintList(r.addedNodes) === fingerprintList(r.removedNodes),
                    generation: genOfMutation,
                    liveGeneration: live,
                    stale,
                });
            }

            const host = blockingHost(r.target);
            if (host) {
                if (!v2.blockingSeen.includes(host)) v2.blockingSeen.push(host);
                const ps = v2.perSection[host] ?? {
                    firstMs: t, lastMs: -1, lastVisibleMs: -1,
                    data: 0, structure: 0, anim: 0,
                    imageExpected: false, imageFinalMs: -1,
                    contentMs: -1, structureMs: -1, visibleStateMs: -1,
                    finalAuthMs: -1, identicalRerenders: 0, diagnosticWrites: 0,
                };
                // FINAL_VISIBLE_MS counts every visible change, animation included: the honest
                // "when did this region stop moving at all". The gap between it and lastMs is the
                // trailing motion V1 was billing as loading, measured per region not asserted.
                ps.lastVisibleMs = t;

                if (kind === "PRESENTATIONAL_ANIMATION") {
                    ps.anim++;
                } else if (stale) {
                    v2.staleGenerationSuppressed++;
                } else if (judged.every(isPlaceholderNode)) {
                    // Reserved space arrived, not the answer. Activity, never finality.
                    v2.placeholderSuppressed++;
                } else {
                    if (kind === "AUTHORITATIVE_DATA") ps.data++; else ps.structure++;
                    ps.lastMs = t;
                    // OLD V2. Only an authoritative change, only inside a blocking region — but
                    // "authoritative" here still means "was not an animation", which is the defect.
                    if (t > v2.lastBlockingAuthoritativeMs) v2.lastBlockingAuthoritativeMs = t;
                }

                /*
                 * ── V2.1 ── The same suppressions (animation, stale generation, reserved
                 * geometry) still apply, and then the semantic question is asked on top: did this
                 * mutation change anything the operator can see?
                 */
                if (kind21 === "IDENTICAL_RERENDER") ps.identicalRerenders++;
                else if (kind21 === "DIAGNOSTIC_ATTRIBUTE_CHANGE") ps.diagnosticWrites++;

                /*
                 * ONE TABLE DECIDES. An earlier draft short-circuited animations before consulting
                 * ADVANCES_FINALITY, which left the table's PRESENTATIONAL_ANIMATION entry dead —
                 * flipping it to `true` changed nothing and the gate that should have caught that
                 * passed. A rule with two authorities has one that is never tested.
                 */
                const suppressed = stale || judged.every(isPlaceholderNode);
                if (ADVANCES_FINALITY[kind21] && !suppressed) {
                    if (kind21 === "AUTHORITATIVE_CONTENT_CHANGE") ps.contentMs = t;
                    else if (kind21 === "AUTHORITATIVE_STRUCTURE_CHANGE") ps.structureMs = t;
                    else ps.visibleStateMs = t;
                    // AREA FINALITY. Belongs to this area's own semantic change, so a parent
                    // rerender cannot reset an area whose visible truth did not move.
                    ps.finalAuthMs = t;
                    // THE METRIC (V2.1).
                    if (t > v2.finalAuthoritativeMs) v2.finalAuthoritativeMs = t;
                }
                v2.perSection[host] = ps;
            }

            /*
             * The SAME mutation, attributed to its AREA. Deliberately outside the blocking-host
             * branch: a card's paint is worth timing wherever it lands, and the section rules above
             * have already decided what counts toward completion.
             */
            const cards = stale ? [] : judged.flatMap((j) => cardKeysFor(j));
            for (const card of cards) {
                const pc = v2.perCard[card] ?? { firstMs: -1, lastMs: -1, auth: 0, anim: 0 };
                if (kind === "PRESENTATIONAL_ANIMATION") {
                    pc.anim++;
                } else if (!judged.every(isPlaceholderNode)) {
                    pc.auth++;
                    if (pc.firstMs < 0) pc.firstMs = t;
                    pc.lastMs = t;
                }
                v2.perCard[card] = pc;
            }

            /*
             * WHAT mutated, not just where. WU-00 is an outer wrapper, so nearest-ancestor
             * attribution makes it a catch-all; without the target's identity we cannot tell
             * genuine late first-order content from shell churn, and that distinction is the
             * whole question.
             */
            const LATE = (window as unknown as { __p076late?: unknown[] });
            LATE.__p076late = LATE.__p076late || [];
            /*
             * A RING, NOT A PREFIX. Keeping the FIRST 80 records means the buffer fills during an
             * early burst and every later mutation is invisible — including, twice now, the one
             * that actually set completion: the sample then shows activity stopping at 4,909ms
             * while the metric says 10,123ms, and the difference is unexplainable rather than
             * absent. The interesting mutations are the LAST ones, so drop from the front.
             */
            /*
             * THE WINDOW HAS TO COVER THE TAIL BEING INVESTIGATED.
             *
             * This opened at 4,000ms and held 200 records. WU-09's authoritative tail starts at
             * its FIRST paint (~2,478ms measured) and runs to ~5,610ms, emitting on the order of a
             * thousand mutations — so the old window missed the first ~1.5 seconds outright and
             * the ring then discarded most of what remained. Attribution needs the whole tail, not
             * its final burst.
             */
            if (t > 1500) {
                if ((LATE.__p076late as unknown[]).length >= 2000) {
                    (LATE.__p076late as unknown[]).shift();
                }
                const el = (r.target.nodeType === 1 ? r.target : r.target.parentElement) as Element | null;
                (LATE.__p076late as unknown[]).push({
                    t, region: key, kind, kind21, blocking: host,
                    type: r.type,
                    tag: el?.tagName ?? null,
                    cls: (el?.getAttribute?.("class") || "").slice(0, 70),
                    txt: (el?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
                    added: r.addedNodes?.length ?? 0,
                    /*
                     * WHAT arrived, not just how many. A post-complete childList record reporting
                     * `added: 1, removed: 0` is indistinguishable from real late truth without the
                     * arriving subtree's own semantic fingerprint — the record's `txt` is the
                     * PARENT's text, which is unchanged in exactly the case under investigation.
                     * This is how the WU-07 observation was finally named: `SPAN|Work: 1`.
                     */
                    textBefore: r.type === "characterData" ? (r.oldValue ?? "").replace(/\s+/g, " ").trim() : null,
                    textAfter: r.type === "characterData"
                        ? (r.target.nodeValue ?? "").replace(/\s+/g, " ").trim()
                        : null,
                    addedFp: Array.from(r.addedNodes ?? []).map(fingerprint).join("~").slice(0, 160),
                    removedFp: Array.from(r.removedNodes ?? []).map(fingerprint).join("~").slice(0, 160),
                    /*
                     * WHICH attribute, whether nodes LEFT, and which card owns it.
                     *
                     * The classifier already reads attributeName to separate animation from data,
                     * but the fingerprint dropped it — so an `attributes` mutation on an
                     * already-final card looks identical to real content arriving, which is exactly
                     * the question at the binding render. `removed` likewise: `added: 0` cannot
                     * currently be told apart from a removal.
                     */
                    attr: r.attributeName ?? null,
                    oldV: r.oldValue === null ? null : String(r.oldValue).slice(0, 40),
                    newV: r.attributeName && el
                        ? (el.getAttribute(r.attributeName) ?? null)?.slice?.(0, 40) ?? null
                        : null,
                    removed: r.removedNodes?.length ?? 0,
                    card: cardKeysFor(judged[0])[0] ?? null,
                    /*
                     * IDENTITY — enough to tell two nodes apart without inferring.
                     * `parentId` is the decisive field for the WU-07 duplicate: one id twice means
                     * one header appending twice; two ids means two header instances.
                     */
                    batchId,
                    parentId: nodeId(r.target),
                    addedIds: Array.from(r.addedNodes ?? []).map((n) => nodeId(n)),
                    removedIds: Array.from(r.removedNodes ?? []).map((n) => nodeId(n)),
                    sectionId: nearestAttr(r.target, "data-alloy-section-id"),
                    fpBoundary: nearestAttr(r.target, "data-focus-panel-boundary"),
                    fpState: nearestAttr(r.target, "data-focus-panel-state"),
                    subjectId: nearestAttr(r.target, "data-subject-id")
                        ?? nearestAttr(r.target, "data-record-id")
                        ?? nearestAttr(r.target, "data-opportunity-id"),
                    componentId: nearestAttr(r.target, "data-component"),
                    generation: (V2.__p076v2 as { latestGeneration?: string } | undefined)?.latestGeneration ?? null,
                });
            }
        }
    };
    // addInitScript runs BEFORE the document is parsed, so documentElement can be null and
    // observe() then fails silently — which reported visibleComplete=0 on five straight samples.
    // Observing `document` works from the same point and survives the parse.
    /*
     * IMAGE FINALITY. A section whose avatar has not decoded is not final, and a decode lands with
     * NO DOM mutation — so mutation evidence alone calls it done early, systematically on exactly
     * the sections that carry images. Captured on the capture phase: load/error do not bubble.
     * Attributed through the same leaf-most rule as everything else.
     */
    const imageSettled = (e: Event) => {
        const el = e.target as Element | null;
        if (!el || el.tagName !== "IMG") return;
        const host = blockingHost(el);
        if (!host) return;
        const store = V2.__p076v2;
        if (!store) return;
        const t = performance.now();
        const ps = store.perSection[host] ?? {
            firstMs: t, lastMs: -1, lastVisibleMs: t,
            data: 0, structure: 0, anim: 0,
            imageExpected: false, imageFinalMs: -1,
            contentMs: -1, structureMs: -1, visibleStateMs: -1,
            finalAuthMs: -1, identicalRerenders: 0, diagnosticWrites: 0,
        };
        ps.imageExpected = true;
        if (t > ps.imageFinalMs) ps.imageFinalMs = t;
        store.perSection[host] = ps;
    };
    document.addEventListener("load", imageSettled, true);
    document.addEventListener("error", imageSettled, true);

    const attach = () => {
        try {
            new MutationObserver((recs) => mark(recs)).observe(document, {
                childList: true, subtree: true, characterData: true, attributes: true,
                // V2.1 needs the PREVIOUS value: without these, "React rewrote the same string"
                // is indistinguishable from "new truth arrived", which is the defect being fixed.
                attributeOldValue: true, characterDataOldValue: true,
            });
        } catch { /* retried below */ }
    };
    attach();
    document.addEventListener("DOMContentLoaded", attach, { once: true });
}
