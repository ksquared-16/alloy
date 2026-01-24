import Link from "next/link";
import { Service } from "@/lib/services";
import PrimaryButton from "./PrimaryButton";

interface ServiceCardProps {
  service: Service;
}

export default function ServiceCard({ service }: ServiceCardProps) {
  const isAvailable = service.status === "available";
  const isGutters = service.id === "gutter";

  return (
    <div
      className={`
        bg-white rounded-lg shadow-md p-6
        transition-shadow hover:shadow-lg
        flex flex-col
        ${!isAvailable ? "opacity-75" : ""}
      `}
    >
      <h3 className="text-xl font-bold text-alloy-midnight mb-2">
        {service.name}
      </h3>
      <p className="text-gray-600 mb-4 flex-grow">{service.description}</p>
      
      <div className="flex items-center justify-between mt-auto">
        <span
          className={`
            px-3 py-1 rounded-full text-sm font-medium
            ${
              isAvailable
                ? isGutters
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-600"
            }
          `}
        >
          {isAvailable ? (isGutters ? "Get Early Access" : "Available") : "Coming Soon"}
        </span>
        
        {isAvailable ? (
          <Link href={service.href}>
            <PrimaryButton className="!px-4 !py-2 text-sm">
              Learn More
            </PrimaryButton>
          </Link>
        ) : (
          <button
            disabled
            className="px-4 py-2 text-sm font-semibold text-gray-400 cursor-not-allowed"
          >
            Coming Soon
          </button>
        )}
      </div>
    </div>
  );
}

