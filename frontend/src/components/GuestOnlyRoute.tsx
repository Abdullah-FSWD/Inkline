"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

// Redirects an already-authenticated visitor away from a page meant only for logged-out users
// (login/signup) to the library - the mirror image of ProtectedRoute. Deliberately checks this
// only once, based on whatever auth state is already in place when the page is first opened,
// not reactively for the rest of that page's lifetime: without that distinction, submitting
// the signup form (which logs the user in immediately) would trigger this same check and yank
// the page away before the user ever sees the "Account created" confirmation.
export function GuestOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const checked = useRef(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (loading || checked.current) return;
    checked.current = true;

    async function redirectIfAlreadyLoggedIn() {
      if (user) {
        setRedirecting(true);
        router.replace("/library");
      }
    }

    redirectIfAlreadyLoggedIn();
  }, [loading, user, router]);

  if (loading || redirecting) return null;

  return <>{children}</>;
}
