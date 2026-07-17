import { useState, type ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppSidebar } from "./app-sidebar";
import { CommandPalette } from "./command-palette";

export function AppShell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen w-full">
        <AppSidebar onOpenPalette={() => setPaletteOpen(true)} />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <Toaster />
    </TooltipProvider>
  );
}
