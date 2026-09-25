import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import type {
    OpportunityDrawerViewModel,
    OpportunityDrawerViewModelSkipped,
} from "@/lib/adminV2/viewModel/drawer/types";
import {
    markTruthPatchArrived,
    markTruthPatchValidated,
} from "@/lib/adminV2/viewModel/drawer/opportunity/drawerTruthPatchDiag";
import {
    TRUTH_PATCH_LINE_KEY,
    drawerTruthPatchDescribesSubject,
    type DrawerTruthPatch,
} from "@/lib/adminV2/viewModel/drawer/opportunity/drawerTruthPatch";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import {
    actionableCarrierDescribesSubject,
    CARRIER_LINE_KEY,
    DRAWER_VIEW_MODEL_LINE_KEY,
    PHASED_QUERY_KEY,
    type ActionableDrawerCarrier,
} from "@/lib/adminV2/viewModel/drawer/opportunity/actionableDrawerCarrier";

export function buildOpportunityDrawerViewModelUrl(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    /** Ask for the two-phase delivery. Only a caller that supplies a carrier sink may set this. */
    phased = false
): string {
    const qs = new URLSearchParams();
    const dept = workspaceContext?.department_id?.trim() ?? "";
    const wu = workspaceContext?.work_unit_id?.trim() ?? "";
    if (dept) qs.set("department_id", dept);
    if (wu) qs.set("work_unit_id", wu);
    /*
     * The settled frame projects child-scoped truth, so it must be told WHICH child. The client
     * already knows — `attentionSubjectId` — and until now had no way to say it, which is how the
     * settled producer resolved a different participant than the surface was scoped to.
     */
    const attention = workspaceContext?.attention_subject_id?.trim() ?? "";
    if (attention) qs.set("attention_subject_id", attention);
    if (phased) qs.set(PHASED_QUERY_KEY, "1");
    const q = qs.toString();
    return `/api/admin/view-models/drawer/opportunity/${encodeURIComponent(opportunityId)}${q ? `?${q}` : ""}`;
}

/**
 * Read the two-phase body: phase 1 (the actionable carrier) then phase 2 (the view model).
 *
 * ONE SEAM, TWO PHASES — never a second fetch. The carrier is handed to `onCarrier` the instant its
 * line lands, and this function still resolves with exactly the shape the unphased path resolves
 * with, so every caller above it is unchanged.
 *
 * FAILS CLOSED, TWICE OVER. A carrier is only handed on if it VALIDATES against the subject this
 * request was made for: a truncated line, an unknown `carrier_version`, a different opportunity or
 * a different attention lens all yield nothing rather than something approximate. And a stream that
 * never produces a phase-2 line is an error, not an empty view model.
 */
async function readPhasedDrawerViewModelBody(
    response: Response,
    expect: { opportunityId: string; attentionSubjectId: string | null },
    onCarrier: (carrier: ActionableDrawerCarrier) => void,
    onTruthPatch?: ((patch: DrawerTruthPatch) => void) | null
): Promise<
    | { ok: true; viewModel: OpportunityDrawerViewModel }
    | { ok: false; skipped: OpportunityDrawerViewModelSkipped; status: number }
    | { ok: false; error: string; status: number }
> {
    const body = response.body;
    if (!body) return { ok: false, error: "drawer_vm_phased_no_body", status: response.status };

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    let viewModel: OpportunityDrawerViewModel | null = null;
    let skipped: OpportunityDrawerViewModelSkipped | null = null;
    let failure: string | null = null;
    let notFound = false;

    const consume = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
            // A malformed line is discarded, never guessed at. If it was phase 2 the caller sees the
            // same "no view model" failure it would see from a dropped connection.
            return;
        }
        if (CARRIER_LINE_KEY in parsed) {
            const carrier = parsed[CARRIER_LINE_KEY];
            if (actionableCarrierDescribesSubject(carrier, expect)) onCarrier(carrier);
            return;
        }
        if (TRUTH_PATCH_LINE_KEY in parsed) {
            /*
             * A canonical fact that is ready before the view model. Validated against the SELECTED
             * subject on the way in — a late patch for B must be unreadable once C is selected, and
             * a mismatched patch is refused whole rather than partially merged.
             */
            // B1 — the phase is recognized here, before any validation work. `parsed` above is the
            // reader's own JSON.parse, so this is the earliest in-page instant that can be marked.
            markTruthPatchArrived(expect.opportunityId);
            const patch = parsed[TRUTH_PATCH_LINE_KEY];
            if (drawerTruthPatchDescribesSubject(patch, expect)) {
                // B2/B3 — parsed and identity-validated.
                markTruthPatchValidated(expect.opportunityId);
                onTruthPatch?.(patch);
            }
            return;
        }
        if (DRAWER_VIEW_MODEL_LINE_KEY in parsed) {
            viewModel = parsed[DRAWER_VIEW_MODEL_LINE_KEY] as OpportunityDrawerViewModel;
            return;
        }
        if ("__skipped" in parsed) {
            skipped = parsed.__skipped as OpportunityDrawerViewModelSkipped;
            return;
        }
        if ("__error" in parsed) {
            failure = String(parsed.__error ?? "drawer_vm_phased_error");
            return;
        }
        if ("__not_found" in parsed) {
            // The org assertion refused. The unphased path answers this as a 404; a streamed
            // response has already sent its status, so it arrives as a line and is mapped back here
            // to the same shape every caller above already handles.
            notFound = true;
        }
    };

    for (;;) {
        const { done, value } = await reader.read();
        if (value) {
            buffered += decoder.decode(value, { stream: true });
            let newline = buffered.indexOf("\n");
            while (newline >= 0) {
                consume(buffered.slice(0, newline));
                buffered = buffered.slice(newline + 1);
                newline = buffered.indexOf("\n");
            }
        }
        if (done) break;
    }
    buffered += decoder.decode();
    consume(buffered);

    if (viewModel) return { ok: true, viewModel };
    if (notFound) return { ok: false, error: "Not found", status: 404 };
    if (skipped) return { ok: false, skipped, status: 422 };
    return { ok: false, error: failure ?? "drawer_vm_phased_incomplete", status: 500 };
}

export async function fetchOpportunityDrawerViewModelClient(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    init?: RequestInit,
    /**
     * Supply a sink and this request becomes two-phase: the carrier is delivered as soon as action
     * authority exists, and the returned promise still settles on the complete view model. Omit it
     * and the request is exactly the single-answer one it has always been.
     */
    onCarrier?: ((carrier: ActionableDrawerCarrier) => void) | null,
    onTruthPatch?: ((patch: DrawerTruthPatch) => void) | null
): Promise<
    | { ok: true; viewModel: OpportunityDrawerViewModel }
    | { ok: false; skipped: OpportunityDrawerViewModelSkipped; status: number }
    | { ok: false; error: string; status: number }
> {
    const phased = typeof onCarrier === "function";
    const url = buildOpportunityDrawerViewModelUrl(opportunityId, workspaceContext, phased);
    const response = await fetch(url, init ?? workspaceDataFetchInit());
    if (response.ok) {
        if (phased) {
            return readPhasedDrawerViewModelBody(
                response,
                {
                    opportunityId: opportunityId.trim(),
                    attentionSubjectId: workspaceContext?.attention_subject_id?.trim() || null,
                },
                onCarrier,
                onTruthPatch
            );
        }
        const viewModel = (await response.json()) as OpportunityDrawerViewModel;
        return { ok: true, viewModel };
    }
    const body = (await response.json().catch(() => ({}))) as OpportunityDrawerViewModelSkipped & {
        error?: string;
    };
    if (response.status === 422 && body.structureSettled === false) {
        return { ok: false, skipped: body, status: response.status };
    }
    return {
        ok: false,
        error: body.error ?? `drawer_vm_fetch_${response.status}`,
        status: response.status,
    };
}
