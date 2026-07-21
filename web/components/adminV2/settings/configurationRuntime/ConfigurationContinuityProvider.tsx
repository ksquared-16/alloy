"use client";

/**
 * Configuration Continuity Provider — Organization Runtime Foundation (Checkpoint A).
 *
 * Owns Organization shell lifetime helpers inside the settings layout:
 * - selection retention (sessionStorage)
 * - route-aware prefetch for primary Configuration destinations
 * - invalidation subscription surface for nested pages
 *
 * Does not own Work Unit kernel, queues, or Focus Panel.
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
    CONFIGURATION_CONTINUITY_WARM_HREFS,
    markConfigurationContinuity,
    prepareConfigurationSoftNavTarget,
} from "@/lib/configRuntime/configurationContinuity";
import {
    readConfigurationSelection,
    writeConfigurationSelection,
    type ConfigurationSelectionSnapshot,
} from "@/lib/configRuntime/configurationSelectionRetention";
import {
    subscribeConfigurationInvalidation,
    type ConfigurationInvalidationEvent,
} from "@/lib/configRuntime/configurationInvalidation";
import { loadLocationsCollection } from "@/lib/locations/locationsCollectionCache";
import { loadProgramsCollection } from "@/lib/programs/programsCollectionCache";
import { loadProgramsChapterContext } from "@/lib/programs/programsChapterContextCache";
import {
    CANONICAL_ORGANIZATION_BASE,
    CANONICAL_ORGANIZATION_PROGRAMS_HREF,
    normalizeToCanonicalAdminPath,
} from "@/lib/admin/canonicalAdminRoutes";
import {
    isLocationsConfigurationPath,
    LOCATION_SETTINGS_LOCATION_ID_PARAM,
} from "@/lib/admin/canonicalLocationSettingsRoutes";

type ConfigurationContinuityContextValue = {
    orgId: string;
    selection: ConfigurationSelectionSnapshot | null;
    rememberLocationSelection: (args: {
        locationId: string | null;
        tab?: string | null;
        itemId?: string | null;
    }) => void;
    rememberProgramSelection: (args: {
        programId: string | null;
        section?: string | null;
    }) => void;
    rememberProgramsChapterSelection: (args: { chapter: string | null }) => void;
    lastInvalidation: ConfigurationInvalidationEvent | null;
};

const ConfigurationContinuityContext = createContext<ConfigurationContinuityContextValue | null>(
    null,
);

function readSearchParam(name: string): string | null {
    if (typeof window === "undefined") return null;
    try {
        return new URLSearchParams(window.location.search).get(name);
    } catch {
        return null;
    }
}

export function ConfigurationContinuityProvider({
    orgId,
    children,
}: {
    orgId: string;
    children: ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const warmOnceRef = useRef(false);
    const [selectionVersion, setSelectionVersion] = useState(0);
    const [lastInvalidation, setLastInvalidation] = useState<ConfigurationInvalidationEvent | null>(
        null,
    );

    const selection = useMemo(() => {
        void selectionVersion;
        return readConfigurationSelection(orgId);
    }, [orgId, selectionVersion]);

    const rememberLocationSelection = useCallback(
        (args: { locationId: string | null; tab?: string | null; itemId?: string | null }) => {
            writeConfigurationSelection(orgId, {
                locationId: args.locationId,
                locationTab: args.tab ?? null,
                locationItemId: args.itemId ?? null,
            });
            setSelectionVersion((v) => v + 1);
        },
        [orgId],
    );

    const rememberProgramSelection = useCallback(
        (args: { programId: string | null; section?: string | null }) => {
            writeConfigurationSelection(orgId, {
                programId: args.programId,
                programSection: args.section ?? null,
                ...(args.programId ? { programsChapter: null } : {}),
            });
            setSelectionVersion((v) => v + 1);
        },
        [orgId],
    );

    const rememberProgramsChapterSelection = useCallback(
        (args: { chapter: string | null }) => {
            writeConfigurationSelection(orgId, {
                programsChapter: args.chapter,
            });
            setSelectionVersion((v) => v + 1);
        },
        [orgId],
    );

    // Shell retained mark when settings providers stay mounted across config routes.
    useEffect(() => {
        const path = normalizeToCanonicalAdminPath(pathname ?? "");
        markConfigurationContinuity("shell_retained", { path });
        if (isLocationsConfigurationPath(path)) {
            rememberLocationSelection({
                locationId: readSearchParam(LOCATION_SETTINGS_LOCATION_ID_PARAM),
                tab: readSearchParam("tab"),
                itemId: readSearchParam("itemId"),
            });
        }
        if (path === CANONICAL_ORGANIZATION_PROGRAMS_HREF) {
            const chapter = readSearchParam("chapter");
            const programId = readSearchParam("programId");
            const section = readSearchParam("section");
            if (chapter) {
                // Sibling chapter navigation must not wipe retained Program selection.
                rememberProgramsChapterSelection({ chapter });
            } else if (programId) {
                rememberProgramSelection({ programId, section });
            } else {
                // Collection landing: clear chapter only. Program retention is cleared
                // explicitly via rememberProgramSelection(null) when the operator exits.
                rememberProgramsChapterSelection({ chapter: null });
            }
        }
        if (path === CANONICAL_ORGANIZATION_BASE) {
            markConfigurationContinuity("reveal", { path: CANONICAL_ORGANIZATION_BASE });
        }
    }, [
        pathname,
        rememberLocationSelection,
        rememberProgramSelection,
        rememberProgramsChapterSelection,
    ]);

    // Warm primary Configuration destinations once per settings-shell mount.
    useEffect(() => {
        if (warmOnceRef.current) return;
        warmOnceRef.current = true;
        for (const href of CONFIGURATION_CONTINUITY_WARM_HREFS) {
            void prepareConfigurationSoftNavTarget(href, (h) => router.prefetch(h));
        }
    }, [router]);

    // Data warm for Locations + Programs collections — peek ready before soft-nav reveal.
    useEffect(() => {
        const id = orgId.trim();
        if (!id) return;
        void loadLocationsCollection(id).catch(() => undefined);
        void loadProgramsCollection(id).catch(() => undefined);
        void loadProgramsChapterContext(id).catch(() => undefined);
    }, [orgId]);

    useEffect(() => {
        return subscribeConfigurationInvalidation((event) => {
            setLastInvalidation(event);
        });
    }, []);

    const value = useMemo<ConfigurationContinuityContextValue>(
        () => ({
            orgId,
            selection,
            rememberLocationSelection,
            rememberProgramSelection,
            rememberProgramsChapterSelection,
            lastInvalidation,
        }),
        [
            orgId,
            selection,
            rememberLocationSelection,
            rememberProgramSelection,
            rememberProgramsChapterSelection,
            lastInvalidation,
        ],
    );

    return (
        <ConfigurationContinuityContext.Provider value={value}>
            <div
                className="contents"
                data-configuration-continuity="true"
                data-testid="configuration-continuity-root"
            >
                {children}
            </div>
        </ConfigurationContinuityContext.Provider>
    );
}

export function useConfigurationContinuity(): ConfigurationContinuityContextValue {
    const ctx = useContext(ConfigurationContinuityContext);
    if (!ctx) {
        throw new Error("useConfigurationContinuity must be used within ConfigurationContinuityProvider");
    }
    return ctx;
}

export function useConfigurationContinuityOptional(): ConfigurationContinuityContextValue | null {
    return useContext(ConfigurationContinuityContext);
}
