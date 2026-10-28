import * as React from "react"
import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"

/** The source line of the task item being rendered, for its checkbox. */
const TaskLineContext = React.createContext<number | null>(null)

function TaskCheckbox({ checked, onToggle }: { checked: boolean; onToggle: (line: number) => void }) {
  const line = React.useContext(TaskLineContext)
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={line === null}
      aria-label={checked ? "Completed task" : "Task"}
      className="mt-[0.3em] size-4 shrink-0 cursor-pointer accent-primary"
      onChange={() => line !== null && onToggle(line)}
    />
  )
}

/**
 * Rendered Markdown. Raw HTML in a note is shown as text, never executed (react-markdown
 * doesn't render HTML without rehype-raw), and unsafe URL schemes are stripped by its default
 * `urlTransform`. Links open in the system browser: the main process turns the
 * `target="_blank"` popup into `workspace.openUrl`.
 */
export function MarkdownPreview({
  markdown,
  onToggleTask,
}: {
  markdown: string
  /** Called with the 1-based source line of a task whose checkbox was clicked. */
  onToggleTask: (line: number) => void
}) {
  const onToggleTaskRef = React.useRef(onToggleTask)
  onToggleTaskRef.current = onToggleTask

  const components = React.useMemo<Components>(
    () => ({
      h1: ({ node: _node, ...props }) => <h3 className="mt-6 mb-3 text-[1.6em] leading-tight font-bold first:mt-0" {...props} />,
      h2: ({ node: _node, ...props }) => <h4 className="mt-6 mb-2 text-[1.3em] leading-snug font-bold first:mt-0" {...props} />,
      h3: ({ node: _node, ...props }) => <h5 className="mt-5 mb-2 text-[1.12em] font-semibold first:mt-0" {...props} />,
      h4: ({ node: _node, ...props }) => <h6 className="mt-4 mb-1 font-semibold first:mt-0" {...props} />,
      h5: ({ node: _node, ...props }) => <h6 className="mt-4 mb-1 font-semibold first:mt-0" {...props} />,
      h6: ({ node: _node, ...props }) => <h6 className="mt-4 mb-1 font-semibold text-muted-foreground first:mt-0" {...props} />,
      p: ({ node: _node, ...props }) => <p className="my-3 first:mt-0 last:mb-0" {...props} />,
      a: ({ node: _node, href, ...props }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={href}
          className="text-primary underline underline-offset-2 hover:no-underline"
          {...props}
        />
      ),
      ul: ({ node: _node, className, ...props }) => (
        <ul
          className={cn(
            "my-3 pl-6",
            className?.includes("contains-task-list") ? "list-none pl-1" : "list-disc",
            "[&_ul]:my-1 [&_ol]:my-1"
          )}
          {...props}
        />
      ),
      ol: ({ node: _node, ...props }) => <ol className="my-3 list-decimal pl-6 [&_ol]:my-1 [&_ul]:my-1" {...props} />,
      li: ({ node, className, ...props }) =>
        className?.includes("task-list-item") ? (
          <TaskLineContext.Provider value={node?.position?.start.line ?? null}>
            <li className="my-1 flex items-start gap-2 [&>p]:my-0" {...props} />
          </TaskLineContext.Provider>
        ) : (
          <li className="my-1 pl-1" {...props} />
        ),
      input: ({ node: _node, type, checked }) =>
        type === "checkbox" ? <TaskCheckbox checked={!!checked} onToggle={(line) => onToggleTaskRef.current(line)} /> : null,
      blockquote: ({ node: _node, ...props }) => (
        <blockquote className="my-3 border-l-3 border-border pl-4 text-muted-foreground italic" {...props} />
      ),
      code: ({ node: _node, className, ...props }) => (
        <code
          className={cn(
            "font-mono text-[0.9em]",
            // Inline code gets a chip; code inside <pre> is styled by the block.
            !className?.startsWith("language-") && "rounded-sm bg-muted px-1 py-0.5 [pre_&]:bg-transparent [pre_&]:p-0",
            className
          )}
          {...props}
        />
      ),
      pre: ({ node: _node, ...props }) => (
        <pre className="my-3 overflow-x-auto rounded-md bg-muted px-4 py-3 text-[0.9em] leading-relaxed" {...props} />
      ),
      hr: ({ node: _node, ...props }) => <hr className="my-6 border-border" {...props} />,
      table: ({ node: _node, ...props }) => (
        <div className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm" {...props} />
        </div>
      ),
      th: ({ node: _node, ...props }) => <th className="border border-border bg-muted px-3 py-1.5 text-left font-semibold" {...props} />,
      td: ({ node: _node, ...props }) => <td className="border border-border px-3 py-1.5" {...props} />,
      img: ({ node: _node, alt, ...props }) => <img alt={alt ?? ""} className="my-3 max-w-full rounded-md" {...props} />,
    }),
    []
  )

  return (
    <div data-slot="markdown-preview" className="text-[15px] leading-[1.65] break-words">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </Markdown>
    </div>
  )
}
