"use client";

import PersonDrawerParentModuleNav from "@/components/admin/entity/PersonDrawerParentModuleNav";
import { personDrawerParentChromeActive } from "@/lib/admin/person/personDrawerParentChrome";
import type { PersonDrawerParentChromeHint } from "@/lib/admin/person/personDrawerParentChrome";
import { resolvePersonDrawerParentModuleNavModel } from "@/lib/admin/person/resolvePersonDrawerParentModuleNavModel";
import type { DrawerTabKey } from "@/lib/entityPresentation";

/** Parent drawer module shortcuts — stay inside person drawer. */
export default function PersonDrawerParentLifecycleRail({
    record,
    chromeHint,
    onSelectTab,
}: {
    record: Record<string, unknown>;
    chromeHint?: PersonDrawerParentChromeHint | null;
    onSelectTab: (tab: DrawerTabKey) => void;
}) {
    if (!personDrawerParentChromeActive(record, chromeHint)) {
        return null;
    }

    const moduleItems = resolvePersonDrawerParentModuleNavModel();

    const handleModuleClick = (key: string) => {
        if (key === "documents") {
            onSelectTab("documents");
            return;
        }
        if (key === "communications") {
            onSelectTab("communications");
            return;
        }
        if (key === "activity") {
            onSelectTab("related");
        }
    };

    return <PersonDrawerParentModuleNav items={moduleItems} onModuleClick={handleModuleClick} />;
}
