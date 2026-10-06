import { createHash } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";

const messages = {
  animationAmbiguous: [
    "Mais de um vídeo apareceu para esta animação; o resultado precisa ser reconciliado antes de continuar.",
    "More than one video appeared for this animation; the result must be reconciled before continuing.",
    "Apareció más de un vídeo para esta animación; el resultado debe reconciliarse antes de continuar.",
  ],
  animationPending: [
    "Existe um envio de animação ainda não reconciliado; nenhuma nova geração foi enviada.",
    "An animation submission is still unreconciled; no new generation was submitted.",
    "Hay un envío de animación pendiente de reconciliación; no se envió una nueva generación.",
  ],
  promptMismatch: [
    "O texto completo não foi confirmado no editor do Flow; a geração não foi enviada.",
    "The complete text was not confirmed in the Flow editor; generation was not submitted.",
    "No se confirmó el texto completo en el editor de Flow; no se envió la generación.",
  ],
  animationInstruction: [
    "Informe as instruções do bloco ou um prompt de animação.",
    "Enter the block instructions or an animation prompt.",
    "Introduce las instrucciones del bloque o un prompt de animación.",
  ],
  unavailable: [
    "Uma referência não foi confirmada no projeto; nenhum prompt foi enviado.",
    "A reference was not confirmed in the project; no prompt was sent.",
    "Una referencia no fue confirmada en el proyecto; no se envió ningún prompt.",
  ],
  missing: [
    "A identidade da referência não foi encontrada no projeto do Flow.",
    "The reference identity was not found in the Flow project.",
    "La identidad de la referencia no se encontró en el proyecto de Flow.",
  ],
  unconfirmed: [
    "O Flow não confirmou a referência existente.",
    "Flow did not confirm the existing reference.",
    "Flow no confirmó la referencia existente.",
  ],
  confirmed: [
    "Referência existente confirmada no projeto.",
    "Existing reference confirmed in the project.",
    "Referencia existente confirmada en el proyecto.",
  ],
  clear: [
    "Não foi possível limpar as referências antes da preparação.",
    "References could not be cleared before preparation.",
    "No se pudieron limpiar las referencias antes de la preparación.",
  ],
  uploaded: [
    "A imagem enviada não possui uma identidade confirmada no projeto do Flow.",
    "The uploaded image has no confirmed identity in the Flow project.",
    "La imagen subida no tiene una identidad confirmada en el proyecto de Flow.",
  ],
};

export function referenceMessage(locale, key) {
  const language = String(locale || "pt-BR");
  return messages[key][language.startsWith("en") ? 1 : language.startsWith("es") ? 2 : 0];
}

// Provider facts stay in this plugin's private workspace, scoped to its explicit profile/project.
export function catalogPath(services, digest, context) {
  if (!/^[a-f0-9]{64}$/.test(digest || "") || !context?.projectUrl || !context?.accountProfile)
    return null;
  const key = createHash("sha256")
    .update(JSON.stringify([context.accountProfile, context.projectUrl, digest]))
    .digest("hex");
  return services.getWorkspacePath(`.flow-media-${key}.json`);
}

export async function rememberMedia(services, digest, context, media) {
  const path = catalogPath(services, digest, context);
  if (!path || !/^[a-f0-9-]{36}$/i.test(media?.mediaId || "")) return;
  await writeFile(
    path,
    JSON.stringify({
      ...context,
      digest,
      mediaId: media.mediaId,
      ...(media.name ? { name: media.name } : {}),
    }),
    "utf8",
  );
}

export async function recalledMedia(services, digest, context) {
  const path = catalogPath(services, digest, context);
  if (!path) return null;
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return value.digest === digest &&
      value.projectUrl === context.projectUrl &&
      value.accountProfile === context.accountProfile
      ? value
      : null;
  } catch {
    return null;
  }
}

// A complete preflight barrier: no prompt can be sent while any reference is unavailable.
export async function prepareReferenceCatalog(
  images,
  prepare,
  failureMessage = "A reference was not confirmed in the project; no prompt was sent.",
) {
  const result = new Map();
  for (const image of images) {
    const reference = await prepare(image);
    if (!reference?.mediaId || !reference?.name) {
      const error = new Error(failureMessage);
      error.code = "OUTPUT_VALIDATION_FAILED";
      throw error;
    }
    result.set(image.id, reference);
  }
  return result;
}

function receiptPath(services, request, itemId, context) {
  const key = createHash("sha256")
    .update(
      JSON.stringify([
        request.executionId,
        request.blockId,
        itemId,
        context.accountProfile,
        context.projectUrl,
      ]),
    )
    .digest("hex");
  return services.getWorkspacePath(`.flow-result-${key}.json`);
}

export async function saveAnimationReceipt(services, request, itemId, context, receipt) {
  if (!itemId) return;
  const path = `${receiptPath(services, request, itemId, context)}.animation`;
  const temporary = `${path}.partial`;
  await writeFile(temporary, JSON.stringify(receipt), "utf8");
  await rename(temporary, path);
}

export async function readAnimationReceipt(services, request, itemId, context) {
  if (!itemId) return null;
  try {
    return JSON.parse(
      await readFile(`${receiptPath(services, request, itemId, context)}.animation`, "utf8"),
    );
  } catch (error) {
    if (error.code === "ENOENT") return null;
    // A corrupt receipt cannot be interpreted as permission to repeat an effect.
    throw Object.assign(error, {
      code: "OUTPUT_VALIDATION_FAILED",
      recovery: { stage: "awaiting_result", externalEffect: "possible" },
    });
  }
}

export async function rememberResult(services, request, itemId, context, prompt, media) {
  if (!itemId || !media?.length) return;
  const promptDigest = createHash("sha256").update(prompt).digest("hex");
  await writeFile(
    receiptPath(services, request, itemId, context),
    JSON.stringify({ promptDigest, attempt: request.attempt, media }),
    "utf8",
  );
}

export async function recalledResult(
  services,
  request,
  itemId,
  context,
  prompt,
  allowEarlierAttempt = false,
) {
  if (!itemId) return null;
  try {
    const saved = JSON.parse(
      await readFile(receiptPath(services, request, itemId, context), "utf8"),
    );
    return (allowEarlierAttempt || saved.attempt === request.attempt) &&
      saved.promptDigest === createHash("sha256").update(prompt).digest("hex") &&
      Array.isArray(saved.media) &&
      saved.media.length
      ? saved.media
      : null;
  } catch {
    return null;
  }
}
