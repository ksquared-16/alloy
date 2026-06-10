import OptionSetDetailClient from "../OptionSetDetailClient";

export const dynamic = "force-dynamic";

function decodeSetKey(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

export default async function AdminSystemOptionSetDetailPage({
    params,
}: {
    params: Promise<{ setKey: string }>;
}) {
    const { setKey: raw } = await params;
    const setKey = decodeSetKey(raw ?? "");
    return <OptionSetDetailClient setKey={setKey} />;
}
