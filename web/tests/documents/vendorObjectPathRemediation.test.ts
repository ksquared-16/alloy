/**
 * Phase 0 commit 6C — vendor object path remediation utility.
 *
 * All fixtures are in-memory. Nothing here touches production storage or the
 * shared tenant.
 *
 * The most important case is the one that matches live reality: none of the six
 * objects has a `documents` row and none of the vendor ids resolves, so every
 * one must fail closed rather than have ownership guessed.
 */
import { describe, expect, it } from "vitest";

import {
    BUCKET,
    DEFAULT_MODE,
    buildPlan,
    canonicalDestination,
    parseVendorIdFromPath,
    runRemediation,
    type DbAdapter,
    type StorageAdapter,
} from "@/scripts/vendorObjectPathRemediation";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_ORG = "bbbbbbbb-0000-4000-8000-000000000002";
const VENDOR = "1bc72438-9a86-408d-ad64-40d01696895d";

/** The six real nonconforming paths, verified live 2026-07-31. */
const LIVE_OBJECTS = [
    "vendors/1bc72438-9a86-408d-ad64-40d01696895d/drivers_license/0d4fd47e-88b4-4fb8-97b6-1f160bea0d1a.png",
    "vendors/1bc72438-9a86-408d-ad64-40d01696895d/insurance/666d5018-3e65-4785-ad32-8739a057fec7.png",
    "vendors/6aea3036-10f6-4006-aba9-7a20b9dc37c3/drivers_license/127beb9f-70a4-450d-89b9-2562333caa18.png",
    "vendors/6aea3036-10f6-4006-aba9-7a20b9dc37c3/insurance/b024de90-0bcf-49fa-b73d-042c40de0c49.png",
    "vendors/bfe0c35e-e038-46b8-970d-0c711a144a11/drivers_license/f3627923-623d-4be0-97fc-0d13cebd5d11.png",
    "vendors/bfe0c35e-e038-46b8-970d-0c711a144a11/insurance/7a160587-588b-4159-b96c-63505e3ebf3a.png",
];

type Fixture = {
    objects: Set<string>;
    documents: Map<string, { id: string; org_id: string }>;
    vendors: Map<string, { id: string; org_id: string }>;
    copies: Array<{ from: string; to: string }>;
    removals: string[];
    rowUpdates: Array<{ documentId: string; path: string }>;
};

function fixture(over: Partial<Fixture> = {}): Fixture {
    return {
        objects: new Set(LIVE_OBJECTS),
        documents: new Map(),
        vendors: new Map(),
        copies: [],
        removals: [],
        rowUpdates: [],
        ...over,
    };
}

function adapters(f: Fixture): { storage: StorageAdapter; db: DbAdapter } {
    return {
        storage: {
            async list(prefix) {
                return [...f.objects].filter((o) => o.startsWith(prefix));
            },
            async exists(path) {
                return f.objects.has(path);
            },
            async copy(from, to) {
                f.copies.push({ from, to });
                f.objects.add(to);
            },
            async remove(path) {
                f.removals.push(path);
                f.objects.delete(path);
            },
        },
        db: {
            async findDocumentByPath(_bucket, path) {
                return f.documents.get(path) ?? null;
            },
            async findVendor(vendorId) {
                return f.vendors.get(vendorId) ?? null;
            },
            async updateDocumentPath(documentId, path) {
                f.rowUpdates.push({ documentId, path });
            },
        },
    };
}

/** A fully mappable object, for exercising the happy path. */
function mappableFixture(): Fixture {
    const path = LIVE_OBJECTS[0];
    const f = fixture({ objects: new Set([path]) });
    f.documents.set(path, { id: "doc-1", org_id: ORG });
    f.vendors.set(VENDOR, { id: VENDOR, org_id: ORG });
    return f;
}

describe("6C — defaults and safety", () => {
    it("defaults to dry-run", () => {
        expect(DEFAULT_MODE).toBe("dry-run");
    });

    it("dry-run never mutates", async () => {
        const f = mappableFixture();
        const { storage, db } = adapters(f);

        const report = await runRemediation({ storage, db });

        expect(report.mode).toBe("dry-run");
        expect(report.readOnly).toBe(true);
        expect(f.copies).toHaveLength(0);
        expect(f.removals).toHaveLength(0);
        expect(f.rowUpdates).toHaveLength(0);
    });

    it("refuses every mutating mode without explicit authorization", async () => {
        for (const mode of ["copy-and-update", "delete-old", "rollback"] as const) {
            const f = mappableFixture();
            const { storage, db } = adapters(f);

            const report = await runRemediation({ mode, storage, db });

            expect(report.readOnly, mode).toBe(true);
            expect(report.totals.mutated, mode).toBe(0);
            expect(f.copies, mode).toHaveLength(0);
            expect(f.removals, mode).toHaveLength(0);
            expect(f.rowUpdates, mode).toHaveLength(0);
            expect(report.notes.join(" ")).toMatch(/requires explicit authorization/);
        }
    });

    it("enumerates only the nonconforming vendor prefix", async () => {
        const f = fixture();
        f.objects.add(`${ORG}/persons/abc/file.pdf`);
        const { storage, db } = adapters(f);

        const report = await runRemediation({ storage, db });

        expect(report.totals.enumerated).toBe(LIVE_OBJECTS.length);
        expect(report.plans.every((p) => p.objectPath.startsWith("vendors/"))).toBe(true);
    });
});

describe("6C — live reality: ownership cannot be established", () => {
    it("fails closed on all six objects, exactly as found in the live environment", async () => {
        // No documents rows, no vendor rows — the verified state.
        const f = fixture();
        const { storage, db } = adapters(f);

        const report = await runRemediation({ storage, db });

        expect(report.totals.enumerated).toBe(6);
        expect(report.totals.mappable).toBe(0);
        expect(report.totals.blocked).toBe(6);
        expect(report.plans.every((p) => p.status === "blocked")).toBe(true);
        expect(report.plans.every((p) => p.blockedReason === "NO_DOCUMENT_ROW")).toBe(true);
        expect(report.notes.join(" ")).toMatch(/No guess is made/);
    });

    it("copy-and-update performs nothing when everything is blocked", async () => {
        const f = fixture();
        const { storage, db } = adapters(f);

        const report = await runRemediation({ mode: "copy-and-update", storage, db, authorizedToMutate: true });

        expect(report.totals.mutated).toBe(0);
        expect(f.copies).toHaveLength(0);
        expect(f.rowUpdates).toHaveLength(0);
    });

    it("blocks when a document row exists but the vendor does not", async () => {
        const f = fixture({ objects: new Set([LIVE_OBJECTS[0]]) });
        f.documents.set(LIVE_OBJECTS[0], { id: "doc-1", org_id: ORG });

        const plans = await buildPlan(adapters(f).storage, adapters(f).db);

        expect(plans[0].status).toBe("blocked");
        expect(plans[0].blockedReason).toBe("NO_VENDOR_ROW");
    });

    it("blocks when the vendor belongs to another organization", async () => {
        const f = fixture({ objects: new Set([LIVE_OBJECTS[0]]) });
        f.documents.set(LIVE_OBJECTS[0], { id: "doc-1", org_id: ORG });
        f.vendors.set(VENDOR, { id: VENDOR, org_id: OTHER_ORG });

        const plans = await buildPlan(adapters(f).storage, adapters(f).db);

        expect(plans[0].status).toBe("blocked");
        expect(plans[0].blockedReason).toBe("VENDOR_ORG_MISMATCH");
    });

    it("blocks an unparseable path", async () => {
        const f = fixture({ objects: new Set(["vendors/not-a-uuid/insurance/x.png"]) });
        const plans = await buildPlan(adapters(f).storage, adapters(f).db);
        expect(plans[0].blockedReason).toBe("UNPARSEABLE_PATH");
    });
});

describe("6C — path computation", () => {
    it("parses the vendor id only when it is a uuid", () => {
        expect(parseVendorIdFromPath(LIVE_OBJECTS[0])).toBe(VENDOR);
        expect(parseVendorIdFromPath("vendors/nope/insurance/x.png")).toBeNull();
        expect(parseVendorIdFromPath("persons/abc/x.png")).toBeNull();
    });

    it("computes an org-scoped destination that satisfies the convention", () => {
        const dest = canonicalDestination(LIVE_OBJECTS[0], ORG);
        expect(dest).toBe(`${ORG}/vendors/${VENDOR}/drivers_license/0d4fd47e-88b4-4fb8-97b6-1f160bea0d1a.png`);
        expect(dest!.split("/")[0]).toBe(ORG);
    });
});

describe("6C — mappable object lifecycle", () => {
    it("detects a destination collision and blocks rather than overwriting", async () => {
        const f = mappableFixture();
        f.objects.add(canonicalDestination(LIVE_OBJECTS[0], ORG)!);
        const { storage, db } = adapters(f);

        const report = await runRemediation({ storage, db });

        expect(report.plans[0].collision).toBe(true);
        expect(report.plans[0].status).toBe("blocked");
        expect(report.plans[0].blockedReason).toBe("DESTINATION_COLLISION");
    });

    it("copies, verifies, then updates the row — in that order", async () => {
        const f = mappableFixture();
        const { storage, db } = adapters(f);

        const report = await runRemediation({ mode: "copy-and-update", storage, db, authorizedToMutate: true });

        expect(report.totals.mutated).toBe(1);
        expect(f.copies).toHaveLength(1);
        expect(f.rowUpdates).toHaveLength(1);
        expect(f.rowUpdates[0].path).toBe(f.copies[0].to);
        // Old object retained; deletion is a separate authorized mode.
        expect(f.removals).toHaveLength(0);
        expect(report.notes.join(" ")).toMatch(/Old objects retained/);
    });

    it("does not update the row when copy verification fails", async () => {
        const f = mappableFixture();
        const a = adapters(f);
        // Copy silently does not land.
        a.storage.copy = async () => {};

        const report = await runRemediation({
            mode: "copy-and-update",
            storage: a.storage,
            db: a.db,
            authorizedToMutate: true,
        });

        expect(report.totals.mutated).toBe(0);
        expect(f.rowUpdates).toHaveLength(0);
        expect(report.notes.join(" ")).toMatch(/verification failed/);
    });

    it("delete-old refuses when the destination is not verified", async () => {
        const f = mappableFixture();
        const { storage, db } = adapters(f);

        const report = await runRemediation({ mode: "delete-old", storage, db, authorizedToMutate: true });

        expect(f.removals).toHaveLength(0);
        expect(report.notes.join(" ")).toMatch(/Refusing to delete/);
    });

    it("delete-old removes the original only after a verified copy", async () => {
        const f = mappableFixture();
        const a = adapters(f);
        await runRemediation({ mode: "copy-and-update", storage: a.storage, db: a.db, authorizedToMutate: true });

        const report = await runRemediation({
            mode: "delete-old",
            storage: a.storage,
            db: a.db,
            authorizedToMutate: true,
        });

        expect(report.totals.mutated).toBe(1);
        expect(f.removals).toEqual([LIVE_OBJECTS[0]]);
    });

    it("rollback restores the row to the original path", async () => {
        const f = mappableFixture();
        const a = adapters(f);
        await runRemediation({ mode: "copy-and-update", storage: a.storage, db: a.db, authorizedToMutate: true });
        f.rowUpdates.length = 0;

        const report = await runRemediation({
            mode: "rollback",
            storage: a.storage,
            db: a.db,
            authorizedToMutate: true,
        });

        expect(report.totals.mutated).toBe(1);
        expect(f.rowUpdates[0].path).toBe(LIVE_OBJECTS[0]);
    });

    it("rollback refuses when the original object is gone", async () => {
        const f = mappableFixture();
        const a = adapters(f);
        await runRemediation({ mode: "copy-and-update", storage: a.storage, db: a.db, authorizedToMutate: true });
        await runRemediation({ mode: "delete-old", storage: a.storage, db: a.db, authorizedToMutate: true });

        const report = await runRemediation({
            mode: "rollback",
            storage: a.storage,
            db: a.db,
            authorizedToMutate: true,
        });

        // Once delete-old has run the original is gone, so nothing enumerates
        // and rollback is genuinely impossible. The utility must say that
        // rather than reporting a silent zero.
        expect(report.totals.mutated).toBe(0);
        expect(report.notes.join(" ")).toMatch(/rollback is no longer possible/);
    });
});

describe("6C — report shape", () => {
    it("emits a machine-readable report", async () => {
        const f = fixture();
        const { storage, db } = adapters(f);

        const report = await runRemediation({ storage, db });

        expect(report.bucket).toBe(BUCKET);
        expect(report.generatedAt).toBeTruthy();
        expect(report.totals).toMatchObject({ enumerated: 6, mappable: 0, blocked: 6, mutated: 0 });
        expect(() => JSON.parse(JSON.stringify(report))).not.toThrow();
    });
});
