import Link from "next/link";
import { EmptyState } from "@/components/ux/shared";

export default function UxNotFound() {
  return (
    <EmptyState title="Not found">
      That visit or page doesn&apos;t exist.{" "}
      <Link href="/owner#visits" className="underline">
        Back to all visits
      </Link>
    </EmptyState>
  );
}
