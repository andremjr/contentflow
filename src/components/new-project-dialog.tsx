import { useState } from "react";
import { Plus, FolderPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createProject } from "@/lib/store";
import type { Project } from "@/lib/domain";

export function NewProjectDialog({
  channelId,
  trigger,
  onCreate,
}: {
  channelId: string;
  trigger?: React.ReactNode;
  onCreate?: (project: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");

  const canSubmit = title.trim().length > 0;

  function reset() {
    setTitle("");
    setDeadline("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const project = createProject({ title, channelId, deadline });
    toast.success("Projeto criado", { description: project.title });
    onCreate?.(project);
    reset();
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            size="sm"
            className="h-9 gap-1.5 px-2.5 text-white sm:px-3"
            aria-label="Novo projeto"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">Novo projeto</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-secondary">
              <FolderPlus className="size-5 text-foreground" />
            </div>
            <div>
              <DialogTitle>Novo projeto</DialogTitle>
              <DialogDescription>O projeto inicia na etapa de Tema.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pr-title">Título *</Label>
            <Input
              id="pr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: A física impossível de Interstellar"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-deadline">Prazo (opcional)</Label>
            <Input
              id="pr-deadline"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              placeholder="Ex.: 15 dez"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="gap-1.5 gradient-brand text-white"
            >
              <Plus className="size-4" />
              Criar projeto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
