import { redirect } from "next/navigation";
import { CANONICAL_OPERATOR_BASE } from "@/lib/admin/canonicalAdminRoutes";

export const dynamic = "force-dynamic";

/** Archived legacy admin landing — operator workspace is canonical. */
export default function LegacyAdminArchivedPage() {
    redirect(CANONICAL_OPERATOR_BASE);
}
