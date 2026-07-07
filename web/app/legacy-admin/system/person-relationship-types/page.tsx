import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — person relationship vocabulary lives under Platform Configuration → Relationships. */
export default function AdminSystemPersonRelationshipTypesRedirectPage() {
    redirect("/settings/relationships?tab=person-relationships");
}
