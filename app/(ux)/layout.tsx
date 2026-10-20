import Link from "next/link";
import { Suspense } from "react";
import { NavLinks, NavLinksStatic } from "@/components/ux/shared/NavLinks";
import { RoleSwitch } from "@/components/ux/shared/RoleSwitch";

export default function UxLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/owner" className="font-semibold tracking-tight">
            Counter Intelligence
          </Link>
          <Suspense fallback={<NavLinksStatic />}>
            <NavLinks />
          </Suspense>
          <div className="ml-auto">
            <Suspense fallback={null}>
              <RoleSwitch />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
      <footer className="mx-auto w-full max-w-3xl px-4 py-6 text-xs text-muted">
        Verma Jewellers · all data is synthetic
      </footer>
    </div>
  );
}
