/** @vitest-environment jsdom */

/**
 * R5 — two distinct Activity events must render as two rows with distinct React keys.
 *
 * The timeline keyed rows on `${label}-${occurredAt}`, and `occurredAt` holds the FORMATTED
 * timestamp ("Today • 8:21 AM") — minute granularity. Two canonical events with the same title in
 * the same minute therefore produced the same key. Observed live on Firefly: 18 warnings in one
 * journey, all `Tour invitation sent-Today • 8:21 AM`.
 *
 * The full-precision time is not lost in the data — `atSortKey` keeps epoch ms and the upstream
 * timeline entry carries an immutable `id`. Only the DISPLAY string is minute-granular, and it was
 * the display string that became the identity.
 *
 * The warning is a client-reconciler warning: `renderToStaticMarkup` does not emit it, so this
 * renders through `react-dom/client` and asserts on captured `console.error`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import CurrentWorkActivityPreview, {
    currentWorkActivityRowKey,
    type CurrentWorkActivityPreviewItem,
} from "@/components/admin/focusPanel/cards/CurrentWorkActivityPreview";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/** Two DISTINCT canonical events: same title, same displayed minute. Both are legitimate. */
const COLLIDING: CurrentWorkActivityPreviewItem[] = [
    { label: "Tour invitation sent", detail: null, category: "Communication", kind: "communication", occurredAt: "Today • 8:21 AM" },
    { label: "Tour invitation sent", detail: null, category: "Communication", kind: "communication", occurredAt: "Today • 8:21 AM" },
];

let host: HTMLDivElement;
let root: Root;
let errors: string[];
let spy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    errors = [];
    spy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
        errors.push(a.map(String).join(" "));
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    spy.mockRestore();
});

const render = async (items: CurrentWorkActivityPreviewItem[]) => {
    // The popover anchors to a real trigger element; without it the component throws before it
    // renders a single row, and a harness that never renders proves nothing about keys.
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger } as React.RefObject<HTMLElement | null>;
    await act(async () => {
        root.render(
            React.createElement(CurrentWorkActivityPreview, {
                open: true,
                items,
                onClose: () => {},
                triggerRef,
            }),
        );
    });
};
const duplicateKeyWarnings = () => errors.filter((e) => /same key/i.test(e));
/** The popover renders through a PORTAL, so the rows are not inside the mount host. */
const renderedLabels = () =>
    [...document.querySelectorAll("li")].map((li) => (li.textContent ?? "").trim());

describe("Current Work Activity rows have collision-safe identity", () => {
    it("two distinct events with the same label and displayed minute render without a duplicate-key warning", async () => {
        await render(COLLIDING);
        expect(duplicateKeyWarnings()).toEqual([]);
    });

    it("both entries remain rendered — identity is fixed, truth is not deduplicated", async () => {
        await render(COLLIDING);
        const rows = renderedLabels().filter((t) => t.includes("Tour invitation sent"));
        expect(rows).toHaveLength(2);
    });

    it("an identical rerender produces no warning and the same row count", async () => {
        await render(COLLIDING);
        await render(COLLIDING);
        expect(duplicateKeyWarnings()).toEqual([]);
        expect(renderedLabels().filter((t) => t.includes("Tour invitation sent"))).toHaveLength(2);
    });

    it("inserting a newer entry at the front keeps every row and stays warning-free", async () => {
        await render(COLLIDING);
        await render([
            { label: "Tour scheduled", detail: null, category: "Communication", kind: "communication", occurredAt: "Today • 9:02 AM" },
            ...COLLIDING,
        ]);
        expect(duplicateKeyWarnings()).toEqual([]);
        expect(renderedLabels().filter((t) => t.trim().length > 0)).toHaveLength(3);
    });

    it("three identical-minute events still render three rows", async () => {
        await render([...COLLIDING, { ...COLLIDING[0]! }]);
        expect(duplicateKeyWarnings()).toEqual([]);
        expect(renderedLabels().filter((t) => t.includes("Tour invitation sent"))).toHaveLength(3);
    });
});

describe("the key rule itself", () => {
    const item = (over: Partial<CurrentWorkActivityPreviewItem>): CurrentWorkActivityPreviewItem => ({
        label: "Tour invitation sent",
        detail: null,
        category: null,
        kind: "communication",
        occurredAt: "Today • 8:21 AM",
        ...over,
    });

    it("a canonical id IS the key — display text never participates", () => {
        expect(currentWorkActivityRowKey(item({ id: "direct:direct:evt-1" }), 0)).toBe("direct:direct:evt-1");
        // Same id, different position and different display: still the same row.
        expect(currentWorkActivityRowKey(item({ id: "direct:direct:evt-1", occurredAt: "Today • 9:00 AM" }), 7))
            .toBe("direct:direct:evt-1");
    });

    it("identity follows the event across a reorder, not its position", () => {
        const a = item({ id: "direct:direct:evt-a" });
        const b = item({ id: "direct:direct:evt-b" });
        const forward = [a, b].map(currentWorkActivityRowKey);
        const reversed = [b, a].map(currentWorkActivityRowKey);
        expect(reversed).toEqual([forward[1], forward[0]]);
    });

    it("inserting a newer entry at the front does not change existing keys", () => {
        const a = item({ id: "direct:direct:evt-a" });
        const b = item({ id: "direct:direct:evt-b" });
        const before = [a, b].map(currentWorkActivityRowKey);
        const after = [item({ id: "direct:direct:evt-new" }), a, b].map(currentWorkActivityRowKey);
        expect(after.slice(1)).toEqual(before);
    });

    it("two sources cannot collide on a shared row id", () => {
        const direct = currentWorkActivityRowKey(item({ id: "direct:direct:row-1" }), 0);
        const related = currentWorkActivityRowKey(item({ id: "related:children:row-1" }), 1);
        expect(direct).not.toBe(related);
    });

    it("with no canonical id the fallback is deterministic and unique within the render", () => {
        const first = currentWorkActivityRowKey(item({}), 0);
        const second = currentWorkActivityRowKey(item({}), 1);
        expect(first).toBe(currentWorkActivityRowKey(item({}), 0)); // deterministic
        expect(first).not.toBe(second); // and it separates the colliding rows
        expect(first).toContain("no-canonical-id");
    });

    it("an empty or whitespace id falls back rather than keying on nothing", () => {
        expect(currentWorkActivityRowKey(item({ id: "   " }), 3)).toContain("no-canonical-id");
        expect(currentWorkActivityRowKey(item({ id: null }), 3)).toContain("no-canonical-id");
    });
});

describe("Activity truth is untouched", () => {
    it("labels, timestamps and order render exactly as supplied", async () => {
        const supplied: CurrentWorkActivityPreviewItem[] = [
            { label: "Tour scheduled", detail: null, category: null, kind: "communication", occurredAt: "Today • 9:02 AM" },
            ...COLLIDING,
        ];
        await render(supplied);
        const rows = renderedLabels().filter((t) => t.length > 0);
        expect(rows).toHaveLength(3);
        expect(rows[0]).toContain("Tour scheduled");
        expect(rows[0]).toContain("Today • 9:02 AM");
        expect(rows[1]).toContain("Tour invitation sent");
        expect(rows[1]).toContain("Today • 8:21 AM");
        expect(rows[2]).toContain("Tour invitation sent");
    });
});

describe("the identity contract holds across producers and renderers", () => {
    const ROOT = join(process.cwd(), "components", "admin", "focusPanel", "cards");
    const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

    it("every renderer of this item type uses the shared key owner", () => {
        for (const file of [
            "CurrentWorkActivityPreview.tsx",
            "CurrentWorkWorkspace.tsx",
            "CurrentWorkFocusedSurface.tsx",
        ]) {
            const src = read(file);
            expect(src).toContain("currentWorkActivityRowKey(item, index)");
            // No renderer may reconstruct identity from display text again.
            expect(src).not.toContain("key={`${item.label}-");
        }
    });

    it("NO Activity identity is built from label + display time anywhere", () => {
        /*
         * The assertion that would have caught the fourth producer.
         *
         * Scoping the check to "the three renderers" is what let `buildWhatsNextCardPresentation`
         * keep the old key: it computes its key into a DTO instead of in JSX, so it matched no
         * `key={...}` search. This sweeps the Current Work presentation tree for the SHAPE.
         */
        const roots = [
            join(process.cwd(), "components", "admin", "focusPanel", "cards"),
            join(process.cwd(), "lib", "adminV2", "runtime", "focusPanel", "currentWork"),
        ];
        const offenders: string[] = [];
        for (const root of roots) {
            for (const name of readdirSync(root)) {
                if (!/\.(ts|tsx)$/.test(name)) continue;
                const src = readFileSync(join(root, name), "utf8");
                for (const line of src.split("\n")) {
                    if (line.trimStart().startsWith("*")) continue; // doc comments describe the old shape
                    if (/`\$\{[^}]*label[^}]*\}-\$\{[^}]*(occurredAt|at|when)[^}]*\}`/.test(line)) {
                        offenders.push(`${name}: ${line.trim().slice(0, 100)}`);
                    }
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("the What's Next card builds its key from the shared owner too", () => {
        const src = readFileSync(
            join(process.cwd(), "lib", "adminV2", "runtime", "focusPanel", "currentWork", "buildWhatsNextCardPresentation.ts"),
            "utf8",
        );
        expect(src).toContain("key: currentWorkActivityRowKey(item, index)");
    });

    it("the adapter propagates the canonical id and namespaces it by source and scope", () => {
        const adapter = readFileSync(
            join(process.cwd(), "lib", "adminV2", "runtime", "focusPanel", "currentWork", "buildCurrentWorkActivityPreviewItems.ts"),
            "utf8",
        );
        expect(adapter).toContain("id: entry.id ?? null");
        expect(adapter).toContain('id: `${entry.source}:${entry.relatedScope ?? "direct"}:${entry.id}`');
    });

    it("the same raw event id appearing direct and related stays two rows", async () => {
        const shared = "row-shared-1";
        await render([
            { id: `direct:direct:${shared}`, label: "Note added", detail: null, category: null, kind: "note", occurredAt: "Today • 8:21 AM" },
            { id: `related:children:${shared}`, label: "Note added", detail: null, category: null, kind: "note", occurredAt: "Today • 8:21 AM" },
        ]);
        expect(duplicateKeyWarnings()).toEqual([]);
        expect(renderedLabels().filter((t) => t.includes("Note added"))).toHaveLength(2);
    });

    it("several synthetic fallback entries are unique within one rendered list", () => {
        const synthetic = (label: string) => ({ label, detail: null, category: null, kind: "task" as const, occurredAt: "Today • 8:21 AM" });
        const keys = [synthetic("Tour scheduled"), synthetic("Tour scheduled"), synthetic("Tour scheduled")]
            .map(currentWorkActivityRowKey);
        expect(new Set(keys).size).toBe(3);
    });
});
