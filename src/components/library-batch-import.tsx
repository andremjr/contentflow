import { useRef, useState } from "react";
import { toast } from "sonner";
import { CompositionCanvas, CompositionPreview } from "./composition-canvas";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import type { RuntimeValue, StrategicCollection, StoredFile, ThumbnailLayout } from "@/lib/domain";
import { importLibraryItems, uploadLocalFile } from "@/lib/store";
import { libraryValuesIssues } from "@/lib/strategic-library";
import { useAppPreferences } from "@/lib/app-preferences";

type Row = { id: string; values: Record<string, RuntimeValue> };
const newRow = (): Row => ({ id: crypto.randomUUID(), values: {} });

export function LibraryBatchImport({ collection }: { collection: StrategicCollection }) {
  const { t } = useAppPreferences();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [column, setColumn] = useState(collection.fields[0].id);
  const [columnText, setColumnText] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const importId = useRef(crypto.randomUUID());
  const field =
    collection.fields.find((candidate) => candidate.id === column) ?? collection.fields[0];
  const valid =
    rows.length > 0 &&
    rows.length <= 1000 &&
    rows.every((row) => !libraryValuesIssues(collection, row.values).length);

  function changeRows(next: Row[]) {
    importId.current = crypto.randomUUID();
    setRows(next);
  }
  function fillColumn(values: RuntimeValue[], fieldId = field.id) {
    if (values.length > 1000) {
      toast.error(t("Lote inválido."));
      return;
    }
    const next = [...rows];
    while (next.length < values.length) next.push(newRow());
    values.forEach((value, index) => {
      next[index] = { ...next[index], values: { ...next[index].values, [fieldId]: value } };
    });
    changeRows(next);
  }
  async function upload(files: File[], fieldId = field.id, rowId?: string) {
    if (files.length > 1000) {
      toast.error(t("Lote inválido."));
      return;
    }
    if (!files.length || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const stored: StoredFile[] = [];
      for (const file of files) stored.push(await uploadLocalFile(file));
      if (rowId)
        changeRows(
          rows.map((row) =>
            row.id === rowId ? { ...row, values: { ...row.values, [fieldId]: stored[0] } } : row,
          ),
        );
      else fillColumn(stored, fieldId);
    } catch {
      toast.error(t("Não foi possível salvar o arquivo"));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (!valid || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await importLibraryItems(
        collection.id,
        rows.map((row) => row.values),
        importId.current,
      );
      toast.success(t("Lote importado."));
      setOpen(false);
      changeRows([newRow()]);
      setColumnText("");
    } catch {
      toast.error(t("Não foi possível importar o lote. Revise os campos e tente novamente."));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!lock.current) setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {t("Importar em lote")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Importar em lote")}</DialogTitle>
          <DialogDescription>
            {t("Preencha as linhas ou importe uma coluna por vez. Revise a ordem antes de salvar.")}
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={busy} className="space-y-4 min-w-0">
          <div className="space-y-2 rounded-md border p-3">
            <Label>{t("Preencher por coluna")}</Label>
            <select
              aria-label={t("Coluna")}
              className="w-full rounded border bg-background p-2"
              value={column}
              onChange={(event) => {
                setColumn(event.target.value);
                setColumnText("");
              }}
            >
              {collection.fields.map((candidate) => (
                <option data-i18n-ignore key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
            {field.shape.kind === "content" && field.shape.family !== "text" ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Os arquivos preenchem esta coluna na ordem selecionada, a partir da primeira linha.",
                  )}
                </p>
                <Input
                  aria-label={t("Selecionar arquivos")}
                  type="file"
                  multiple
                  accept={`${field.shape.family}/*`}
                  onChange={(event) => {
                    void upload(Array.from(event.target.files ?? []));
                    event.target.value = "";
                  }}
                />
              </>
            ) : field.shape.kind === "control" && field.shape.control === "thumbnail_layout" ? (
              <p>{t("Edite os layouts diretamente nas linhas.")}</p>
            ) : (
              <>
                <Textarea
                  aria-label={t("Valores da coluna")}
                  value={columnText}
                  onChange={(event) => setColumnText(event.target.value)}
                  placeholder={t("Um valor por linha")}
                />
                <Button
                  variant="outline"
                  disabled={!columnText.trim()}
                  onClick={() =>
                    fillColumn(
                      columnText
                        .replace(/\r/g, "")
                        .split("\n")
                        .map((value) =>
                          field.shape.kind === "control" &&
                          field.shape.control === "number" &&
                          value.trim()
                            ? Number(value)
                            : value,
                        ),
                    )
                  }
                >
                  {t("Aplicar à coluna")}
                </Button>
              </>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>{t("Linha")}</th>
                  {collection.fields.map((candidate) => (
                    <th key={candidate.id} className="min-w-48 p-2 text-left">
                      <span data-i18n-ignore>{candidate.label}</span>
                      {candidate.required && " *"}
                    </th>
                  ))}
                  <th>{t("Ações")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id} className="border-t align-top">
                    <td className="p-2">{index + 1}</td>
                    {collection.fields.map((candidate) => {
                      const value = row.values[candidate.id];
                      const update = (next: RuntimeValue) =>
                        changeRows(
                          rows.map((entry) =>
                            entry.id === row.id
                              ? { ...entry, values: { ...entry.values, [candidate.id]: next } }
                              : entry,
                          ),
                        );
                      return (
                        <td key={candidate.id} className="p-2">
                          {candidate.shape.kind === "control" &&
                          candidate.shape.control === "thumbnail_layout" ? (
                            <>
                              <CompositionPreview
                                boxes={(value as ThumbnailLayout | undefined)?.boxes ?? []}
                                className="w-48"
                              />
                              <CompositionCanvas
                                boxes={(value as ThumbnailLayout | undefined)?.boxes ?? []}
                                onChange={(boxes) => update({ aspectRatio: "16:9", boxes })}
                              />
                            </>
                          ) : candidate.shape.kind === "content" &&
                            candidate.shape.family !== "text" ? (
                            <>
                              {value && typeof value === "object" && "url" in value && (
                                <div data-i18n-ignore>
                                  {candidate.shape.family === "image" && (
                                    <img
                                      src={(value as StoredFile).url}
                                      alt={(value as StoredFile).name}
                                      className="mb-2 h-24 w-40 object-contain rounded border"
                                    />
                                  )}
                                  <a
                                    href={(value as StoredFile).url}
                                    target="_blank"
                                    rel="noreferrer"
                                    data-i18n-ignore
                                  >
                                    {(value as StoredFile).name}
                                  </a>
                                </div>
                              )}
                              <Input
                                aria-label={`${candidate.label} ${index + 1}`}
                                type="file"
                                accept={`${candidate.shape.family}/*`}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (file) void upload([file], candidate.id, row.id);
                                  event.target.value = "";
                                }}
                              />
                            </>
                          ) : (
                            <Textarea
                              aria-label={`${candidate.label} ${index + 1}`}
                              rows={2}
                              value={
                                typeof value === "string" || typeof value === "number"
                                  ? String(value)
                                  : ""
                              }
                              onChange={(event) =>
                                update(
                                  candidate.shape.kind === "control" &&
                                    candidate.shape.control === "number" &&
                                    event.target.value
                                    ? Number(event.target.value)
                                    : event.target.value,
                                )
                              }
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="p-2">
                      <Button
                        variant="ghost"
                        onClick={() => changeRows(rows.filter((entry) => entry.id !== row.id))}
                      >
                        {t("Remover linha")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            variant="outline"
            disabled={rows.length >= 1000}
            onClick={() => changeRows([...rows, newRow()])}
          >
            {t("Adicionar linha")}
          </Button>
          {!valid && (
            <p className="text-sm text-muted-foreground">
              {t("Preencha os campos obrigatórios e corrija os valores antes de importar.")}
            </p>
          )}
          <Button className="w-full" disabled={!valid || busy} onClick={() => void save()}>
            {t(busy ? "Salvando…" : "Importar itens")}
          </Button>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
