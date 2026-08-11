export async function execute(request) {
  const value = request.inputs["content"];
  if (typeof value !== "string") {
    return {
      status: "error",
      code: "INVALID_INPUT",
      message: "content precisa ser texto.",
      retryable: false,
    };
  }
  return { status: "success", values: { result: value.trim().toUpperCase() } };
}
