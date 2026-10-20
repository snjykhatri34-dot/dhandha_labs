// Minimal server-only client for Supabase's REST API (PostgREST).
// RLS has no policies on our tables, so this uses the service role key: never import it in the browser.
import "server-only";

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase isn't configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  }
  return { url: url.replace(/\/$/, ""), key };
}

export async function rest<T>(path: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
  const { url, key } = config();
  const { prefer, headers, ...rest } = init;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...rest,
    cache: "no-store",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase ${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status}): ${await res.text()}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const eq = (value: string) => `eq.${encodeURIComponent(value)}`;
