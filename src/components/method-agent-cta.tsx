import { useState } from "react";
import { Check, Copy, Download, PlugZap, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ECOSYSTEM_DOWNLOADS } from "@/lib/ecosystem-downloads";
import { cn } from "@/lib/utils";

type McpInfo = { available: boolean; transport: string; scope: string; config: string };

export function MethodAgentCta({
  className,
  channelId,
}: {
  className?: string;
  channelId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mcpInfo, setMcpInfo] = useState<McpInfo>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);

  async function openMcpDialog() {
    setOpen(true);
    if (mcpInfo || loading) return;
    setLoading(true);
    setError(undefined);
    try {
      const query = channelId ? `?channelId=${encodeURIComponent(channelId)}` : "";
      const response = await fetch(`/api/builder/mcp-info${query}`);
      const payload = (await response.json()) as McpInfo & { error?: string };
      if (!response.ok)
        throw new Error(payload.error ?? "Não foi possível preparar a conexão MCP.");
      setMcpInfo(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível preparar a conexão MCP.");
    } finally {
      setLoading(false);
    }
  }

  async function copyConfig() {
    if (!mcpInfo) return;
    await navigator.clipboard.writeText(mcpInfo.config);
    setCopied(true);
    toast.success("Configuração MCP copiada");
    window.setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <>
      <section className={cn("rounded-xl border border-brand/25 bg-card/55 p-4", className)}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-xl">
            <h2 className="text-sm font-semibold">Recursos para criar Métodos</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Use um agente conectado ao ContentFlow, o agente guiado ou a skill atualizada.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[32rem]">
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 px-3 py-2.5"
              onClick={() => void openMcpDialog()}
            >
              <PlugZap className="size-4 shrink-0 text-brand-soft" />
              <span className="min-w-0 text-left">
                <span className="block text-xs font-semibold">Conectar agente via MCP</span>
                <span className="block text-[10px] font-normal text-muted-foreground">
                  Configuração direta no canal
                </span>
              </span>
            </Button>
            <Button asChild variant="outline" className="h-auto justify-start gap-3 px-3 py-2.5">
              <a href={ECOSYSTEM_DOWNLOADS.methodDevelopmentSkill} target="_blank" rel="noreferrer">
                <Sparkles className="size-4 shrink-0 text-brand-soft" />
                <span className="min-w-0 text-left">
                  <span className="block text-xs font-semibold">Baixar skill de Métodos</span>
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    Contrato e referências atualizados
                  </span>
                </span>
                <Download className="ml-auto size-3.5 shrink-0" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Conectar um agente ao ContentFlow</DialogTitle>
            <DialogDescription>
              Use esta configuração em qualquer agente compatível com MCP. O ContentFlow precisa
              permanecer aberto durante a criação e os testes dos Métodos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
              <li>Abra as configurações MCP do seu agente.</li>
              <li>Cole a configuração abaixo e inicie a conexão.</li>
              <li>Descreva como você produz e peça para o agente validar antes de aplicar.</li>
            </ol>
            <div className="rounded-lg border border-border bg-muted/35 p-3 text-xs text-muted-foreground">
              O agente pode ler este canal, os Métodos e as capacidades dos plugins instalados. Ele
              pode associar conexões locais existentes, mas não cria canais nem plugins e nunca
              recebe senhas, tokens ou outros segredos.
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Preparando configuração MCP...</p>
            ) : error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : mcpInfo ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium">Configuração do servidor MCP local</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => void copyConfig()}
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied ? "Copiado" : "Copiar configuração"}
                  </Button>
                </div>
                <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-background p-3 text-[11px] leading-relaxed">
                  <code>{mcpInfo.config}</code>
                </pre>
                <p className="text-xs text-muted-foreground">
                  Alguns agentes pedem os campos command e args separadamente; os mesmos valores
                  aparecem nesta configuração.
                </p>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
