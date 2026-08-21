import { describe, expect, it, vi } from "vitest";
import {
    buildOrganizationDistributionPlan,
    canApplyOrganizationConfiguration,
    executeOrganizationDistributionPlan,
    organizationConfigurationDomain,
    organizationConfigurationDomains,
    summarizeOrganizationGovernance,
    type OrganizationConfigurationApplyProvider,
    type OrganizationConfigurationDomain,
} from "@/lib/configRuntime/organizationRuntime";
import { resolveConfigLayers } from "@/lib/configRuntime/scope";

const applyDomain: OrganizationConfigurationDomain = {
    key: "schedule-patterns",
    label: "Schedule patterns",
    description: "Reusable weekly patterns.",
    href: "/settings/schedules",
    icon: "business-processes",
    publisherLabel: "Organization",
    configurationOwner: "Scheduling",
    runtimeOwner: "Scheduling",
    consumers: ["Locations"],
    inheritance: {
        kind: "value",
        path: ["organization", "location"],
        label: "Organization publishes; Locations consume",
    },
    publication: { mode: "explicit", status: "published", label: "Published" },
    override: { state: "available", label: "Locations may differ" },
    health: { state: "ready", label: "Ready", detail: "Ready to apply." },
    distributionMode: "apply",
    applyProviderKey: "schedule-pattern-apply-v1",
};

describe("Organization Configuration Runtime", () => {
    it("registers one system-of-record home per configuration area", () => {
        const domains = organizationConfigurationDomains();
        expect(new Set(domains.map((domain) => domain.key)).size).toBe(domains.length);
        expect(domains.every((domain) => domain.configurationOwner.trim().length > 0)).toBe(true);
        expect(domains.map((domain) => domain.key)).toEqual([
            "programs-locations",
            "financials",
            // `staff` arrived with the Employment foundation merge and this ordered list was not
            // updated with it, so the branch inherited a red assertion about a domain that really
            // does exist. The list is still exhaustive and still ordered — that is the property.
            "staff",
            "access",
            "communications",
            "data-model",
            "automation",
            "business-processes",
            "surfaces",
            "operational-intelligence",
        ]);
        expect(domains.some((domain) => domain.key === "programs")).toBe(false);
        expect(organizationConfigurationDomain("locations")?.distributionMode).toBe("none");
        expect(organizationConfigurationDomain("programs-locations")?.label).toBe("Programs & Locations");
        expect(organizationConfigurationDomain("programs")?.inheritance.path).toEqual([
            "organization",
            "location",
        ]);
        expect(organizationConfigurationDomain("commercial")?.key).toBe("programs");
        expect(organizationConfigurationDomain("programs")?.consumers).toContain("Locations");
        expect(
            organizationConfigurationDomain("programs")?.ownedConfiguration?.every(
                (item) => !/capacity|rooms?/i.test(item),
            ),
        ).toBe(true);
        expect(organizationConfigurationDomain("financials")?.href).toBe("/organization/financials");
    });

    it("resolves the nearest explicitly present layer without losing falsy values", () => {
        expect(
            resolveConfigLayers([
                { authority: "platform", present: true, value: true },
                { authority: "org", present: true, value: false },
                { authority: "location", present: false, value: true },
            ]),
        ).toEqual({ value: false, authority: "org", isOverride: false });

        expect(
            resolveConfigLayers([
                { authority: "org", present: true, value: "shared" },
                { authority: "location", present: true, value: "" },
            ]),
        ).toEqual({ value: "", authority: "location", isOverride: true });
    });

    it("keeps Apply hidden until a matching authoritative provider is registered", () => {
        const wrongProvider: OrganizationConfigurationApplyProvider = {
            key: "schedule-pattern-apply-v1",
            domainKey: "other",
            apply: vi.fn(),
        };
        expect(canApplyOrganizationConfiguration(applyDomain, [])).toBe(false);
        expect(canApplyOrganizationConfiguration(applyDomain, [wrongProvider])).toBe(false);
        expect(
            canApplyOrganizationConfiguration(applyDomain, [
                { ...wrongProvider, domainKey: applyDomain.key },
            ]),
        ).toBe(true);
    });

    it("builds a deterministic, retry-safe plan only from a published revision", () => {
        const provider: OrganizationConfigurationApplyProvider = {
            key: "schedule-pattern-apply-v1",
            domainKey: applyDomain.key,
            apply: vi.fn(),
        };
        const publication = {
            domainKey: applyDomain.key,
            configurationId: "pattern-1",
            revision: "rev-4",
            state: "published" as const,
        };
        const plan = buildOrganizationDistributionPlan({
            orgId: "org-1",
            domain: applyDomain,
            publication,
            providers: [provider],
            targets: [
                { locationId: "loc-b", locationLabel: "North" },
                { locationId: "loc-a", locationLabel: "Downtown" },
                { locationId: "loc-b", locationLabel: "Duplicate" },
            ],
        });
        const retry = buildOrganizationDistributionPlan({
            orgId: "org-1",
            domain: applyDomain,
            publication,
            providers: [provider],
            targets: [...plan.targets].reverse(),
        });

        expect(plan.targets.map((target) => target.locationId)).toEqual(["loc-a", "loc-b"]);
        expect(retry.idempotencyKey).toBe(plan.idempotencyKey);
        expect(() =>
            buildOrganizationDistributionPlan({
                orgId: "org-1",
                domain: applyDomain,
                publication: { ...publication, state: "draft" },
                providers: [provider],
                targets: plan.targets,
            }),
        ).toThrow("Publish this configuration");
    });

    it("requires authoritative confirmation for every selected location", async () => {
        const apply = vi.fn<OrganizationConfigurationApplyProvider["apply"]>(
            async () => ({
                auditId: "audit-1",
                authoritativeRevision: "rev-4",
                targets: [{ locationId: "loc-a", status: "applied" }],
            }),
        );
        const provider: OrganizationConfigurationApplyProvider = {
            key: "schedule-pattern-apply-v1",
            domainKey: applyDomain.key,
            apply,
        };
        const plan = buildOrganizationDistributionPlan({
            orgId: "org-1",
            domain: applyDomain,
            publication: {
                domainKey: applyDomain.key,
                configurationId: "pattern-1",
                revision: "rev-4",
                state: "published",
            },
            providers: [provider],
            targets: [
                { locationId: "loc-a", locationLabel: "Downtown" },
                { locationId: "loc-b", locationLabel: "North" },
            ],
        });

        await expect(executeOrganizationDistributionPlan(plan, [provider])).rejects.toThrow(
            "every selected location",
        );

        apply.mockResolvedValueOnce({
            auditId: "audit-2",
            authoritativeRevision: "rev-4",
            targets: [
                { locationId: "loc-a", status: "applied" },
                { locationId: "loc-b", status: "unchanged" },
            ],
        });
        await expect(executeOrganizationDistributionPlan(plan, [provider])).resolves.toMatchObject({
            auditId: "audit-2",
        });
    });

    it("keeps unassessed location posture distinct from inherited or overridden", () => {
        expect(
            summarizeOrganizationGovernance({
                activeLocationIds: ["loc-a", "loc-b"],
                states: [
                    {
                        locationId: "loc-a",
                        locationLabel: "Downtown",
                        domainKey: "programs",
                        posture: "inherited",
                    },
                    {
                        locationId: "loc-b",
                        locationLabel: "North",
                        domainKey: "programs",
                        posture: "not_assessed",
                    },
                ],
            }),
        ).toEqual({
            activeLocationCount: 2,
            assessedLocationCount: 1,
            inheritedCount: 1,
            overriddenCount: 0,
            assignedCount: 0,
            notAssessedCount: 1,
        });
    });
});
