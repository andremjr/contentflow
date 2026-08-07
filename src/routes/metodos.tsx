import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/metodos")({
  beforeLoad: () => {
    throw redirect({ to: "/methods" });
  },
});
