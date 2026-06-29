import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
    ORG_SCOPE_SELECTION,
    ScopePicker,
    isScopeSelectionComplete,
    scopeSelectionToPayload,
    type ScopeOptions,
    type ScopeSelection,
} from "@/components/adminV2/settings/configurationRuntime/ScopePicker";

const OPTIONS: ScopeOptions = {
    sites: [{ id: "site-1", label: "Austin Campus" }],
    programs: [{ id: "prog-1", label: "Toddler · Austin Campus" }],
    rooms: [{ id: "room-1", label: "Toddler A · Austin Campus" }],
};

describe("ScopePicker — scopeSelectionToPayload emits correct scope_type + ids", () => {
    it("org → just scope_type, no ids", () => {
        expect(scopeSelectionToPayload(ORG_SCOPE_SELECTION)).toEqual({ scope_type: "org" });
    });

    it("site → site_location_id only", () => {
        const sel: ScopeSelection = { scopeType: "site", siteLocationId: "site-1", programCategoryId: null, roomLocationId: null };
        expect(scopeSelectionToPayload(sel)).toEqual({ scope_type: "site", site_location_id: "site-1" });
    });

    it("program → program_category_id only", () => {
        const sel: ScopeSelection = { scopeType: "program", siteLocationId: null, programCategoryId: "prog-1", roomLocationId: null };
        expect(scopeSelectionToPayload(sel)).toEqual({ scope_type: "program", program_category_id: "prog-1" });
    });

    it("room → room_location_id only", () => {
        const sel: ScopeSelection = { scopeType: "room", siteLocationId: null, programCategoryId: null, roomLocationId: "room-1" };
        expect(scopeSelectionToPayload(sel)).toEqual({ scope_type: "room", room_location_id: "room-1" });
    });
});

describe("ScopePicker — isScopeSelectionComplete", () => {
    it("org is always complete", () => {
        expect(isScopeSelectionComplete(ORG_SCOPE_SELECTION)).toBe(true);
    });
    it("non-org requires its target id", () => {
        expect(isScopeSelectionComplete({ scopeType: "site", siteLocationId: null, programCategoryId: null, roomLocationId: null })).toBe(false);
        expect(isScopeSelectionComplete({ scopeType: "site", siteLocationId: "site-1", programCategoryId: null, roomLocationId: null })).toBe(true);
        expect(isScopeSelectionComplete({ scopeType: "room", siteLocationId: null, programCategoryId: null, roomLocationId: null })).toBe(false);
    });
});

describe("ScopePicker — displays human labels, never raw IDs", () => {
    it("org selection shows scope-type labels and no target select", () => {
        const html = renderToStaticMarkup(
            <ScopePicker value={ORG_SCOPE_SELECTION} onChange={() => {}} options={OPTIONS} />,
        );
        expect(html).toContain("Org default");
        expect(html).toContain("Location override");
        // No target select rendered for org scope.
        expect(html).not.toContain("scope-picker-target");
    });

    it("site selection shows the location label, not its UUID, in the target select", () => {
        const sel: ScopeSelection = { scopeType: "site", siteLocationId: "site-1", programCategoryId: null, roomLocationId: null };
        const html = renderToStaticMarkup(<ScopePicker value={sel} onChange={() => {}} options={OPTIONS} />);
        expect(html).toContain("Austin Campus"); // human label visible
        expect(html).toContain("scope-picker-target");
    });

    it("program selection shows the program label", () => {
        const sel: ScopeSelection = { scopeType: "program", siteLocationId: null, programCategoryId: "prog-1", roomLocationId: null };
        const html = renderToStaticMarkup(<ScopePicker value={sel} onChange={() => {}} options={OPTIONS} />);
        expect(html).toContain("Toddler · Austin Campus");
    });
});
