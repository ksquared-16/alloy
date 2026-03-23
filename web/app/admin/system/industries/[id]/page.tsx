import IndustriesDetailClient from "./IndustriesDetailClient";

export const dynamic = 'force-dynamic';

export default async function AdminSystemIndustryDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <IndustriesDetailClient id={id} />;
}
