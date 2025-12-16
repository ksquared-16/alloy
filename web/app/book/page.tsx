import Section from "@/components/Section";
import GhlEmbed from "@/components/GhlEmbed";

export default function BookPage() {
    return (
        <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-6">
            <GhlEmbed
                src="https://api.leadconnectorhq.com/widget/booking/GficiTFm4cbAbQ05IHwz"
                title="Booking Calendar"
                height={1200}
                className="!min-h-[1200px] md:!min-h-[900px]"
            />
        </div>
    );
}

