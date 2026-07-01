/** Next.js cache tag for GET /api/admin/actions; invalidate after successful execute. */
export function adminActionsOrgTag(orgId: string): string {
    return `admin-actions:${orgId}`;
}
