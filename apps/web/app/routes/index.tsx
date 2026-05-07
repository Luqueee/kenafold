import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@kenafold/ui"

export const Route = createFileRoute("/")({
  component: Home,
})

function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background text-foreground">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-primary">Kenafold</h1>
        <p className="max-w-md text-lg text-muted-foreground">
          A fast, native file manager for macOS.
        </p>
        <Button size="lg">Download for macOS</Button>
      </div>
    </main>
  )
}
