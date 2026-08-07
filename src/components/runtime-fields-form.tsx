import { useState } from "react";
import { FileAudio, FileImage, FileVideo, LoaderCircle, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
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
import type { BlockFieldDefinition, RuntimeValue, StoredFile } from "@/lib/domain";
import { uploadLocalFile } from "@/lib/store";

function isStoredFile(value: RuntimeValue | undefined): value is StoredFile {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && "url" in value);
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
