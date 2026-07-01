import TourBookingPublicClient from "./TourBookingPublicClient";

export const dynamic = "force-dynamic";

export default async function TourBookingPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    return <TourBookingPublicClient token={token} />;
}
