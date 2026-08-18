"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { BookOpen, Pencil, Highlighter, PenLine, ArrowRight } from "lucide-react";

const features = [
  { icon: Pencil, label: "Pencil" },
  { icon: Highlighter, label: "Highlighter" },
  { icon: PenLine, label: "Underline" },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="flex w-full max-w-lg flex-col items-center text-center"
      >
        <motion.div
          variants={item}
          className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent"
        >
          <BookOpen size={28} strokeWidth={1.75} />
        </motion.div>

        <motion.h1 variants={item} className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Inkline
        </motion.h1>

        <motion.p variants={item} className="mt-3 max-w-sm text-base leading-relaxed text-muted-foreground">
          Upload an HTML or PDF file and mark it up like a real page — pencil, highlighter, and underline that
          follow you everywhere you log in.
        </motion.p>

        <motion.div variants={item} className="mt-8 flex items-center gap-6">
          {features.map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 text-muted-foreground">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-surface-border bg-surface">
                <Icon size={16} strokeWidth={1.75} />
              </div>
              <span className="text-xs">{label}</span>
            </div>
          ))}
        </motion.div>

        <motion.div variants={item} className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/signup"
              className="flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover"
            >
              Get started
              <ArrowRight size={16} />
            </Link>
          </motion.div>
          <Link href="/login" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Already have an account? Log in
          </Link>
        </motion.div>
      </motion.div>
    </main>
  );
}
