import type { BlockInputBinding, RuntimeValue } from "../src/lib/domain";
import type { PluginInputPort } from "../src/lib/plugin-contract";

type AssignedPluginInput = {
  label: string;
  value: RuntimeValue;
};

function mimePatternMatches(left: string, right: string) {
  const normalize = (value: string) => value.trim().toLowerCase();
  const [leftType, leftSubtype] = normalize(left).split("/");
  const [rightType, rightSubtype] = normalize(right).split("/");
  if (!leftType || !leftSubtype || !rightType || !rightSubtype) return false;
  return (
    leftType === rightType &&
    (leftSubtype === "*" || rightSubtype === "*" || leftSubtype === rightSubtype)
  );
}

function presentationScore(input: BlockInputBinding, port: PluginInputPort) {
  const inputPresentation = input.presentation;
  const portPresentation = port.presentation;
  if (!inputPresentation || !portPresentation) return 0;

  let score = 0;
  if (inputPresentation.itemType && portPresentation.itemType) {
    score += inputPresentation.itemType === portPresentation.itemType ? 8 : -8;
  }

  const inputMimes = inputPresentation.acceptedMimeTypes ?? [];
  const portMimes = portPresentation.acceptedMimeTypes ?? [];
  if (inputMimes.length && portMimes.length) {
    const hasOverlap = inputMimes.some((inputMime) =>
      portMimes.some((portMime) => mimePatternMatches(inputMime, portMime)),
    );
    score += hasOverlap ? 6 : -10;
  }
  return score;
}

function semanticIdentityScore(input: BlockInputBinding, port: PluginInputPort) {
  const normalize = (value: string | undefined) =>
    (value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const portKey = normalize(port.key);
  if (!portKey) return 0;
  if (normalize(input.sourceKey) === portKey) return 20;
  const inputIdTokens = normalize(input.id).split(" ");
  if (inputIdTokens.includes(portKey)) return 12;
  const inputLabelTokens = normalize(input.label).split(" ");
  return inputLabelTokens.includes(portKey) ? 8 : 0;
}

export function selectPluginInputPort(
  input: BlockInputBinding,
  ports: PluginInputPort[],
  usedInputPorts: ReadonlySet<string>,
) {
  return ports
    .map((port, index) => ({ port, index }))
    .filter(
      ({ port }) =>
        port.acceptedTypes.includes(input.type) && (port.multiple || !usedInputPorts.has(port.key)),
    )
    .sort((left, right) => {
      const scoreDifference =
        semanticIdentityScore(input, right.port) +
        presentationScore(input, right.port) -
        (semanticIdentityScore(input, left.port) + presentationScore(input, left.port));
      return scoreDifference || left.index - right.index;
    })[0]?.port;
}

export function composePluginPortValue(
  assignedInputs: AssignedPluginInput[],
): RuntimeValue | undefined {
  if (!assignedInputs.length) return undefined;
  if (assignedInputs.length === 1) return assignedInputs[0].value ?? null;

  return assignedInputs
    .map(({ label, value }) => `${label}: ${JSON.stringify(value ?? null)}`)
    .join("\n");
}
