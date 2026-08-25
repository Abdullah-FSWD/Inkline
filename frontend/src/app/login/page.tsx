"use client";

import { Suspense } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BookOpen } from "lucide-react";
import { LoginForm } from "./LoginForm";
import { ExpiredNotice } from "./ExpiredNotice";
import { GuestOnlyRoute } from "@/components/GuestOnlyRoute";

export default function LoginPage() {
  return (
    <GuestOnlyRoute>
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface p-8 shadow-sm"
        >
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <BookOpen size={22} strokeWidth={1.75} />
            </div>
            <h1 className="text-xl font-semibold text-foreground">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">Log in to your library and annotations.</p>
          </div>
          <Suspense fallback={null}>
            <ExpiredNotice />
          </Suspense>
          <LoginForm />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-accent hover:text-accent-hover">
              Sign up
            </Link>
          </p>
        </motion.div>
      </main>
    </GuestOnlyRoute>
  );
}
