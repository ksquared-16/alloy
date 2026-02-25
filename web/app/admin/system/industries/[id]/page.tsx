import IndustriesDetailClient from "./IndustriesDetailClient";

export default async function AdminSystemIndustryDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <IndustriesDetailClient id={id} />;
}
