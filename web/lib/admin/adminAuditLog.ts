/**
 * V1 audit: log admin/ops change to console. Optionally write to audit_log table later.
 * Kept separate from adminAuth so client-safe modules can audit without pulling next/headers.
 */
export function logAdminAudit(params: {
    entity: string;
    id: string;
    changed_fields: string[];
    actor_user_id: string;
    role: string;
}) {
    console.log("[ADMIN_AUDIT]", JSON.stringify(params));
}
