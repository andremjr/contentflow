import { createFileRoute, Outlet } from "@tanstack/react-router";
export const Route = createFileRoute("/channel/$channelId")({ component: Outlet });
