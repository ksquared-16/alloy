/**
 * Repeated destinations are not repeated FACTS.
 *
 * A printed form repeats a destination whenever a value has more than one occurrence: five dose
 * columns for one vaccine, eight blank rows for "other vaccines received", seven checkboxes for
 * one "check all that apply" question. Read one destination at a time, the Oregon Certificate of
 * Immunization Status looks like 69 independent immunization questions. It is about a dozen.
 *
 * The evidence for that is GEOMETRIC, and it is evidence any form carries — not something read out
 * of a field-name table for one document. A grid announces itself: several widgets sharing an
 * x-position down the page form a column, several sharing a y-position form a row, and a page that
 * has both is a table. A checkbox group announces itself the same way: same size, same alignment,
 * regular spacing, no other widget between them.
 *
 * Two kinds of grid, told apart by the types down each column:
 *
 *   • columns all the same type   → each ROW is one datum repeated N times (a dose schedule)
 *   • columns of differing types  → each ROW is a record (a vaccine name AND its date), so the
 *                                   table is one repeating collection with N instances
 *
 * Pure + deterministic, and a proposal either way: nothing here collapses a destination. Every
 * widget survives in the draft with its own name, page and box; grouping is what the operator is
 * shown so they can decide the collection ONCE instead of seventy times.
 */

import type { PdfFieldRegion } from "./pdfAcroForm";

export type RepeatingGroupKind = "value_series" | "repeating_record" | "choice_group";

export interface RepeatingFieldGroup {
    /** Stable id from lineage: page + kind + anchor position. Never an array index. */
    id: string;
    kind: RepeatingGroupKind;
    page: number;
    /** Operator-facing name, lifted from what the member names share. */
    label: string;
    /** How many times the unit repeats (dose columns / table rows / options). */
    instances: number;
    /** Native field names of every member, in reading order. */
    member_names: string[];
    /** Member labels, in reading order. */
    member_labels: string[];
    /** For a repeating record: the per-instance columns. For a series: the single repeated type. */
    item_types: string[];
    /** Deterministic reasons this group was recognized. */
    signals: string[];
}

interface Positioned {
    f: PdfFieldRegion;
    x: number;
    y: number;
    w: number;
    h: number;
}

const X_TOLERANCE = 6; // points — a shared column edge
const Y_TOLERANCE = 4; // points — a shared baseline row
/** A grid needs at least this many aligned columns and rows before it is a grid and not a coincidence. */
const MIN_GRID_COLUMNS = 2;
const MIN_GRID_ROWS = 3;
/** A row of a type-homogeneous grid is a series once it has this many members. */
const MIN_SERIES_MEMBERS = 2;
/** Aligned checkboxes become one choice group at this size. */
const MIN_CHOICE_MEMBERS = 2;
/** Two widgets are "the same size" within this many points — PDF widget boxes are not pixel-exact. */
const SIZE_TOLERANCE = 2;

function positioned(fields: PdfFieldRegion[]): Positioned[] {
    const out: Positioned[] = [];
    for (const f of fields) {
        if (!f.bbox) continue;
        const [x0, y0, x1, y1] = f.bbox;
        out.push({ f, x: x0, y: y0, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
    }
    return out;
}

/** Cluster values that sit within `tolerance` of each other, ordered ascending. */
function cluster(values: number[], tolerance: number): number[][] {
    const sorted = [...values].sort((a, b) => a - b);
    const groups: number[][] = [];
    for (const v of sorted) {
        const last = groups[groups.length - 1];
        if (last && Math.abs(v - last[last.length - 1]) <= tolerance) last.push(v);
        else groups.push([v]);
    }
    return groups;
}

function mean(ns: number[]): number {
    return ns.reduce((a, b) => a + b, 0) / ns.length;
}

/** The longest word-level common prefix/suffix of a set of names — what the repeats share. */
export function invariantLabel(labels: string[]): string {
    if (labels.length === 0) return "";
    const split = labels.map((l) => l.split(/\s+/).filter(Boolean));
    // common suffix words carry the identity in "Dose 1 … DTaP" / "Dose 2 … DTaP"
    const suffix: string[] = [];
    for (let i = 1; ; i += 1) {
        const w = split[0][split[0].length - i];
        if (!w || !split.every((s) => s[s.length - i] === w)) break;
        suffix.unshift(w);
    }
    if (suffix.length > 0) return suffix.join(" ");
    const prefix: string[] = [];
    for (let i = 0; ; i += 1) {
        const w = split[0][i];
        if (!w || !split.every((s) => s[i] === w)) break;
        prefix.push(w);
    }
    return prefix.join(" ") || labels[0];
}

function groupId(page: number, kind: RepeatingGroupKind, anchor: number): string {
    return `${page}:${kind}:${Math.round(anchor)}`;
}

/** The type most of a column's cells carry. A cell that disagrees is not part of the grid. */
function modalType(types: string[]): string {
    const counts = new Map<string, number>();
    for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

/** Grids: widgets aligned into both columns and rows on one page. */
function detectGrids(page: number, items: Positioned[]): RepeatingFieldGroup[] {
    const inputs = items.filter((p) => p.f.type !== "signature");
    if (inputs.length < MIN_GRID_COLUMNS * MIN_GRID_ROWS) return [];

    const colGroups = cluster(inputs.map((p) => p.x), X_TOLERANCE).filter((g) => g.length >= MIN_GRID_ROWS);
    if (colGroups.length < MIN_GRID_COLUMNS) return [];

    // Each column has ONE type. A `Date` widget parked in a column of dose dates, or a checkbox
    // sharing a left margin with a table of names, sits in the column visually but is a different
    // question — so it is excluded rather than allowed to make the whole grid look heterogeneous.
    const columns = colGroups.map((g) => {
        const center = mean(g);
        const cells = inputs.filter((p) => Math.abs(p.x - center) <= X_TOLERANCE);
        return { center, type: modalType(cells.map((c) => c.f.type)), cells: [] as Positioned[] };
    });
    const cellOf = (p: Positioned) => columns.find((c) => Math.abs(p.x - c.center) <= X_TOLERANCE && p.f.type === c.type);
    const gridCells = inputs.filter((p) => !!cellOf(p));
    for (const p of gridCells) cellOf(p)!.cells.push(p);

    const rowGroups = cluster(gridCells.map((p) => p.y), Y_TOLERANCE);
    const candidateRows = rowGroups
        .map((ys) => {
            const yc = mean(ys);
            return gridCells.filter((p) => Math.abs(p.y - yc) <= Y_TOLERANCE).sort((a, b) => a.x - b.x);
        })
        .filter((r) => r.length >= MIN_SERIES_MEMBERS);
    if (candidateRows.length < MIN_GRID_ROWS) return [];

    // A table's rows occupy the SAME columns. Without that, any two widgets that happen to share a
    // baseline in two unrelated columns read as a row — which is how a pair of exemption checkboxes
    // ended up inside the "other vaccines" table. The most common column signature wins; a shorter
    // row is kept only when it fills a prefix of that signature (a vaccine with 2 doses, not 5).
    const indexOf = (p: Positioned) => columns.findIndex((c) => Math.abs(p.x - c.center) <= X_TOLERANCE && p.f.type === c.type);
    const signature = (r: Positioned[]) => r.map(indexOf).sort((a, b) => a - b);
    const sigKey = (r: Positioned[]) => signature(r).join(",");
    const sigCounts = new Map<string, number>();
    for (const r of candidateRows) sigCounts.set(sigKey(r), (sigCounts.get(sigKey(r)) ?? 0) + 1);
    const dominant = [...sigCounts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
    const dominantIdx = dominant.split(",").map(Number);
    const rows = candidateRows.filter((r) => {
        const idx = signature(r);
        return idx[0] === dominantIdx[0] && idx.every((i) => dominantIdx.includes(i));
    });
    if (rows.length < MIN_GRID_ROWS) return [];

    // Only columns that actually contributed a retained cell are part of this grid.
    const activeColumns = dominantIdx.map((i) => columns[i]);
    if (activeColumns.length < MIN_GRID_COLUMNS) return [];

    // Homogeneous columns ⇒ the row repeats ONE value. Mixed columns ⇒ the row is a record.
    const homogeneous = new Set(activeColumns.map((c) => c.type)).size === 1;

    if (homogeneous) {
        return rows.map((row) => ({
            id: groupId(page, "value_series", row[0].y),
            kind: "value_series" as const,
            page,
            label: invariantLabel(row.map((p) => p.f.label)),
            instances: row.length,
            member_names: row.map((p) => p.f.name),
            member_labels: row.map((p) => p.f.label),
            item_types: [activeColumns[0].type],
            signals: [
                `${row.length} widgets on one row aligned to ${activeColumns.length} shared columns`,
                `every column is ${activeColumns[0].type} — the row repeats one value`,
            ],
        }));
    }

    // A repeating table. Its name comes from what the FIRST column's cells share down the rows —
    // that is the column a table labels itself by.
    const firstColumn = rows.map((r) => r[0]);
    const members = rows.flat();
    return [
        {
            id: groupId(page, "repeating_record", rows[0][0].y),
            kind: "repeating_record",
            page,
            label: invariantLabel(firstColumn.map((p) => p.f.label)) || "Repeating rows",
            instances: rows.length,
            member_names: members.map((p) => p.f.name),
            member_labels: members.map((p) => p.f.label),
            item_types: activeColumns.map((c) => c.type),
            signals: [
                `${rows.length} rows × ${activeColumns.length} columns of aligned widgets`,
                `columns differ in type (${activeColumns.map((c) => c.type).join(", ")}) — each row is one record, not one repeated value`,
            ],
        },
    ];
}

/**
 * Partition by visual size, tolerantly: cluster on width, then on height inside each width band.
 */
function clusterBySize(items: Positioned[], tolerance: number): Positioned[][] {
    const byWidth: Positioned[][] = [];
    for (const p of [...items].sort((a, b) => a.w - b.w)) {
        const last = byWidth[byWidth.length - 1];
        if (last && Math.abs(p.w - last[last.length - 1].w) <= tolerance) last.push(p);
        else byWidth.push([p]);
    }
    const out: Positioned[][] = [];
    for (const band of byWidth) {
        let current: Positioned[] = [];
        for (const p of [...band].sort((a, b) => a.h - b.h)) {
            if (current.length > 0 && Math.abs(p.h - current[current.length - 1].h) > tolerance) {
                out.push(current);
                current = [];
            }
            current.push(p);
        }
        if (current.length > 0) out.push(current);
    }
    return out;
}

/** Checkbox clusters: same-size aligned booleans with regular spacing and nothing else between them. */
function detectChoiceGroups(page: number, items: Positioned[], claimed: Set<string>): RepeatingFieldGroup[] {
    const boxes = items.filter((p) => p.f.type === "boolean" && !claimed.has(p.f.name));
    if (boxes.length < MIN_CHOICE_MEMBERS) return [];

    // Same-size boxes only — a differently sized control is a different question. Sizes are
    // compared with a tolerance, not by exact value: PDF widgets of the same visual box routinely
    // differ by a fraction of a point (this form draws one of its checkboxes 15.37 × 14.32 and the
    // rest 14.85 × 14.85), and rounding those into separate buckets loses the group.
    const bySize = clusterBySize(boxes, SIZE_TOLERANCE);

    const groups: RepeatingFieldGroup[] = [];
    for (const sameSize of bySize) {
        if (sameSize.length < MIN_CHOICE_MEMBERS) continue;
        // Read top→bottom; a vertical gap much larger than the typical one separates two questions.
        const sorted = [...sameSize].sort((a, b) => b.y - a.y || a.x - b.x);
        const gaps: number[] = [];
        for (let i = 1; i < sorted.length; i += 1) gaps.push(Math.abs(sorted[i - 1].y - sorted[i].y));
        const positive = gaps.filter((g) => g > Y_TOLERANCE).sort((a, b) => a - b);
        const typical = positive.length > 0 ? positive[Math.floor(positive.length / 2)] : 0;
        const breakAt = typical > 0 ? typical * 2.5 : Infinity;

        let bucket: Positioned[] = [sorted[0]];
        const flush = () => {
            if (bucket.length < MIN_CHOICE_MEMBERS) return;
            groups.push({
                id: groupId(page, "choice_group", bucket[0].y),
                kind: "choice_group",
                page,
                // A checkbox group's meaning is its OPTIONS, which are the member labels. Only use
                // a shared stem as the group name when the members actually share one.
                label: invariantLabel(bucket.map((p) => p.f.label)) || `Checkbox group (${bucket.length} options)`,
                instances: bucket.length,
                member_names: bucket.map((p) => p.f.name),
                member_labels: bucket.map((p) => p.f.label),
                item_types: ["boolean"],
                signals: [
                    `${bucket.length} same-size checkboxes in one block`,
                    `regular ${Math.round(typical)}pt spacing with no larger break inside`,
                ],
            });
        };
        for (let i = 1; i < sorted.length; i += 1) {
            const gap = Math.abs(sorted[i - 1].y - sorted[i].y);
            if (gap > breakAt) {
                flush();
                bucket = [sorted[i]];
            } else {
                bucket.push(sorted[i]);
            }
        }
        flush();
    }
    return groups;
}

/**
 * Recognize the repeating structures a page's widget geometry declares. Returns groups only —
 * the caller decides what to do with them, and every member field remains a real destination.
 */
export function detectRepeatingFieldGroups(fields: PdfFieldRegion[]): RepeatingFieldGroup[] {
    const byPage = new Map<number, Positioned[]>();
    for (const p of positioned(fields)) {
        const page = p.f.page > 0 ? p.f.page : 1;
        if (!byPage.has(page)) byPage.set(page, []);
        byPage.get(page)!.push(p);
    }

    const out: RepeatingFieldGroup[] = [];
    for (const [page, items] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
        const grids = detectGrids(page, items);
        const claimed = new Set(grids.flatMap((g) => g.member_names));
        out.push(...grids, ...detectChoiceGroups(page, items, claimed));
    }
    return out;
}
