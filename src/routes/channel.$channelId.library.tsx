import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, FolderOpen, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createLibraryItem, removeLibraryItem, useChannel, useLibraryItems } from "@/lib/store";

export const Route = createFileRoute("/channel/$channelId/library")({
  component: ChannelLibraryPage,
});

function ChannelLibraryPage() {
  const { channelId } = Route.useParams();
  const channel = useChannel(channelId);
  const items = useLibraryItems(channelId);
  const collections = useMemo(() => {
    const grouped = new Map<string, typeof items>();
    for (const item of items)
      grouped.set(item.collection, [...(grouped.get(item.collection) ?? []), item]);
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);
  if (!channel) return null;
  return (
    <AppShell>
      <TopBar
        showNewProject={false}
        breadcrumbs={[{ label: "Canais" }, { label: channel.name }, { label: "Biblioteca" }]}
        title="Biblioteca estratégica"
        subtitle="Elementos pré-existentes que podem ser escolhidos dentro dos métodos"
        actions={<NewLibraryItem channelId={channelId} />}
      />
      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
        {collections.length ? (
          <div className="space-y-6">
            {collections.map(([collection, collectionItems]) => (
              <section key={collection}>
                <div className="mb-3 flex items-center gap-2">
                  <FolderOpen className="size-4 text-brand-soft" />
                  <h2 className="text-sm font-semibold">{collection}</h2>
                  <span className="text-xs text-muted-foreground">{collectionItems.length}</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {collectionItems.map((item) => (
                    <article
                      key={item.id}
                      className="group rounded-xl border border-border/70 bg-card p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold">{item.name}</h3>
                          <p className="mt-2 whitespace-pre-wrap text-xs text-foreground">
                            {item.value}
                          </p>
                          {item.description && (
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              {item.description}
                            </p>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                          onClick={() => removeLibraryItem(item.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
            <div className="grid size-14 place-items-center rounded-2xl border border-border/60 bg-card">
              <BookOpen className="size-6 text-brand-soft" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Sua biblioteca está vazia</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastre estruturas de título, estilos, regras, personas e outros elementos
              reutilizáveis.
            </p>
            <div className="mt-5">
              <NewLibraryItem channelId={channelId} />
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}

function NewLibraryItem({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false);
  const [collection, setCollection] = useState("");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  function save() {
    if (!collection.trim() || !name.trim() || !value.trim()) return;
    createLibraryItem({
      channelId,
      collection: collection.trim(),
      name: name.trim(),
      value: value.trim(),
      description: description.trim() || undefined,
    });
    setName("");
    setValue("");
    setDescription("");
    setOpen(false);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 gradient-brand text-white">
          <Plus className="size-4" /> Adicionar item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo item estratégico</DialogTitle>
          <DialogDescription>
            Esse item poderá ser usado por blocos Escolher e como contexto de qualquer tarefa
            humana.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Coleção</Label>
            <Input
              value={collection}
              onChange={(event) => setCollection(event.target.value)}
              placeholder="Ex: Estruturas de título"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: Curiosidade aberta"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Conteúdo</Label>
            <Textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="A estrutura, regra, modelo ou informação reutilizável"
              rows={5}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição opcional</Label>
            <Input value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <Button
            className="w-full gradient-brand text-white"
            disabled={!collection.trim() || !name.trim() || !value.trim()}
            onClick={save}
          >
            Salvar na biblioteca
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
