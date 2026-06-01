"use client";

import type { RecordDrawerHeaderActionButtonProps } from "@/components/admin/drawer/record/RecordDrawerActionRail";
import { RecordDrawerHeaderActionButton as RecordDrawerHeaderActionButtonImpl } from "@/components/admin/drawer/record/RecordDrawerActionRail";
import {
    OPPORTUNITY_DRAWER_HEADER_ACTIONS_ROW_CLASS,
    opportunityDrawerHeaderActionClassName,
} from "@/components/admin/drawer/record/recordDrawerHeaderActionClasses";

export { opportunityDrawerHeaderActionClassName };
export { OPPORTUNITY_DRAWER_HEADER_ACTIONS_ROW_CLASS };

export type OpportunityDrawerHeaderActionButtonProps = RecordDrawerHeaderActionButtonProps;

/** Opportunity re-export — behavior unchanged; primitive lives in RecordDrawerActionRail. */
export default RecordDrawerHeaderActionButtonImpl;
