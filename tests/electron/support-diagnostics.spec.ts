import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import yauzl from "yauzl";

test.setTimeout(180_000);
function readZip(file: string): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error);
      const result: Record<string, string> = {};
      zip.on("error", reject);
      zip.on("end", () => resolve(result));
      zip.on("entry", (entry) =>
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) return reject(error);
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            result[entry.fileName] = Buffer.concat(chunks).toString("utf8");
            zip.readEntry();
          });
        }),
      );
      zip.readEntry();
    });
  });
}

for (const [language, preferences, heading, exportLabel, folderLabel, success] of [
  [
    "pt-BR",
    "Preferências",
    "Suporte e diagnóstico",
    "Exportar diagnóstico",
    "Abrir pasta de logs",
    "Diagnóstico exportado. Você pode enviar o ZIP ao suporte.",
  ],
  [
    "en",
    "Preferences",
    "Support and diagnostics",
    "Export diagnostics",
    "Open logs folder",
    "Diagnostics exported. You can send the ZIP to support.",
  ],
  [
    "es",
    "Preferencias",
    "Soporte y diagnóstico",
    "Exportar diagnóstico",
    "Abrir carpeta de registros",
    "Diagnóstico exportado. Puedes enviar el ZIP a soporte.",
  ],
] as const) {
  test(`Preferences exports real local errors without private content (${language})`, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "contentflow-support-electron-"));
    const logDirectory = path.join(directory, "logs");
    await mkdir(logDirectory);
    const expired = `support-${Math.floor(Date.now() / 3600000) * 3600000 - 86400000}.jsonl`;
    await writeFile(path.join(logDirectory, expired), "PRIVATE_EXPIRED");
    await writeFile(path.join(logDirectory, "student-note.txt"), "preserve");
    const app = await electron.launch({
      args: ["."],
      cwd: path.resolve(import.meta.dirname, "../.."),
      env: { ...process.env, CONTENTFLOW_ELECTRON_USER_DATA_DIR: directory },
    });
    try {
      const window = await app.firstWindow();
      await expect(window.locator("h1")).toBeVisible();
      await window.evaluate(async (language) => {
        const settings = await (await fetch("/api/preferences")).json();
        await fetch("/api/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...settings, language }),
        });
      }, language);
      await window.reload();
      await window.getByRole("button", { name: preferences, exact: true }).click();
      const dialog = window.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await window.evaluate(async () => {
        // A real backend validation failure with private request data.
        const rejected = await fetch("/api/commands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "PRIVATE_PROMPT", token: "PRIVATE_TOKEN" }),
        });
        if (rejected.ok) throw new Error("Expected validation failure");
        // Successful state reads must not create a stream of logs.
        for (let i = 0; i < 5; i++) await fetch("/api/state");
        setTimeout(() => {
          throw new TypeError("Cannot read properties of undefined (reading 'PRIVATE_FIELD')");
        }, 0);
        setTimeout(() => {
          void Promise.reject(new ReferenceError("PRIVATE_REJECTION"));
        }, 0);
      });
      const destination = path.join(directory, "support.zip");
      await app.evaluate(({ dialog, shell }, destination) => {
        let count = 0;
        dialog.showSaveDialog = (async () =>
          ++count === 1
            ? { canceled: true, filePath: "" }
            : { canceled: false, filePath: destination }) as typeof dialog.showSaveDialog;
        shell.openPath = async (folder) => {
          (globalThis as typeof globalThis & { supportFolder?: string }).supportFolder = folder;
          return "";
        };
      }, destination);
      await dialog.getByRole("button", { name: exportLabel, exact: true }).click();
      await expect(dialog.getByRole("button", { name: exportLabel, exact: true })).toBeEnabled();
      expect((await readdir(directory)).includes("support.zip")).toBe(false);
      await dialog.getByRole("button", { name: folderLabel, exact: true }).click();
      await expect
        .poll(() =>
          app.evaluate(
            () => (globalThis as typeof globalThis & { supportFolder?: string }).supportFolder,
          ),
        )
        .toBe(logDirectory);
      await expect(dialog.getByRole("button", { name: exportLabel, exact: true })).toBeEnabled();
      await dialog.getByRole("button", { name: exportLabel, exact: true }).click();
      await expect(window.getByText(success, { exact: true })).toBeVisible();
      const entries = await readZip(destination);
      const report = JSON.stringify(entries);
      expect(report).not.toContain("PRIVATE");
      expect(report).not.toContain(directory.replaceAll("\\", "\\\\"));
      const events = entries["events.jsonl"]
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      expect(events.some((event) => event.code === "APP_STARTED")).toBe(true);
      expect(events.some((event) => event.code === "API_STARTED")).toBe(true);
      expect(
        events.some(
          (event) => event.code === "API_REQUEST_FAILED" && event.operation === "/api/commands",
        ),
      ).toBe(true);
      expect(
        events.some((event) => event.code === "UI_ERROR" && event.errorType === "TypeError"),
      ).toBe(true);
      expect(
        events.some(
          (event) => event.code === "UI_REJECTION" && event.errorType === "ReferenceError",
        ),
      ).toBe(true);
      expect(events.some((event) => event.operation === "/api/state")).toBe(false);
      expect(entries["LEIA-ME.txt"]).toContain("Erro na interface");
      expect((await readdir(logDirectory)).includes(expired)).toBe(false);
      expect(await readFile(path.join(logDirectory, "student-note.txt"), "utf8")).toBe("preserve");
    } finally {
      await app.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
