import { Card, CardContent, StatusPill } from "@rentbrown/ui";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-start gap-4">
          <StatusPill tone="info">Admin</StatusPill>
          <h1 className="text-2xl font-extrabold text-foreground">
            RentBrown admin — scaffold
          </h1>
          <p className="text-sm text-muted-foreground">
            Operations boundary. Design tokens wired up.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
