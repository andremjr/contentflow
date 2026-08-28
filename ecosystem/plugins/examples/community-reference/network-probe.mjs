export async function execute(request) {
  try {
    await fetch(request.configuration.url);
    return { status: "success", values: { result: "NETWORK_ALLOWED" } };
  } catch (error) {
    const code = error?.cause?.code ?? error?.code ?? error?.name ?? "UNKNOWN";
    return {
      status: "success",
      values: { result: `${String(code)}:${String(error?.message ?? error)}` },
    };
  }
}
