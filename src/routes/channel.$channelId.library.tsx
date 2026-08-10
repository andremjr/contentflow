import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronDown,
  FolderOpen,
  Image as ImageIcon,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { CompositionCanvas, CompositionPreview } from "@/components/composition-canvas";
import { TopBar } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  StoredFile,
  StrategicCollection,
  StrategicCollectionField,
  ThumbnailLayout,
} from "@/lib/domain";
import {
  createLibraryCollection,
  createLibraryItem,
  removeLibraryCollection,
  removeLibraryItem,
  uploadLocalFile,
  useChannel,
  useLibraryCollections,
  useLibraryItems,
  updateLibraryCollection,
} from "@/lib/store";

type CollectionItemValue = string | number | StoredFile | ThumbnailLayout;

function isStoredFile(value: CollectionItemValue | undefined): value is StoredFile {
  return typeof value === "object" && value !== null && "url" in value;
}

function isThumbnailLayout(value: CollectionItemValue | undefined): value is ThumbnailLayout {
  return Boolean(
    value &&
    typeof value === "object" &&
    "aspectRatio" in value &&
    value.aspectRatio === "16:9" &&
    "boxes" in value &&
    Array.isArray(value.boxes),
  );
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/channel/$channelId/library")({
  component: ChannelLibraryPage,
});

function newField(index: number): StrategicCollectionField {
  return {
    id: crypto.randomUUID(),
    label: index === 0 ? "Nome" : "",
    type: index === 0 ? "text" : "textarea",
    required: index === 0,
  };
}

function ChannelLibraryPage() {
  const { channelId } = Route.useParams();
  const channel = useChannel(channelId);
  const collections = useLibraryCollections(channelId);
  const items = useLibraryItems(channelId);
  const totalItems = items.length;
  if (!channel) return null;

  return (
    <AppShell>
      <TopBar
        showNewProject={false}
        breadcrumbs={[{ label: "Canais" }, { label: channel.name }, { label: "Biblioteca" }]}
        title="Biblioteca estratégica"
        subtitle="Coleções estruturadas usadas pelos blocos Escolher"
        actions={<NewCollection channelId={channelId} />}
      />
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {collections.length ? (
          <div className="mx-auto max-w-6xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1 text-xs text-muted-foreground">
              <span>
                {collections.length} {collections.length === 1 ? "coleção" : "coleções"} e{" "}
                {totalItems} {totalItems === 1 ? "item" : "itens"}
              </span>
              <span>Abra uma coleção para consultar ou administrar seus itens.</span>
            </div>
            {collections.map((collection) => (
              <CollectionSection
                key={collection.id}
                collection={collection}
                items={items.filter((item) => item.collectionId === collection.id)}
              />
            ))}
          </div>
        ) : (
          <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
            <div className="grid size-14 place-items-center rounded-2xl border border-border/60 bg-card">
              <BookOpen className="size-6 text-brand-soft" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Sua biblioteca está vazia</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie uma coleção, defina os campos que formam cada item e depois alimente essa base.
            </p>
            <div className="mt-5">
              <NewCollection channelId={channelId} />
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}

function CollectionSection({
  collection,
  items,
}: {
  collection: StrategicCollection;
  items: ReturnType<typeof useLibraryItems>;
}) {
  const [open, setOpen] = useState(false);

  function removeCollection() {
    if (
      !window.confirm(
        `Excluir a coleção “${collection.name}” e seus ${items.length} ${items.length === 1 ? "item" : "itens"}?`,
      )
    ) {
      return;
    }
    removeLibraryCollection(collection.id);
    toast.success("Coleção removida.");
  }

  return (
    <section className="overflow-hidden border-y border-border bg-transparent">
      <header className="flex items-center gap-2 p-3 sm:px-4 sm:py-3.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1.5 text-left outline-none transition hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={`collection-${collection.id}`}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary">
            <FolderOpen className="size-4 text-foreground" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold">{collection.name}</span>
              <Badge variant="secondary">
                {items.length} {items.length === 1 ? "item" : "itens"}
              </Badge>
            </span>
            <span className="mt-1.5 flex flex-wrap gap-x-1.5 gap-y-1">
              {collection.fields.map((field) => (
                <Badge key={field.id} variant="outline" className="text-[10px] font-normal">
                  {field.label}
                  {!field.required && " · opcional"}
                </Badge>
              ))}
            </span>
          </span>
          <ChevronDown
            className={`mr-1 size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        <div className="flex shrink-0 gap-1">
          <NewCollectionItem collection={collection} />
          <EditCollection collection={collection} />
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={removeCollection}
            aria-label={`Excluir coleção ${collection.name}`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </header>

      {open && (
        <div id={`collection-${collection.id}`} className="border-t border-border/60">
          {items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-secondary/35 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {collection.fields.map((field) => (
                      <th key={field.id} className="px-4 py-3 font-semibold sm:px-5">
                        {field.label}
                      </th>
                    ))}
                    <th className="w-12 px-3 py-3" aria-label="Ações" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="group align-top transition-colors hover:bg-secondary/20"
                    >
                      {collection.fields.map((field) => (
                        <td key={field.id} className="max-w-sm px-4 py-3 sm:px-5">
                          <CollectionValueCell field={field} value={item.values[field.id]} />
                        </td>
                      ))}
                      <td className="px-2 py-3 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeLibraryItem(item.id)}
                          aria-label="Excluir item"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm font-medium">Esta coleção ainda não possui itens.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Use “Adicionar item” para preencher os campos definidos na coleção.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CollectionValueCell({
  field,
  value,
}: {
  field: StrategicCollectionField;
  value: CollectionItemValue | undefined;
}) {
  if (value === undefined || value === null || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }

  if (field.type === "thumbnail_layout" && isThumbnailLayout(value)) {
    return <CompositionPreview boxes={value.boxes} className="w-44 min-w-44" />;
  }

  if (field.type === "image" && isStoredFile(value)) {
    return (
      <img
        src={value.url}
        alt={value.name}
        className="size-16 rounded-lg border border-border/60 object-cover"
      />
    );
  }

  if (field.type === "url") {
    return (
      <a
        href={String(value)}
        target="_blank"
        rel="noreferrer"
        className="block max-w-sm break-all text-brand-soft hover:underline"
      >
        {String(value)}
      </a>
    );
  }

  return (
    <span className="block max-w-sm whitespace-pre-wrap text-foreground">{String(value)}</span>
  );
}

function EditCollection({ collection }: { collection: StrategicCollection }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(collection.name);
  const [fields, setFields] = useState<StrategicCollectionField[]>(collection.fields);
  const valid =
    Boolean(name.trim()) && fields.length > 0 && fields.every((field) => field.label.trim());

  function prepare() {
    setName(collection.name);
    setFields(collection.fields.map((field) => ({ ...field })));
  }

  function updateField(id: string, patch: Partial<StrategicCollectionField>) {
    setFields((current) =>
      current.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    );
  }

  function save() {
    if (!valid) return;
    updateLibraryCollection({
      ...collection,
      name: name.trim(),
      fields: fields.map((field) => ({ ...field, label: field.label.trim() })),
    });
    toast.success(`Coleção “${name.trim()}” atualizada.`);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) prepare();
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label={`Editar coleção ${collection.name}`}
        >
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar coleção</DialogTitle>
          <DialogDescription>
            Atualize o nome e os campos usados pelos itens desta coleção.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Nome da coleção</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>

          <CollectionFieldEditor fields={fields} onChange={setFields} onUpdate={updateField} />

          <Button className="w-full gradient-brand text-white" disabled={!valid} onClick={save}>
            Salvar alterações
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewCollection({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [fields, setFields] = useState<StrategicCollectionField[]>([newField(0)]);
  const valid =
    Boolean(name.trim()) && fields.length > 0 && fields.every((field) => field.label.trim());

  function updateField(id: string, patch: Partial<StrategicCollectionField>) {
    setFields((current) =>
      current.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    );
  }

  function reset() {
    setName("");
    setFields([newField(0)]);
  }

  function save() {
    if (!valid) return;
    createLibraryCollection({
      channelId,
      name: name.trim(),
      fields: fields.map((field) => ({ ...field, label: field.label.trim() })),
    });
    toast.success(`Coleção “${name.trim()}” criada.`);
    setOpen(false);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 gradient-brand text-white">
          <Plus className="size-4" /> Adicionar coleção
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova coleção estratégica</DialogTitle>
          <DialogDescription>
            Dê um nome à coleção e defina o formato que todos os seus itens seguirão.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Nome da coleção</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: CTAs"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Campos de cada item</Label>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Adicione quantos campos forem necessários para representar cada opção.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => setFields((current) => [...current, newField(current.length)])}
              >
                <Plus className="size-3.5" /> Campo
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="grid gap-2 border-b border-border py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_150px_auto_auto] sm:items-center"
                >
                  <Input
                    value={field.label}
                    onChange={(event) => updateField(field.id, { label: event.target.value })}
                    placeholder={`Nome do campo ${index + 1}`}
                  />
                  <Select
                    value={field.type}
                    onValueChange={(type) =>
                      updateField(field.id, { type: type as StrategicCollectionField["type"] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto curto</SelectItem>
                      <SelectItem value="textarea">Texto longo</SelectItem>
                      <SelectItem value="number">Número</SelectItem>
                      <SelectItem value="image">Imagem</SelectItem>
                      <SelectItem value="url">Link</SelectItem>
                      <SelectItem value="thumbnail_layout">Layout de thumbnail</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
                    <Checkbox
                      checked={field.required}
                      onCheckedChange={(checked) =>
                        updateField(field.id, { required: checked === true })
                      }
                    />
                    Obrigatório
                  </label>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    disabled={fields.length === 1}
                    onClick={() =>
                      setFields((current) => current.filter((item) => item.id !== field.id))
                    }
                    aria-label="Remover campo"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Button className="w-full gradient-brand text-white" disabled={!valid} onClick={save}>
            Criar coleção
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CollectionFieldEditor({
  fields,
  onChange,
  onUpdate,
}: {
  fields: StrategicCollectionField[];
  onChange: (fields: StrategicCollectionField[]) => void;
  onUpdate: (id: string, patch: Partial<StrategicCollectionField>) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label>Campos de cada item</Label>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Adicione quantos campos forem necessários para representar cada opção.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => onChange([...fields, newField(fields.length)])}
        >
          <Plus className="size-3.5" /> Campo
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid gap-2 border-b border-border py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_150px_auto_auto] sm:items-center"
          >
            <Input
              value={field.label}
              onChange={(event) => onUpdate(field.id, { label: event.target.value })}
              placeholder={`Nome do campo ${index + 1}`}
            />
            <Select
              value={field.type}
              onValueChange={(type) =>
                onUpdate(field.id, { type: type as StrategicCollectionField["type"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Texto curto</SelectItem>
                <SelectItem value="textarea">Texto longo</SelectItem>
                <SelectItem value="number">Número</SelectItem>
                <SelectItem value="image">Imagem</SelectItem>
                <SelectItem value="url">Link</SelectItem>
                <SelectItem value="thumbnail_layout">Layout de thumbnail</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
              <Checkbox
                checked={field.required}
                onCheckedChange={(checked) => onUpdate(field.id, { required: checked === true })}
              />
              Obrigatório
            </label>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-muted-foreground hover:text-destructive"
              disabled={fields.length === 1}
              onClick={() => onChange(fields.filter((item) => item.id !== field.id))}
              aria-label="Remover campo"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewCollectionItem({ collection }: { collection: StrategicCollection }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, CollectionItemValue>>({});
  const [uploadingFieldId, setUploadingFieldId] = useState<string | null>(null);
  const valid = collection.fields.every((field) => {
    const value = values[field.id];
    const hasValue =
      typeof value === "string"
        ? Boolean(value.trim())
        : isThumbnailLayout(value)
          ? value.boxes.length > 0
          : value !== undefined;
    if (field.required && !hasValue) return false;
    if (field.type === "url" && hasValue) {
      return typeof value === "string" && isValidHttpUrl(value.trim());
    }
    return true;
  });

  async function uploadImage(fieldId: string, file?: File) {
    if (!file) return;
    setUploadingFieldId(fieldId);
    try {
      const storedFile = await uploadLocalFile(file);
      setValues((current) => ({ ...current, [fieldId]: storedFile }));
      toast.success(`${file.name} salvo localmente.`);
    } catch (error) {
      toast.error("Não foi possível salvar a imagem", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUploadingFieldId(null);
    }
  }

  function save() {
    if (!valid) return;
    createLibraryItem({
      channelId: collection.channelId,
      collectionId: collection.id,
      values: Object.fromEntries(
        collection.fields.map((field) => {
          const value = values[field.id];
          if (typeof value === "string") {
            return [field.id, field.type === "number" && value ? Number(value) : value.trim()];
          }
          return [field.id, value ?? ""];
        }),
      ),
    });
    toast.success(`Item adicionado a “${collection.name}”.`);
    setValues({});
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setValues({});
          setUploadingFieldId(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Plus className="size-3.5" /> Adicionar item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo item em {collection.name}</DialogTitle>
          <DialogDescription>Preencha o formato definido para esta coleção.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {collection.fields.map((field) => {
            const fieldValue = values[field.id];
            return (
              <div key={field.id} className="space-y-1.5">
                <Label>
                  {field.label}
                  {field.required && <span className="ml-1 text-destructive">*</span>}
                </Label>
                {field.type === "textarea" ? (
                  <Textarea
                    value={typeof fieldValue === "string" ? fieldValue : ""}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.id]: event.target.value }))
                    }
                    rows={4}
                  />
                ) : field.type === "thumbnail_layout" ? (
                  <div className="rounded-xl border border-border/70 bg-background/30 p-3">
                    <CompositionCanvas
                      boxes={isThumbnailLayout(fieldValue) ? fieldValue.boxes : []}
                      onChange={(boxes) =>
                        setValues((current) => ({
                          ...current,
                          [field.id]: { aspectRatio: "16:9", boxes },
                        }))
                      }
                    />
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      As posições e dimensões são salvas em porcentagens para funcionar em qualquer
                      resolução 16:9.
                    </p>
                  </div>
                ) : field.type === "image" ? (
                  <div className="rounded-xl border border-dashed border-input p-4">
                    {isStoredFile(fieldValue) ? (
                      <div className="space-y-3">
                        <img
                          src={fieldValue.url}
                          alt={fieldValue.name}
                          className="max-h-56 w-full rounded-lg object-contain"
                        />
                        <p className="truncate text-center text-xs text-muted-foreground">
                          {fieldValue.name}
                        </p>
                      </div>
                    ) : (
                      <div className="text-center text-xs text-muted-foreground">
                        <ImageIcon className="mx-auto mb-2 size-5" />
                        Nenhuma imagem selecionada
                      </div>
                    )}
                    <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
                      {uploadingFieldId === field.id ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <ImageIcon className="size-4" />
                      )}
                      {isStoredFile(fieldValue) ? "Substituir imagem" : "Selecionar imagem"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingFieldId === field.id}
                        onChange={(event) => void uploadImage(field.id, event.target.files?.[0])}
                      />
                    </label>
                  </div>
                ) : (
                  <Input
                    type={
                      field.type === "number" ? "number" : field.type === "url" ? "url" : "text"
                    }
                    value={
                      typeof fieldValue === "string" || typeof fieldValue === "number"
                        ? fieldValue
                        : ""
                    }
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.id]: event.target.value }))
                    }
                    placeholder={field.type === "url" ? "https://..." : undefined}
                  />
                )}
                {field.type === "url" &&
                  typeof fieldValue === "string" &&
                  fieldValue.trim() &&
                  !isValidHttpUrl(fieldValue.trim()) && (
                    <p className="text-[11px] text-destructive">
                      Informe um link completo começando com http:// ou https://.
                    </p>
                  )}
              </div>
            );
          })}
          <Button className="w-full gradient-brand text-white" disabled={!valid} onClick={save}>
            Adicionar item
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
