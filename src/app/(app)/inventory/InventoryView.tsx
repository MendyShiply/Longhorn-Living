"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CONDITION_LABELS, STATUS_LABELS, STATUS_ORDER, type ItemCondition, type ItemStatus } from "@/lib/types";
import { money } from "@/lib/pricing";

export interface InventoryRow {
  id: string;
  code: string;
  image: string | null;
  title: string | null;
  category: string | null;
  brand: string | null;
  retailer: string | null;
  model: string | null;
  color: string | null;
  dimensions: string | null;
  status: ItemStatus;
  condition: ItemCondition | null;
  conditionNotes: string | null;
  built: boolean;
  price: number | null;
  retail: number | null;
  pctOfRetail: number | null;
  location: string | null;
  load: string | null;
  pallet: number | null;
  photos: number;
  liveListings: number;
  scannedCode: string | null;
  added: string;
  daysInStock: number;
}

// ------------------------------------------------------------------
// Columns
// ------------------------------------------------------------------

type ColType = "text" | "number" | "money" | "date";
type Value = string | number | null;

interface Col {
  id: string;
  label: string;
  type: ColType;
  width: number;
  /** The value used for sorting, filtering and the CSV. */
  get: (r: InventoryRow) => Value;
  /** Optional custom cell. Defaults to the formatted value. */
  cell?: (r: InventoryRow) => React.ReactNode;
}

const conditionShort = (c: ItemCondition | null) => (c ? CONDITION_LABELS[c].split(" (")[0] : null);

const COLUMNS: Col[] = [
  { id: "code", label: "Item #", type: "text", width: 110, get: (r) => r.code },
  {
    id: "photo",
    label: "Photo",
    type: "number",
    width: 64,
    get: (r) => r.photos,
    cell: (r) =>
      r.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.image} alt="" className="h-9 w-9 rounded object-cover" />
      ) : (
        <span className="block h-9 w-9 rounded bg-stone-100" />
      ),
  },
  {
    id: "title",
    label: "Product",
    type: "text",
    width: 280,
    get: (r) => r.title,
    cell: (r) => r.title ?? <i className="text-amber-700">Needs identifying</i>,
  },
  { id: "category", label: "Category", type: "text", width: 130, get: (r) => r.category },
  { id: "status", label: "Status", type: "text", width: 120, get: (r) => STATUS_LABELS[r.status], cell: (r) => <StatusPill s={r.status} /> },
  { id: "condition", label: "Condition", type: "text", width: 130, get: (r) => conditionShort(r.condition) },
  { id: "price", label: "Price", type: "money", width: 95, get: (r) => r.price },
  { id: "retail", label: "Retail", type: "money", width: 95, get: (r) => r.retail },
  { id: "pct", label: "% of retail", type: "number", width: 95, get: (r) => r.pctOfRetail, cell: (r) => (r.pctOfRetail != null ? `${r.pctOfRetail}%` : "") },
  { id: "brand", label: "Brand", type: "text", width: 130, get: (r) => r.brand },
  { id: "retailer", label: "Retailer", type: "text", width: 110, get: (r) => r.retailer },
  { id: "location", label: "Location", type: "text", width: 110, get: (r) => r.location },
  { id: "load", label: "Load", type: "text", width: 80, get: (r) => r.load },
  { id: "pallet", label: "Pallet", type: "number", width: 70, get: (r) => r.pallet },
  { id: "built", label: "Built", type: "text", width: 70, get: (r) => (r.built ? "Yes" : "No") },
  { id: "listings", label: "Live listings", type: "number", width: 100, get: (r) => r.liveListings },
  { id: "days", label: "Days in stock", type: "number", width: 110, get: (r) => r.daysInStock },
  { id: "added", label: "Added", type: "date", width: 105, get: (r) => r.added },
  { id: "model", label: "Model #", type: "text", width: 130, get: (r) => r.model },
  { id: "color", label: "Color", type: "text", width: 100, get: (r) => r.color },
  { id: "dimensions", label: "Dimensions", type: "text", width: 160, get: (r) => r.dimensions },
  { id: "notes", label: "Condition notes", type: "text", width: 200, get: (r) => r.conditionNotes },
  { id: "scanned", label: "Barcode", type: "text", width: 140, get: (r) => r.scannedCode },
];
const COL_BY_ID = Object.fromEntries(COLUMNS.map((c) => [c.id, c]));
const DEFAULT_ORDER = COLUMNS.map((c) => c.id);
const DEFAULT_HIDDEN = ["model", "color", "dimensions", "notes", "scanned"];

function display(col: Col, v: Value): string {
  if (v === null || v === undefined || v === "") return "";
  if (col.type === "money") return money(Number(v));
  if (col.type === "date") return new Date(String(v)).toLocaleDateString();
  return String(v);
}

// ------------------------------------------------------------------
// Filters and sorting
// ------------------------------------------------------------------

/** values: show only rows whose value is in this list ("(Blank)" for empty). min/max: number range. */
type Filter = { values?: string[]; min?: number; max?: number };
type Sort = { col: string; dir: "asc" | "desc" } | null;

const BLANK = "(Blank)";
const valueKey = (col: Col, r: InventoryRow) => {
  const v = col.get(r);
  return v === null || v === "" ? BLANK : col.type === "date" ? display(col, v) : String(v);
};

function passes(col: Col, f: Filter, r: InventoryRow) {
  if (f.values && !f.values.includes(valueKey(col, r))) return false;
  if (f.min !== undefined || f.max !== undefined) {
    const v = col.get(r);
    if (v === null || v === "") return false;
    const n = Number(v);
    if (f.min !== undefined && n < f.min) return false;
    if (f.max !== undefined && n > f.max) return false;
  }
  return true;
}

function compare(col: Col, a: InventoryRow, b: InventoryRow) {
  const x = col.get(a);
  const y = col.get(b);
  if (x === null || x === "") return y === null || y === "" ? 0 : 1;
  if (y === null || y === "") return -1;
  if (col.type === "text") return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
  if (col.type === "date") return new Date(String(x)).getTime() - new Date(String(y)).getTime();
  return Number(x) - Number(y);
}

// ------------------------------------------------------------------
// Saved layout (per browser)
// ------------------------------------------------------------------

const LAYOUT_KEY = "ll-inventory-table-v1";
interface Layout {
  order: string[];
  hidden: string[];
}
function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const l = JSON.parse(raw) as Layout;
      // Keep any columns added in later versions of the app.
      const order = [...l.order.filter((id) => COL_BY_ID[id]), ...DEFAULT_ORDER.filter((id) => !l.order.includes(id))];
      return { order, hidden: l.hidden.filter((id) => COL_BY_ID[id]) };
    }
  } catch {
    // storage blocked: use defaults
  }
  return { order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN };
}
function saveLayout(l: Layout) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(l));
  } catch {
    // ignore
  }
}

// ------------------------------------------------------------------
// Main view
// ------------------------------------------------------------------

export function InventoryView({
  rows,
  initialStatus,
  initialQuery,
  loadCode,
}: {
  rows: InventoryRow[];
  initialStatus: string;
  initialQuery: string;
  loadCode: string | null;
}) {
  const [mode, setMode] = useState<"cards" | "table">("cards");
  const [q, setQ] = useState(initialQuery);
  const [filters, setFilters] = useState<Record<string, Filter>>(() => {
    const f: Record<string, Filter> = {};
    if (initialStatus) f.status = { values: [STATUS_LABELS[initialStatus as ItemStatus] ?? initialStatus] };
    return f;
  });
  const [sort, setSort] = useState<Sort>(null);
  const [layout, setLayout] = useState<Layout>({ order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN });
  useEffect(() => setLayout(loadLayout()), []);
  const updateLayout = (l: Layout) => {
    setLayout(l);
    saveLayout(l);
  };

  // Categories for the chips across the top (shared by both views)
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const c = r.category ?? BLANK;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => (a[0] === BLANK ? 1 : b[0] === BLANK ? -1 : a[0].localeCompare(b[0])));
  }, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (needle) {
        const hay = [r.code, r.title, r.brand, r.category, r.model, r.scannedCode, r.location].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      for (const [id, f] of Object.entries(filters)) {
        const col = COL_BY_ID[id];
        if (col && !passes(col, f, r)) return false;
      }
      return true;
    });
    if (sort) {
      const col = COL_BY_ID[sort.col];
      out = [...out].sort((a, b) => {
        const c = compare(col, a, b);
        // blanks stay at the bottom either way
        const blankA = col.get(a) === null || col.get(a) === "";
        const blankB = col.get(b) === null || col.get(b) === "";
        if (blankA || blankB) return c;
        return sort.dir === "asc" ? c : -c;
      });
    }
    return out;
  }, [rows, q, filters, sort]);

  const setFilter = (id: string, f: Filter | null) =>
    setFilters((prev) => {
      const next = { ...prev };
      if (!f || (!f.values && f.min === undefined && f.max === undefined)) delete next[id];
      else next[id] = f;
      return next;
    });

  const activeCategory = filters.category?.values?.length === 1 ? filters.category.values[0] : null;
  const activeStatus = filters.status?.values?.length === 1 ? filters.status.values[0] : "";
  const filterCount = Object.keys(filters).length + (q ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">Inventory</h1>
          {loadCode && (
            <p className="muted">
              Load {loadCode} only ·{" "}
              <Link href="/inventory" className="underline">
                show all
              </Link>
            </p>
          )}
        </div>
        <div role="tablist" aria-label="View" className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5">
          {(["cards", "table"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md px-4 py-1.5 text-sm font-semibold ${mode === m ? "bg-brand-500 text-white" : "text-stone-600"}`}
            >
              {m === "cards" ? "Cards" : "Table"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search name, item #, brand, barcode"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="input max-w-[12rem]"
          value={activeStatus}
          onChange={(e) => setFilter("status", e.target.value ? { values: [e.target.value] } : null)}
        >
          <option value="">All statuses</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={STATUS_LABELS[s]}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {filterCount > 0 && (
          <button
            className="btn-secondary"
            onClick={() => {
              setQ("");
              setFilters({});
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Categories */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <Chip on={!filters.category} onClick={() => setFilter("category", null)}>
          All <span className="opacity-60">{rows.length}</span>
        </Chip>
        {categories.map(([c, n]) => (
          <Chip key={c} on={activeCategory === c} onClick={() => setFilter("category", activeCategory === c ? null : { values: [c] })}>
            {c === BLANK ? "No category" : c} <span className="opacity-60">{n}</span>
          </Chip>
        ))}
      </div>

      <p className="muted">
        {visible.length} of {rows.length} items
      </p>

      {mode === "cards" ? (
        <Cards rows={visible} />
      ) : (
        <Table
          rows={rows}
          visible={visible}
          layout={layout}
          updateLayout={updateLayout}
          filters={filters}
          setFilter={setFilter}
          sort={sort}
          setSort={setSort}
        />
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
        on ? "border-brand-500 bg-brand-500 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-brand-500"
      }`}
    >
      {children}
    </button>
  );
}

const STATUS_STYLE: Record<ItemStatus, string> = {
  received: "bg-amber-100 text-amber-800",
  identified: "bg-sky-100 text-sky-800",
  built: "bg-sky-100 text-sky-800",
  photographed: "bg-orange-100 text-orange-800",
  listed: "bg-green-100 text-green-800",
  sold: "bg-indigo-100 text-indigo-800",
  picked_up: "bg-indigo-100 text-indigo-800",
  parts: "bg-stone-200 text-stone-700",
  scrap: "bg-stone-200 text-stone-700",
};
function StatusPill({ s }: { s: ItemStatus }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s]}`}>{STATUS_LABELS[s]}</span>;
}

// ------------------------------------------------------------------
// Cards view (the original look)
// ------------------------------------------------------------------

function Cards({ rows }: { rows: InventoryRow[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((i) => (
        <Link key={i.id} href={`/items/${i.id}`} className="card flex gap-3 hover:border-brand-500">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-stone-100">
            {i.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={i.image} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-xs text-stone-500">
              {i.code} · {i.load}
              {i.category ? ` · ${i.category}` : ""}
            </div>
            <div className="line-clamp-2 font-medium">{i.title ?? <i className="text-amber-700">Needs identifying</i>}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <b>{money(i.price)}</b>
              <StatusPill s={i.status} />
              {i.condition && <span className="muted">{conditionShort(i.condition)}</span>}
              {i.location && <span className="muted">📍{i.location}</span>}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------
// Table view (spreadsheet style)
// ------------------------------------------------------------------

function Table(props: {
  rows: InventoryRow[];
  visible: InventoryRow[];
  layout: Layout;
  updateLayout: (l: Layout) => void;
  filters: Record<string, Filter>;
  setFilter: (id: string, f: Filter | null) => void;
  sort: Sort;
  setSort: (s: Sort) => void;
}) {
  const router = useRouter();
  const { layout, updateLayout } = props;
  const cols = layout.order.filter((id) => !layout.hidden.includes(id)).map((id) => COL_BY_ID[id]);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [showCols, setShowCols] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const move = (id: string, toId: string) => {
    if (id === toId) return;
    const order = layout.order.filter((x) => x !== id);
    order.splice(order.indexOf(toId), 0, id);
    updateLayout({ ...layout, order });
  };
  const shift = (id: string, step: -1 | 1) => {
    // Move past hidden columns so the change is visible
    const shown = layout.order.filter((x) => !layout.hidden.includes(x));
    const i = shown.indexOf(id);
    const target = shown[i + step];
    if (!target) return;
    const order = layout.order.filter((x) => x !== id);
    const t = order.indexOf(target);
    order.splice(step === 1 ? t + 1 : t, 0, id);
    updateLayout({ ...layout, order });
  };

  function downloadCsv() {
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const exportCols = cols.filter((c) => c.id !== "photo");
    const lines = [
      exportCols.map((c) => esc(c.label)).join(","),
      ...props.visible.map((r) => exportCols.map((c) => esc(c.type === "money" ? String(c.get(r) ?? "") : display(c, c.get(r)))).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `longhorn-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const totals = useMemo(() => {
    const sum = (f: (r: InventoryRow) => number | null) => props.visible.reduce((a, r) => a + (f(r) ?? 0), 0);
    return { price: sum((r) => r.price), retail: sum((r) => r.retail) };
  }, [props.visible]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <button className="btn-secondary py-1.5" onClick={() => setShowCols((v) => !v)}>
            Columns ({cols.length}/{COLUMNS.length})
          </button>
          {showCols && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowCols(false)} />
              <div className="absolute left-0 top-full z-40 mt-1 max-h-96 w-64 overflow-auto rounded-xl border border-stone-200 bg-white p-2 shadow-lg">
                {layout.order.map((id) => (
                  <label key={id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-stone-50">
                    <input
                      type="checkbox"
                      checked={!layout.hidden.includes(id)}
                      onChange={(e) =>
                        updateLayout({
                          ...layout,
                          hidden: e.target.checked ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id],
                        })
                      }
                    />
                    {COL_BY_ID[id].label}
                  </label>
                ))}
                <button
                  className="mt-1 w-full rounded px-2 py-1.5 text-left text-sm text-brand-600 hover:bg-stone-50"
                  onClick={() => updateLayout({ order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN })}
                >
                  Reset to default layout
                </button>
              </div>
            </>
          )}
        </div>
        <button className="btn-secondary py-1.5" onClick={downloadCsv}>
          Download for Excel / Sheets
        </button>
        {props.sort && (
          <button className="btn-secondary py-1.5" onClick={() => props.setSort(null)}>
            Clear sort
          </button>
        )}
        <span className="muted hidden md:inline">Tip: tap a column name to sort or filter, drag it to move it.</span>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {cols.map((c, i) => {
                const filtered = Boolean(props.filters[c.id]);
                const sorted = props.sort?.col === c.id ? props.sort.dir : null;
                return (
                  <th
                    key={c.id}
                    style={{ width: c.width, minWidth: c.width }}
                    draggable
                    onDragStart={(e) => {
                      setDragId(c.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOverId(c.id);
                    }}
                    onDragLeave={() => setOverId((o) => (o === c.id ? null : o))}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId) move(dragId, c.id);
                      setDragId(null);
                      setOverId(null);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                    className={`sticky top-0 z-20 border-b border-r border-stone-200 bg-stone-100 p-0 text-left font-semibold text-stone-700 ${
                      i === 0 ? "left-0 z-30" : ""
                    } ${overId === c.id && dragId !== c.id ? "bg-brand-100" : ""} ${dragId === c.id ? "opacity-50" : ""}`}
                  >
                    <button
                      className="flex w-full cursor-pointer items-center gap-1 px-2 py-2 text-left"
                      onClick={(e) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setMenu(menu?.id === c.id ? null : { id: c.id, x: r.left, y: r.bottom });
                      }}
                    >
                      <span className="truncate">{c.label}</span>
                      {sorted && <span className="text-brand-600">{sorted === "asc" ? "▲" : "▼"}</span>}
                      {filtered && <span className="text-brand-600" title="Filtered">⏷</span>}
                      <span className="ml-auto text-xs text-stone-400">▾</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {props.visible.map((r, ri) => (
              <tr
                key={r.id}
                onClick={() => router.push(`/items/${r.id}`)}
                className={`cursor-pointer ${ri % 2 ? "bg-stone-50" : "bg-white"} hover:bg-brand-50`}
              >
                {cols.map((c, i) => (
                  <td
                    key={c.id}
                    style={{ maxWidth: c.width }}
                    className={`border-b border-r border-stone-100 px-2 py-1.5 align-middle ${
                      c.type === "money" || c.type === "number" ? "text-right tabular-nums" : ""
                    } ${i === 0 ? `sticky left-0 z-10 font-mono text-xs ${ri % 2 ? "bg-stone-50" : "bg-white"}` : ""}`}
                  >
                    <div className={c.id === "title" ? "line-clamp-2" : "truncate"}>{c.cell ? c.cell(r) : display(c, c.get(r))}</div>
                  </td>
                ))}
              </tr>
            ))}
            {!props.visible.length && (
              <tr>
                <td colSpan={cols.length} className="px-3 py-8 text-center text-stone-500">
                  No items match these filters.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              {cols.map((c, i) => (
                <td
                  key={c.id}
                  className={`sticky bottom-0 border-t border-stone-200 bg-stone-100 px-2 py-1.5 font-semibold ${
                    c.type === "money" || c.type === "number" ? "text-right tabular-nums" : ""
                  } ${i === 0 ? "left-0 z-10" : ""}`}
                >
                  {i === 0 ? `${props.visible.length} items` : c.id === "price" ? money(totals.price) : c.id === "retail" ? money(totals.retail) : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {menu && (
        <ColumnMenu
          col={COL_BY_ID[menu.id]}
          x={menu.x}
          y={menu.y}
          rows={props.rows}
          filter={props.filters[menu.id] ?? null}
          sort={props.sort}
          onSort={(dir) => {
            props.setSort({ col: menu.id, dir });
            setMenu(null);
          }}
          onFilter={(f) => props.setFilter(menu.id, f)}
          onMove={(step) => shift(menu.id, step)}
          onHide={() => {
            updateLayout({ ...layout, hidden: [...layout.hidden, menu.id] });
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// The menu that opens from a column header
// ------------------------------------------------------------------

function ColumnMenu(props: {
  col: Col;
  x: number;
  y: number;
  rows: InventoryRow[];
  filter: Filter | null;
  sort: Sort;
  onSort: (dir: "asc" | "desc") => void;
  onFilter: (f: Filter | null) => void;
  onMove: (step: -1 | 1) => void;
  onHide: () => void;
  onClose: () => void;
}) {
  const { col } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: props.x, top: props.y + 4 });
  useEffect(() => {
    // Keep the menu on screen
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setPos({
      left: Math.max(8, Math.min(props.x, window.innerWidth - w - 8)),
      top: Math.max(8, Math.min(props.y + 4, window.innerHeight - h - 8)),
    });
  }, [props.x, props.y]);

  const numeric = col.type === "number" || col.type === "money";
  const labels =
    col.type === "text"
      ? ["Sort A to Z", "Sort Z to A"]
      : col.type === "date"
        ? ["Oldest first", "Newest first"]
        : ["Smallest first", "Largest first"];

  // Distinct values with counts, for the checkbox filter
  const options = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of props.rows) {
      const k = valueKey(col, r);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => {
      if (a[0] === BLANK) return 1;
      if (b[0] === BLANK) return -1;
      return numeric ? Number(a[0]) - Number(b[0]) : a[0].localeCompare(b[0], undefined, { numeric: true });
    });
  }, [props.rows, col, numeric]);

  const [search, setSearch] = useState("");
  const allKeys = options.map(([k]) => k);
  const selected = new Set(props.filter?.values ?? allKeys);
  const toggle = (k: string) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    const values = [...next];
    props.onFilter(values.length === allKeys.length ? { ...props.filter, values: undefined } : { ...props.filter, values });
  };
  const shown = options.filter(([k]) => k.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={props.onClose} />
      <div
        ref={ref}
        style={{ left: pos.left, top: pos.top }}
        className="fixed z-50 w-72 max-w-[calc(100vw-16px)] rounded-xl border border-stone-200 bg-white p-2 text-sm shadow-xl"
      >
        <div className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{col.label}</div>
        <MenuButton onClick={() => props.onSort("asc")} active={props.sort?.col === col.id && props.sort.dir === "asc"}>
          ▲ {labels[0]}
        </MenuButton>
        <MenuButton onClick={() => props.onSort("desc")} active={props.sort?.col === col.id && props.sort.dir === "desc"}>
          ▼ {labels[1]}
        </MenuButton>
        <div className="my-1 flex gap-1">
          <MenuButton onClick={() => props.onMove(-1)}>← Move left</MenuButton>
          <MenuButton onClick={() => props.onMove(1)}>Move right →</MenuButton>
        </div>
        {col.id !== "code" && <MenuButton onClick={props.onHide}>Hide column</MenuButton>}

        <div className="my-2 border-t border-stone-100" />
        <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Filter</div>

        {numeric && (
          <div className="flex items-center gap-2 px-2 pb-2">
            <input
              className="w-full rounded-md border border-stone-300 px-2 py-1"
              inputMode="decimal"
              placeholder="Min"
              defaultValue={props.filter?.min ?? ""}
              onChange={(e) => props.onFilter({ ...props.filter, min: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
            <span className="text-stone-400">to</span>
            <input
              className="w-full rounded-md border border-stone-300 px-2 py-1"
              inputMode="decimal"
              placeholder="Max"
              defaultValue={props.filter?.max ?? ""}
              onChange={(e) => props.onFilter({ ...props.filter, max: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </div>
        )}

        {options.length > 8 && (
          <input
            className="mx-2 mb-1 w-[calc(100%-16px)] rounded-md border border-stone-300 px-2 py-1"
            placeholder="Search values"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        <div className="flex gap-3 px-2 py-1 text-xs">
          <button className="text-brand-600 underline" onClick={() => props.onFilter({ ...props.filter, values: undefined })}>
            Select all
          </button>
          <button className="text-brand-600 underline" onClick={() => props.onFilter({ ...props.filter, values: [] })}>
            Clear all
          </button>
        </div>
        <div className="max-h-56 overflow-auto">
          {shown.map(([k, n]) => (
            <label key={k} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-stone-50">
              <input type="checkbox" checked={selected.has(k)} onChange={() => toggle(k)} />
              <span className="min-w-0 flex-1 truncate">{col.type === "money" && k !== BLANK ? money(Number(k)) : k}</span>
              <span className="text-xs text-stone-400">{n}</span>
            </label>
          ))}
        </div>
        {props.filter && (
          <button className="mt-1 w-full rounded-lg bg-stone-100 px-2 py-1.5 font-medium hover:bg-stone-200" onClick={() => props.onFilter(null)}>
            Remove this filter
          </button>
        )}
      </div>
    </>
  );
}

function MenuButton({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-stone-50 ${active ? "font-semibold text-brand-600" : ""}`}
    >
      {children}
    </button>
  );
}
