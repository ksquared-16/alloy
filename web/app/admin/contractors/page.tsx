import { redirect } from "next/navigation";

/** Backward compatibility: old "Contractors" route redirects to Vendors. */
export default function AdminContractorsPage() {
    redirect("/admin/vendors");
}
