export async function execute(request, services) {
  const content = request.inputs.content;

  if (typeof content !== "string") {
    return {
      status: "error",
      code: "INVALID_INPUT",
      message: "A entrada content precisa ser texto.",
      retryable: false,
    };
  }

  if (services?.signal?.aborted) {
    return {
      status: "error",
      code: "CANCELLED",
      message: "A execução foi cancelada.",
      retryable: false,
    };
  }

  return {
    status: "success",
    values: {
      result: content.trim(),
    },
  };
}
