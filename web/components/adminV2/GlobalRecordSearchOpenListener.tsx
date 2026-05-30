"use client";

import { useEffect } from "react";
import { useAdminDrawer, type OpenDrawerParams } from "@/contexts/AdminDrawerContext";
import {
    ADMINV2_GLOBAL_SEARCH_OPEN_RECORD_EVENT,
    clearGlobalRecordSearchOpenIntent,
    GLOBAL_SEARCH_DRAWER_OPEN_SOURCE,
    readGlobalRecordSearchOpenIntent,
    type GlobalRecordSearchOpenDetail,
} from "@/lib/adminV2/globalRecordSearchOpen";
import { isGlobalSearchLegacyDrawerEntityType } from "@/lib/admin/globalSearch/globalRecordSearchDrawerTarget";
import {
    cachePersonDrawerChildOpenSeed,
    cachePersonDrawerParentOpenSeed,
} from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import { prefetchPersonDrawerSnapshot } from "@/lib/admin/prefetchPersonDrawerSnapshot";

function warmPersonDrawerFromGlobalSearch(detail: GlobalRecordSearchOpenDetail): void {
    if (detail.open_entity_type !== "persons") return;
    const personId = detail.open_entity_id.trim();
    const seed = detail.personDrawerOpenSeed;
    if (!personId || !seed) return;
    if (seed.presentation_emphasis === PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS) {
        cachePersonDrawerChildOpenSeed(personId, seed);
    } else if (seed.presentation_emphasis === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS) {
        cachePersonDrawerParentOpenSeed(personId, seed);
    }
    try {
        prefetchPersonDrawerSnapshot(personId, { source: "click", openSeed: seed });
    } catch {
        /* non-fatal */
    }
}

function openFromGlobalSearchDetail(
    openDrawer: (params: OpenDrawerParams) => void,
    detail: GlobalRecordSearchOpenDetail
): void {
    const id = detail.open_entity_id.trim();
    const type = detail.open_entity_type;
    if (!id || isGlobalSearchLegacyDrawerEntityType(type)) return;
    warmPersonDrawerFromGlobalSearch(detail);
    openDrawer({
        type,
        id,
        source: GLOBAL_SEARCH_DRAWER_OPEN_SOURCE,
        personDrawerOpenSeed: detail.personDrawerOpenSeed ?? null,
    });
}

/** Opens AdminV2 entity drawer from global search — blocks legacy member/contact drawers. */
export default function GlobalRecordSearchOpenListener() {
    const { openDrawer } = useAdminDrawer();

    useEffect(() => {
        const pending = readGlobalRecordSearchOpenIntent();
        if (pending) {
            clearGlobalRecordSearchOpenIntent();
            if (!isGlobalSearchLegacyDrawerEntityType(pending.open_entity_type)) {
                openFromGlobalSearchDetail(openDrawer, pending);
            }
        }
    }, [openDrawer]);

    useEffect(() => {
        const onOpen = (ev: Event) => {
            const detail = (ev as CustomEvent<GlobalRecordSearchOpenDetail>).detail;
            if (!detail?.open_entity_id || !detail?.open_entity_type) return;
            openFromGlobalSearchDetail(openDrawer, detail);
        };
        window.addEventListener(ADMINV2_GLOBAL_SEARCH_OPEN_RECORD_EVENT, onOpen);
        return () => window.removeEventListener(ADMINV2_GLOBAL_SEARCH_OPEN_RECORD_EVENT, onOpen);
    }, [openDrawer]);

    return null;
}
