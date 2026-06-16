import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Statuses settings delete UX", () => {
    it("optimistically updates local state before refetch", () => {
        const client = read("app/legacy-admin/system/statuses/StatusesClient.tsx");
        expect(client).toContain("setStatuses((prev) =>");
        expect(client).toContain("previousStatuses");
        expect(client).toContain("fetchStatuses({ silent: true })");
    });

    it("shows action message banner after delete/inactivate", () => {
        const client = read("app/legacy-admin/system/statuses/StatusesClient.tsx");
        expect(client).toContain("status-settings-action-message");
        expect(client).toContain("setActionMessage");
    });

    it("supports show inactive toggle", () => {
        const client = read("app/legacy-admin/system/statuses/StatusesClient.tsx");
        expect(client).toContain("status-settings-show-inactive");
        expect(client).toContain("include_inactive");
    });

    it("admin GET bypasses effective status cache", () => {
        const route = read("app/api/admin/status-definitions/route.ts");
        expect(route).toContain("fetchEffectiveStatusDefinitionsDirect");
        expect(route).not.toMatch(/fetchEffectiveStatusDefinitions\(/);
    });

    it("delete route revalidates status cache", () => {
        const route = read("app/api/admin/status-definitions/[id]/route.ts");
        expect(route).toContain("revalidateEffectiveStatusDefinitionsCache");
        expect(route).toContain("planStatusDefinitionDelete");
    });
});
