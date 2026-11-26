import { describe, expect, it } from "vitest";
import { detectRepeatingFieldGroups } from "@/lib/pos/processingCase/structure/repeatingFieldGroups";
import type { PdfFieldRegion } from "@/lib/pos/processingCase/structure/pdfAcroForm";

type Spec = { name: string; type: PdfFieldRegion["type"]; x: number; y: number; w?: number; h?: number; page?: number };
const F = ({ name, type, x, y, w = 60, h = 16, page = 1 }: Spec): PdfFieldRegion => ({
    label: name,
    name,
    type,
    page,
    bbox: [x, y, x + w, y + h],
});

describe("detectRepeatingFieldGroups — a grid of one repeated value", () => {
    // 3 rows × 4 aligned same-type columns: each row repeats ONE datum four times.
    const grid = ["alpha", "beta", "gamma"].flatMap((row, r) =>
        [0, 1, 2, 3].map((c) => F({ name: `dose ${c + 1} ${row}`, type: "text", x: 200 + c * 72, y: 400 - r * 24 }))
    );

    it("reads each row as its own value series", () => {
        const groups = detectRepeatingFieldGroups(grid);
        expect(groups.filter((g) => g.kind === "value_series")).toHaveLength(3);
        expect(groups.every((g) => g.instances === 4)).toBe(true);
    });

    it("names the series by what its members share, not by the first one", () => {
        const g = detectRepeatingFieldGroups(grid).find((x) => x.member_names[0] === "dose 1 alpha")!;
        expect(g.label).toBe("alpha");
    });

    it("keeps a short row — a vaccine with two doses is still that vaccine's schedule", () => {
        const ragged = [...grid, F({ name: "dose 1 delta", type: "text", x: 200, y: 328 }), F({ name: "dose 2 delta", type: "text", x: 272, y: 328 })];
        const g = detectRepeatingFieldGroups(ragged).find((x) => x.label === "delta");
        expect(g?.kind).toBe("value_series");
        expect(g?.instances).toBe(2);
    });

    it("excludes a differently-typed cell parked in one of the columns", () => {
        // The real CIS puts a "date of chickenpox disease" date widget inside a dose column.
        const withIntruder = [...grid, F({ name: "disease date", type: "date", x: 416, y: 376 })];
        const groups = detectRepeatingFieldGroups(withIntruder);
        expect(groups.flatMap((g) => g.member_names)).not.toContain("disease date");
    });

    it("never pulls a signature into a grid", () => {
        const withSig = [...grid, F({ name: "signature", type: "signature", x: 200, y: 300, w: 200 })];
        expect(detectRepeatingFieldGroups(withSig).flatMap((g) => g.member_names)).not.toContain("signature");
    });
});

describe("detectRepeatingFieldGroups — a table whose rows are records", () => {
    const table = [1, 2, 3, 4, 5].flatMap((r) => [
        F({ name: `item name Row${r}`, type: "text", x: 24, y: 600 - r * 20, w: 139 }),
        F({ name: `item date Row${r}`, type: "date", x: 165, y: 600 - r * 20, w: 91 }),
    ]);

    it("is one repeating collection, not one series per row", () => {
        const groups = detectRepeatingFieldGroups(table);
        expect(groups).toHaveLength(1);
        expect(groups[0].kind).toBe("repeating_record");
        expect(groups[0].instances).toBe(5);
        expect(groups[0].member_names).toHaveLength(10);
        expect(groups[0].item_types).toEqual(["text", "date"]);
    });

    it("takes its name from the column a table labels itself by", () => {
        expect(detectRepeatingFieldGroups(table)[0].label).toBe("item name");
    });

    it("does not admit a row that occupies different columns", () => {
        // Two unrelated widgets that merely share a baseline are not a row of this table.
        const withStray = [
            ...table,
            F({ name: "stray left", type: "boolean", x: 300, y: 300, w: 15, h: 15 }),
            F({ name: "stray right", type: "boolean", x: 480, y: 300, w: 15, h: 15 }),
            F({ name: "stray left 2", type: "boolean", x: 300, y: 280, w: 15, h: 15 }),
            F({ name: "stray right 2", type: "boolean", x: 480, y: 280, w: 15, h: 15 }),
            F({ name: "stray left 3", type: "boolean", x: 300, y: 260, w: 15, h: 15 }),
            F({ name: "stray right 3", type: "boolean", x: 480, y: 260, w: 15, h: 15 }),
        ];
        const record = detectRepeatingFieldGroups(withStray).find((g) => g.kind === "repeating_record")!;
        expect(record.instances).toBe(5);
        expect(record.member_names.some((n) => n.startsWith("stray"))).toBe(false);
    });
});

describe("detectRepeatingFieldGroups — checkbox groups", () => {
    const boxes = (names: string[], startY: number, step = 20) =>
        names.map((n, i) => F({ name: n, type: "boolean", x: 48, y: startY - i * step, w: 14.85, h: 14.85 }));

    it("splits two blocks separated by a large gap into two questions", () => {
        const groups = detectRepeatingFieldGroups([...boxes(["a", "b", "c"], 400), ...boxes(["x", "y", "z"], 200)]);
        expect(groups.filter((g) => g.kind === "choice_group")).toHaveLength(2);
        expect(groups.map((g) => g.member_names)).toEqual([
            ["a", "b", "c"],
            ["x", "y", "z"],
        ]);
    });

    it("still groups a checkbox whose widget box is a fraction of a point off", () => {
        // The real CIS draws one exemption checkbox 15.37 × 14.32 and its neighbour 14.85 × 14.85.
        const groups = detectRepeatingFieldGroups([
            F({ name: "module", type: "boolean", x: 27, y: 379, w: 14.85, h: 14.85 }),
            F({ name: "provider", type: "boolean", x: 27, y: 363, w: 15.37, h: 14.32 }),
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].member_names).toEqual(["module", "provider"]);
    });

    it("does not group a lone checkbox", () => {
        expect(detectRepeatingFieldGroups([F({ name: "agree", type: "boolean", x: 48, y: 400, w: 15, h: 15 })])).toHaveLength(0);
    });
});

describe("detectRepeatingFieldGroups — honesty", () => {
    it("finds nothing without geometry", () => {
        expect(detectRepeatingFieldGroups([{ label: "a", name: "a", type: "text", page: 1, bbox: null }])).toEqual([]);
    });

    it("finds nothing in a plain stack of unaligned single fields", () => {
        const stack = ["name", "email", "phone", "address"].map((n, i) => F({ name: n, type: "text", x: 72 + i * 3, y: 500 - i * 30 }));
        expect(detectRepeatingFieldGroups(stack)).toEqual([]);
    });
});
