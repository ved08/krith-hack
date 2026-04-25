import { ReactNode } from "react";

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  gradient?: "blue" | "purple" | "pink" | "emerald";
  onClick?: () => void;
}

const gradients = {
  blue: "from-primary-500/20 to-cyan-500/20 border-primary-200",
  purple: "from-accent-500/20 to-pink-500/20 border-accent-200",
  pink: "from-pink-500/20 to-rose-500/20 border-pink-200",
  emerald: "from-emerald-500/20 to-teal-500/20 border-emerald-200",
};

const icons = {
  blue: "text-primary-600",
  purple: "text-accent-600",
  pink: "text-pink-600",
  emerald: "text-emerald-600",
};

export function FeatureCard({
  icon,
  title,
  description,
  gradient = "blue",
  onClick,
}: FeatureCardProps) {
  return (
    <button
      onClick={onClick}
      className={`group relative p-8 rounded-2xl border-2 bg-gradient-to-br ${gradients[gradient]} backdrop-blur-sm transition-all duration-300 hover:shadow-lg hover:scale-105 active:scale-95 text-left cursor-pointer`}
    >
      {/* Animated gradient overlay on hover */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-white/50 to-transparent" />

      <div className="relative z-10">
        <div
          className={`text-5xl mb-4 ${icons[gradient]} group-hover:scale-110 transition-transform duration-300`}
        >
          {icon}
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
        <p className="text-slate-600 leading-relaxed">{description}</p>
      </div>

      {/* Bottom accent line */}
      <div
        className={`absolute bottom-0 left-0 h-1 bg-gradient-to-r ${
          {
            blue: "from-primary-500 to-cyan-500",
            purple: "from-accent-500 to-pink-500",
            pink: "from-pink-500 to-rose-500",
            emerald: "from-emerald-500 to-teal-500",
          }[gradient]
        } rounded-full w-0 group-hover:w-full transition-all duration-500`}
      />
    </button>
  );
}
