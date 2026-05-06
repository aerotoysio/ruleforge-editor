"use client";

import { Calendar, Clock, CalendarDays, CalendarRange, Sun } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import type { PortBinding } from "@/lib/types";

type DateBinding = Extract<PortBinding, { kind: "date" }>;

type Props = {
  value: DateBinding;
  onChange: (next: DateBinding) => void;
};

const MODES: { value: DateBinding["mode"]; label: string; description: string; icon: typeof Calendar }[] = [
  { value: "absolute",        label: "Specific date",   description: "Pick one exact date",                icon: Calendar     },
  { value: "relative-window", label: "Relative window", description: "Within next/last N days/weeks/…",    icon: CalendarRange },
  { value: "day-of-week",     label: "Day of week",     description: "Match certain weekdays (Mon–Sun)",   icon: CalendarDays },
  { value: "day-of-month",    label: "Day of month",    description: "Match certain calendar days (1–31)", icon: Calendar     },
  { value: "month-of-year",   label: "Month of year",   description: "Match certain months (Jan–Dec)",     icon: Calendar     },
  { value: "is-weekend",      label: "Weekend / weekday", description: "Saturday or Sunday — yes or no",   icon: Sun          },
];

const DAYS = [
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
  { v: 7, label: "Sun" },
];

const MONTHS = [
  { v: 1, label: "Jan" }, { v: 2, label: "Feb" }, { v: 3, label: "Mar" }, { v: 4, label: "Apr" },
  { v: 5, label: "May" }, { v: 6, label: "Jun" }, { v: 7, label: "Jul" }, { v: 8, label: "Aug" },
  { v: 9, label: "Sep" }, { v: 10, label: "Oct" }, { v: 11, label: "Nov" }, { v: 12, label: "Dec" },
];

export function DateBindingPicker({ value, onChange }: Props) {
  function setMode(mode: DateBinding["mode"]) {
    if (mode === "absolute") onChange({ kind: "date", mode, date: new Date().toISOString().slice(0, 10) });
    else if (mode === "relative-window") onChange({ kind: "date", mode, direction: "next", unit: "days", amount: 7 });
    else onChange({ kind: "date", mode, values: [] });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Mode picker */}
      <div className="grid grid-cols-2 gap-1.5">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = value.mode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={cn(
                "text-left flex items-start gap-2 px-2 py-1.5 rounded-md border transition-colors",
                active
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card border-border hover:border-foreground/30",
              )}
              title={m.description}
            >
              <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
              <div className="flex flex-col leading-tight">
                <span className="text-[12px] font-medium">{m.label}</span>
                <span className={cn("text-[10px] mt-0.5", active ? "opacity-80" : "text-muted-foreground")}>
                  {m.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Mode-specific controls */}
      <div className="rounded-md border bg-muted/30 px-3 py-2.5">
        {value.mode === "absolute" ? (
          <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">Date</span>
            <Input
              type="date"
              value={value.date ?? ""}
              onChange={(e) => onChange({ ...value, date: e.target.value })}
            />
          </div>
        ) : null}

        {value.mode === "relative-window" ? (
          <div className="flex items-center gap-2 flex-wrap text-[12px]">
            <span className="text-muted-foreground">Within the</span>
            <Select
              value={value.direction ?? "next"}
              onChange={(e) => onChange({ ...value, direction: e.target.value as DateBinding["direction"] })}
            >
              <option value="next">next</option>
              <option value="last">last</option>
              <option value="this">this</option>
            </Select>
            {value.direction !== "this" ? (
              <Input
                type="number"
                min={1}
                value={value.amount ?? 7}
                onChange={(e) => onChange({ ...value, amount: Math.max(1, Number(e.target.value) || 1) })}
                className="w-20"
              />
            ) : null}
            <Select
              value={value.unit ?? "days"}
              onChange={(e) => onChange({ ...value, unit: e.target.value as DateBinding["unit"] })}
            >
              <option value="days">day(s)</option>
              <option value="weeks">week(s)</option>
              <option value="months">month(s)</option>
              <option value="years">year(s)</option>
            </Select>
          </div>
        ) : null}

        {value.mode === "day-of-week" ? (
          <DayChipGrid items={DAYS} value={value.values ?? []} onChange={(values) => onChange({ ...value, values })} />
        ) : null}

        {value.mode === "month-of-year" ? (
          <DayChipGrid items={MONTHS} value={value.values ?? []} onChange={(values) => onChange({ ...value, values })} />
        ) : null}

        {value.mode === "day-of-month" ? (
          <div className="flex flex-col gap-2">
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">Pick days (1–31)</div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
                const active = value.values?.includes(d) ?? false;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      const cur = value.values ?? [];
                      onChange({ ...value, values: active ? cur.filter((x) => x !== d) : [...cur, d] });
                    }}
                    className={cn(
                      "h-7 text-[11px] font-mono rounded border transition-colors tabular-nums",
                      active
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background text-foreground border-border hover:border-foreground/30",
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {value.mode === "is-weekend" ? (
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">Match when</span>
            <Select
              value={value.values?.[0]?.toString() ?? "1"}
              onChange={(e) => onChange({ ...value, values: [Number(e.target.value)] })}
            >
              <option value="1">it&rsquo;s a weekend (Sat/Sun)</option>
              <option value="0">it&rsquo;s a weekday (Mon–Fri)</option>
            </Select>
          </div>
        ) : null}
      </div>

      {/* Plain-language summary */}
      <SummaryLine binding={value} />
    </div>
  );
}

function DayChipGrid({
  items,
  value,
  onChange,
}: {
  items: { v: number; label: string }[];
  value: number[];
  onChange: (next: number[]) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {items.map((it) => {
        const active = value.includes(it.v);
        return (
          <button
            key={it.v}
            type="button"
            onClick={() => onChange(active ? value.filter((x) => x !== it.v) : [...value, it.v])}
            className={cn(
              "h-7 text-[11px] font-medium rounded border transition-colors",
              active
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-foreground border-border hover:border-foreground/30",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function SummaryLine({ binding }: { binding: DateBinding }) {
  const text = (() => {
    if (binding.mode === "absolute") return binding.date ? `equals ${binding.date}` : "(pick a date)";
    if (binding.mode === "relative-window") {
      if (binding.direction === "this") return `within this ${binding.unit ?? "day"}`;
      return `within the ${binding.direction ?? "next"} ${binding.amount ?? 7} ${binding.unit ?? "days"}`;
    }
    if (binding.mode === "day-of-week") {
      const labels = (binding.values ?? []).map((v) => DAYS.find((d) => d.v === v)?.label).filter(Boolean);
      return labels.length ? `is ${labels.join(", ")}` : "(pick weekdays)";
    }
    if (binding.mode === "month-of-year") {
      const labels = (binding.values ?? []).map((v) => MONTHS.find((d) => d.v === v)?.label).filter(Boolean);
      return labels.length ? `month is ${labels.join(", ")}` : "(pick months)";
    }
    if (binding.mode === "day-of-month") {
      const list = binding.values ?? [];
      return list.length ? `day of month is ${list.sort((a, b) => a - b).join(", ")}` : "(pick days)";
    }
    if (binding.mode === "is-weekend") return binding.values?.[0] === 1 ? "is a weekend" : "is a weekday";
    return "";
  })();
  return (
    <div className="flex items-center gap-1.5 px-1 text-[11.5px] text-muted-foreground">
      <Clock className="w-3 h-3" />
      <span>This date</span>
      <span className="font-medium text-foreground">{text}</span>
    </div>
  );
}
