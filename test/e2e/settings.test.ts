import * as fs from "node:fs"
import * as path from "node:path"
import { expect, test } from "@mobrowser/cli/e2e"

const conf = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../mobrowser.conf.json"), "utf8"))
const { major, minor, patch } = conf.app.version

// The Settings window loads this renderer at `#/settings/<section>` (src/main/settings.ts). The
// fixture can't open a second window, so these tests show the same screen in the first one.

test("a theme picked in Settings applies at once and is kept after a reload", async ({ page }) => {
  await page.evaluate(() => {
    location.hash = "#/settings/general"
  })
  await expect(page.getByRole("heading", { level: 1, name: "General" })).toBeVisible()
  await expect(page.getByRole("radio", { name: "System" })).toBeChecked()

  // The cards are labels around visually hidden radios: clicking the card's caption selects it.
  await page.getByText("Dark", { exact: true }).click()
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked()
  await expect(page.locator("html")).toHaveClass(/\bdark\b/)

  await page.reload()
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked()
  await expect(page.locator("html")).toHaveClass(/\bdark\b/)

  // The keyboard moves the choice too, and Light really drops the dark tokens.
  await page.getByRole("radio", { name: "Dark" }).focus()
  await page.keyboard.press("ArrowLeft")
  await expect(page.getByRole("radio", { name: "Light" })).toBeChecked()
  await expect(page.locator("html")).toHaveClass(/\blight\b/)
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/)
})

test("the Settings sidebar switches sections and About shows the app's version", async ({ page }) => {
  await page.evaluate(() => {
    location.hash = "#/settings/general"
  })
  await page.getByRole("link", { name: "Import & Export" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Import & Export" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Import…" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Export…" })).toBeVisible()

  await page.getByRole("link", { name: "About" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "About" })).toBeVisible()
  // Name and version come from mobrowser.conf.json, not from the page.
  await expect(page.getByRole("heading", { level: 2, name: conf.app.name })).toBeVisible()
  await expect(page.getByText(`Version ${major}.${minor}.${patch}`)).toBeVisible()
  // The app icon (decorative: the name is right below it) actually loads.
  const icon = page.locator("main img")
  await expect(icon).toHaveJSProperty("complete", true)
  expect(await icon.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
})
