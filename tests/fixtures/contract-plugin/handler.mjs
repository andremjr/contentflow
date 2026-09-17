export async function execute(_request, services) {
  await services.publishPartial({
    values: { result: "resultado parcial" },
    progress: 0.5,
    message: "Primeira resposta capturada.",
  });
  await new Promise((resolve) => setTimeout(resolve, 3000));
  return { status: "success", values: { result: "resultado final" } };
}
