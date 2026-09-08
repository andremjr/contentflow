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
