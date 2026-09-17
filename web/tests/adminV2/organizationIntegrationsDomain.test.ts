/**
 * Integrations is a first-class Organization configuration domain, and the two places that say so
 * must agree.
 *
 * The defect this closes was not cosmetic. The left rail listed Integrations under Organization
 * while the configuration model did not contain it at all — so `/organization`, which renders
 * strictly from that model, had no Integrations card. An operator who started at the landing page
 * could reasonably conclude the capability did not exist.
 */
import { describe, expect, it } from "vitest";

import { CONFIGURATION_MODE_NAV_ITEMS } from "@/lib/adminV2/configurationModeNav";
import {
    organizationConfigurationDomain,
    organizationConfigurationDomains,
} from "@/lib/configRuntime/organizationRuntime";
import { isOrganizationDomainVisible } from "@/lib/access/surfaceCapabilities";

const navItems = CONFIGURATION_MODE_NAV_ITEMS;

describe("the navigation and the configuration model agree about Integrations", () => {
    it("Integrations is a registered configuration domain", () => {
        const domain = organizationConfigurationDomain("integrations");
        expect(domain).not.toBeNull();
        expect(domain?.label).toBe("Integrations");
        expect(domain?.href).toBe("/organization/integrations");
    });

    it("it is a landing peer, not merely a lookup entry", () => {
        expect(organizationConfigurationDomains().map((d) => d.key)).toContain("integrations");
    });

    it("the left rail and the domain point at the same route", () => {
        const navEntry = navItems.find((item) => item.href === "/organization/integrations");
        expect(navEntry, "Integrations is in the Organization nav").toBeTruthy();
        expect(navEntry?.label).toBe(organizationConfigurationDomain("integrations")?.label);
    });

    it("every Organization nav entry under /organization has a configuration domain behind it", () => {
        /*
         * The general form of the same defect. A nav entry pointing at an `/organization/<domain>`
         * route with no domain registered is a page the landing cannot offer — which is exactly how
         * Integrations went missing for a release.
         */
        const domainHrefs = new Set(organizationConfigurationDomains().map((d) => d.href));
        const orphans = navItems
            .filter((item) => /^\/organization\/[a-z-]+$/.test(item.href))
            .filter((item) => !domainHrefs.has(item.href))
            .map((item) => item.href);
        expect(orphans, "nav routes with no configuration domain").toEqual([]);
    });

    it("the card is offered to the same principals the rail offers it to", () => {
        // Neither surface gates Integrations today, and they must not diverge: a card hidden from
        // someone the rail still shows the entry to is the same contradiction the other way round.
        expect(isOrganizationDomainVisible("integrations", new Set())).toBe(true);
    });
});

describe("the domain describes Integrations honestly", () => {
    const domain = organizationConfigurationDomain("integrations")!;

    it("it explains itself in operator language, not platform language", () => {
        expect(domain.description).toMatch(/external software/i);
        expect(domain.description).not.toMatch(/scope|oauth|installation|api/i);
    });

    it("its health is owned where health can actually be answered", () => {
        // Per-connection facts — credential present, boundary non-empty, requests succeeding —
        // cannot be answered by a static landing card, and claiming "Ready" there would be a
        // guess printed as a verdict.
        expect(domain.health.state).toBe("not_assessed");
        expect(domain.health.detail).toMatch(/per integration/i);
    });

    it("access changes are enforced rather than published", () => {
        expect(domain.publication.mode).toBe("immediate");
        expect(domain.publication.label).toMatch(/request/i);
    });

    it("it owns the four things Integrations actually configures", () => {
        expect(domain.ownedConfiguration).toEqual([
            "Connected applications",
            "Granted capabilities",
            "Location boundary",
            "Credentials and their lifecycle",
        ]);
    });
});
