import Link from "next/link";
import { BookOpen } from "lucide-react";

export function Header() {
  return (
    <header className="border-b border-surface-border bg-surface">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-foreground">
          <BookOpen size={20} strokeWidth={1.75} className="text-accent" />
          <span className="text-base font-semibold tracking-tight">Inkline</span>
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          <Link href="/login" className="font-medium text-muted-foreground transition-colors hover:text-foreground">
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-accent px-4 py-2 font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            Sign up
          </Link>
        </nav>
      </div>
    </header>
  );
}
