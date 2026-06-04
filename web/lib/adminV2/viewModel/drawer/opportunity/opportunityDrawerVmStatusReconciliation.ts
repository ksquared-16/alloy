import type { StatusControlVm } from "@/lib/adminV2/viewModel/drawer/types";
import { statusDefsFromViewModelStatusControl } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelFirstPaint";

export type OpportunityDrawerStatusDefOption = {
    status_key: string;
    status_label: string;
    sort_order: number;
    is_active: boolean;
};

export type PinnedOpportunityDrawerVmStatus = {
    opportunityId: string;
    statusControl: StatusControlVm;
    statusDefs: OpportunityDrawerStatusDefOption[];
    statusKey: string;
    statusLabel: string;
    pinnedAt: number;
};

export type DrawerVmStatusDiagnosticTag =
    | "vm_seed"
    | "non_vm_write_blocked"
    | "status_defs_reconciled"
    | "double_commit_detected";

const DIAG_PREFIX = "[drawer-vm-status:";

export function logDrawerVmStatusDiagnostic(
    tag: DrawerVmStatusDiagnosticTag,
    payload: Record<string, unknown>
): void {
    if (typeof console === "undefined" || typeof console.info !== "function") return;
    console.info(`${DIAG_PREFIX}${tag}]`, payload);
}

export function opportunityDrawerVmStatusKeyFromControl(status: StatusControlVm): string {
    if (status.renderAs === "dropdown") return status.status_key.trim();
    if (status.renderAs === "readonly_pill") return status.label.trim();
    return "";
}

export function opportunityDrawerVmStatusLabelFromControl(status: StatusControlVm): string {
    if (status.renderAs === "dropdown") return status.label.trim() || status.status_key.trim();
    if (status.renderAs === "readonly_pill") return status.label.trim();
    return "";
}

export function pinOpportunityDrawerVmStatusFromViewModel(
    opportunityId: string,
    status: StatusControlVm
): PinnedOpportunityDrawerVmStatus | null {
    const id = opportunityId.trim();
    if (!id || status.renderAs === "hidden") return null;

    const statusDefs = statusDefsFromViewModelStatusControl(status);
    const statusKey = opportunityDrawerVmStatusKeyFromControl(status);
    const statusLabel = opportunityDrawerVmStatusLabelFromControl(status);

    if (status.renderAs === "dropdown" && (!statusKey || statusDefs.length === 0)) return null;
    if (status.renderAs === "readonly_pill" && !statusLabel) return null;

    return {
        opportunityId: id,
        statusControl: status,
        statusDefs,
        statusKey,
        statusLabel,
        pinnedAt: Date.now(),
    };
}

export function opportunityDrawerVmStatusContractComplete(
    pin: PinnedOpportunityDrawerVmStatus | null | undefined
): boolean {
    if (!pin) return false;
    if (pin.statusControl.renderAs === "hidden") return false;
    if (pin.statusDefs.length === 0) return false;
    if (pin.statusControl.renderAs === "dropdown" && !pin.statusKey) return false;
    return true;
}

export function shouldBlockNonVmStatusWrite(params: {
    hardCutover: boolean;
    pin: PinnedOpportunityDrawerVmStatus | null | undefined;
    opportunityId: string;
}): boolean {
    if (!params.hardCutover) return false;
    const pin = params.pin;
    if (!pin) return false;
    return pin.opportunityId === params.opportunityId.trim();
}

export function reconcileStatusDefsWithVmPin(
    pin: PinnedOpportunityDrawerVmStatus,
    incoming: OpportunityDrawerStatusDefOption[],
    source: string
): {
    defs: OpportunityDrawerStatusDefOption[];
    blocked: boolean;
    replaced: boolean;
} {
    if (incoming.length === 0) {
        logDrawerVmStatusDiagnostic("non_vm_write_blocked", {
            opportunity_id: pin.opportunityId,
            source,
            reason: "empty_incoming",
        });
        return { defs: pin.statusDefs, blocked: true, replaced: false };
    }

    const incomingKeys = incoming.map((d) => d.status_key).sort().join("|");
    const pinKeys = pin.statusDefs.map((d) => d.status_key).sort().join("|");
    if (incomingKeys === pinKeys) {
        logDrawerVmStatusDiagnostic("status_defs_reconciled", {
            opportunity_id: pin.opportunityId,
            source,
            mode: "noop_match",
        });
        return { defs: pin.statusDefs, blocked: false, replaced: false };
    }

    const wouldShrinkToSingleSeed = incoming.length === 1 && pin.statusDefs.length > 1;
    const wouldDropCurrent =
        pin.statusKey.length > 0 && !incoming.some((d) => d.status_key === pin.statusKey);
    if (wouldShrinkToSingleSeed || wouldDropCurrent) {
        logDrawerVmStatusDiagnostic("non_vm_write_blocked", {
            opportunity_id: pin.opportunityId,
            source,
            reason: wouldShrinkToSingleSeed ? "single_option_seed" : "current_status_missing",
            incoming_count: incoming.length,
            pin_count: pin.statusDefs.length,
        });
        return { defs: pin.statusDefs, blocked: true, replaced: false };
    }

    logDrawerVmStatusDiagnostic("status_defs_reconciled", {
        opportunity_id: pin.opportunityId,
        source,
        mode: "incoming_accepted",
    });
    return { defs: incoming, blocked: false, replaced: true };
}

export function detectOpportunityStatusDoubleCommit(params: {
    opportunityId: string;
    vmContractComplete: boolean;
    hadMountedControl: boolean;
    showingSkeleton: boolean;
    statusKey: string;
}): boolean {
    if (!params.vmContractComplete || !params.hadMountedControl || !params.showingSkeleton) return false;
    logDrawerVmStatusDiagnostic("double_commit_detected", {
        opportunity_id: params.opportunityId,
        status_key: params.statusKey,
    });
    return true;
}
