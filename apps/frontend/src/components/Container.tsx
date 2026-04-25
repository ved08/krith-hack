import { ReactNode } from "react";

interface ContainerProps {
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "full";
}

const SIZES = {
  sm: "max-w-2xl",
  md: "max-w-4xl",
  lg: "max-w-6xl",
  full: "max-w-full",
};

export function Container({
  children,
  className = "",
  size = "lg",
}: ContainerProps) {
  return (
    <div className={`mx-auto ${SIZES[size]} px-4 lg:px-8 ${className}`}>
      {children}
    </div>
  );
}
