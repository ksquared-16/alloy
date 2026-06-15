import { describe, expect, it } from "vitest";
import {
    OPERATIONAL_QUEUE_ROW_ACTIONS_SHELL_WIDTH,
    buildOperationalQueueRowContentGridFromColumns,
} from "@/lib/layout/operationalQueueRowShell";
import { columnGridTemplate } from "@/lib/layout/queueRecordLayoutEditorModel";
import { defaultLeadQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";
import { queueRecordWidthToCss } from "@/lib/layout/queueRecordLayoutWidth";

describe("operationalQueueRowShell", () => {
    it("maps saved column width tokens to grid tracks", () => {
        const columns = [
            { width: "medium" as const },
            { width: "medium" as const },
            { width: "small" as const },
            { width: "large" as const },
            { width: "flex" as const },
        ];
        expect(buildOperationalQueueRowContentGridFromColumns(columns)).toBe(
            columns.map((col) => queueRecordWidthToCss(col.width)).join(" "),
        );
    });

    it("columnGridTemplate uses configured widths from layout metadata", () => {
        const layout = defaultLeadQueueLayoutV3();
        const custom = {
            ...layout,
            columns: layout.columns.map((col, index) => ({
                ...col,
                width: (index === 2 ? "small" : index === 3 ? "large" : "medium") as "small" | "medium" | "large",
            })),
        };
        const grid = columnGridTemplate(custom);
        expect(grid).toContain(queueRecordWidthToCss("small"));
        expect(grid).toContain(queueRecordWidthToCss("large"));
        expect(grid).toContain(queueRecordWidthToCss("medium"));
        expect((grid.match(/minmax\(/g) ?? []).length).toBe(custom.columns.length);
    });

    it("default lead layout grid reflects semantic width tokens", () => {
        const layout = defaultLeadQueueLayoutV3();
        expect(columnGridTemplate(layout)).toBe(
            layout.columns.map((col) => queueRecordWidthToCss(col.width)).join(" "),
        );
    });

    it("reserves a fixed actions rail width outside the content grid", () => {
        expect(OPERATIONAL_QUEUE_ROW_ACTIONS_SHELL_WIDTH).toBe("168px");
    });
});
