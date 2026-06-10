import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

/** Backward compatibility: old "Contractors" route redirects to Vendors. */
export default function AdminContractorsPage() {
    redirect("/legacy-admin/vendors");
}
