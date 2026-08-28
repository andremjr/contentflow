import { Download, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ECOSYSTEM_DOWNLOADS } from "@/lib/ecosystem-downloads";
import { cn } from "@/lib/utils";

const METHOD_AGENT_URL =
  "https://chatgpt.com/g/g-6a74d7da8edc8191950f36481a113904-contentflow-tradutor-de-metodos";

export function MethodAgentCta({ className }: { className?: string }) {
  return (
    <section className={cn("rounded-xl border border-brand/25 bg-card/55 p-4", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <h2 className="text-sm font-semibold">Recursos para criar Métodos</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Use o agente guiado ou baixe a skill atualizada para trabalhar com seu agente de IA.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[34rem]">
          <Button asChild variant="outline" className="h-auto justify-start gap-3 px-3 py-2.5">
            <a
              href={METHOD_AGENT_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir o agente de criação de Métodos em uma nova aba"
            >
              <Sparkles className="size-4 shrink-0 text-brand-soft" />
              <span className="min-w-0 text-left">
                <span className="block text-xs font-semibold">Abrir agente de Métodos</span>
                <span className="block text-[10px] font-normal text-muted-foreground">
                  Criação guiada no ChatGPT
                </span>
              </span>
              <ExternalLink className="ml-auto size-3.5 shrink-0" />
            </a>
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
  );
}
