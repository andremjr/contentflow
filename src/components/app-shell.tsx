import { type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AppSidebar } from "./app-sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col bg-background">{children}</div>
      </div>
      <Toaster />
    </>
  );
}
