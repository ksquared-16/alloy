import { ButtonHTMLAttributes, ReactNode } from "react";

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  className?: string;
}

export default function PrimaryButton({
  children,
  className = "",
  type = "button",
  ...props
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      className={`
        bg-alloy-blue hover:bg-alloy-blue/90
        text-white font-semibold 
        px-6 py-3 rounded-lg 
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloy-blue focus-visible:ring-offset-2
        active:scale-[0.99]
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}

