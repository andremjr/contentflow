// Plugin-owned serialization. ContentFlow stores each serialized object as text.
const messages = {
  "Per-item execution requires exactly one JSON text item.": [
    "A execução por item exige exatamente um texto JSON.",
    "La ejecución por elemento requiere exactamente un texto JSON.",
  ],
  "Invalid JSON text item fields: use string or string[].": [
    "Campos inválidos no texto JSON: use string ou string[].",
    "Campos inválidos en el texto JSON: use string o string[].",
  ],
  "Reference fields must be string[].": [
    "Campos de IDs devem ser string[].",
    "Los campos de IDs deben ser string[].",
  ],
  "Referenced input has no canonical items.": [
    "A entrada de referência não possui itens com IDs canônicos.",
    "La entrada de referencia no tiene elementos con IDs canónicos.",
  ],
  "Expected a JSON array of text item objects.": [
    "A resposta deve ser um array JSON de objetos de texto.",
    "La respuesta debe ser un array JSON de objetos de texto.",
  ],
  "Expected nonempty JSON text items.": [
    "A resposta não contém itens de texto JSON.",
    "La respuesta no contiene elementos de texto JSON.",
  ],
  "Invalid JSON text item fields.": [
    "A resposta contém campos JSON incorretos.",
    "La respuesta contiene campos JSON incorrectos.",
  ],
  "Invalid JSON text item value.": [
    "A resposta contém valores JSON incorretos.",
    "La respuesta contiene valores JSON incorrectos.",
  ],
  "JSON text item references an unknown ContentFlow ID.": [
    "O texto JSON contém um ID desconhecido do ContentFlow.",
    "El texto JSON contiene un ID desconocido de ContentFlow.",
  ],
  "Invalid JSON text configuration.": [
    "Configuração inválida dos textos JSON.",
    "Configuración inválida de los textos JSON.",
  ],
};
function fail(message, request, code = "OUTPUT_VALIDATION_FAILED") {
  const locale = String(request?.context?.locale ?? "pt-BR");
  const translated = locale.startsWith("en")
    ? message
    : (messages[message]?.[locale.startsWith("es") ? 1 : 0] ?? message);
  throw Object.assign(new Error(translated), { code });
}

export function textItemContract(request) {
  if (request?.configuration?.textItemFormat !== "json") return undefined;
  let fields, links;
  try {
    fields = JSON.parse(request.configuration.textItemFields || '{"prompt":"string"}');
    links = JSON.parse(request.configuration.textItemReferenceInputs || "{}");
    if (
      !fields ||
      !links ||
      Array.isArray(fields) ||
      Array.isArray(links) ||
      typeof fields !== "object" ||
      typeof links !== "object"
    )
      throw new Error();
  } catch {
    fail("Invalid JSON text configuration.", request, "INVALID_CONFIGURATION");
  }
  if (
    !Object.keys(fields).length ||
    Object.values(fields).some((type) => !["string", "string[]"].includes(type))
  )
    fail(
      "Invalid JSON text item fields: use string or string[].",
      request,
      "INVALID_CONFIGURATION",
    );
  const sources = Object.create(null);
  for (const [key, port] of Object.entries(links)) {
    if (typeof port !== "string" || fields[key] !== "string[]")
      fail("Reference fields must be string[].", request, "INVALID_CONFIGURATION");
    const delivery = request.inputDeliveries?.find((item) => item.portKey === port);
    if (!delivery?.items?.length)
      fail("Referenced input has no canonical items.", request, "INVALID_INPUT");
    sources[key] = delivery.items.map((item) => ({ id: item.id, value: item.value }));
  }
  return { fields, sources };
}

export function jsonTextInstruction(request) {
  const contract = textItemContract(request);
  return (
    contract &&
    `Return only a JSON array of objects.${request.outputContract?.some((field) => field.portKey === "parts" && field.shape?.cardinality === "one") ? " Return exactly one object for this work item." : ""} Every object must have exactly these fields and types: ${JSON.stringify(contract.fields)}. Reference fields must contain only exact IDs from the corresponding source below; use [] when none applies. Sources: ${JSON.stringify(contract.sources)}.`
  );
}

export function jsonTextValue(result, request) {
  const items = jsonTextValues(result, request);
  if (items.length !== 1) fail("Per-item execution requires exactly one JSON text item.", request);
  return items[0];
}

export function jsonTextValues(result, request) {
  const contract = textItemContract(request);
  let items;
  try {
    items = JSON.parse(result);
  } catch {
    fail("Expected a JSON array of text item objects.", request);
  }
  if (!Array.isArray(items) || !items.length) fail("Expected nonempty JSON text items.", request);
  return items.map((item) => {
    if (
      !item ||
      Array.isArray(item) ||
      typeof item !== "object" ||
      Object.keys(item).length !== Object.keys(contract.fields).length
    )
      fail("Invalid JSON text item fields.", request);
    for (const [key, type] of Object.entries(contract.fields)) {
      const value = item[key];
      if (
        type === "string"
          ? typeof value !== "string" || !value.trim()
          : !Array.isArray(value) ||
            value.some((entry) => typeof entry !== "string" || !entry.trim())
      )
        fail("Invalid JSON text item value.", request);
      if (
        contract.sources[key] &&
        value.some((id) => !contract.sources[key].some((source) => source.id === id))
      )
        fail("JSON text item references an unknown ContentFlow ID.", request);
    }
    return JSON.stringify(item);
  });
}
