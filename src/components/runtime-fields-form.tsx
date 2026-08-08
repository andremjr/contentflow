import { useState } from "react";
import {
  FileAudio,
  FileImage,
  FileVideo,
  LoaderCircle,
  Paperclip,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { CompositionCanvas } from "@/components/composition-canvas";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  BlockFieldDefinition,
  RecordFieldDefinition,
  RuntimeValue,
  StoredFile,
  StructuredRecord,
  ThumbnailLayout,
} from "@/lib/domain";
import { uploadLocalFile } from "@/lib/store";

function isStoredFile(value: RuntimeValue | undefined): value is StoredFile {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && "url" in value);
}

function isThumbnailLayout(value: RuntimeValue | undefined): value is ThumbnailLayout {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && "boxes" in value);
}

function isStructuredRecord(value: unknown): value is StructuredRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && !("url" in value));
}

function toIsoDatetime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function toDatetimeLocalValue(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function acceptFor(type: BlockFieldDefinition["type"]) {
  if (type === "image") return "image/*";
  if (type === "audio") return "audio/*";
  if (type === "video") return "video/*";
  return undefined;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <FileImage className="size-4" />;
  if (mimeType.startsWith("audio/")) return <FileAudio className="size-4" />;
  if (mimeType.startsWith("video/")) return <FileVideo className="size-4" />;
  return <Paperclip className="size-4" />;
}

export function RuntimeFieldsForm({
  fields,
  values,
  dynamicOptions = {},
  onChange,
}: {
  fields: BlockFieldDefinition[];
  values: Record<string, RuntimeValue>;
  dynamicOptions?: Record<string, string[]>;
  onChange: (values: Record<string, RuntimeValue>) => void;
}) {
  const [uploadingKey, setUploadingKey] = useState<string>();

  const update = (key: string, value: RuntimeValue) => onChange({ ...values, [key]: value });

  async function upload(field: BlockFieldDefinition, files: FileList | null) {
    if (!files?.length) return;
    setUploadingKey(field.key);
    try {
      const uploaded = await Promise.all(Array.from(files).map(uploadLocalFile));
      update(field.key, field.type === "files" ? uploaded : uploaded[0]);
    } catch (error) {
      toast.error("Não foi possível salvar o arquivo", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUploadingKey(undefined);
    }
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const value = values[field.key];
        const options = [
          ...new Set([...(field.options ?? []), ...(dynamicOptions[field.id] ?? [])]),
        ];
        const fileValues = Array.isArray(value)
          ? value.filter((item): item is StoredFile => typeof item !== "string")
          : isStoredFile(value)
            ? [value]
            : [];
        return (
          <div key={field.id} className="space-y-1.5">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="ml-1 text-destructive">*</span>}
            </Label>

            {field.type === "textarea" ? (
              <Textarea
                id={field.id}
                rows={6}
                value={typeof value === "string" ? value : ""}
                placeholder={field.placeholder}
                onChange={(event) => update(field.key, event.target.value)}
              />
            ) : field.type === "records" ? (
              <StructuredRecordsInput
                field={field}
                value={value}
                onChange={(records) => update(field.key, records)}
              />
            ) : field.type === "list" ? (
              <Textarea
                id={field.id}
                rows={6}
                value={
                  Array.isArray(value)
                    ? value.filter((item) => typeof item === "string").join("\n")
                    : ""
                }
                placeholder={field.placeholder ?? "Um item por linha"}
                onChange={(event) =>
                  update(
                    field.key,
                    event.target.value
                      .split("\n")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  )
                }
              />
            ) : field.type === "datetime" ? (
              <Input
                id={field.id}
                type="datetime-local"
                value={toDatetimeLocalValue(value)}
                onChange={(event) => update(field.key, toIsoDatetime(event.target.value))}
              />
            ) : field.type === "number" ? (
              <Input
                id={field.id}
                type="number"
                value={typeof value === "number" ? value : ""}
                placeholder={field.placeholder}
                onChange={(event) =>
                  update(field.key, event.target.value === "" ? null : Number(event.target.value))
                }
              />
            ) : field.type === "boolean" ? (
              <label className="flex items-center gap-2 rounded-lg border border-border/70 p-3 text-sm">
                <Checkbox
                  checked={value === true}
                  onCheckedChange={(checked) => update(field.key, checked === true)}
                />
                Confirmar
              </label>
            ) : field.type === "approval" ? (
              <Select
                value={typeof value === "string" ? value : ""}
                onValueChange={(next) => update(field.key, next)}
              >
                <SelectTrigger id={field.id}>
                  <SelectValue placeholder="Selecione uma decisão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Aprovar</SelectItem>
                  <SelectItem value="rejected">Reprovar</SelectItem>
                </SelectContent>
              </Select>
            ) : field.type === "select" ? (
              <Select
                value={typeof value === "string" ? value : ""}
                onValueChange={(next) => update(field.key, next)}
              >
                <SelectTrigger id={field.id}>
                  <SelectValue placeholder={field.placeholder ?? "Selecione uma opção"} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.type === "multiselect" ? (
              <div className="space-y-2 rounded-lg border border-border/70 p-3">
                {options.map((option) => {
                  const current = Array.isArray(value)
                    ? value.filter((item): item is string => typeof item === "string")
                    : [];
                  const selected = current.includes(option);
                  return (
                    <label key={option} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(checked) => {
                          update(
                            field.key,
                            checked === true
                              ? [...new Set([...current, option])]
                              : current.filter((item) => item !== option),
                          );
                        }}
                      />
                      {option}
                    </label>
                  );
                })}
                {!options.length && (
                  <p className="text-xs text-muted-foreground">Nenhuma opção disponível.</p>
                )}
              </div>
            ) : field.type === "thumbnail_layout" ? (
              <div className="rounded-xl border border-border/70 bg-background/30 p-3">
                <CompositionCanvas
                  boxes={isThumbnailLayout(value) ? value.boxes : []}
                  onChange={(boxes) => update(field.key, { aspectRatio: "16:9", boxes })}
                />
              </div>
            ) : ["file", "image", "audio", "video", "files"].includes(field.type) ? (
              <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                {fileValues.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 rounded-md bg-secondary/50 p-2 text-xs"
                  >
                    <FileIcon mimeType={file.mimeType} />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => update(field.key, null)}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                ))}
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border/70 px-3 py-2 text-xs hover:bg-secondary/50">
                  {uploadingKey === field.key ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Paperclip className="size-3.5" />
                  )}
                  {uploadingKey === field.key
                    ? "Salvando..."
                    : field.type === "files"
                      ? "Selecionar arquivos"
                      : "Selecionar arquivo"}
                  <input
                    id={field.id}
                    type="file"
                    multiple={field.type === "files"}
                    accept={acceptFor(field.type)}
                    className="hidden"
                    disabled={uploadingKey === field.key}
                    onChange={(event) => void upload(field, event.target.files)}
                  />
                </label>
              </div>
            ) : (
              <Input
                id={field.id}
                type={field.type === "url" ? "url" : "text"}
                value={typeof value === "string" ? value : ""}
                placeholder={field.placeholder}
                onChange={(event) => update(field.key, event.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StructuredRecordsInput({
  field,
  value,
  onChange,
}: {
  field: BlockFieldDefinition;
  value: RuntimeValue | undefined;
  onChange: (records: StructuredRecord[]) => void;
}) {
  const schema = field.recordFields ?? [];
  const records = Array.isArray(value) ? value.filter(isStructuredRecord) : [];

  function addRecord() {
    onChange([
      ...records,
      Object.fromEntries(schema.map((recordField) => [recordField.key, null])) as StructuredRecord,
    ]);
  }

  function updateRecord(index: number, key: string, nextValue: StructuredRecord[string]) {
    onChange(
      records.map((record, recordIndex) =>
        recordIndex === index ? { ...record, [key]: nextValue } : record,
      ),
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-background/20 p-3">
      {records.map((record, index) => (
        <div key={index} className="rounded-xl border border-border/70 bg-card p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">Registro {index + 1}</p>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground hover:text-destructive"
              onClick={() => onChange(records.filter((_, recordIndex) => recordIndex !== index))}
              aria-label={`Remover registro ${index + 1}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {schema.map((recordField) => (
              <RecordValueInput
                key={recordField.id}
                field={recordField}
                value={record[recordField.key]}
                onChange={(nextValue) => updateRecord(index, recordField.key, nextValue)}
              />
            ))}
          </div>
        </div>
      ))}
      {!schema.length && (
        <p className="text-xs text-destructive">
          Defina os campos internos desta lista no editor do método.
        </p>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full gap-1.5"
        disabled={!schema.length}
        onClick={addRecord}
      >
        <Plus className="size-3.5" /> Adicionar registro
      </Button>
    </div>
  );
}

function RecordValueInput({
  field,
  value,
  onChange,
}: {
  field: RecordFieldDefinition;
  value: StructuredRecord[string] | undefined;
  onChange: (value: StructuredRecord[string]) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function uploadRecordFile(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      onChange(await uploadLocalFile(file));
    } catch (error) {
      toast.error("Não foi possível salvar o arquivo", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={field.type === "textarea" ? "space-y-1.5 md:col-span-2" : "space-y-1.5"}>
      <Label>
        {field.label}
        {field.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {field.type === "textarea" ? (
        <Textarea
          rows={4}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === "number" ? (
        <Input
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? null : Number(event.target.value))
          }
        />
      ) : field.type === "boolean" ? (
        <label className="flex items-center gap-2 rounded-lg border border-border/70 p-3 text-sm">
          <Checkbox
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
          Confirmar
        </label>
      ) : field.type === "select" ? (
        <Select value={typeof value === "string" ? value : ""} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma opção" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === "datetime" ? (
        <Input
          type="datetime-local"
          value={toDatetimeLocalValue(value)}
          onChange={(event) => onChange(toIsoDatetime(event.target.value))}
        />
      ) : ["file", "image", "audio", "video"].includes(field.type) ? (
        <div className="rounded-lg border border-dashed border-border p-3">
          {value && typeof value === "object" && "url" in value && (
            <p className="mb-2 truncate text-xs text-muted-foreground">{value.name}</p>
          )}
          <label className="flex cursor-pointer items-center justify-center gap-2 text-xs">
            {uploading ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Paperclip className="size-3.5" />
            )}
            {uploading ? "Salvando..." : "Selecionar arquivo"}
            <input
              type="file"
              accept={acceptFor(field.type)}
              className="hidden"
              disabled={uploading}
              onChange={(event) => void uploadRecordFile(event.target.files?.[0])}
            />
          </label>
        </div>
      ) : (
        <Input
          type={field.type === "url" ? "url" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
