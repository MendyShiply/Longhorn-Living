/** One tap searches of the scanned code on the big retail sites. Free: they just open in a new tab. */
const SITES: { name: string; url: (q: string) => string }[] = [
  { name: "Google", url: (q) => `https://www.google.com/search?q=${q}` },
  { name: "Amazon", url: (q) => `https://www.amazon.com/s?k=${q}` },
  { name: "Wayfair", url: (q) => `https://www.wayfair.com/keyword.php?keyword=${q}` },
  { name: "Home Depot", url: (q) => `https://www.homedepot.com/s/${q}` },
  { name: "Walmart", url: (q) => `https://www.walmart.com/search?q=${q}` },
  { name: "Lowe's", url: (q) => `https://www.lowes.com/search?searchTerm=${q}` },
];

export function SearchLinks({ code, label = "Look it up:" }: { code: string; label?: string }) {
  const q = encodeURIComponent(code.trim());
  if (!q) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-stone-600">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {SITES.map((s) => (
          <a
            key={s.name}
            href={s.url(q)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary px-2 py-2 text-xs"
          >
            {s.name} ↗
          </a>
        ))}
      </div>
    </div>
  );
}
