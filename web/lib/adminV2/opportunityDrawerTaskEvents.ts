/** Dispatched after Task Assist creates or mutates operational tasks so the opportunity drawer can refetch. */
export const ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH = "adminv2:opportunity-operational-tasks-refresh" as const;

/** Open overview tab and focus the header operational strip (optional `task_id` chip). */
export const ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS = "adminv2:opportunity-focus-operational-tasks" as const;

export type OpportunityOperationalTasksRefreshDetail = {
    opportunity_id: string;
};

export type OpportunityFocusOperationalTasksDetail = {
    opportunity_id: string;
    task_id?: string | null;
};
