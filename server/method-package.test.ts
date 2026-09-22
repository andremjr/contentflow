import assert from "node:assert/strict";
import test from "node:test";
import { createMethodPackage, readMethodPackage } from "./method-package";

const cover = "data:image/webp;base64,UklGRgQAAABXRUJQ";

test("pacote ZIP separa as capas em assets e as restaura na importação", async () => {
  const manifest = JSON.stringify({
    format: "contentflow-method-pack",
    version: 1,
    name: "Kit",
    channelName: "Canal",
    channelImageUrl: cover,
    exportedAt: "2026-09-08T00:00:00.000Z",
    methods: [{ name: "Tema", processType: "theme", imageUrl: cover, blocks: [] }],
  });
  const archive = await createMethodPackage(manifest);
  assert.equal(archive.subarray(0, 2).toString(), "PK");
  const restored = JSON.parse(await readMethodPackage(archive));
  assert.equal(restored.channelImageUrl, cover);
  assert.equal(restored.methods[0].imageUrl, cover);
});

test("pacote resolve capas locais e cria novos vínculos locais ao importar", async () => {
  const manifest = JSON.stringify({
    format: "contentflow-method",
    version: 1,
    name: "Tema",
    exportedAt: "2026-09-08T00:00:00.000Z",
    method: {
      name: "Tema",
      processType: "theme",
      imageUrl: "/api/files/original.webp",
      blocks: [],
    },
  });
  const archive = await createMethodPackage(manifest, (url) => {
    assert.equal(url, "/api/files/original.webp");
    return Buffer.from("imagem-local");
  });
  const restored = JSON.parse(
    await readMethodPackage(archive, (assetPath, data) => {
      assert.equal(assetPath, "assets/method-theme.webp");
      assert.equal(data.toString(), "imagem-local");
      return "/api/files/imported.webp";
    }),
  );
  assert.equal(restored.method.imageUrl, "/api/files/imported.webp");
});

test("pacote ZIP v2 separa e restaura capas em entradas de Método aninhadas", async () => {
  const manifest = JSON.stringify({
    format: "contentflow-method-pack",
    version: 2,
    name: "Kit portátil",
    channelName: "Canal",
    exportedAt: "2026-09-20T00:00:00.000Z",
    processOrder: [
      "theme",
      "title",
      "thumbnail",
      "script",
      "narration",
      "assets",
      "editing",
      "publishing",
    ],
    collections: [],
    itemsIncluded: false,
    methods: [
      {
        role: "set",
        requirements: [],
        method: { name: "Tema", processType: "theme", imageUrl: cover, blocks: [] },
      },
      {
        role: "set",
        requirements: [],
        method: { name: "Título", processType: "title", imageUrl: cover, blocks: [] },
      },
    ],
  });
  const archive = await createMethodPackage(manifest);
  const restored = JSON.parse(await readMethodPackage(archive));
  assert.equal(restored.methods[0].method.imageUrl, cover);
  assert.equal(restored.methods[1].method.imageUrl, cover);
});

test("leitura de pacote para prévia mantém assets temporários quando não há persistência", async () => {
  const manifest = JSON.stringify({
    format: "contentflow-method",
    version: 1,
    name: "Tema",
    exportedAt: "2026-09-20T00:00:00.000Z",
    method: { name: "Tema", processType: "theme", imageUrl: cover, blocks: [] },
  });
  const archive = await createMethodPackage(manifest);
  const restored = JSON.parse(await readMethodPackage(archive));
  assert.equal(restored.method.imageUrl, cover);
});

test("pacote ZIP v2 incorpora asset de item e restaura conteúdo e integridade", async () => {
  const itemData = Buffer.from("imagem-do-item");
  const itemUrl = `data:image/png;base64,${itemData.toString("base64")}`;
  const manifest = JSON.stringify({
    format: "contentflow-method-pack",
    version: 2,
    name: "Kit com itens",
    channelName: "Canal",
    exportedAt: "2026-09-20T00:00:00.000Z",
    processOrder: [
      "theme",
      "title",
      "thumbnail",
      "script",
      "narration",
      "assets",
      "editing",
      "publishing",
    ],
    collections: [],
    itemsIncluded: true,
    items: [
      {
        key: "item:1",
        collectionKey: "collection:images:1",
        values: {
          image: {
            id: "portable-file",
            name: "thumb.png",
            mimeType: "image/png",
            size: itemData.length,
            url: itemUrl,
          },
        },
      },
    ],
    methods: [
      {
        role: "set",
        requirements: [],
        method: { name: "Tema", processType: "theme", blocks: [] },
      },
    ],
  });
  const archive = await createMethodPackage(manifest);
  const restored = JSON.parse(await readMethodPackage(archive));
  const file = restored.items[0].values.image;
  assert.equal(file.url, itemUrl);
  assert.equal(file.size, itemData.length);
  assert.match(file.sha256, /^[a-f0-9]{64}$/);
});

test("exportação rejeita asset de item com hash incompatível", async () => {
  const itemData = Buffer.from("conteudo");
  const manifest = JSON.stringify({
    format: "contentflow-method-pack",
    version: 2,
    name: "Kit inválido",
    itemsIncluded: true,
    items: [
      {
        key: "item:1",
        values: {
          file: {
            id: "file",
            name: "arquivo.bin",
            mimeType: "application/octet-stream",
            size: itemData.length,
            sha256: "0".repeat(64),
            url: `data:application/octet-stream;base64,${itemData.toString("base64")}`,
          },
        },
      },
    ],
    methods: [],
  });
  await assert.rejects(() => createMethodPackage(manifest), /integridade/i);
});
