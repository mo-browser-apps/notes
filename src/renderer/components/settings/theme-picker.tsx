import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useAppTheme, type AppTheme } from "@/hooks/use-app-theme"
import { cn } from "@/lib/utils"

const THEMES: { value: AppTheme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

/**
 * Settings → General → Theme: three preview cards (System, Light, Dark) as one radio group. The
 * previews are screenshots in `public/` (`system.png`, `light.png`, `dark.png`).
 * Each card is a `Label` around a visually hidden `RadioGroupItem`, so a click anywhere on the
 * card selects it and the arrow keys move between cards.
 */
export function ThemePicker({ labelledBy }: { labelledBy: string }) {
  const { theme, setTheme } = useAppTheme()

  return (
    <RadioGroup
      value={theme}
      onValueChange={(value) => setTheme(value as AppTheme)}
      aria-labelledby={labelledBy}
      // Fixed-size thumbnails like the macOS appearance picker; `minmax(0, …)` lets them shrink
      // when the window is narrower than three of them.
      className="w-auto grid-cols-[repeat(3,minmax(0,6rem))] gap-3"
    >
      {THEMES.map((item) => (
        <Label key={item.value} className="group/theme flex-col gap-2 font-normal">
          {/* `absolute` too: RadioGroupItem's own `relative` beats `sr-only`'s position, which left
              the hidden 16px radio in the flow and pushed every card 22px below the "Theme" label. */}
          <RadioGroupItem value={item.value} aria-label={item.label} className="sr-only absolute" />
          <div
            className={cn(
              "relative aspect-[16/10] w-full overflow-hidden rounded-lg ring-1 ring-foreground/10",
              // Selected: an outline with a gap, like the macOS appearance picker.
              "outline-3 outline-offset-2 outline-transparent group-has-data-checked/theme:outline-primary",
              "group-has-focus-visible/theme:ring-3 group-has-focus-visible/theme:ring-ring/50"
            )}
          >
            <img src={`./${item.value}.png`} alt="" draggable={false} className="size-full object-cover" />
          </div>
          <span className="text-xs text-muted-foreground group-has-data-checked/theme:font-medium group-has-data-checked/theme:text-foreground">
            {item.label}
          </span>
        </Label>
      ))}
    </RadioGroup>
  )
}

