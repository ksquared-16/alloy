import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — vendor fields are not in the childcare Fields hub; route to Fields home. */
export default function AdminSystemVendorFieldsRedirectPage() {
    redirect("/settings/fields");
}
