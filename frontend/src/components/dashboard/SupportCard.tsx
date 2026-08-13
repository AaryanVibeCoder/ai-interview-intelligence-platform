"use client";

import React from "react";
import { HelpCircle, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

export function SupportCard() {
  const router = useRouter();

  return (
    <div
      onClick={() => router.push("/settings?focus=support")}
      className="rounded-2xl border border-border bg-card/70 p-6 backdrop-blur-xl flex flex-col justify-between h-full hover:bg-card/90 hover:border-primary/40 select-none transition-all duration-200"
    >
      <div>
        <h3 className="font-semibold text-lg text-foreground flex items-center gap-2">
          Support Center
          <HelpCircle className="h-4 w-4 text-primary" />
        </h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Need help? Submit issues directly to our customer support desk.
        </p>
      </div>
      <div className="mt-6 flex justify-end">
        <span className="text-xs font-semibold text-primary flex items-center gap-1 interactive-target">
          Get Help
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}
