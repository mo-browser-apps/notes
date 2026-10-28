// Eval fixture (evals.json #15). Three buttons that look identical; two fail in ways that never
// reach `agent console`: an exception thrown outside React's render, and an unhandled rejection.
// Don't "fix" this file — the eval checks whether the agent's verification notices.
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

async function exportCsv(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 150))
  throw new Error("Export service returned 500")
}

export function ReportsPanel() {
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Reports</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => toast.success("Report refreshed")}>
          Refresh
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setTimeout(() => {
              const rows = undefined as unknown as string[]
              toast(`Scheduled ${rows.length} reports`)
            }, 0)
          }}
        >
          Schedule
        </Button>
        <Button variant="outline" onClick={() => void exportCsv()}>
          Export CSV
        </Button>
      </CardContent>
    </Card>
  )
}
