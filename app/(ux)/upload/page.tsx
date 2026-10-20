// /upload: staff upload a counter clip with store, salesperson and time (Person A).
import { Suspense } from "react";
import { connection } from "next/server";
import { ErrorState, LoadingBlock } from "@/components/ux/shared";
import { UploadForm } from "@/components/ux/upload/UploadForm";
import { visits } from "@/lib/data";
import { STORES } from "@/lib/types/scorecard";

async function UploadFormLoader() {
  await connection();
  let salespeopleByStore: Record<string, string[]>;
  try {
    const all = await visits.list();
    const byStore: Record<string, Set<string>> = {};
    for (const v of all) (byStore[v.store] ??= new Set()).add(v.salesperson);
    salespeopleByStore = Object.fromEntries(
      Object.entries(byStore).map(([store, names]) => [store, [...names].sort()]),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return <ErrorState title="Couldn't load stores and salespeople" message={message} />;
  }
  return <UploadForm stores={STORES} salespeopleByStore={salespeopleByStore} />;
}

export default function UploadPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Upload a counter clip</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        One customer visit per clip. The scorecard goes to the manager for review before staff see it.
      </p>
      <Suspense fallback={<LoadingBlock label="Loading the form…" />}>
        <UploadFormLoader />
      </Suspense>
    </>
  );
}
