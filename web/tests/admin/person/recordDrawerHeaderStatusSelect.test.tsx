import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordDrawerHeaderStatusSelect } from "@/components/admin/entity/RecordDrawerHeaderStatusSelect";

describe("RecordDrawerHeaderStatusSelect", () => {
    it("renders nothing when org has no status definitions and record has no status", () => {
        const html = renderToStaticMarkup(
            <RecordDrawerHeaderStatusSelect
                entityLabel="Person"
                currentStatus=""
                statusDisplayLabel={null}
                statusDefs={[]}
                onChange={() => {}}
            />
        );
        expect(html).toBe("");
    });

    it("renders configured options when status definitions exist", () => {
        const html = renderToStaticMarkup(
            <RecordDrawerHeaderStatusSelect
                entityLabel="Person"
                currentStatus="active"
                statusDisplayLabel="Active"
                statusDefs={[{ status_key: "active", status_label: "Active", sort_order: 0, is_active: true }]}
                onChange={() => {}}
            />
        );
        expect(html).toContain("Active");
        expect(html).not.toContain("None");
    });
});
