import { Footer } from "./footer";
import { Header } from "./header";
import { MobileTabBar } from "./mobile-tab-bar";
import { PrototypeToolbar } from "./prototype-toolbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="rb-container flex-1 py-6 pb-28 lg:py-10 lg:pb-12">{children}</main>
      <Footer />
      <MobileTabBar />
      <PrototypeToolbar />
    </div>
  );
}
