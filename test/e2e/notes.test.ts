import * as fs from "node:fs"
import * as path from "node:path"
import type { Page } from "@playwright/test"
import { expect, test } from "@mobrowser/cli/e2e"

// Each test starts with a fresh profile, so the first-launch sample workspace is present:
// folders Notes, Ideas, Personal, Projects, Work and ten sample notes.

const noteRow = (page: Page, title: string) =>
  page.getByRole("region", { name: "Notes" }).getByRole("button", { name: new RegExp(`^${title}\\b`) })
const titleField = (page: Page) => page.getByRole("textbox", { name: "Note title" })
const bodyField = (page: Page) => page.getByRole("textbox", { name: "Note body" })
// Folder buttons are named by the folder alone; note rows include their date and preview.
const folderButton = (page: Page, name: string) => page.getByRole("button", { name, exact: true })

async function newNote(page: Page, title: string, body: string) {
  await page.getByRole("button", { name: "New Note" }).first().click()
  await expect(titleField(page)).toBeFocused()
  await page.keyboard.type(title)
  await page.keyboard.press("Enter")
  await page.keyboard.type(body)
}

test("autosaves a new note and restores it after a reload", async ({ page }) => {
  await newNote(page, "Groceries for the weekend", "eggs and flour")
  await expect(noteRow(page, "Groceries for the weekend")).toBeVisible()

  // Edits are saved without any explicit save action.
  await expect(async () => {
    await page.reload()
    await noteRow(page, "Groceries for the weekend").click({ timeout: 2000 })
    await expect(titleField(page)).toHaveValue("Groceries for the weekend", { timeout: 1000 })
    await expect(bodyField(page)).toHaveText("eggs and flour", { timeout: 1000 })
  }).toPass({ timeout: 10_000 })

  // A brand-new note left untouched is discarded instead of piling up empty notes.
  await page.getByRole("button", { name: "New Note" }).first().click()
  await page.getByRole("button", { name: "New Note" }).first().click()
  await expect(page.getByRole("button", { name: /^New Note \d/ })).toHaveCount(1)
  await noteRow(page, "Groceries for the weekend").click()
  await expect(page.getByRole("button", { name: /^New Note \d/ })).toHaveCount(0)
})

test("searches titles and Markdown bodies, and Escape restores the list", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "Search notes" })
  // Wait until the notes have loaded, as a user would, before using the shortcut.
  await expect(noteRow(page, "Meeting Notes")).toBeVisible()
  await page.keyboard.press("ControlOrMeta+f")
  await expect(search).toBeFocused()

  // "roadmap" only appears in a body; matching is case-insensitive.
  await search.fill("ROADMAP")
  await expect(noteRow(page, "Meeting Notes")).toBeVisible()
  await expect(page.getByRole("region", { name: "Notes" }).getByRole("heading", { name: "All Notes" })).toBeVisible()
  await expect(page.getByText("1 result")).toBeVisible()
  // The selection follows the results.
  await expect(titleField(page)).toHaveValue("Meeting Notes")

  // Matches text that is bold in the Markdown source ("**Folio**"), and partial words.
  await search.fill("leaning towards fol")
  await expect(noteRow(page, "App name brainstorm")).toBeVisible()
  await expect(page.getByText("1 result")).toBeVisible()

  await search.fill("zzqq")
  await expect(page.getByText("No Results")).toBeVisible()

  await search.press("Escape")
  await expect(search).toHaveValue("")
  await expect(page.getByText("10 notes")).toBeVisible()
})

test("sorts by title without date headings and by date with them", async ({ page }) => {
  const list = page.getByRole("region", { name: "Notes" })
  await expect(list.getByRole("heading", { name: "Today" })).toBeVisible()

  await page.getByRole("button", { name: /^Sort notes/ }).click()
  await page.getByRole("menuitemradio", { name: "Title — A to Z" }).click()
  await expect(list.getByRole("heading", { name: "Today" })).toHaveCount(0)
  const rows = list.locator("[data-note-id]")
  await expect(rows.first()).toHaveAccessibleName(/^App name brainstorm/)
  await expect(rows.last()).toHaveAccessibleName(/^Wi-Fi at the cabin/)

  // The choice is a saved preference.
  await page.reload()
  await expect(rows.first()).toHaveAccessibleName(/^App name brainstorm/)
})

test("deleting a folder can keep its notes, and Undo restores the folder", async ({ page }) => {
  await folderButton(page, "Work").click()
  await page.getByRole("button", { name: "Actions for Work" }).click()
  await page.getByRole("menuitem", { name: "Delete Folder…" }).click()

  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toContainText("It contains 2 notes")
  await expect(dialog.getByRole("radio", { name: /Move notes to “Notes”/ })).toBeChecked()
  await dialog.getByRole("button", { name: "Delete Folder" }).click()

  await expect(folderButton(page, "Work")).toHaveCount(0)
  await folderButton(page, "Notes").click()
  await expect(noteRow(page, "Meeting Notes")).toBeVisible()
  await expect(noteRow(page, "Quarterly Goals")).toBeVisible()

  await page.getByRole("button", { name: "Undo" }).click()
  await expect(folderButton(page, "Work")).toBeVisible()
  await expect(page.getByRole("region", { name: "Notes" }).getByRole("heading", { name: "Work" })).toBeVisible()
  await expect(noteRow(page, "Meeting Notes")).toBeVisible()

  // Deleting the notes too removes them for good — including after a reload.
  await page.getByRole("button", { name: "Actions for Work" }).click()
  await page.getByRole("menuitem", { name: "Delete Folder…" }).click()
  await dialog.getByRole("radio", { name: /Delete the notes too/ }).click()
  await dialog.getByRole("button", { name: "Delete Folder and Notes" }).click()
  await expect(folderButton(page, "Work")).toHaveCount(0)
  await expect(async () => {
    await page.reload()
    await expect(folderButton(page, "All Notes")).toBeVisible({ timeout: 2000 })
    await expect(page.getByText("8 notes")).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })
})

test("deletes a note after confirming, selects the next one, and Undo brings it back", async ({ page }) => {
  await noteRow(page, "Shopping List").click()
  await page.getByRole("button", { name: "Delete Note" }).click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toContainText("Delete “Shopping List”?")
  await dialog.getByRole("button", { name: "Delete Note" }).click()

  await expect(noteRow(page, "Shopping List")).toHaveCount(0)
  await expect(titleField(page)).toHaveValue("Debounce Snippet")
  await expect(page.getByText("9 notes")).toBeVisible()

  await page.getByRole("button", { name: "Undo" }).click()
  await expect(noteRow(page, "Shopping List")).toBeVisible()
  await expect(titleField(page)).toHaveValue("Shopping List")
})

test("formats Markdown from the toolbar and shortcuts, and the preview renders it", async ({ page }) => {
  await newNote(page, "Formatting", "")
  const body = bodyField(page)

  await page.keyboard.type("bold")
  await page.keyboard.press("Shift+Home")
  await page.keyboard.press("ControlOrMeta+b")
  await expect(body).toHaveText("**bold**")
  // ⌘B formats text; it doesn't toggle the sidebar while typing.
  await expect(folderButton(page, "All Notes")).toBeVisible()

  await page.keyboard.press("End")
  await page.keyboard.press("Enter")
  await page.keyboard.type("buy milk")
  await page.getByRole("button", { name: "Checklist" }).click()
  await page.keyboard.press("End")
  await page.keyboard.press("Enter")
  await page.keyboard.type("Section")
  await page.getByRole("button", { name: "Text style" }).click()
  await page.getByRole("menuitem", { name: /^Heading/ }).click()
  await expect(body).toContainText("- [ ] buy milk")
  await expect(body).toContainText("## Section")

  await page.getByRole("button", { name: "Preview", exact: true }).click()
  const article = page.getByRole("region", { name: "Editor" })
  await expect(article.locator("strong")).toHaveText("bold")
  await expect(article.getByRole("heading", { name: "Section" })).toBeVisible()

  // Checking a task in the preview edits the Markdown source.
  await article.getByRole("checkbox", { name: "Task" }).check()
  await page.getByRole("button", { name: "Edit Markdown" }).click()
  await expect(bodyField(page)).toContainText("- [x] buy milk")
})

test("exports a note as Markdown and imports it back", async ({ page, app }) => {
  const exported = test.info().outputPath("Reading List.md")

  await noteRow(page, "Reading List").click()
  await app.answerDialog({ paths: [exported] })
  await page.getByRole("button", { name: "Note actions" }).click()
  await page.getByRole("menuitem", { name: "Export as Markdown…" }).click()
  await expect(page.getByText("Exported “Reading List”")).toBeVisible()

  const text = fs.readFileSync(exported, "utf8")
  expect(text.startsWith("# Reading List\n\n")).toBe(true)
  expect(text).toContain("[CommonMark spec](https://spec.commonmark.org/)")

  const copy = path.join(path.dirname(exported), "Imported Reading.md")
  fs.writeFileSync(copy, text.replace("# Reading List", "# Imported Reading"))
  await folderButton(page, "Personal").click()
  await app.answerDialog({ paths: [copy] })
  await page.getByRole("button", { name: "More options" }).click()
  await page.getByRole("menuitem", { name: "Import Markdown…" }).click()

  await expect(noteRow(page, "Imported Reading")).toBeVisible()
  await expect(titleField(page)).toHaveValue("Imported Reading")
  // The heading that repeats the file name became the title, not a duplicate first line.
  await expect(bodyField(page)).not.toContainText("# Imported Reading")
  await expect(bodyField(page)).toContainText("[CommonMark spec](https://spec.commonmark.org/)")
})

test("never brings the sample notes back once every note is deleted", async ({ page }) => {
  for (const folder of ["Ideas", "Personal", "Projects", "Work"]) {
    await page.getByRole("button", { name: `Actions for ${folder}` }).click()
    await page.getByRole("menuitem", { name: "Delete Folder…" }).click()
    await page.getByRole("alertdialog").getByRole("radio", { name: /Delete the notes too/ }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete Folder and Notes" }).click()
    await expect(folderButton(page, folder)).toHaveCount(0)
  }
  for (const title of ["Welcome to Notes", "Wi-Fi at the cabin"]) {
    await noteRow(page, title).click()
    await page.keyboard.press("ControlOrMeta+Backspace")
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete Note" }).click()
    await expect(noteRow(page, title)).toHaveCount(0)
  }
  await expect(page.getByText("No notes yet", { exact: true })).toBeVisible()

  await expect(async () => {
    await page.reload()
    await expect(folderButton(page, "All Notes")).toBeVisible({ timeout: 2000 })
    await expect(page.getByText("No notes yet", { exact: true })).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })
  await expect(page.getByRole("button", { name: "Create Note" })).toBeVisible()
})

// On macOS the window is moved by `-webkit-app-region: drag` areas, and the OS gives those areas
// the mouse before the page does — even where a dialog is drawn on top. Playwright's clicks bypass
// that, so the regression (a delete dialog over the empty editor that could not be confirmed) is
// caught by checking the regions themselves.
test("dialog buttons never sit on a window drag region", async ({ page }) => {
  test.skip(process.platform !== "darwin", "drag regions exist only on macOS (hidden titlebar)")

  // An empty folder leaves no note selected, so the editor shows its empty state.
  await page.getByRole("button", { name: "New Folder", exact: true }).first().click()
  await page.keyboard.press("Enter")
  await expect(page.getByText("No Note Selected")).toBeVisible()
  await page.getByRole("button", { name: /^Actions for New Folder/ }).click()
  await page.getByRole("menuitem", { name: "Delete Folder…" }).click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog.getByRole("button", { name: "Delete Folder" })).toBeVisible()

  const swallowed = await page.evaluate(() => {
    const region = (el: Element) => getComputedStyle(el).getPropertyValue("-webkit-app-region")
    return [...document.querySelectorAll('[role="alertdialog"] button')].flatMap((button) => {
      const r = button.getBoundingClientRect()
      const underneath = [...document.querySelectorAll("*")].some((el) => {
        if (region(el) !== "drag" || el.contains(button)) return false
        const b = el.getBoundingClientRect()
        return b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top
      })
      return underneath && region(button) !== "no-drag" ? [button.textContent] : []
    })
  })
  expect(swallowed).toEqual([])

  await dialog.getByRole("button", { name: "Delete Folder" }).click()
  await expect(page.getByRole("button", { name: /^Actions for New Folder/ })).toHaveCount(0)
})
