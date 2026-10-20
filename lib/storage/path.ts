// Clip path from schemas.md: <store>/<date>/<store>_<salesperson>_<date>_<visitno>.mp4|m4a
// The visit id doesn't exist yet when the clip is stored, so <visitno> is a unique upload stamp.

export function clipExtension(fileName: string, contentType: string): string {
  const fromName = fileName.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  return contentType.startsWith("audio/") ? "m4a" : "mp4";
}

export function slug(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-") || "unknown"
  );
}

export function clipPath(
  c: { store: string; salesperson: string; date: string; fileName: string; contentType: string },
  stamp: string,
): string {
  const name = slug(c.salesperson);
  return `${c.store}/${c.date}/${c.store}_${name}_${c.date}_${stamp}.${clipExtension(c.fileName, c.contentType)}`;
}

/** e.g. "174512-k3f9": time of upload plus a short random suffix. */
export function uploadStamp(now: Date = new Date()): string {
  const hhmmss = now.toISOString().slice(11, 19).replace(/:/g, "");
  return `${hhmmss}-${Math.random().toString(36).slice(2, 6)}`;
}
