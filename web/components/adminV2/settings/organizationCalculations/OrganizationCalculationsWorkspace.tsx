"use client";

import { useCallback, useEffect, useState } from "react";
import { Calculator } from "lucide-react";
import {
    ConfigurationContext,
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigEditorSection,
    ConfigObjectHeader,
    ConfigWorkspaceCard,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import { provingMinPhysicalLicensedAst, type OrgCalcExpr } from "@/lib/organizationCalculations/ast";
import type { ApprovedInputRef } from "@/lib/organizationCalculations/catalog";

type CalcRow = {
    id: string;
    key: string;
    name: string;
    description: string | null;
    lifecycle: string;
    published_version_id: string | null;
};

type VersionRow = {
    id: string;
    version_number: number;
    immutable: boolean;
    published_at: string | null;
    consumer_bindings: { runtime_surface?: boolean };
    dependency_refs: string[];
};

type DetailPayload = {
    calculation: CalcRow;
    versions: VersionRow[];
    draftVersion: VersionRow | null;
    publishedVersion: VersionRow | null;
};

type RoomOption = { id: string; label: string; siteLabel: string };

type EvalResult = {
    evaluation: {
        status: string;
        value: number | null;
        explanation: Array<{ label: string; op: string; output: number | null }>;
        warnings: Array<{ code: string; message: string }>;
    };
    explanationLines: string[];
    version: { id: string; version_number: number; immutable: boolean };
};

const TEMPLATE_OPTIONS: Array<{
    id: string;
    label: string;
    description: string;
    build: () => OrgCalcExpr;
}> = [
    {
        id: "min_physical_licensed",
        label: "min(physical, licensed)",
        description: "Effective physical–licensed seats (proving reference)",
        build: provingMinPhysicalLicensedAst,
    },
    {
        id: "coalesce_operational_physical",
        label: "coalesce(operational, physical)",
        description: "Prefer operational capacity, fall back to physical",
        build: () => ({
            kind: "call",
            fn: "coalesce",
            id: "root",
            args: [
                { kind: "input", ref: "capacity.room_binding.operational" as ApprovedInputRef, id: "in_op" },
                { kind: "input", ref: "capacity.room_binding.physical" as ApprovedInputRef, id: "in_phys" },
            ],
        }),
    },
];

export default function OrganizationCalculationsWorkspace() {
    const [calculations, setCalculations] = useState<CalcRow[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<DetailPayload | null>(null);
    const [name, setName] = useState("Effective physical–licensed seats");
    const [description, setDescription] = useState(
        "Organization composition of physical and licensed capacity (not platform binding).",
    );
    const [templateId, setTemplateId] = useState("min_physical_licensed");
    const [runtimeSurface, setRuntimeSurface] = useState(true);
    const [rooms, setRooms] = useState<RoomOption[]>([]);
    const [roomId, setRoomId] = useState("");
    const [effectiveAt, setEffectiveAt] = useState(() => new Date().toISOString().slice(0, 10));
    const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        const res = await fetch("/api/admin/organization-calculations");
        const json = (await res.json()) as { calculations?: CalcRow[]; error?: string };
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
                        parent_id?: string | null;
                    }>;
                    error?: string;
                };
                if (!res.ok) return;
                const locs = json.locations ?? [];
                const byId = new Map(locs.map((l) => [l.id, l]));
                const roomOpts = locs
                    .filter((l) => String(l.location_type ?? "").toLowerCase() === "unit")
                    .map((l) => {
                        const parentId = (l as { parent_location_id?: string | null }).parent_location_id ?? null;
                        const site = parentId ? byId.get(parentId) : null;
                        return {
                            id: l.id,
                            label: String(l.label ?? "").trim() || "Untitled room",
                            siteLabel: String(site?.label ?? "").trim() || "Site",
                        };
                    });
                setRooms(roomOpts);
                if (roomOpts[0] && !roomId) setRoomId(roomOpts[0].id);
            } catch {
                /* room picker optional */
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- load rooms once
    }, [refresh]);

    useEffect(() => {
        if (!selectedId) {
            setDetail(null);
            return;
        }
        void loadDetail(selectedId).catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
    }, [selectedId, loadDetail]);

    const selected = calculations.find((c) => c.id === selectedId) ?? null;

    const createDraft = async () => {
        setBusy(true);
        setError(null);
        setEvalResult(null);
        try {
            const template = TEMPLATE_OPTIONS.find((t) => t.id === templateId) ?? TEMPLATE_OPTIONS[0]!;
            const res = await fetch("/api/admin/organization-calculations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    description,
                    expression_ast: template.build(),
                    // Binding is applied explicitly after publish via bind-runtime.
                    consumer_bindings: {},
                }),
            });
            const json = (await res.json()) as { calculation?: CalcRow; error?: string };
            if (!res.ok) throw new Error(json.error ?? `Create failed (${res.status})`);
            await refresh();
            if (json.calculation) setSelectedId(json.calculation.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Create failed");
        } finally {
            setBusy(false);
        }
    };

    const forkDraft = async () => {
        if (!selectedId || !detail?.publishedVersion) return;
        setBusy(true);
        setError(null);
        try {
            const template = TEMPLATE_OPTIONS.find((t) => t.id === templateId) ?? TEMPLATE_OPTIONS[0]!;
            const res = await fetch(`/api/admin/organization-calculations/${selectedId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    expression_ast: template.build(),
                    description,
                }),
            });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? `Fork failed (${res.status})`);
            await refresh();
            await loadDetail(selectedId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fork draft failed");
        } finally {
            setBusy(false);
        }
    };

    const publish = async () => {
        if (!selectedId) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/organization-calculations/${selectedId}/publish`, {
                method: "POST",
            });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? `Publish failed (${res.status})`);
            await refresh();
            await loadDetail(selectedId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Publish failed");
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
            if (!res.ok) throw new Error(json.error ?? `Bind failed (${res.status})`);
            await loadDetail(selectedId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Bind failed");
        } finally {
            setBusy(false);
        }
    };

    const archive = async () => {
        if (!selectedId) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/organization-calculations/${selectedId}/archive`, {
                method: "POST",
            });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? `Archive failed (${res.status})`);
            await refresh();
            await loadDetail(selectedId);
            setEvalResult(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Archive failed");
        } finally {
            setBusy(false);
        }
    };

    const evaluate = async (versionSpec?: string) => {
        if (!selectedId) return;
        if (!roomId.trim()) {
            setError("Room is required to evaluate");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const version =
                versionSpec ??
                (detail?.draftVersion && !detail.draftVersion.immutable ?
                    "draft"
                :   "published");
            const res = await fetch(`/api/admin/organization-calculations/${selectedId}/evaluate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    roomId: roomId.trim(),
                    effectiveAt,
                    version,
                }),
            });
            const json = (await res.json()) as EvalResult & { error?: string };
            if (!res.ok) throw new Error(json.error ?? `Evaluate failed (${res.status})`);
            setEvalResult(json);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Evaluate failed");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            className="process-config-page min-h-0 flex-1"
            data-testid="organization-calculations-product"
        >
            <ConfigurationContext
                title="Organization Calculations"
                subtitle="Author governed room-capacity compositions over approved platform inputs."
                titleIcon={<Calculator className="h-5 w-5" strokeWidth={2} />}
                testId="organization-calculations-context"
            >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                    <ConfigWorkspaceCard testId="organization-calculations-list-card">
                        <ConfigObjectHeader
                            size="default"
                            name="Calculations"
                            facts={[`${calculations.length} total`]}
                            testId="organization-calculations-list-header"
                        />
                        {loadError ?
                            <p className="text-sm text-red-800" role="alert">
                                {loadError}
                            </p>
                        :   null}
                        <ul className="mt-2 space-y-1" data-testid="organization-calculations-list">
                            {calculations.length === 0 ?
                                <li className="config-typo-sublabel">No organization calculations yet.</li>
                            :   calculations.map((calc) => (
                                    <li key={calc.id}>
                                        <button
                                            type="button"
                                            className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${
                                                selectedId === calc.id ?
                                                    "bg-alloy-stone/20 text-alloy-midnight"
                                                :   "hover:bg-alloy-stone/10 text-alloy-midnight/80"
                                            }`}
                                            onClick={() => {
                                                setSelectedId(calc.id);
                                                setEvalResult(null);
                                                setError(null);
                                            }}
                                            data-testid={`organization-calculations-item-${calc.id}`}
                                        >
                                            <span className="font-medium">{calc.name}</span>
                                            <span className="ml-2 text-xs text-alloy-midnight/50">
                                                {calc.lifecycle}
                                            </span>
                                        </button>
                                    </li>
                                ))
                            }
                        </ul>
                    </ConfigWorkspaceCard>

                    <div className="space-y-3">
                        <ConfigWorkspaceCard testId="organization-calculations-author-card">
                            <ConfigObjectHeader
                                size="default"
                                name="Author draft"
                                facts={["Structured templates only — not a freeform formula builder"]}
                                testId="organization-calculations-author-header"
                            />
                            <div className="mt-2 space-y-2.5">
                                <ConfigEditorSection title="Identity" testId="organization-calculations-identity">
                                    <label className="block max-w-md space-y-1">
                                        <span className="config-typo-field-label">Name</span>
                                        <input
                                            className="config-runtime-input"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            data-testid="organization-calculations-name"
                                        />
                                    </label>
                                    <label className="block space-y-1">
                                        <span className="config-typo-field-label">Description</span>
                                        <textarea
                                            className="config-runtime-input min-h-[4rem]"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            data-testid="organization-calculations-description"
                                        />
                                    </label>
                                </ConfigEditorSection>

                                <ConfigEditorSection
                                    title="Expression template"
                                    description="Pick an approved composition. Inputs are capacity.room_binding projections only."
                                    testId="organization-calculations-template"
                                >
                                    <div className="space-y-2">
                                        {TEMPLATE_OPTIONS.map((opt) => (
                                            <label key={opt.id} className="flex items-start gap-2">
                                                <input
                                                    type="radio"
                                                    name="orgcalc-template"
                                                    checked={templateId === opt.id}
                                                    onChange={() => setTemplateId(opt.id)}
                                                    className="mt-1"
                                                    data-testid={`organization-calculations-template-${opt.id}`}
                                                />
                                                <span>
                                                    <span className="block text-sm font-medium text-alloy-midnight">
                                                        {opt.label}
                                                    </span>
                                                    <span className="config-typo-sublabel">{opt.description}</span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                    <p className="config-typo-sublabel mt-2">
                                        Runtime binding is explicit after publish (exact version). Creating a draft
                                        does not auto-bind.
                                    </p>
                                    <label className="mt-2 flex items-center gap-2 hidden">
                                        <input
                                            type="checkbox"
                                            checked={runtimeSurface}
                                            onChange={(e) => setRuntimeSurface(e.target.checked)}
                                            data-testid="organization-calculations-runtime-surface"
                                        />
                                        <span className="text-sm">legacy</span>
                                    </label>
                                </ConfigEditorSection>

                                <div className="flex flex-wrap gap-2">
                                    <ConfigurationPrimaryButton
                                        className="config-primary-btn--sm"
                                        disabled={busy || !name.trim()}
                                        onClick={() => void createDraft()}
                                        data-testid="organization-calculations-create"
                                    >
                                        {busy ? "Working…" : "Save draft"}
                                    </ConfigurationPrimaryButton>
                                    <ConfigurationSecondaryButton
                                        disabled={busy || !selectedId || !detail?.draftVersion}
                                        onClick={() => void publish()}
                                        data-testid="organization-calculations-publish"
                                    >
                                        Publish immutable version
                                    </ConfigurationSecondaryButton>
                                    <ConfigurationSecondaryButton
                                        disabled={busy || !selectedId || !detail?.publishedVersion}
                                        onClick={() => void forkDraft()}
                                        data-testid="organization-calculations-fork-draft"
                                    >
                                        Edit → new draft
                                    </ConfigurationSecondaryButton>
                                    <ConfigurationSecondaryButton
                                        disabled={busy || !selectedId || selected?.lifecycle === "archived"}
                                        onClick={() => void archive()}
                                        data-testid="organization-calculations-archive"
                                    >
                                        Archive
                                    </ConfigurationSecondaryButton>
                                </div>
                            </div>
                        </ConfigWorkspaceCard>

                        {detail ?
                            <ConfigWorkspaceCard testId="organization-calculations-versions-card">
                                <ConfigObjectHeader
                                    size="default"
                                    name="Versions"
                                    facts={[selected?.name ?? "", selected?.lifecycle ?? ""].filter(Boolean)}
                                    testId="organization-calculations-versions-header"
                                />
                                <ul className="mt-2 space-y-2" data-testid="organization-calculations-versions">
                                    {detail.versions.map((v) => {
                                        const bound = Boolean(v.consumer_bindings?.runtime_surface);
                                        return (
                                            <li
                                                key={v.id}
                                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                                data-testid={`organization-calculations-version-${v.version_number}`}
                                            >
                                                <span>
                                                    v{v.version_number}{" "}
                                                    <span className="text-xs text-alloy-midnight/50">
                                                        {v.immutable ? "immutable" : "draft"}
                                                        {bound ? " · runtime-bound" : ""}
                                                    </span>
                                                </span>
                                                <span className="flex flex-wrap gap-1">
                                                    {v.immutable ?
                                                        <ConfigurationSecondaryButton
                                                            disabled={busy || bound || detail.calculation.lifecycle === "archived"}
                                                            onClick={() => void bindVersion(v.id)}
                                                            data-testid={`organization-calculations-bind-v${v.version_number}`}
                                                        >
                                                            {bound ? "Bound" : "Bind to room capacity"}
                                                        </ConfigurationSecondaryButton>
                                                    :   null}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </ConfigWorkspaceCard>
                        :   null}

                        <ConfigWorkspaceCard testId="organization-calculations-evaluate-card">
                            <ConfigObjectHeader
                                size="default"
                                name="Evaluate"
                                facts={selected ? [selected.name, selected.lifecycle] : ["Select a calculation"]}
                                testId="organization-calculations-evaluate-header"
                            />
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                <label className="block space-y-1">
                                    <span className="config-typo-field-label">Room</span>
                                    {rooms.length > 0 ?
                                        <select
                                            className="config-runtime-input"
                                            value={roomId}
                                            onChange={(e) => setRoomId(e.target.value)}
                                            data-testid="organization-calculations-room-id"
                                        >
                                            {rooms.map((r) => (
                                                <option key={r.id} value={r.id}>
                                                    {r.siteLabel} / {r.label}
                                                </option>
                                            ))}
                                        </select>
                                    :   <input
                                            className="config-runtime-input font-mono text-xs"
                                            value={roomId}
                                            onChange={(e) => setRoomId(e.target.value)}
                                            placeholder="room uuid"
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
                            <div className="mt-2 flex flex-wrap gap-2">
                                <ConfigurationPrimaryButton
                                    className="config-primary-btn--sm"
                                    disabled={busy || !selectedId}
                                    onClick={() => void evaluate()}
                                    data-testid="organization-calculations-evaluate"
                                >
                                    Evaluate
                                </ConfigurationPrimaryButton>
                                {rooms[1] ?
                                    <ConfigurationSecondaryButton
                                        disabled={busy || !selectedId}
                                        onClick={() => {
                                            setRoomId(rooms[1]!.id);
                                            void evaluate();
                                        }}
                                        data-testid="organization-calculations-evaluate-second-room"
                                    >
                                        Evaluate 2nd room
                                    </ConfigurationSecondaryButton>
                                :   null}
                            </div>

                            {evalResult ?
                                <div
                                    className="mt-3 space-y-1 rounded-md border border-alloy-stone/30 bg-white/60 p-3"
                                    data-testid="organization-calculations-eval-result"
                                >
                                    <p className="text-sm text-alloy-midnight">
                                        <span className="font-medium">Organization result:</span>{" "}
                                        {evalResult.evaluation.value ?? "∅"} seats{" "}
                                        <span className="text-alloy-midnight/55">
                                            (v{evalResult.version.version_number} · {evalResult.evaluation.status})
                                        </span>
                                    </p>
                                    <p className="config-typo-sublabel">Unit: seats · provenance: Organization Calculation AST</p>
                                    <ol
                                        className="list-decimal space-y-0.5 pl-4 text-xs text-alloy-midnight/75"
                                        data-testid="organization-calculations-explanation"
                                    >
                                        {evalResult.explanationLines.map((line) => (
                                            <li key={line}>{line}</li>
                                        ))}
                                    </ol>
                                    {evalResult.evaluation.warnings.length > 0 ?
                                        <ul className="mt-1 list-disc pl-4 text-xs text-amber-800" data-testid="organization-calculations-warnings">
                                            {evalResult.evaluation.warnings.map((w) => (
                                                <li key={w.code + w.message}>{w.message}</li>
                                            ))}
                                        </ul>
                                    :   null}
                                </div>
                            :   null}
                        </ConfigWorkspaceCard>

                        {error ?
                            <p className="text-sm text-red-800" role="alert" data-testid="organization-calculations-error">
                                {error}
                            </p>
                        :   null}
                    </div>
                </div>
            </ConfigurationContext>
        </div>
    );
}
