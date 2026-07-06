"use client";

import { useRouter } from "next/navigation";

export function BackButton({ label, href, fallback }: { label: string; href?: string | null; fallback: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (href) {
          router.push(href);
        } else if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      ← {label}
    </button>
  );
}
