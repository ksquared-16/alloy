/**
 * Department page session cache must be keyed by workspace view fingerprint
 * so work-unit summary totals do not cross-contaminate across site selections.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
    readDepartmentPageCache,
    writeDepartmentPageCache,
} from "@/lib/workspace/adminV2WorkspaceSessionCache";
import { workspaceViewCacheFingerprint } from "@/lib/adminV2/workspaceSiteFilterClient";

const ORG = "org-site-scope";
const USER = "user-site-scope";
const DEPT_ID = "dept-site-scope";
const FP = "scope:abc";
const SITE_A = "site-a";
const SITE_B = "site-b";

let store: Record<string, string> = {};

const mockSessionStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
        store[key] = value;
    },
    removeItem: (key: string) => {
        delete store[key];
    },
    clear: () => {
        store = {};
    },
    get length() {
        return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
};

beforeEach(() => {
    store = {};
    Object.defineProperty(globalThis, "sessionStorage", {
        value: mockSessionStorage,
        writable: true,
        configurable: true,
    });
    Object.defineProperty(globalThis, "window", {
        value: globalThis,
        writable: true,
        configurable: true,
    });
});

afterEach(() => {
    store = {};
});

function baseSnap(total: number) {
    return {
        dept: { id: DEPT_ID, name: "Lead Management", key: "lead_management" },
        workUnits: [{ id: "wu-tour", name: "Tours", key: "lifecycle_wu_tour" }],
        workUnitSummaries: {
            "wu-tour": { total, needs_attention: null },
        },
        summariesComplete: true,
    };
}

describe("department page cache site scope", () => {
    it("cache keys differ when selected site differs", () => {
        const fpAll = workspaceViewCacheFingerprint(FP, null);
        const fpSiteA = workspaceViewCacheFingerprint(FP, SITE_A);
        const fpSiteB = workspaceViewCacheFingerprint(FP, SITE_B);

        expect(fpAll).toBe(FP);
        expect(fpSiteA).toBe(`${FP};view:${SITE_A}`);
        expect(fpSiteB).toBe(`${FP};view:${SITE_B}`);

        writeDepartmentPageCache(ORG, USER, fpSiteA, baseSnap(45));
        writeDepartmentPageCache(ORG, USER, fpSiteB, baseSnap(3));

        expect(readDepartmentPageCache(ORG, DEPT_ID, USER, fpSiteA)?.workUnitSummaries["wu-tour"].total).toBe(45);
        expect(readDepartmentPageCache(ORG, DEPT_ID, USER, fpSiteB)?.workUnitSummaries["wu-tour"].total).toBe(3);
    });

    it("all-site and site-specific totals do not cross-contaminate", () => {
        const fpAll = workspaceViewCacheFingerprint(FP, null);
        const fpSiteA = workspaceViewCacheFingerprint(FP, SITE_A);

        writeDepartmentPageCache(ORG, USER, fpAll, baseSnap(96));
        writeDepartmentPageCache(ORG, USER, fpSiteA, baseSnap(7));

        expect(readDepartmentPageCache(ORG, DEPT_ID, USER, fpAll)?.workUnitSummaries["wu-tour"].total).toBe(96);
        expect(readDepartmentPageCache(ORG, DEPT_ID, USER, fpSiteA)?.workUnitSummaries["wu-tour"].total).toBe(7);
        expect(readDepartmentPageCache(ORG, DEPT_ID, USER, FP)?.workUnitSummaries["wu-tour"].total).toBe(96);
    });

    it("site-scoped read does not return all-site cache entry", () => {
        const fpAll = workspaceViewCacheFingerprint(FP, null);
        const fpSiteA = workspaceViewCacheFingerprint(FP, SITE_A);

        writeDepartmentPageCache(ORG, USER, fpAll, baseSnap(45));

        expect(readDepartmentPageCache(ORG, DEPT_ID, USER, fpSiteA)).toBeNull();
    });
});
