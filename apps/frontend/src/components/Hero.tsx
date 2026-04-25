import { ReactNode } from "react";

interface HeroProps {
  title: string;
  subtitle: string;
  cta?: {
    label: string;
    onClick: () => void;
  };
  image?: ReactNode;
  gradient?: "blue" | "purple" | "pink";
}

export function Hero({
  title,
  subtitle,
  cta,
  image,
  gradient = "blue",
}: HeroProps) {
  const gradients = {
    blue: "from-primary-600 to-cyan-600",
    purple: "from-accent-600 to-pink-600",
    pink: "from-pink-500 to-rose-500",
  };

  return (
    <div className="relative overflow-hidden pt-32 pb-20 lg:pt-40 lg:pb-32">
      {/* Animated background gradient */}
      <div className="absolute inset-0 -z-10">
        <div
          className={`absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-br ${gradients[gradient]} rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float`}
        />
        <div
          className={`absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-to-tl ${gradients[gradient]} rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float`}
          style={{ animationDelay: "-2s" }}
        />
      </div>

      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6 animate-slide-up">
            <div className="space-y-3">
              <h1 className="text-5xl lg:text-6xl font-bold text-balance leading-tight">
                <span
                  className={`bg-gradient-to-r ${gradients[gradient]} bg-clip-text text-transparent`}
                >
                  {title}
                </span>
              </h1>
              <p className="text-xl text-slate-600 text-balance leading-relaxed max-w-lg">
                {subtitle}
              </p>
            </div>

            {cta && (
              <div className="pt-4">
                <button
                  onClick={cta.onClick}
                  className="px-8 py-4 rounded-xl bg-gradient-blue text-white font-bold text-lg shadow-glow hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-300 inline-block"
                >
                  {cta.label}
                  <span className="ml-2">→</span>
                </button>
              </div>
            )}
          </div>

          {image && (
            <div className="hidden lg:flex items-center justify-center animate-slide-in-right">
              {image}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
