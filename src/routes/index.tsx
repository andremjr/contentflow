import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Blank Page" },
      { name: "description", content: "A blank page ready for your content." },
      { property: "og:title", content: "Blank Page" },
      { property: "og:description", content: "A blank page ready for your content." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background" aria-label="Blank page" />
  );
}
