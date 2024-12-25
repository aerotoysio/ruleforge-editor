"use client";

import { useState, useMemo } from "react";
import { ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ShuttleItem = {
  /** Stable identifier for matching against the selected list. */
  value: string;
  /** Primary label shown in the row. */
  label: string;
  /** Optional secondary label (shown lighter, after the primary). */
  hint?: string;
};

type Props = {
  /** Heading shown at the top — e.g. "Select a cabin". */
  title?: string;
  /** Full set of available items. */
  items: ShuttleItem[];
  /** Currently-selected values (subset of items.value). */
  selected: string[];
  onChange: (next: string[]) => void;
  /** Optional subtitle line under the title. */
  description?: string;
};

/**
 * Two-column shuttle picker: items the user has selected on the left,
 * remaining options on the right, arrows between for moving them. Clicking
 * a row toggles its selection too.
 *
 * This is the universal "pick one or many from a set" pattern — used by
 * ref-select bindings (pick airports, cabins, pax types) and by literal
 * string-array bindings.
 */
export function ShuttlePicker({ title, description, items, selected, onChange }: Props) {
  const [filter, setFilter] = useState("");
  const [highlightSelected, setHighlightSelected] = useState<string[]>([]);
  const [highlightAvailable, setHighlightAvailable] = useState<string[]>([]);

  const f = filter.trim().toLowerCase();

  const selectedItems = useMemo(
    () => selected.map((v) => items.find((i) => i.value === v)).filter(Boolean) as ShuttleItem[],
    [selected, items],
  );

  const availableItems = useMemo(() => {
    const sel = new Set(selected);
    let pool = items.filter((i) => !sel.has(i.value));
    if (f) {
      pool = pool.filter((i) =>
        i.label.toLowerCase().includes(f) ||
        i.value.toLowerCase().includes(f) ||
        (i.hint?.toLowerCase().includes(f) ?? false),
      );
    }
    return pool;
  }, [items, selected, f]);

  function moveSelectedToAvailable(values: string[]) {
    onChange(selected.filter((v) => !values.includes(v)));
    setHighlightSelected([]);
  }

  function moveAvailableToSelected(values: string[]) {
    onChange([...selected, ...values]);
    setHighlightAvailable([]);
  }

  function toggleHighlight(list: string[], setList: (next: string[]) => void, value: string, ev: React.MouseEvent) {
    if (ev.metaKey || ev.ctrlKey) {
      // toggle one at a time
      setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
    } else if (ev.shiftKey && list.length > 0) {
      // simple shift-click range — for keyboard mavens; trivial impl uses the last
      setList([...list, value]);
    } else {
      setList([value]);
    }
  }

  const arrowDisabledRight = highlightAvailable.length === 0;
  const arrowDisabledLeft = highlightSelected.length === 0;

  return (
    <div className="flex flex-col gap-2">
      {title ? (
        <div className="flex flex-col gap-0.5 px-0.5">
          <div className="text-[12.5px] font-semibold tracking-tight text-foreground">{title}</div>
          {description ? (
            <div className="text-[11px] text-muted-foreground">{description}</div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-stretch">
        {/* Selected column */}
        <Column
          label="Selected"
          countLabel={selectedItems.length === 0 ? "nothing yet" : `${selectedItems.length}`}
          highlight={highlightSelected}
          items={selectedItems}
          empty="Drag items here, or use the arrows →"
          onRowClick={(v, ev) => toggleHighlight(highlightSelected, setHighlightSelected, v, ev)}
          onRowDoubleClick={(v) => moveSelectedToAvailable([v])}
        />

        {/* Arrow column */}
        <div className="flex flex-col items-center justify-center gap-1.5 px-1">
          <button
            type="button"
            onClick={() => moveAvailableToSelected(highlightAvailable)}
            disabled={arrowDisabledRight}
            className={cn(
              "w-9 h-9 inline-flex items-center justify-center rounded-md border transition-all",
              arrowDisabledRight
                ? "bg-muted/30 text-muted-foreground/40 border-border cursor-not-allowed"
                : "bg-card text-foreground border-border hover:border-foreground/50 hover:bg-muted/40",
            )}
            title="Add highlighted items to Selected"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => moveAvailableToSelected(availableItems.map((i) => i.value))}
            disabled={availableItems.length === 0}
            className={cn(
              "w-9 h-7 inline-flex items-center justify-center rounded-md border transition-all",
              availableItems.length === 0
                ? "bg-muted/30 text-muted-foreground/40 border-border cursor-not-allowed"
                : "bg-card text-foreground border-border hover:border-foreground/50 hover:bg-muted/40",
            )}
            title="Add all"
          >
            <ChevronsLeft className="w-3 h-3" />
          </button>
          <div className="my-1 h-px w-5 bg-border" />
          <button
            type="button"
            onClick={() => moveSelectedToAvailable(highlightSelected)}
            disabled={arrowDisabledLeft}
            className={cn(
              "w-9 h-9 inline-flex items-center justify-center rounded-md border transition-all",
              arrowDisabledLeft
                ? "bg-muted/30 text-muted-foreground/40 border-border cursor-not-allowed"
                : "bg-card text-foreground border-border hover:border-foreground/50 hover:bg-muted/40",
            )}
            title="Remove highlighted items from Selected"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => moveSelectedToAvailable(selectedItems.map((i) => i.value))}
            disabled={selectedItems.length === 0}
            className={cn(
              "w-9 h-7 inline-flex items-center justify-center rounded-md border transition-all",
              selectedItems.length === 0
                ? "bg-muted/30 text-muted-foreground/40 border-border cursor-not-allowed"
                : "bg-card text-foreground border-border hover:border-foreground/50 hover:bg-muted/40",
            )}
            title="Remove all"
          >
            <ChevronsRight className="w-3 h-3" />
          </button>
        </div>

        {/* Available column */}
        <div className="flex flex-col">
          <Column
            label="Available"
            countLabel={`${availableItems.length}`}
            highlight={highlightAvailable}
            items={availableItems}
            empty={f ? "No matches." : "Nothing left to add."}
            onRowClick={(v, ev) => toggleHighlight(highlightAvailable, setHighlightAvailable, v, ev)}
            onRowDoubleClick={(v) => moveAvailableToSelected([v])}
            search={
              <div className="relative mb-1">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search…"
                  className="w-full h-7 text-[11.5px] pl-7 pr-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}

function Column({
  label,
  countLabel,
  items,
  highlight,
  empty,
  onRowClick,
  onRowDoubleClick,
  search,
}: {
  label: string;
  countLabel: string;
  items: ShuttleItem[];
  highlight: string[];
  empty: string;
  onRowClick: (value: string, ev: React.MouseEvent) => void;
  onRowDoubleClick: (value: string) => void;
  search?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-md border bg-card overflow-hidden h-[260px]">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b bg-muted/30 shrink-0">
        <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-semibold">{label}</span>
        <span className="text-[10.5px] tabular-nums text-muted-foreground">{countLabel}</span>
      </div>
      {search ? <div className="p-1.5 border-b shrink-0">{search}</div> : null}
      <div className="flex-1 overflow-auto">
        {items.length === 0 ? (
          <div className="px-3 py-3 text-[11.5px] text-muted-foreground italic">{empty}</div>
        ) : (
          items.map((it) => {
            const isHighlighted = highlight.includes(it.value);
            return (
              <button
                key={it.value}
                type="button"
                onClick={(e) => onRowClick(it.value, e)}
                onDoubleClick={() => onRowDoubleClick(it.value)}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 flex items-center gap-2 text-[12px] transition-colors",
                  isHighlighted ? "bg-foreground text-background" : "hover:bg-muted/40 text-foreground",
                )}
                title={it.hint ?? it.label}
              >
                <span className="flex-1 truncate">
                  {it.label}
                  {it.hint && it.hint !== it.label ? (
                    <span className={cn("font-mono ml-1.5 text-[10.5px]", isHighlighted ? "opacity-80" : "text-muted-foreground")}>
                      ({it.hint})
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
