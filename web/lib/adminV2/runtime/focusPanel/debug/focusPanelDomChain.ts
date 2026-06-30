/**
 * Focus Panel DOM-chain diagnostic — walks the live runtime DOM from the grid root UP to
 * <body> and DOWN to the actual card box (`.alloy-os-ucard`), reporting the box-model +
 * flex/grid properties for every node. Use it to find the first node where width collapses
 * (content-width "island" symptom).
 *
 * On any dev harness it is exposed as `window.__focusPanelDomChain()`. To run on a gated
 * route (e.g. /workspace/work-unit) without the harness, paste the snippet printed by
 * `focusPanelDomChainSnippet()` into the browser console.
 *
 * NOTE: a wrapper with `display: contents` generates NO box — `width` rules on it are
 * ignored — so the real card box can be a *grandchild* of the cell. This report walks the
 * actual element tree (not just direct children) so that case is visible.
 */

const TRACKED_PROPS = [
    "display",
    "width",
    "maxWidth",
    "minWidth",
    "flex",
    "flexBasis",
    "flexGrow",
    "flexShrink",
    "gridTemplateColumns",
    "gridColumn",
    "justifyContent",
    "alignItems",
    "alignSelf",
    "position",
    "boxSizing",
    "overflow",
] as const;

type NodeReport = Record<string, string | number>;

function selectorFor(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const className = typeof el.className === "string" ? el.className : "";
    const cls = className
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .map((c) => `.${c}`)
        .join("");
    const data = Array.from(el.attributes)
        .filter((a) => a.name.startsWith("data-focus-panel") || a.name === "data-fp-strategy" || a.name === "data-fp-published-lane")
        .slice(0, 2)
        .map((a) => `[${a.name}]`)
        .join("");
    return `${tag}${id}${cls}${data}`;
}

function snapshot(el: Element): NodeReport {
    const cs = window.getComputedStyle(el);
    const report: NodeReport = {
        node: selectorFor(el),
        renderedWidthPx: Math.round(el.getBoundingClientRect().width),
        renderedLeftPx: Math.round(el.getBoundingClientRect().left),
    };
    for (const prop of TRACKED_PROPS) report[prop] = cs[prop as keyof CSSStyleDeclaration] as string;
    return report;
}

/** Walk grid root → <body> (ancestors) and grid root → card box (descendants). */
export function focusPanelDomChain(): {
    found: boolean;
    strategy?: string | null;
    ancestorsUpToBody?: NodeReport[];
    laneChainDownToCard?: NodeReport[];
    note: string;
} {
    if (typeof document === "undefined") return { found: false, note: "no document" };
    const grid =
        document.querySelector('[data-focus-panel-card-grid="true"]') ??
        document.querySelector(".alloy-os-focus-panel-grid");
    if (!grid) return { found: false, note: "No .alloy-os-focus-panel-grid on the page." };

    const ancestors: NodeReport[] = [];
    let up: Element | null = grid;
    while (up && up !== document.documentElement) {
        ancestors.push(snapshot(up));
        up = up.parentElement;
    }

    // Down: grid → first card cell → (display:contents wrapper) → .alloy-os-ucard.
    const cell =
        grid.querySelector('[data-focus-panel-grid-cell="household"]') ??
        grid.querySelector("[data-focus-panel-grid-cell]");
    const down: NodeReport[] = [];
    if (cell) {
        down.push(snapshot(cell));
        // walk every element between the cell and the card box (covers display:contents).
        const ucard = cell.querySelector(".alloy-os-ucard");
        const path: Element[] = [];
        let n: Element | null = ucard;
        while (n && n !== cell) {
            path.unshift(n);
            n = n.parentElement;
        }
        for (const el of path) down.push(snapshot(el));
    }

    const strategy =
        (grid.querySelector("[data-fp-strategy]") as HTMLElement | null)?.dataset.fpStrategy ??
        (grid.querySelector(".alloy-os-fp-canvas") as HTMLElement | null)?.dataset.fpStrategy ??
        null;

    return {
        found: true,
        strategy,
        ancestorsUpToBody: ancestors,
        laneChainDownToCard: down,
        note: "Look for the first node whose renderedWidthPx is < its parent (where width collapses). A display:contents wrapper with width:auto + a content-width .alloy-os-ucard is the island bug.",
    };
}

/** A copy-paste console snippet (no imports) for gated routes. */
export function focusPanelDomChainSnippet(): string {
    return `(${focusPanelDomChain.toString()})()`;
}
