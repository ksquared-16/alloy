"use client";

/**
 * Organization Calculation Library — reusable definitions.
 * Mounted standalone (compat redirect) or embedded in Operational Intelligence.
 * Collection → Selected workspace (Overview / Definition / Test / Versions / Where used / Lifecycle).
 */

import { AlloySelect } from "@/components/workspace/AlloySelect";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calculator, Plus, Search } from "lucide-react";
import {
    ConfigurationContext,
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigEditorSection,
    ConfigWorkspaceCard,
    ConfigWorkspaceTabBar,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    QUEUE_ROW_CARD_IDLE_BORDER_CLASS,
    QUEUE_ROW_CARD_SELECTED_BORDER_CLASS,
    QUEUE_ROW_CARD_SHELL_CLASS,
    QUEUE_ROW_SELECTED_RAIL_CLASS,
} from "@/lib/presentation/runtime/queueRowCardShell";
import {
    CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF,
    organizationCalculationLibraryHref,
} from "@/lib/admin/canonicalAdminRoutes";
import {
    ORG_CALC_PRODUCT_TYPES,
    inferProductTypeFromAst,
    productTypeById,
    statusLabel,
    type OrgCalcProductTypeId,
} from "@/lib/organizationCalculations/productCatalog";
import ReadableDefinitionBuilder, {
    applyDefinitionSuggestion,
} from "@/components/adminV2/settings/organizationCalculations/ReadableDefinitionBuilder";
import {
    compilePivotBuilderDraft,
    roomUtilizationPivotDraft,
    type PivotBuilderDraft,
} from "@/lib/organizationCalculations/pivotBuilder";
import {
    filterOperatorCalculations,
    isDeveloperCollectionMode,
} from "@/lib/organizationCalculations/operatorCollectionFilter";

type CalcListItem = {
    id: string;
    key: string;
    name: string;
    description: string | null;
    lifecycle: string;
    published_version_id: string | null;
    updated_at: string;
    type_label: string;
    type_id: string;
    status_label: string;
    version_label: string;
    published_version_number: number | null;
    has_draft: boolean;
    consumer_count: number;
};

type VersionRow = {
    id: string;
    version_number: number;
    immutable: boolean;
    published_at: string | null;
    consumer_bindings: { runtime_surface?: boolean };
    expression_ast?: unknown;
};

type DetailPayload = {
    calculation: CalcListItem & { created_at?: string };
    versions: VersionRow[];
    draftVersion: VersionRow | null;
    publishedVersion: VersionRow | null;
};

type RoomOption = { id: string; label: string; siteLabel: string };

type EvalResult = {
    evaluation: {
        status: string;
        value: number | null;
        explanation: Array<{ label: string; op: string; output: number | null; inputs?: Array<{ label: string; value: number | null }> }>;
        warnings: Array<{ code: string; message: string }>;
    };
    explanationLines: string[];
    version: { id: string; version_number: number; immutable: boolean };
};

type WorkspaceTab = "overview" | "definition" | "test" | "versions" | "usage" | "lifecycle";
type FilterKey = "active" | "draft" | "archived";
type Mode = "home" | "collection" | "new" | "selected";

const TABS: Array<{ key: WorkspaceTab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "definition", label: "Definition" },
    { key: "versions", label: "Versions" },
    { key: "usage", label: "Where used" },
    { key: "lifecycle", label: "Lifecycle" },
];

function formatUpdated(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch {
        return iso;
    }
}

function humanEvalStatus(status: string): string {
    if (status === "resolved") return "Ready";
    if (status === "not_configured") return "Missing capacity data";
    if (status === "incomplete" || status === "partial") return "Incomplete inputs";
    return status;
}

export type OrganizationCalculationsWorkspaceProps = {
    /** When true, render inside Operational Intelligence without a second product shell. */
    embedded?: boolean;
};

export default function OrganizationCalculationsWorkspace({
    embedded = false,
}: OrganizationCalculationsWorkspaceProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const urlId = searchParams.get("calculationId") || searchParams.get("id");
    const urlView = embedded ? searchParams.get("libraryView") : searchParams.get("view");
    const urlStepRaw = Number(searchParams.get("step") || "1");
    const urlStep = (urlStepRaw === 2 || urlStepRaw === 3 || urlStepRaw === 4 ? urlStepRaw : 1) as 1 | 2 | 3 | 4;

    const [calculations, setCalculations] = useState<CalcListItem[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(urlId);
    const [detail, setDetail] = useState<DetailPayload | null>(null);
    const [tab, setTab] = useState<WorkspaceTab>("overview");
    const [filter, setFilter] = useState<FilterKey>(urlView === "archived" ? "archived" : "active");
    const [search, setSearch] = useState("");
    const [mode, setMode] = useState<Mode>(
        urlView === "new" ? "new"
        : urlId ? "selected"
        : urlView === "archived" ? "collection"
        : embedded ? "collection"
        : urlView === "home" ? "home"
        : "collection",
    );

    // Keep workspace mode aligned with the URL (collection → object → workspace).
    // Do not treat a missing view as "home" after mount — soft navigations can briefly
    // clear search params and would otherwise wipe an in-progress New Calculation flow.
    useEffect(() => {
        if (urlView === "new") {
            setMode("new");
            return;
        }
        if (urlId) {
            setSelectedId(urlId);
            setMode("selected");
            return;
        }
        if (urlView === "archived") {
            setFilter("archived");
            setMode("collection");
            return;
        }
        if (urlView === "collection" || urlView === "browse") {
            setFilter((prev) => (prev === "archived" ? "active" : prev));
            setSelectedId(null);
            setMode("collection");
            return;
        }
        if (urlView === "home") {
            setSelectedId(null);
            setMode(embedded ? "collection" : "home");
        }
    }, [urlView, urlId, embedded]);

    // New calculation wizard — step is URL-backed so remounts / Fast Refresh keep place.
    const [wizardStep, setWizardStepState] = useState<1 | 2 | 3 | 4>(urlView === "new" ? urlStep : 1);
    useEffect(() => {
        if (urlView === "new") setWizardStepState(urlStep);
    }, [urlView, urlStep]);
    const setWizardStep = useCallback(
        (next: 1 | 2 | 3 | 4) => {
            setWizardStepState(next);
            if (embedded) {
                router.replace(
                    organizationCalculationLibraryHref({
                        libraryView: "new",
                        step: next > 1 ? next : null,
                    }),
                );
                return;
            }
            const params = new URLSearchParams();
            params.set("view", "new");
            if (next > 1) params.set("step", String(next));
            router.replace(`/organization/calculations?${params.toString()}`);
        },
        [router, embedded],
    );
    const [productTypeId, setProductTypeId] = useState<OrgCalcProductTypeId>("capacity_lowest_physical_licensed");
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [pivotDraft, setPivotDraft] = useState<PivotBuilderDraft>(() =>
        roomUtilizationPivotDraft("Room utilization"),
    );

    // Survive Fast Refresh / soft-nav remounts during New Calculation.
    useEffect(() => {
        if (urlView !== "new") return;
        try {
            const raw = sessionStorage.getItem("org-calcs-wizard-v1");
            if (!raw) return;
            const parsed = JSON.parse(raw) as {
                step?: number;
                name?: string;
                description?: string;
                productTypeId?: OrgCalcProductTypeId;
            };
            if (parsed.name) setName(parsed.name);
            if (parsed.description) setDescription(parsed.description);
            if (parsed.productTypeId && productTypeById(parsed.productTypeId)) {
                setProductTypeId(parsed.productTypeId);
            }
            if (parsed.step === 2 || parsed.step === 3 || parsed.step === 4) {
                setWizardStepState(parsed.step);
            }
        } catch {
            /* ignore */
        }
    }, [urlView]);

    useEffect(() => {
        if (mode !== "new") return;
        try {
            sessionStorage.setItem(
                "org-calcs-wizard-v1",
                JSON.stringify({ step: wizardStep, name, description, productTypeId }),
            );
        } catch {
            /* ignore */
        }
    }, [mode, wizardStep, name, description, productTypeId]);

    const [rooms, setRooms] = useState<RoomOption[]>([]);
    const [roomId, setRoomId] = useState("");
    const [effectiveAt, setEffectiveAt] = useState(() => new Date().toISOString().slice(0, 10));
    const [evalResult, setEvalResult] = useState<EvalResult | null>(null);

    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const setUrl = useCallback(
        (next: { calculationId?: string | null; view?: string | null }) => {
            if (embedded) {
                const href = organizationCalculationLibraryHref({
                    calculationId: next.calculationId,
                    libraryView: next.view,
                });
                // Preserve developer collection mode across library navigation.
                const url = new URL(href, "http://local.invalid");
                if (searchParams.get("developer") === "1") url.searchParams.set("developer", "1");
                if (searchParams.get("dev") === "1") url.searchParams.set("dev", "1");
                router.replace(`${url.pathname}?${url.searchParams.toString()}`);
                return;
            }
            const params = new URLSearchParams();
            if (next.view) params.set("view", next.view);
            if (next.calculationId) params.set("calculationId", next.calculationId);
            if (searchParams.get("developer") === "1") params.set("developer", "1");
            if (searchParams.get("dev") === "1") params.set("dev", "1");
            const q = params.toString();
            router.replace(q ? `/organization/calculations?${q}` : "/organization/calculations");
        },
        [router, embedded, searchParams],
    );

    const refresh = useCallback(async () => {
        setLoadError(null);
        const res = await fetch("/api/admin/organization-calculations");
        const json = (await res.json()) as { calculations?: CalcListItem[]; error?: string };
        if (!res.ok) {
            setLoadError(json.error ?? `Failed to load (${res.status})`);
            return;
        }
        setCalculations(json.calculations ?? []);
    }, []);

    const loadDetail = useCallback(async (id: string) => {
        const res = await fetch(`/api/admin/organization-calculations/${id}`);
        const json = (await res.json()) as DetailPayload & { error?: string };
        if (!res.ok) throw new Error(json.error ?? `Load failed (${res.status})`);
        setDetail(json);
    }, []);

    useEffect(() => {
        void refresh();
        void (async () => {
            try {
                const res = await fetch("/api/admin/locations?hierarchy=1");
                const json = (await res.json()) as {
                    locations?: Array<{
                        id: string;
                        label?: string | null;
                        location_type?: string | null;
                        parent_location_id?: string | null;
                    }>;
                };
                if (!res.ok) return;
                const locs = json.locations ?? [];
                const byId = new Map(locs.map((l) => [l.id, l]));
                const roomOpts = locs
                    .filter((l) => String(l.location_type ?? "").toLowerCase() === "unit")
                    .map((l) => {
                        const site = l.parent_location_id ? byId.get(l.parent_location_id) : null;
                        return {
                            id: l.id,
                            label: String(l.label ?? "").trim() || "Untitled room",
                            siteLabel: String(site?.label ?? "").trim() || "Site",
                        };
                    });
                setRooms(roomOpts);
                if (roomOpts[0]) setRoomId(roomOpts[0].id);
            } catch {
                /* optional */
            }
        })();
    }, [refresh]);

    useEffect(() => {
        if (!selectedId) {
            setDetail(null);
            return;
        }
        void loadDetail(selectedId).catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
    }, [selectedId, loadDetail]);

    const selected = calculations.find((c) => c.id === selectedId) ?? null;
    const productType = useMemo(() => {
        if (detail?.draftVersion?.expression_ast || detail?.publishedVersion?.expression_ast) {
            return inferProductTypeFromAst(
                detail.draftVersion?.expression_ast ?? detail.publishedVersion?.expression_ast,
            );
        }
        return productTypeById(selected?.type_id) ?? ORG_CALC_PRODUCT_TYPES[0]!;
    }, [detail, selected]);

    const developerMode = isDeveloperCollectionMode(searchParams);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        const scoped = filterOperatorCalculations(calculations, { developerMode });
        return scoped.filter((c) => {
            if (filter === "active" && c.lifecycle === "archived") return false;
            if (filter === "active" && c.lifecycle !== "published" && c.lifecycle !== "draft") return false;
            if (filter === "draft" && c.lifecycle !== "draft" && !c.has_draft) return false;
            if (filter === "archived" && c.lifecycle !== "archived") return false;
            if (filter === "active" && c.lifecycle === "draft") return true;
            if (!q) return true;
            return (
                c.name.toLowerCase().includes(q)
                || (c.description ?? "").toLowerCase().includes(q)
                || c.type_label.toLowerCase().includes(q)
            );
        });
    }, [calculations, filter, search, developerMode]);

    const counts = useMemo(() => {
        const scoped = filterOperatorCalculations(calculations, { developerMode });
        const active = scoped.filter((c) => c.lifecycle !== "archived").length;
        const draft = scoped.filter((c) => c.lifecycle === "draft" || c.has_draft).length;
        const archived = scoped.filter((c) => c.lifecycle === "archived").length;
        const published = scoped.filter((c) => c.lifecycle === "published").length;
        const recent = [...scoped]
            .filter((c) => c.lifecycle !== "archived")
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
            .slice(0, 5);
        return { active, draft, archived, published, recent };
    }, [calculations, developerMode]);

    const boundVersion = detail?.versions.find((v) => v.consumer_bindings?.runtime_surface) ?? null;

    const selectCalc = (id: string) => {
        setSelectedId(id);
        setMode("selected");
        setTab("overview");
        setEvalResult(null);
        setError(null);
        setUrl({ calculationId: id, view: "collection" });
    };

    const openHome = () => {
        setSelectedId(null);
        setMode("home");
        setUrl({ view: "home" });
    };

    const openCollection = (f: FilterKey = "active") => {
        setFilter(f);
        setSelectedId(null);
        setMode("collection");
        setUrl({ view: f === "archived" ? "archived" : "collection" });
    };

    const openNew = () => {
        try {
            sessionStorage.removeItem("org-calcs-wizard-v1");
        } catch {
            /* ignore */
        }
        setWizardStepState(1);
        setProductTypeId("room_utilization_pct");
        setName("Room utilization");
        setDescription("");
        setPivotDraft(roomUtilizationPivotDraft("Room utilization"));
        setError(null);
        setSelectedId(null);
        setMode("new");
        setUrl({ view: "new" });
    };

    const createDraft = async () => {
        setBusy(true);
        setError(null);
        try {
            let expressionAst;
            try {
                expressionAst = compilePivotBuilderDraft({ ...pivotDraft, name: name.trim() || pivotDraft.name });
            } catch (e) {
                throw new Error(e instanceof Error ? e.message : "Complete the calculation builder");
            }
            const inferred = inferProductTypeFromAst(expressionAst);
            const res = await fetch("/api/admin/organization-calculations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim(),
                    product_type_id: inferred.id,
                    expression_ast: expressionAst,
                }),
            });
            const json = (await res.json()) as { calculation?: CalcListItem; error?: string };
            if (!res.ok) throw new Error(json.error ?? `Create failed (${res.status})`);
            await refresh();
            if (json.calculation) selectCalc(json.calculation.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save draft");
        } finally {
            setBusy(false);
        }
    };

    const publish = async () => {
        if (!selectedId) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/organization-calculations/${selectedId}/publish`, { method: "POST" });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Could not publish");
            await refresh();
            await loadDetail(selectedId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not publish");
        } finally {
            setBusy(false);
        }
    };

    const forkDraft = async () => {
        if (!selectedId || !detail) return;
        setBusy(true);
        setError(null);
        try {
            const ast =
                detail.draftVersion?.expression_ast
                ?? detail.publishedVersion?.expression_ast
                ?? productType.buildAst();
            const res = await fetch(`/api/admin/organization-calculations/${selectedId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ expression_ast: ast }),
            });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Could not create draft");
            await refresh();
            await loadDetail(selectedId);
            setTab("versions");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not create draft");
        } finally {
            setBusy(false);
        }
    };

    const bindVersion = async (versionId: string) => {
        if (!selectedId) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/organization-calculations/${selectedId}/bind-runtime`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ versionId }),
            });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Could not update usage");
            await loadDetail(selectedId);
            await refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not update usage");
        } finally {
            setBusy(false);
        }
    };

    const archive = async () => {
        if (!selectedId) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/organization-calculations/${selectedId}/archive`, { method: "POST" });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Could not archive");
            setFilter("archived");
            await refresh();
            await loadDetail(selectedId);
            setTab("lifecycle");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not archive");
        } finally {
            setBusy(false);
        }
    };

    const restore = async () => {
        if (!selectedId) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/organization-calculations/${selectedId}/restore`, { method: "POST" });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Could not restore");
            setFilter("active");
            await refresh();
            await loadDetail(selectedId);
            setTab("lifecycle");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not restore");
        } finally {
            setBusy(false);
        }
    };

    const evaluate = async () => {
        if (!selectedId) return;
        if (!roomId.trim()) {
            setError("Choose a room to test this calculation.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const version =
                detail?.draftVersion && !detail.draftVersion.immutable ? "draft" : "published";
            const res = await fetch(`/api/admin/organization-calculations/${selectedId}/evaluate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomId: roomId.trim(), effectiveAt, version }),
            });
            const json = (await res.json()) as EvalResult & { error?: string };
            if (!res.ok) throw new Error(friendlyEvalError(json.error ?? "Test failed"));
            setEvalResult(json);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Test failed");
            setEvalResult(null);
        } finally {
            setBusy(false);
        }
    };

    const contextActions = (
        <div className="flex flex-wrap gap-2">
            {!embedded && mode !== "home" ?
                <ConfigurationSecondaryButton onClick={openHome} data-testid="organization-calculations-home">
                    Overview
                </ConfigurationSecondaryButton>
            :   null}
            {mode !== "new" ?
                <ConfigurationPrimaryButton
                    className="config-primary-btn--sm inline-flex items-center gap-1"
                    onClick={openNew}
                    data-testid="organization-calculations-new"
                >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    New definition
                </ConfigurationPrimaryButton>
            :   null}
        </div>
    );

    const libraryBody =
        mode === "home" && !embedded ?
            <DomainHome
                counts={counts}
                recent={counts.recent}
                onNew={openNew}
                onBrowse={() => openCollection("active")}
                onArchived={() => openCollection("archived")}
                onSelect={selectCalc}
                loadError={loadError}
            />
        : mode === "new" ?
            <ConfigurationShell
                testId="organization-calculations-shell-new"
                queueColumn={
                    <CollectionRail
                        items={visible}
                        filter={filter}
                        setFilter={(f) => {
                            setFilter(f);
                            setUrl({ view: f === "archived" ? "archived" : "collection" });
                        }}
                        search={search}
                        setSearch={setSearch}
                        selectedId={null}
                        onSelect={(id) => {
                            setMode("collection");
                            selectCalc(id);
                        }}
                        onNew={mode === "new" ? () => undefined : openNew}
                        onArchived={() => openCollection("archived")}
                        total={filterOperatorCalculations(calculations, { developerMode }).length}
                        developerMode={developerMode}
                    />
                }
            >
                <ReadableDefinitionBuilder
                    name={name}
                    setName={setName}
                    draft={pivotDraft}
                    onChange={setPivotDraft}
                    busy={busy}
                    error={error}
                    onCancel={() => openCollection("active")}
                    onSave={() => void createDraft()}
                    onApplySuggestion={(id) => {
                        void (async () => {
                            const [popRes, wgtRes] = await Promise.all([
                                fetch("/api/admin/organization-populations"),
                                fetch("/api/admin/organization-weightings"),
                            ]);
                            const popJson = (await popRes.json()) as {
                                populations?: Array<{
                                    id: string;
                                    name: string;
                                    lifecycle: string;
                                    published_version_id: string | null;
                                    versions: Array<{
                                        id: string;
                                        version_number: number;
                                        immutable: boolean;
                                        predicate: string;
                                        membership_summary: string;
                                    }>;
                                }>;
                            };
                            const wgtJson = (await wgtRes.json()) as {
                                equivalencies?: Array<{
                                    id: string;
                                    name: string;
                                    key?: string;
                                    lifecycle: string;
                                    published_version_id: string | null;
                                    versions: Array<{
                                        id: string;
                                        version_number: number;
                                        immutable: boolean;
                                        scheme: string;
                                        factors: Record<string, number>;
                                        full_time_days: number;
                                        full_time_hours?: number | null;
                                        session_basis?: "days_per_week" | "attendance_type" | null;
                                        summary: string;
                                    }>;
                                }>;
                                weightings?: Array<{
                                    id: string;
                                    name: string;
                                    key?: string;
                                    lifecycle: string;
                                    published_version_id: string | null;
                                    versions: Array<{
                                        id: string;
                                        version_number: number;
                                        immutable: boolean;
                                        scheme: string;
                                        factors: Record<string, number>;
                                        full_time_days: number;
                                        summary: string;
                                    }>;
                                }>;
                            };
                            const { mapPublishedPopulations, mapPublishedEquivalencies } = await import(
                                "@/lib/organizationCalculations/definitionCatalog"
                            );
                            const pops = mapPublishedPopulations(popJson.populations ?? []);
                            const wgts = mapPublishedEquivalencies(
                                (wgtJson.equivalencies ?? wgtJson.weightings ?? []) as Parameters<
                                    typeof mapPublishedEquivalencies
                                >[0],
                            );
                            const fte =
                                wgts.find((w) =>
                                    /days per week|full-time|fte|equivalent|session/i.test(w.name),
                                ) ?? wgts[0] ?? null;
                            const applied = applyDefinitionSuggestion(id, {
                                populationVersionId: pops[0]?.versionId ?? null,
                                weightingVersionId: wgts[0]?.versionId ?? null,
                                fteWeightingVersionId: fte?.versionId ?? null,
                            });
                            setName(applied.name);
                            setPivotDraft(applied.draft);
                        })();
                    }}
                />
            </ConfigurationShell>
        :   <ConfigurationShell
                testId="organization-calculations-shell"
                queueColumn={
                    <CollectionRail
                        items={visible}
                        filter={filter}
                        setFilter={(f) => {
                            setFilter(f);
                            if (f === "archived") setUrl({ view: "archived", calculationId: selectedId });
                        }}
                        search={search}
                        setSearch={setSearch}
                        selectedId={selectedId}
                        onSelect={selectCalc}
                        onNew={openNew}
                        onArchived={() => openCollection("archived")}
                        total={filterOperatorCalculations(calculations, { developerMode }).length}
                        developerMode={developerMode}
                    />
                }
            >
                {!selectedId || !selected ?
                    <ConfigurationEmptyState
                        testId="organization-calculations-empty-selection"
                        title={visible.length === 0 ? "No definitions yet" : "Select a definition"}
                        description={
                            visible.length === 0 ?
                                "Create a reusable definition for how operational answers are calculated."
                            :   "Choose a definition to review, test, publish, or see where it is used."
                        }
                        actions={
                            <ConfigurationPrimaryButton
                                className="config-primary-btn--sm"
                                onClick={openNew}
                                data-testid="organization-calculations-empty-add"
                            >
                                New definition
                            </ConfigurationPrimaryButton>
                        }
                    />
                :   <SelectedWorkspace
                        selected={selected}
                        detail={detail}
                        productType={productType}
                        tab={tab}
                        setTab={setTab}
                        rooms={rooms}
                        roomId={roomId}
                        setRoomId={setRoomId}
                        effectiveAt={effectiveAt}
                        setEffectiveAt={setEffectiveAt}
                        evalResult={evalResult}
                        boundVersion={boundVersion}
                        busy={busy}
                        error={error}
                        onPublish={() => void publish()}
                        onFork={() => void forkDraft()}
                        onBind={(id) => void bindVersion(id)}
                        onArchive={() => void archive()}
                        onRestore={() => void restore()}
                        onEvaluate={() => void evaluate()}
                    />
                }
            </ConfigurationShell>;

    if (embedded) {
        return (
            <div
                className="min-h-0 flex-1 space-y-3"
                data-testid="organization-calculations-product"
                data-oi-embedded-library="true"
            >
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold text-alloy-midnight">Calculation Library</h2>
                        <p className="mt-0.5 text-sm text-alloy-midnight/60">
                            Reusable definitions that determine how operational answers are calculated.
                        </p>
                    </div>
                    {contextActions}
                </div>
                {loadError ?
                    <p className="text-sm text-red-800" role="alert">
                        {loadError}
                    </p>
                :   null}
                {libraryBody}
            </div>
        );
    }

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="organization-calculations-product">
            <ConfigurationContext
                title="Calculation Library"
                subtitle="Reusable definitions that determine how operational answers are calculated."
                titleIcon={<Calculator className="h-5 w-5" strokeWidth={2} />}
                actions={contextActions}
                testId="organization-calculations-context"
            >
                {libraryBody}
            </ConfigurationContext>
        </div>
    );
}

function friendlyEvalError(message: string): string {
    const m = message.toLowerCase();
    if (m.includes("room not found") || m.includes("inaccessible") || m.includes("cross-org")) {
        return "That room isn’t available in this organization.";
    }
    if (m.includes("archived")) return "Archived calculations can’t be tested until they’re restored.";
    return message;
}

function DomainHome({
    counts,
    recent,
    onNew,
    onBrowse,
    onArchived,
    onSelect,
    loadError,
}: {
    counts: { active: number; draft: number; archived: number; published: number };
    recent: CalcListItem[];
    onNew: () => void;
    onBrowse: () => void;
    onArchived: () => void;
    onSelect: (id: string) => void;
    loadError: string | null;
}) {
    return (
        <div className="space-y-4" data-testid="organization-calculations-domain-home">
            {loadError ?
                <p className="text-sm text-red-800" role="alert">
                    {loadError}
                </p>
            :   null}
            <div className="process-config-setup-card p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                    Organization
                </p>
                <h2 className="config-typo-workspace-title mt-1 text-xl text-alloy-midnight">
                    Reusable definitions
                </h2>
                <p className="config-typo-sublabel mt-1.5 max-w-2xl">
                    These definitions determine how measurements and operational answers are calculated.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                    <ConfigurationPrimaryButton
                        className="config-primary-btn--sm"
                        onClick={onNew}
                        data-testid="organization-calculations-home-new"
                    >
                        New definition
                    </ConfigurationPrimaryButton>
                    <ConfigurationSecondaryButton onClick={onBrowse} data-testid="organization-calculations-home-browse">
                        Browse definitions
                    </ConfigurationSecondaryButton>
                    <ConfigurationSecondaryButton
                        onClick={onArchived}
                        data-testid="organization-calculations-home-archived"
                    >
                        View archived
                    </ConfigurationSecondaryButton>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                    { label: "Active", value: counts.active, testId: "stat-active" },
                    { label: "Published", value: counts.published, testId: "stat-published" },
                    { label: "Drafts", value: counts.draft, testId: "stat-draft" },
                    { label: "Archived", value: counts.archived, testId: "stat-archived" },
                ].map((s) => (
                    <ConfigWorkspaceCard key={s.label} compact testId={`organization-calculations-${s.testId}`}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            {s.label}
                        </p>
                        <p className="mt-1 text-2xl font-semibold text-alloy-midnight">{s.value}</p>
                    </ConfigWorkspaceCard>
                ))}
            </div>

            <ConfigWorkspaceCard testId="organization-calculations-recent">
                <p className="config-typo-queue-section-label">Recently updated</p>
                {recent.length === 0 ?
                    <ConfigurationEmptyState
                        testId="organization-calculations-home-empty"
                        title="No definitions yet"
                        description="Create your first reusable definition to get started."
                        actions={
                            <ConfigurationPrimaryButton className="config-primary-btn--sm" onClick={onNew}>
                                New definition
                            </ConfigurationPrimaryButton>
                        }
                    />
                :   <ul className="mt-2 divide-y divide-alloy-stone/20">
                        {recent.map((c) => (
                            <li key={c.id}>
                                <button
                                    type="button"
                                    className="flex w-full items-start justify-between gap-3 py-2.5 text-left hover:bg-alloy-stone/5"
                                    onClick={() => onSelect(c.id)}
                                    data-testid={`organization-calculations-recent-${c.id}`}
                                >
                                    <span>
                                        <span className="block text-sm font-medium text-alloy-midnight">{c.name}</span>
                                        <span className="config-typo-sublabel">
                                            {c.type_label} · {c.status_label}
                                            {c.has_draft ? " · Draft in progress" : ""}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-[11px] text-alloy-midnight/45">
                                        {formatUpdated(c.updated_at)}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                }
            </ConfigWorkspaceCard>
        </div>
    );
}

function CollectionRail({
    items,
    filter,
    setFilter,
    search,
    setSearch,
    selectedId,
    onSelect,
    onNew,
    onArchived,
    total,
    developerMode,
}: {
    items: CalcListItem[];
    filter: FilterKey;
    setFilter: (f: FilterKey) => void;
    search: string;
    setSearch: (s: string) => void;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onNew: () => void;
    onArchived: () => void;
    total: number;
    developerMode?: boolean;
}) {
    return (
        <div
            className="locations-collection-rail process-config-setup-card flex h-full min-h-0 flex-col overflow-hidden p-3"
            data-testid="organization-calculations-collection"
            data-collection="organization-calculations-list"
            data-developer-mode={developerMode ? "1" : "0"}
        >
            <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                    <p className="locations-collection-rail__title text-[15px] font-semibold text-alloy-midnight">
                        Definitions
                    </p>
                    <p className="locations-collection-rail__count mt-0.5" data-testid="organization-calculations-list">
                        {total} total
                        {developerMode ? " · Developer" : ""}
                    </p>
                </div>
                <ConfigurationPrimaryButton
                    className="config-primary-btn--sm px-2 py-1"
                    onClick={onNew}
                    data-testid="organization-calculations-rail-new"
                >
                    <Plus className="h-3.5 w-3.5" />
                </ConfigurationPrimaryButton>
            </div>

            <label className="programs-collection-controls__search-wrap mb-2 block">
                <Search className="programs-collection-controls__search-icon" aria-hidden />
                <input
                    className="programs-collection-controls__search"
                    placeholder="Search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    data-testid="organization-calculations-search"
                />
            </label>

            <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="Filter definitions">
                {(
                    [
                        ["active", "Published"],
                        ["draft", "Draft"],
                        ["archived", "Archived"],
                    ] as const
                ).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={filter === key}
                        className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                            filter === key ?
                                "bg-alloy-stone/25 text-alloy-midnight"
                            :   "text-alloy-midnight/50 hover:bg-alloy-stone/10"
                        }`}
                        onClick={() => {
                            setFilter(key);
                            if (key === "archived") onArchived();
                        }}
                        data-testid={`organization-calculations-filter-${key}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className="locations-collection-rail__list min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5" role="listbox">
                {items.length === 0 ?
                    <p className="config-typo-sublabel px-1 py-3">
                        {filter === "archived" ? "Nothing has been archived." : "No definitions match this view."}
                    </p>
                :   items.map((c) => {
                        const selected = c.id === selectedId;
                        const status =
                            c.lifecycle === "archived" ? "Archived"
                            : c.has_draft || c.lifecycle === "draft" ? "Draft"
                            : "Published";
                        const usage =
                            c.consumer_count === 0 ?
                                "Not used"
                            :   `${c.consumer_count} use${c.consumer_count === 1 ? "" : "s"}`;
                        return (
                            <button
                                key={c.id}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                className={`${QUEUE_ROW_CARD_SHELL_CLASS} locations-collection-row relative w-full !px-2.5 !py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-alloy-bend-pine ${
                                    selected ? QUEUE_ROW_CARD_SELECTED_BORDER_CLASS : QUEUE_ROW_CARD_IDLE_BORDER_CLASS
                                }`}
                                onClick={() => onSelect(c.id)}
                                data-testid={`organization-calculations-item-${c.id}`}
                            >
                                {selected ? <span aria-hidden className={QUEUE_ROW_SELECTED_RAIL_CLASS} /> : null}
                                <span className="locations-collection-row__body min-w-0 pl-1">
                                    <span className="block text-[13px] font-semibold leading-snug text-alloy-midnight [overflow-wrap:anywhere]">
                                        {c.name}
                                    </span>
                                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-alloy-midnight/50">
                                        <span
                                            className={`locations-collection-row__status shrink-0 ${
                                                status === "Published" ?
                                                    "locations-collection-row__status--active"
                                                : status === "Archived" ?
                                                    "locations-collection-row__status--inactive"
                                                :   ""
                                            }`}
                                        >
                                            {status}
                                        </span>
                                        <span aria-hidden>·</span>
                                        <span>
                                            {usage}
                                            {" · "}
                                            {formatUpdated(c.updated_at)}
                                        </span>
                                    </span>
                                </span>
                            </button>
                        );
                    })
                }
            </div>
        </div>
    );
}

function SelectedWorkspace({
    selected,
    detail,
    productType,
    tab,
    setTab,
    rooms,
    roomId,
    setRoomId,
    effectiveAt,
    setEffectiveAt,
    evalResult,
    boundVersion,
    busy,
    error,
    onPublish,
    onFork,
    onBind,
    onArchive,
    onRestore,
    onEvaluate,
}: {
    selected: CalcListItem;
    detail: DetailPayload | null;
    productType: (typeof ORG_CALC_PRODUCT_TYPES)[number];
    tab: WorkspaceTab;
    setTab: (t: WorkspaceTab) => void;
    rooms: RoomOption[];
    roomId: string;
    setRoomId: (id: string) => void;
    effectiveAt: string;
    setEffectiveAt: (d: string) => void;
    evalResult: EvalResult | null;
    boundVersion: VersionRow | null;
    busy: boolean;
    error: string | null;
    onPublish: () => void;
    onFork: () => void;
    onBind: (versionId: string) => void;
    onArchive: () => void;
    onRestore: () => void;
    onEvaluate: () => void;
}) {
    const archived = selected.lifecycle === "archived";

    return (
        <div className="min-w-0" data-testid="organization-calculations-selected">
            <div className="process-config-setup-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            {productType.typeLabel}
                        </p>
                        <h2
                            className="config-typo-workspace-title mt-1 text-lg text-alloy-midnight"
                            data-testid="organization-calculations-selected-name"
                        >
                            {selected.name}
                        </h2>
                        <p className="config-typo-sublabel mt-0.5">
                            {statusLabel(selected.lifecycle)}
                            {selected.version_label ? ` · ${selected.version_label}` : ""}
                            {selected.has_draft ? " · Draft in progress" : ""}
                            {boundVersion ? ` · Used by Room capacity (v${boundVersion.version_number})` : ""}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {!archived && detail?.draftVersion ?
                            <ConfigurationPrimaryButton
                                className="config-primary-btn--sm"
                                disabled={busy}
                                onClick={onPublish}
                                data-testid="organization-calculations-publish"
                            >
                                Publish
                            </ConfigurationPrimaryButton>
                        :   null}
                        {!archived && selected.lifecycle === "published" && !detail?.draftVersion ?
                            <ConfigurationSecondaryButton
                                disabled={busy}
                                onClick={onFork}
                                data-testid="organization-calculations-fork-draft"
                            >
                                Create draft
                            </ConfigurationSecondaryButton>
                        :   null}
                    </div>
                </div>
                <ConfigWorkspaceTabBar
                    tabs={TABS}
                    activeSection={tab}
                    onSectionChange={setTab}
                    ariaLabel="Calculation sections"
                    testId="organization-calculations-tabs"
                    testIdPrefix="organization-calculations-tab"
                />
            </div>

            <div className="mt-2.5 space-y-2.5">
                {tab === "overview" ?
                    <OverviewPanel selected={selected} productType={productType} boundVersion={boundVersion} />
                : null}
                {tab === "definition" || tab === "test" ?
                    <div
                        className="grid gap-2.5 xl:grid-cols-2"
                        data-testid="organization-calculations-definition-workspace"
                    >
                        <DefinitionPanel selected={selected} productType={productType} />
                        <TestPanel
                            rooms={rooms}
                            roomId={roomId}
                            setRoomId={setRoomId}
                            effectiveAt={effectiveAt}
                            setEffectiveAt={setEffectiveAt}
                            evalResult={evalResult}
                            productType={productType}
                            busy={busy}
                            archived={archived}
                            onEvaluate={onEvaluate}
                        />
                    </div>
                : null}
                {tab === "versions" ?
                    <VersionsPanel
                        detail={detail}
                        busy={busy}
                        archived={archived}
                        onPublish={onPublish}
                        onFork={onFork}
                        onBind={onBind}
                    />
                : null}
                {tab === "usage" ?
                    <UsagePanel
                        boundVersion={boundVersion}
                        detail={detail}
                        busy={busy}
                        archived={archived}
                        onBind={onBind}
                        calculationId={selected.id}
                    />
                : null}
                {tab === "lifecycle" ?
                    <LifecyclePanel
                        selected={selected}
                        busy={busy}
                        onArchive={onArchive}
                        onRestore={onRestore}
                        onPublish={onPublish}
                    />
                : null}

                {error ?
                    <p className="text-sm text-red-800" role="alert" data-testid="organization-calculations-error">
                        {error}
                    </p>
                :   null}
            </div>
        </div>
    );
}

function OverviewPanel({
    selected,
    productType,
    boundVersion,
}: {
    selected: CalcListItem;
    productType: (typeof ORG_CALC_PRODUCT_TYPES)[number];
    boundVersion: VersionRow | null;
}) {
    return (
        <div className="grid gap-3 lg:grid-cols-2" data-testid="organization-calculations-overview">
            <ConfigWorkspaceCard>
                <p className="config-typo-queue-section-label">What it does</p>
                <p className="mt-2 text-sm text-alloy-midnight">{selected.description?.trim() || productType.summary}</p>
                <p className="config-typo-sublabel mt-3">
                    Produces {productType.outputLabel.toLowerCase()} ({productType.units}).
                </p>
            </ConfigWorkspaceCard>
            <ConfigWorkspaceCard>
                <p className="config-typo-queue-section-label">Status</p>
                <dl className="mt-2 space-y-2 text-sm">
                    <div className="flex justify-between gap-2">
                        <dt className="text-alloy-midnight/50">Lifecycle</dt>
                        <dd className="font-medium text-alloy-midnight">{statusLabel(selected.lifecycle)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                        <dt className="text-alloy-midnight/50">Version</dt>
                        <dd className="font-medium text-alloy-midnight">{selected.version_label}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                        <dt className="text-alloy-midnight/50">Used by</dt>
                        <dd className="font-medium text-alloy-midnight">
                            {boundVersion ?
                                `Room capacity (v${boundVersion.version_number})`
                            :   "Not used yet"}
                        </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                        <dt className="text-alloy-midnight/50">Updated</dt>
                        <dd className="font-medium text-alloy-midnight">{formatUpdated(selected.updated_at)}</dd>
                    </div>
                </dl>
            </ConfigWorkspaceCard>
        </div>
    );
}

function DefinitionPanel({
    selected,
    productType,
}: {
    selected: CalcListItem;
    productType: (typeof ORG_CALC_PRODUCT_TYPES)[number];
}) {
    return (
        <ConfigWorkspaceCard testId="organization-calculations-definition">
            <ConfigEditorSection title="Definition">
                <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                    <div>
                        <dt className="config-typo-field-label">Name</dt>
                        <dd className="mt-0.5 text-alloy-midnight">{selected.name}</dd>
                    </div>
                    <div>
                        <dt className="config-typo-field-label">Type</dt>
                        <dd className="mt-0.5 text-alloy-midnight">{productType.title}</dd>
                    </div>
                    <div className="sm:col-span-2">
                        <dt className="config-typo-field-label">Description</dt>
                        <dd className="mt-0.5 text-alloy-midnight/80">
                            {selected.description?.trim() || productType.summary}
                        </dd>
                    </div>
                    <div>
                        <dt className="config-typo-field-label">Inputs</dt>
                        <dd className="mt-0.5 text-alloy-midnight">{productType.inputLabels.join(", ")}</dd>
                    </div>
                    <div>
                        <dt className="config-typo-field-label">Result</dt>
                        <dd className="mt-0.5 text-alloy-midnight">
                            {productType.outputLabel} · {productType.units}
                        </dd>
                    </div>
                </dl>
            </ConfigEditorSection>
        </ConfigWorkspaceCard>
    );
}

function TestPanel({
    rooms,
    roomId,
    setRoomId,
    effectiveAt,
    setEffectiveAt,
    evalResult,
    productType,
    busy,
    archived,
    onEvaluate,
}: {
    rooms: RoomOption[];
    roomId: string;
    setRoomId: (id: string) => void;
    effectiveAt: string;
    setEffectiveAt: (d: string) => void;
    evalResult: EvalResult | null;
    productType: (typeof ORG_CALC_PRODUCT_TYPES)[number];
    busy: boolean;
    archived: boolean;
    onEvaluate: () => void;
}) {
    return (
        <ConfigWorkspaceCard testId="organization-calculations-evaluate-card">
            <ConfigEditorSection
                title="Test"
                description="See how this calculation resolves for a room on a specific date."
            >
                {archived ?
                    <p className="config-typo-sublabel">Restore this calculation before testing.</p>
                :   <>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <label className="block space-y-1">
                                <span className="config-typo-field-label">Room</span>
                                {rooms.length > 0 ?
                                    <AlloySelect
                                        triggerClassName="config-runtime-input"
                                        allowEmpty={false}
                                        value={roomId}
                                        options={rooms.map((r) => ({ value: r.id, label: `${r.siteLabel} / ${r.label}` }))}
                                        aria-label="Room"
                                        testId="organization-calculations-room-id"
                                        onChange={setRoomId}
                                    />
                                :   <input
                                        className="config-runtime-input"
                                        value={roomId}
                                        onChange={(e) => setRoomId(e.target.value)}
                                        data-testid="organization-calculations-room-id"
                                    />
                                }
                            </label>
                            <label className="block space-y-1">
                                <span className="config-typo-field-label">Effective date</span>
                                <input
                                    type="date"
                                    className="config-runtime-input"
                                    value={effectiveAt}
                                    onChange={(e) => setEffectiveAt(e.target.value)}
                                    data-testid="organization-calculations-effective-at"
                                />
                            </label>
                        </div>
                        <div className="mt-3">
                            <ConfigurationPrimaryButton
                                className="config-primary-btn--sm"
                                disabled={busy}
                                onClick={onEvaluate}
                                data-testid="organization-calculations-evaluate"
                            >
                                {busy ? "Testing…" : "Run test"}
                            </ConfigurationPrimaryButton>
                        </div>
                    </>
                }

                {evalResult ?
                    <div
                        className="mt-4 space-y-3 rounded-md border border-alloy-stone/30 bg-white/70 p-3"
                        data-testid="organization-calculations-eval-result"
                    >
                        <div>
                            <p className="config-typo-field-label">Result</p>
                            <p className="mt-0.5 text-lg font-semibold text-alloy-midnight">
                                {evalResult.evaluation.value == null ?
                                    "Not available"
                                :   `${evalResult.evaluation.value} ${productType.units}`}
                            </p>
                            <p className="config-typo-sublabel">
                                {humanEvalStatus(evalResult.evaluation.status)} · version{" "}
                                {evalResult.version.version_number}
                            </p>
                        </div>
                        <div>
                            <p className="config-typo-field-label">How it was calculated</p>
                            <ol
                                className="mt-1 list-decimal space-y-1 pl-4 text-xs text-alloy-midnight/75"
                                data-testid="organization-calculations-explanation"
                            >
                                {evalResult.explanationLines.map((line) => (
                                    <li key={line}>
                                        {line
                                            .replace(/capacity\.room_binding\./g, "")
                                            .replace(/capacity\.room_binding/g, "room capacity")
                                            .replace(/\s+from\s+room capacity/g, "")}
                                    </li>
                                ))}
                            </ol>
                        </div>
                        {evalResult.evaluation.warnings.length > 0 ?
                            <ul
                                className="list-disc pl-4 text-xs text-amber-900"
                                data-testid="organization-calculations-warnings"
                            >
                                {evalResult.evaluation.warnings.map((w) => (
                                    <li key={w.code + w.message}>
                                        {w.message.includes("not available") || w.message.includes("unknown") ?
                                            "Required capacity data isn’t configured for this room yet."
                                        :   w.message}
                                    </li>
                                ))}
                            </ul>
                        :   null}
                    </div>
                :   null}
            </ConfigEditorSection>
        </ConfigWorkspaceCard>
    );
}

function VersionsPanel({
    detail,
    busy,
    archived,
    onPublish,
    onFork,
    onBind,
}: {
    detail: DetailPayload | null;
    busy: boolean;
    archived: boolean;
    onPublish: () => void;
    onFork: () => void;
    onBind: (id: string) => void;
}) {
    if (!detail) return <p className="config-typo-sublabel">Loading versions…</p>;
    return (
        <ConfigWorkspaceCard testId="organization-calculations-versions-card">
            <ConfigEditorSection
                title="Versions"
                description="Published versions never change. Create a draft to make edits, then publish a new version."
            >
                <ul className="space-y-2" data-testid="organization-calculations-versions">
                    {detail.versions.map((v) => {
                        const bound = Boolean(v.consumer_bindings?.runtime_surface);
                        return (
                            <li
                                key={v.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-alloy-stone/25 px-3 py-2"
                                data-testid={`organization-calculations-version-${v.version_number}`}
                            >
                                <div>
                                    <p className="text-sm font-medium text-alloy-midnight">
                                        Version {v.version_number}
                                        {!v.immutable ? " · Draft" : " · Published"}
                                        {bound ? " · In use" : ""}
                                    </p>
                                    <p className="config-typo-sublabel">
                                        {v.published_at ?
                                            `Published ${formatUpdated(v.published_at)}`
                                        :   "Not published yet"}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {v.immutable && !archived && !bound ?
                                        <ConfigurationSecondaryButton
                                            disabled={busy}
                                            onClick={() => onBind(v.id)}
                                            data-testid={`organization-calculations-bind-v${v.version_number}`}
                                        >
                                            Use for Room capacity
                                        </ConfigurationSecondaryButton>
                                    :   null}
                                    {bound ?
                                        <span className="rounded bg-[#00a283]/10 px-2 py-1 text-[11px] font-semibold text-[#007d68]">
                                            Room capacity
                                        </span>
                                    :   null}
                                </div>
                            </li>
                        );
                    })}
                </ul>
                {!archived ?
                    <div className="mt-3 flex flex-wrap gap-2">
                        {detail.draftVersion ?
                            <ConfigurationPrimaryButton
                                className="config-primary-btn--sm"
                                disabled={busy}
                                onClick={onPublish}
                            >
                                Publish draft
                            </ConfigurationPrimaryButton>
                        :   <ConfigurationSecondaryButton disabled={busy} onClick={onFork}>
                                Create draft from published
                            </ConfigurationSecondaryButton>
                        }
                    </div>
                :   null}
            </ConfigEditorSection>
        </ConfigWorkspaceCard>
    );
}

function UsagePanel({
    boundVersion,
    detail,
    busy,
    archived,
    onBind,
    calculationId,
}: {
    boundVersion: VersionRow | null;
    detail: DetailPayload | null;
    busy: boolean;
    archived: boolean;
    onBind: (id: string) => void;
    calculationId: string;
}) {
    const [measurements, setMeasurements] = useState<
        Array<{ id: string; name: string; question_key?: string | null; status: string }>
    >([]);

    useEffect(() => {
        void (async () => {
            try {
                const res = await fetch("/api/admin/metrics/oi-org-calc-measurements");
                const json = (await res.json()) as {
                    measurements?: Array<{
                        id: string;
                        name: string;
                        status: string;
                        question_key?: string | null;
                        source?: { calculation_id?: string };
                    }>;
                };
                if (!res.ok) return;
                setMeasurements(
                    (json.measurements ?? []).filter(
                        (m) =>
                            m.status !== "retired"
                            && m.source?.calculation_id === calculationId,
                    ),
                );
            } catch {
                /* optional */
            }
        })();
    }, [calculationId]);

    return (
        <ConfigWorkspaceCard testId="organization-calculations-usage">
            <ConfigEditorSection
                title="Where used"
                description="Measurements and surfaces that use this reusable definition."
            >
                {measurements.length > 0 ?
                    <ul className="mb-3 space-y-2">
                        {measurements.map((m) => (
                            <li key={m.id}>
                                <Link
                                    href={`${CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF}?view=measurements&orgMeasurement=${m.id}`}
                                    className="block rounded-md border border-alloy-stone/25 px-3 py-3 hover:border-[#00a283]/40"
                                    data-testid={`organization-calculations-where-used-measurement-${m.id}`}
                                >
                                    <p className="text-sm font-semibold text-alloy-midnight">{m.name}</p>
                                    <p className="config-typo-sublabel mt-0.5">
                                        Operational Intelligence · Measurements
                                        {m.question_key === "future_room_capacity" ?
                                            " · Future Room Capacity"
                                        :   ""}
                                    </p>
                                </Link>
                            </li>
                        ))}
                    </ul>
                :   null}

                {boundVersion ?
                    <div className="rounded-md border border-alloy-stone/25 px-3 py-3">
                        <p className="text-sm font-semibold text-alloy-midnight">Room capacity</p>
                        <p className="config-typo-sublabel mt-0.5">
                            Shows beside platform capacity on each room. Using version {boundVersion.version_number}.
                        </p>
                        {!archived && detail ?
                            <div className="mt-3 flex flex-wrap gap-2">
                                {detail.versions
                                    .filter((v) => v.immutable && v.id !== boundVersion.id)
                                    .map((v) => (
                                        <ConfigurationSecondaryButton
                                            key={v.id}
                                            disabled={busy}
                                            onClick={() => onBind(v.id)}
                                            data-testid={`organization-calculations-rebind-v${v.version_number}`}
                                        >
                                            Switch to version {v.version_number}
                                        </ConfigurationSecondaryButton>
                                    ))}
                            </div>
                        :   null}
                    </div>
                : measurements.length === 0 ?
                    <ConfigurationEmptyState
                        testId="organization-calculations-usage-empty"
                        title="Not used yet"
                        description="This definition isn’t connected to a measurement or Room capacity yet."
                    />
                :   null}
            </ConfigEditorSection>
        </ConfigWorkspaceCard>
    );
}

function LifecyclePanel({
    selected,
    busy,
    onArchive,
    onRestore,
    onPublish,
}: {
    selected: CalcListItem;
    busy: boolean;
    onArchive: () => void;
    onRestore: () => void;
    onPublish: () => void;
}) {
    const archived = selected.lifecycle === "archived";
    return (
        <ConfigWorkspaceCard testId="organization-calculations-lifecycle">
            <ConfigEditorSection
                title="Lifecycle"
                description="Draft → Published → Archived. Published versions stay unchanged forever."
            >
                <p className="text-sm text-alloy-midnight">
                    Current status: <strong>{statusLabel(selected.lifecycle)}</strong>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {selected.lifecycle === "draft" ?
                        <ConfigurationPrimaryButton
                            className="config-primary-btn--sm"
                            disabled={busy}
                            onClick={onPublish}
                        >
                            Publish
                        </ConfigurationPrimaryButton>
                    :   null}
                    {!archived ?
                        <ConfigurationSecondaryButton
                            disabled={busy}
                            onClick={onArchive}
                            data-testid="organization-calculations-archive"
                        >
                            Archive
                        </ConfigurationSecondaryButton>
                    :   <ConfigurationPrimaryButton
                            className="config-primary-btn--sm"
                            disabled={busy}
                            onClick={onRestore}
                            data-testid="organization-calculations-restore"
                        >
                            Restore
                        </ConfigurationPrimaryButton>
                    }
                </div>
            </ConfigEditorSection>
        </ConfigWorkspaceCard>
    );
}
