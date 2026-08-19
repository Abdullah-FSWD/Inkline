"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export function Header() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  return (
    <header className="border-b border-surface-border bg-surface">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-foreground">
          <BookOpen size={20} strokeWidth={1.75} className="text-accent" />
          <span className="text-base font-semibold tracking-tight">Inkline</span>
        </Link>

        {!loading && (
          <nav className="flex items-center gap-5 text-sm">
            {user ? (
              <>
                <Link href="/library" className="font-medium text-muted-foreground transition-colors hover:text-foreground">
                  Library
                </Link>
                <span className="text-muted-foreground">{user.email}</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <LogOut size={15} strokeWidth={1.75} />
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="font-medium text-muted-foreground transition-colors hover:text-foreground">
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-full bg-accent px-4 py-2 font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
                >
                  Sign up
                </Link>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
