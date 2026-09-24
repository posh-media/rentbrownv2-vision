import { Button } from "@rentbrown/ui";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <p className="eyebrow text-muted-foreground">RentBrown</p>
      <h1 className="font-display text-4xl text-foreground">RentBrown site — scaffold</h1>
      <p className="text-sm text-muted-foreground">Marketing boundary. Design tokens wired up.</p>
      <Button variant="outline">Learn more</Button>
    </main>
  );
}
