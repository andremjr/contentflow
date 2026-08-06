import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { MethodBuilder } from "@/components/method-builder";
import { TopBar } from "@/components/top-bar";
import { PROCESS_ORDER, type UniversalProcess } from "@/lib/domain";
import { useChannel } from "@/lib/store";

export const Route = createFileRoute("/channel/$channelId/methods")({
  validateSearch: (search: Record<string, unknown>) => ({
    process: PROCESS_ORDER.includes(search.process as UniversalProcess)
      ? (search.process as UniversalProcess)
      : undefined,
  }),
  component: ChannelMethodsPage,
});

function ChannelMethodsPage() {
  const { channelId } = Route.useParams();
  const { process } = Route.useSearch();
  const channel = useChannel(channelId);
  if (!channel) return null;
  return (
    <AppShell>
      <TopBar
        title="Métodos de Criação"
        subtitle="Defina como cada processo funciona neste canal"
        breadcrumbs={[
          { label: "Canais", to: "/dashboard" },
          { label: channel.name, to: `/channel/${channel.id}` as never },
          { label: "Métodos de Criação" },
        ]}
      />
      <MethodBuilder channelId={channel.id} initialProcess={process} />
    </AppShell>
  );
}
