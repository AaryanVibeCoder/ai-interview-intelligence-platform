import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | ElevateIQ",
  description: "Sign in to your ElevateIQ account",
};

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">Welcome to ElevateIQ</h1>
          <p className="mt-2 text-slate-400">Sign in to your account to continue</p>
        </div>

        <div className="rounded-lg bg-white shadow-lg p-8">
          <SignIn
            routing="path"
            path="/sign-in"
            signUpUrl="/sign-up"
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-none bg-transparent",
                header__title: "text-2xl font-bold text-slate-900",
                header__subtitle: "text-slate-600",
                socialButtonsBlockButton: "border-slate-300 hover:bg-slate-50",
                socialButtonsBlockButton__text: "text-slate-700 font-medium",
                dividerLine: "bg-slate-200",
                dividerText: "text-slate-600",
                formFieldLabel: "text-slate-700 font-medium",
                formFieldInput:
                  "border-slate-300 focus:border-slate-900 focus:ring-slate-900",
                formButtonPrimary:
                  "bg-slate-900 hover:bg-slate-800 text-white font-medium",
                footerActionLink: "text-slate-600 hover:text-slate-900",
                identity__inputGroup: "gap-3",
              },
            }}
          />
        </div>

        <p className="mt-6 text-center text-sm text-slate-400">
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" className="font-medium text-white hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
