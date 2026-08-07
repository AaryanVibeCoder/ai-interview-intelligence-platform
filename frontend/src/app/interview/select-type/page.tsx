"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useInterviewStore } from "@/store/interview-store";

export default function SelectTypeRedirect() {
  const router = useRouter();
  const { interviewType } = useInterviewStore();

  useEffect(() => {
    if (interviewType === "coding") {
      router.replace("/interview/coding");
    } else if (interviewType === "behavioral") {
      router.replace("/interview/behavioral");
    } else {
      router.replace("/dashboard");
    }
  }, [router, interviewType]);

  return (
    <div className="max-w-4xl mx-auto py-24 px-6 flex flex-col items-center justify-center space-y-4">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      <p className="text-sm font-semibold text-muted-foreground">Redirecting to your interview loop...</p>
    </div>
  );
}
