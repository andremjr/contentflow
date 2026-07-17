import { useEffect } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  FolderKanban,
  Radio,
  Library,
  Plus,
  Workflow,
  Settings,
  Search,
} from "lucide-react";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Digite um comando ou pesquise…" />
      <CommandList>
        <CommandEmpty>Nenhum resultado.</CommandEmpty>
        <CommandGroup heading="Navegação">
          <CommandItem>
            <LayoutDashboard /> Visão geral
          </CommandItem>
          <CommandItem>
            <FolderKanban /> Projetos
          </CommandItem>
          <CommandItem>
            <Radio /> Canais
          </CommandItem>
          <CommandItem>
            <Library /> Biblioteca
          </CommandItem>
          <CommandItem>
            <Workflow /> Processos
          </CommandItem>
          <CommandItem>
            <Settings /> Configurações
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Ações">
          <CommandItem>
            <Plus /> Novo projeto
          </CommandItem>
          <CommandItem>
            <Plus /> Novo canal
          </CommandItem>
          <CommandItem>
            <Search /> Buscar em assets
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
