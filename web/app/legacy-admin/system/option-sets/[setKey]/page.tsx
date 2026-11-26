import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function decodeSetKey(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/** Legacy route — option set detail lives under Platform Configuration. */
export default async function AdminSystemOptionSetDetailRedirectPage({
    params,
}: {
    params: Promise<{ setKey: string }>;
}) {
    const { setKey: raw } = await params;
    const setKey = decodeSetKey(raw ?? "");
    redirect(`/settings/option-sets/${encodeURIComponent(setKey)}`);
}
