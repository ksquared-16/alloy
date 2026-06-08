"use client";

import PersonDrawerChildModuleNav from "@/components/admin/entity/PersonDrawerChildModuleNav";
import { personDrawerChildChromeActive } from "@/lib/admin/person/personDrawerChildChrome";
import type { PersonDrawerChildChromeHint } from "@/lib/admin/person/personDrawerChildChrome";
import { resolvePersonDrawerChildModuleNavModel } from "@/lib/admin/person/resolvePersonDrawerChildModuleNavModel";
import type { DrawerTabKey } from "@/lib/entityPresentation";

/** Child drawer module shortcuts — stay inside person drawer (no opportunity navigation). */
export default function PersonDrawerChildLifecycleRail({
    record,
    chromeHint,
    onSelectTab,
}: {
    record: Record<string, unknown>;
    chromeHint?: PersonDrawerChildChromeHint | null;
    onSelectTab: (tab: DrawerTabKey) => void;
}) {
    if (!personDrawerChildChromeActive(record, chromeHint)) {
        return null;
    }

    const moduleItems = resolvePersonDrawerChildModuleNavModel(record);

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

    return <PersonDrawerChildModuleNav items={moduleItems} onModuleClick={handleModuleClick} />;
}
