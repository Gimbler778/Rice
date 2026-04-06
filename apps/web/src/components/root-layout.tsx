import { Outlet } from "react-router-dom";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";

export function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border/70 bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/70">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
              IQ
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-wide">
                IQM Rice
              </div>
              <div className="text-xs text-muted-foreground">
                Atlassian auth workspace
              </div>
            </div>
          </div>
          <ThemeSwitcher />
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
