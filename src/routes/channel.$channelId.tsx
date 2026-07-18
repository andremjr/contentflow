import { createFileRoute, Link, notFound, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { channels } from "@/lib/mock-data";

export const Route = createFileRoute("/channel/$channelId")({
  loader: ({ params }) => {
    const channel = channels.find((c) => c.id === params.channelId);
    if (!channel) throw notFound();
    return { channel };
  },
  notFoundComponent: () => (
    <AppShell>
      <div className="flex flex-1 items-center justify-center p-10">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Canal não encontrado</h2>
          <Button asChild className="mt-4">
            <Link to="/dashboard">Ir para a visão geral</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  ),
  component: ChannelLayout,
});

function ChannelLayout() {
  return <Outlet />;
}