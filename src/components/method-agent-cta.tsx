import { ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const METHOD_AGENT_URL =
  "https://chatgpt.com/g/g-6a74d7da8edc8191950f36481a113904-contentflow-os-tradutor-de-metodos";

export function MethodAgentCta({ className }: { className?: string }) {
  return (
    <div className={cn("flex", className)}>
      <Button
        asChild
        variant="outline"
        className="h-auto min-h-9 w-full justify-center gap-2 whitespace-normal border-brand/30 bg-brand/10 px-4 py-2.5 text-left text-brand-soft hover:border-brand/45 hover:bg-brand/15 hover:text-foreground sm:w-auto"
      >
        <a
          href={METHOD_AGENT_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Use nosso agente para auxiliar na criação do seu método. Abrir em uma nova aba"
        >
          <Sparkles className="size-4" />
          <span>Use nosso agente para auxiliar na criação do seu método</span>
          <ExternalLink className="size-3.5 opacity-60" />
        </a>
      </Button>
    </div>
  );
}
