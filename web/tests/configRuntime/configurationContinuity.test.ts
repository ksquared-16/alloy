import { afterEach, describe, expect, it, vi } from "vitest";
import {
    isConfigurationSoftNavEligibleHref,
    resolveConfigurationSoftNavVariant,
    normalizeConfigurationSoftNavPathname,
} from "@/lib/configRuntime/configurationContinuity";
import {
    clearAllConfigurationSelectionForTests,
    readConfigurationSelection,
    writeConfigurationSelection,
} from "@/lib/configRuntime/configurationSelectionRetention";
import {
    publishConfigurationInvalidation,
    resetConfigurationInvalidationForTests,
    subscribeConfigurationInvalidation,
} from "@/lib/configRuntime/configurationInvalidation";
import { shouldSoftNavigate } from "@/lib/adminV2/navigation/adminV2SoftNavLinkCommit";
import {
    normalizeSoftNavReloadPathname,
    shouldFireReloadFloor,
} from "@/lib/adminV2/navigation/adminV2SoftNavReloadFloor";
import { CONFIGURATION_MODE_NAV_GROUPS } from "@/lib/adminV2/configurationModeNav";

afterEach(() => {
    vi.unstubAllEnvs();
    resetConfigurationInvalidationForTests();
    clearAllConfigurationSelectionForTests();
});

describe("Configuration Continuity — soft-nav eligibility", () => {
    it("treats Organization and Settings as soft-nav eligible", () => {
        expect(isConfigurationSoftNavEligibleHref("/organization")).toBe(true);
        expect(isConfigurationSoftNavEligibleHref("/organization/programs")).toBe(true);
        expect(isConfigurationSoftNavEligibleHref("/organization/locations")).toBe(true);
        expect(isConfigurationSoftNavEligibleHref("/settings/locations")).toBe(true);
        expect(isConfigurationSoftNavEligibleHref("/settings/fields")).toBe(true);
        expect(isConfigurationSoftNavEligibleHref("/adminV2/settings/locations")).toBe(true);
    });

    it("excludes workflows and operator workspace from Configuration eligibility", () => {
        expect(isConfigurationSoftNavEligibleHref("/admin/workflows")).toBe(false);
        expect(isConfigurationSoftNavEligibleHref("/workspace")).toBe(false);
        expect(isConfigurationSoftNavEligibleHref("/workspace/work-unit/a")).toBe(false);
    });

    it("resolves organization vs configuration soft-nav variants", () => {
        expect(resolveConfigurationSoftNavVariant("/organization")).toBe("organization");
        expect(resolveConfigurationSoftNavVariant("/settings/locations")).toBe("configuration");
        expect(resolveConfigurationSoftNavVariant("/organization/programs")).toBe("configuration");
    });

    it("shouldSoftNavigate is true for Organization/Settings by default", () => {
        expect(shouldSoftNavigate("/organization")).toBe(true);
        expect(shouldSoftNavigate("/settings/locations")).toBe(true);
        expect(shouldSoftNavigate("/organization/programs")).toBe(true);
        expect(shouldSoftNavigate("/admin/workflows")).toBe(false);
    });

    it("kill switch forces hard nav for Configuration Continuity too", () => {
        vi.stubEnv("NEXT_PUBLIC_ADMIN_V2_SOFT_SIDEBAR_NAV", "0");
        expect(shouldSoftNavigate("/organization")).toBe(false);
        expect(shouldSoftNavigate("/settings/locations")).toBe(false);
    });
});

describe("Configuration Continuity — reload floor path normalization", () => {
    it("equates rewrite-internal settings paths with canonical browser paths", () => {
        expect(normalizeSoftNavReloadPathname("/adminV2/settings/organization")).toBe("/organization");
        expect(normalizeConfigurationSoftNavPathname("/adminV2/settings/locations")).toBe(
            "/settings/locations",
        );
        expect(
            shouldFireReloadFloor({
                currentPathname: "/adminV2/settings/organization",
                targetPathname: "/organization",
                superseded: false,
            }),
        ).toBe(false);
    });
});

describe("Configuration Continuity — selection retention", () => {
    it("persists and restores Location / Program selection hints", () => {
        const store = new Map<string, string>();
        vi.stubGlobal("window", {
            sessionStorage: {
                getItem: (k: string) => store.get(k) ?? null,
                setItem: (k: string, v: string) => {
                    store.set(k, v);
                },
                removeItem: (k: string) => {
                    store.delete(k);
                },
                clear: () => store.clear(),
                key: (i: number) => [...store.keys()][i] ?? null,
                get length() {
                    return store.size;
                },
            },
        });
        writeConfigurationSelection("org-1", {
            locationId: "loc-1",
            locationTab: "rooms",
            locationItemId: "room-9",
            programId: "prog-1",
            programSection: "overview",
        });
        const snap = readConfigurationSelection("org-1");
        expect(snap?.locationId).toBe("loc-1");
        expect(snap?.locationTab).toBe("rooms");
        expect(snap?.programId).toBe("prog-1");
        expect(snap?.programSection).toBe("overview");
    });
});

describe("Configuration Continuity — invalidation bus", () => {
    it("publishes to subscribers without throwing", () => {
        vi.stubEnv("NEXT_PUBLIC_PERF_PERCEIVED_MARKS", "0");
        vi.stubGlobal("window", {
            dispatchEvent: () => true,
        });
        const seen: string[] = [];
        const unsub = subscribeConfigurationInvalidation((e) => {
            seen.push(`${e.scope}:${e.reason}`);
        });
        publishConfigurationInvalidation("locations", "site-saved", "loc-1");
        expect(seen).toEqual(["locations:site-saved"]);
        unsub();
    });
});

describe("Configuration Continuity — Programs nav IA", () => {
    it("config-mode Programs points at canonical /organization/programs", () => {
        const business = CONFIGURATION_MODE_NAV_GROUPS.find((g) => g.id === "business");
        const programs = business?.items.find((i) => i.testId === "config-mode-nav-programs");
        expect(programs?.href).toBe("/organization/programs");
        expect(programs?.href).not.toBe("/settings/commercial");
    });

    it("config-mode Locations points at canonical /organization/locations", () => {
        const organization = CONFIGURATION_MODE_NAV_GROUPS.find((g) => g.id === "organization");
        const locations = organization?.items.find((i) => i.testId === "config-mode-nav-locations");
        expect(locations?.href).toBe("/organization/locations");
    });
});
