"use client";

import type { RecordDrawerHeaderActionButtonProps } from "@/components/admin/drawer/record/RecordDrawerActionRail";
import {
    RecordDrawerHeaderActionButton as RecordDrawerHeaderActionButtonImpl,
    recordDrawerHeaderActionClassName,
    OPPORTUNITY_DRAWER_HEADER_ACTIONS_ROW_CLASS,
} from "@/components/admin/drawer/record/RecordDrawerActionRail";

export { recordDrawerHeaderActionClassName as opportunityDrawerHeaderActionClassName };
export { OPPORTUNITY_DRAWER_HEADER_ACTIONS_ROW_CLASS };

export type OpportunityDrawerHeaderActionButtonProps = RecordDrawerHeaderActionButtonProps;

/** Opportunity re-export — behavior unchanged; primitive lives in RecordDrawerActionRail. */
export default RecordDrawerHeaderActionButtonImpl;
