import { opportunityDrawerHeaderActionsReady } from "@/lib/admin/drawer/drawerFirstPaintReadiness";
import { opportunityInquirySummaryRightPanelFromPrimaryOnly } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";

/** Opportunity above-fold must not reveal until header, actions, summary, and BOS column are ready or reserved. */
export function opportunityDrawerAboveFoldCoordinatedReady(args: {
    frame_ready: boolean;
    header_actions_ready: boolean;
    primary_contract_ready: boolean;
    inquiry_structural_ready: boolean;
    overview_reveal_ready: boolean;
    bos_panel_from_primary: boolean;
    below_fold_revealed: boolean;
}): boolean {
    if (!args.frame_ready || !args.primary_contract_ready || !args.inquiry_structural_ready) {
        return false;
    }
    if (!args.overview_reveal_ready) return false;
    if (!args.header_actions_ready) return false;
    return args.bos_panel_from_primary || args.below_fold_revealed;
}

export function opportunityDrawerBosPanelReadyFromRecord(
    record: Record<string, unknown> | null | undefined
): boolean {
    if (!record) return false;
    return opportunityInquirySummaryRightPanelFromPrimaryOnly(record);
}

export function opportunityDrawerHeaderActionsCoordinatedReady(args: {
    frame_ready: boolean;
    header_actions_resolved: boolean;
    header_actions_loading: boolean;
    expect_registry: boolean;
    typed_snapshot_first_paint: boolean;
    overview_reveal_ready: boolean;
}): boolean {
    if (args.typed_snapshot_first_paint || args.overview_reveal_ready) {
        return opportunityDrawerHeaderActionsReady({
            frame_ready: args.frame_ready,
            header_actions_resolved: args.header_actions_resolved,
            header_actions_loading: args.header_actions_loading,
            expect_registry: args.expect_registry,
        });
    }
    return opportunityDrawerHeaderActionsReady({
        frame_ready: args.frame_ready,
        header_actions_resolved: args.header_actions_resolved,
        header_actions_loading: args.header_actions_loading,
        expect_registry: args.expect_registry,
    });
}

export function personDrawerHouseholdAddressCoordinatedReady(args: {
    record: Record<string, unknown> | null | undefined;
    section_enabled: boolean;
    body_hydrated: boolean;
    has_content: boolean;
}): boolean {
    if (!args.section_enabled) return true;
    if (!args.body_hydrated) return false;
    return args.has_content;
}
