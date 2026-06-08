export type AddChildDevTraceTag =
    | "[action.add_child:start]"
    | "[action.add_child:submit]"
    | "[action.add_child:customer_member_created]"
    | "[action.add_child:ocm_linked]"
    | "[action.add_child:drawer_patch]"
    | "[action.add_child:child_visible_in_record]";

/** Dev-only traces for Add Child flow audit (local QA). */
export function logAddChildDevTrace(tag: AddChildDevTraceTag, detail: Record<string, unknown>): void {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "development") return;
    console.info(tag, detail);
}
