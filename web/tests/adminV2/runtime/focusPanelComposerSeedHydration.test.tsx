/** @vitest-environment jsdom */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    FocusPanelComposerProvider,
    useFocusPanelComposer,
} from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import {
    CHILDREN_SURFACE_ID,
    defaultNestedSurfaceConfig,
    identityConfigurationFieldKeys,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

function Probe({ onKeys }: { onKeys: (keys: string[]) => void }) {
    const composer = useFocusPanelComposer();
    const rosterKeys = composer
        ? identityConfigurationFieldKeys(composer.configFor(CHILDREN_SURFACE_ID), "roster", "summary")
        : [];
    useEffect(() => {
        onKeys(rosterKeys);
    }, [onKeys, rosterKeys.join("|")]);
    return null;
}

describe("FocusPanelComposerProvider seed hydration", () => {
    it("applies nested configs that arrive after mount (Surfaces hydrate)", () => {
        let latestKeys: string[] = [];
        const onKeys = (keys: string[]) => {
            latestKeys = keys;
        };
        const authored: NestedSurfaceConfig = {
            ...defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID),
            groups: defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID).groups.map((group) =>
                group.key === "roster"
                    ? {
                          ...group,
                          selectedFieldKeys: [
                              "inquiry_child.program",
                              "inquiry_child.schedule_type",
                              "child.gender",
                          ],
                      }
                    : group,
            ),
        };

        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{}}>
                    <Probe onKeys={onKeys} />
                </FocusPanelComposerProvider>,
            );
        });
        expect(latestKeys).toEqual([]);

        act(() => {
            root.render(
                <FocusPanelComposerProvider initialNestedConfigs={{ [CHILDREN_SURFACE_ID]: authored }}>
                    <Probe onKeys={onKeys} />
                </FocusPanelComposerProvider>,
            );
        });

        expect(latestKeys).toEqual([
            "inquiry_child.program",
            "inquiry_child.schedule_type",
            "child.gender",
        ]);
    });
});
