import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatPersonDrawerRecordNumber } from "@/components/admin/entity/PersonDrawerHeaderMetadata";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("Person drawer premium primitives", () => {

    it("PersonDrawerHeaderMetadata renders compact record number without Person prefix", () => {
        expect(formatPersonDrawerRecordNumber({ person_number: 67 })).toBe("#67");
        const meta = read("components/admin/entity/PersonDrawerHeaderMetadata.tsx");
        expect(meta).not.toContain("Person #");
        expect(meta).toContain("data-record-drawer-back-link");
    });

    it("PersonDrawerProfileBadges use substantial title-rail role pills", () => {
        const src = read("components/admin/entity/PersonDrawerProfileBadges.tsx");
        expect(src).toContain("personDrawerRolePillClassName");
    });

    it("PersonDrawerHeaderMetadata splits contact meta from record number row", () => {
        const meta = read("components/admin/entity/PersonDrawerHeaderMetadata.tsx");
        expect(meta).toContain("PersonDrawerHeaderContactMeta");
        expect(meta).toContain("data-record-drawer-back-link");
    });

);
