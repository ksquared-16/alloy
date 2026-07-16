/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import LocationSiteDetailPanel from "@/components/adminV2/settings/locations/LocationSiteDetailPanel";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const site: LocationHierarchyRow = {
    id: "site-1",
    label: "Downtown",
    location_type: "site",
    parent_location_id: null,
    is_active: true,
    address1: "123 Main",
    city: "Portland",
    state: "OR",
    postal_code: "97201",
    metadata: { timezone: "America/Los_Angeles" },
};

async function renderPanel(onSave: (id: string, body: Record<string, unknown>) => Promise<void>) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(
            <LocationSiteDetailPanel site={site} capacitySummary={12} canMutate onSave={onSave} />,
        );
    });
    return container;
}

afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
});

describe("LocationSiteDetailPanel time zone", () => {
    it("offers only the supported United States choices with readable labels", async () => {
        const element = await renderPanel(async () => {});
        const select = element.querySelector<HTMLSelectElement>('[data-testid="locations-site-timezone"]')!;
        const options = [...select.options].map((option) => [option.textContent, option.value]);

        expect(options).toEqual([
            ["Select a U.S. time zone", ""],
            ["Eastern Time", "America/New_York"],
            ["Central Time", "America/Chicago"],
            ["Mountain Time", "America/Denver"],
            ["Arizona", "America/Phoenix"],
            ["Pacific Time", "America/Los_Angeles"],
            ["Alaska Time", "America/Anchorage"],
            ["Hawaii Time", "Pacific/Honolulu"],
        ]);
        expect(options.flat()).not.toContain("UTC");
        expect(options.flat()).not.toContain("America/Toronto");
    });

    it("persists the selected canonical IANA value", async () => {
        const onSave = vi.fn(async (id: string, body: Record<string, unknown>) => {
            void id;
            void body;
        });
        const element = await renderPanel(onSave);
        const select = element.querySelector<HTMLSelectElement>('[data-testid="locations-site-timezone"]')!;

        act(() => {
            select.value = "America/Chicago";
            select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await act(async () => {
            element.querySelector<HTMLButtonElement>('[data-testid="locations-site-save"]')!.click();
            await Promise.resolve();
        });

        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave.mock.calls[0]?.[1]).toMatchObject({
            metadata: expect.objectContaining({ timezone: "America/Chicago" }),
        });
    });
});
