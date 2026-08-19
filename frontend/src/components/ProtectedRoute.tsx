"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, sessionExpired } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(sessionExpired ? "/login?expired=1" : "/login");
    }
  }, [loading, user, sessionExpired, router]);

  if (loading || !user) return null;

  return <>{children}</>;
}
