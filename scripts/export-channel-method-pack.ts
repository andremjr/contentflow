import Database from "better-sqlite3";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createMethodPackage } from "../server/method-package";
import {
  parseMethodImportFile,
  serializeMethodFile,
  serializeMethodPackFile,
} from "../src/lib/method-file";
import type { Channel, StrategicCollection } from "../src/lib/domain";

const channelId = process.argv[2];
if (!channelId) throw new Error("Informe o ID do canal a exportar.");

const dataDirectory = path.join(process.env.APPDATA ?? "", "ContentFlow", "data");
const database = new Database(path.join(dataDirectory, "contentflow.sqlite"), {
  readonly: true,
  fileMustExist: true,
});

try {
  const channelRow = database
    .prepare("SELECT payload FROM channels WHERE id = ?")
    .get(channelId) as { payload: string } | undefined;
  if (!channelRow) throw new Error("Canal não encontrado.");
  const channel = JSON.parse(channelRow.payload) as Channel;
  const collections = database
    .prepare("SELECT payload FROM library_collections WHERE channel_id = ?")
    .all(channelId)
    .map((row) => JSON.parse((row as { payload: string }).payload) as StrategicCollection);
  const methods = Object.values(channel.methods).filter((method) => method.blocks.length > 0);
  const manifest = serializeMethodPackFile(
    `Métodos de ${channel.name}`,
    channel.name,
    methods,
    collections,
  );
  parseMethodImportFile(manifest);
  const archive = await createMethodPackage(manifest);
  const outputDirectory = path.join(process.cwd(), "release", "ecosystem", "methods");
  mkdirSync(outputDirectory, { recursive: true });
  const basename = "historicos-contentflow.contentflow-method-pack";
  writeFileSync(path.join(outputDirectory, `${basename}.json`), `${manifest}\n`, "utf8");
  writeFileSync(path.join(outputDirectory, `${basename}.zip`), archive);
  for (const method of methods) {
    const methodName = method.name || `Método de ${method.processType}`;
    const individualManifest = serializeMethodFile(methodName, method, collections);
    parseMethodImportFile(individualManifest);
    const individualArchive = await createMethodPackage(individualManifest);
    writeFileSync(
      path.join(
        outputDirectory,
        `historicos-contentflow-${method.processType}.contentflow-method.zip`,
      ),
      individualArchive,
    );
  }
  console.log(
    JSON.stringify({ channel: channel.name, methods: methods.length, outputDirectory }, null, 2),
  );
} finally {
  database.close();
}
