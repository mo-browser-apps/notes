/**
 * LOCAL EXTENSION — not in the shadcn registry. `npx shadcn@latest add` will never create or
 * overwrite this file; it is maintained here alongside the vendored components.
 *
 * Date filters and date fields, composed from `Calendar` + `Popover`:
 * - `DateRangePicker` — a toolbar filter chip: presets on the left, a two-month range calendar
 *   on the right (one month, presets on top, on narrow windows). The range applies on "Apply",
 *   so picking dates doesn't refilter a table on every click.
 * - `DatePicker` — a single date in a form.
 *
 * Values are ISO strings (`{ from, to }` covering whole days), so they serialize into the URL.
 *
 * ```tsx
 * <DateRangePicker value={range} onValueChange={setRange} label="Date" />
 * <DatePicker id="expires" value={expiresAt} onValueChange={setExpiresAt} />
 * ```
 */
import * as React from "react"
import { endOfDay, format, startOfDay, subDays } from "date-fns"
import type { DateRange } from "react-day-picker"
import { CalendarIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"

type DateRangeValue = { from: string; to: string } | null

type DateRangePreset = { label: string; range: () => { from: Date; to: Date } }

const DEFAULT_PRESETS: DateRangePreset[] = [
  { label: "Today", range: () => ({ from: new Date(), to: new Date() }) },
  { label: "Yesterday", range: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
  { label: "Last 7 days", range: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: "Last 30 days", range: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { label: "Last 90 days", range: () => ({ from: subDays(new Date(), 89), to: new Date() }) },
  { label: "Last 12 months", range: () => ({ from: subDays(new Date(), 364), to: new Date() }) },
]

function toValue(from: Date, to: Date): DateRangeValue {
  return { from: startOfDay(from).toISOString(), to: endOfDay(to).toISOString() }
}

const sameDay = (a: Date, b: Date) => format(a, "yyyy-MM-dd") === format(b, "yyyy-MM-dd")

/** "Last 30 days" when the range matches a preset, else "Sep 1 – Sep 24, 2026". */
function describeDateRange(
  value: DateRangeValue,
  presets: DateRangePreset[] = DEFAULT_PRESETS
): string {
  if (!value) return "Any time"
  const from = new Date(value.from)
  const to = new Date(value.to)
  for (const preset of presets) {
    const r = preset.range()
    if (sameDay(r.from, from) && sameDay(r.to, to)) return preset.label
  }
  if (sameDay(from, to)) return format(from, "MMM d, yyyy")
  if (from.getFullYear() === to.getFullYear()) {
    return `${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`
  }
  return `${format(from, "MMM d, yyyy")} – ${format(to, "MMM d, yyyy")}`
}

function DateRangePicker({
  value,
  onValueChange,
  label = "Date",
  presets = DEFAULT_PRESETS,
  clearable = true,
  disableFuture = true,
  align = "start",
  className,
}: {
  value: DateRangeValue
  onValueChange: (value: DateRangeValue) => void
  label?: string
  presets?: DateRangePreset[]
  clearable?: boolean
  disableFuture?: boolean
  align?: "start" | "end"
  className?: string
}) {
  const isMobile = useIsMobile()
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<DateRange | undefined>(undefined)

  React.useEffect(() => {
    if (open) setDraft(value ? { from: new Date(value.from), to: new Date(value.to) } : undefined)
  }, [open, value])

  function apply() {
    if (draft?.from) onValueChange(toValue(draft.from, draft.to ?? draft.from))
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            data-slot="date-range-picker"
            variant="outline"
            size="sm"
            className={cn(!value && "border-dashed", className)}
          />
        }
      >
        <CalendarIcon data-icon="inline-start" />
        {value ? (
          <>
            <span className="hidden sm:inline">{label}:</span> {describeDateRange(value, presets)}
          </>
        ) : (
          label
        )}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-auto max-w-[calc(100vw-2rem)] overflow-hidden p-0"
      >
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-row flex-wrap gap-1 p-2 sm:w-36 sm:flex-col">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                size="sm"
                className="justify-start font-normal"
                onClick={() => {
                  const r = preset.range()
                  onValueChange(toValue(r.from, r.to))
                  setOpen(false)
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Separator
            orientation={isMobile ? "horizontal" : "vertical"}
            className="sm:h-auto"
          />
          <div className="flex flex-col">
            <Calendar
              mode="range"
              numberOfMonths={isMobile ? 1 : 2}
              selected={draft}
              onSelect={setDraft}
              defaultMonth={draft?.from ?? subDays(new Date(), 30)}
              disabled={disableFuture ? { after: new Date() } : undefined}
            />
            <Separator />
            <div className="flex items-center justify-between gap-2 p-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                {draft?.from
                  ? `${format(draft.from, "MMM d, yyyy")}${draft.to ? ` – ${format(draft.to, "MMM d, yyyy")}` : ""}`
                  : "Pick a start date"}
              </span>
              <div className="flex gap-2">
                {clearable && value && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onValueChange(null)
                      setOpen(false)
                    }}
                  >
                    <XIcon data-icon="inline-start" />
                    Clear
                  </Button>
                )}
                <Button size="sm" disabled={!draft?.from} onClick={apply}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** A single date for forms. Keeps the time of day when changing an existing value. */
function DatePicker({
  id,
  value,
  onValueChange,
  placeholder = "Pick a date",
  disabledBefore,
  disabledAfter,
  invalid,
  disabled,
  className,
}: {
  id?: string
  /** ISO string or null. */
  value: string | null
  onValueChange: (value: string | null) => void
  placeholder?: string
  disabledBefore?: Date
  disabledAfter?: Date
  invalid?: boolean
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const date = value ? new Date(value) : undefined
  const disabledDays =
    disabledBefore && disabledAfter
      ? [{ before: disabledBefore }, { after: disabledAfter }]
      : disabledBefore
        ? { before: disabledBefore }
        : disabledAfter
          ? { after: disabledAfter }
          : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            id={id}
            data-slot="date-picker"
            variant="outline"
            aria-invalid={invalid || undefined}
            className={cn(
              "w-full justify-start font-normal",
              !date && "text-muted-foreground",
              className
            )}
          />
        }
      >
        <CalendarIcon data-icon="inline-start" />
        {date ? format(date, "MMM d, yyyy") : placeholder}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto overflow-hidden p-0">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          onSelect={(day) => {
            if (day) {
              const next = new Date(day)
              if (date) next.setHours(date.getHours(), date.getMinutes(), 0, 0)
              else next.setHours(9, 0, 0, 0)
              onValueChange(next.toISOString())
            } else {
              onValueChange(null)
            }
            setOpen(false)
          }}
          disabled={disabledDays}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DEFAULT_PRESETS as DATE_RANGE_PRESETS, DatePicker, DateRangePicker, describeDateRange }
export type { DateRangePreset, DateRangeValue }
