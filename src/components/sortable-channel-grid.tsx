import { Link } from "@tanstack/react-router";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, GripVertical, MoreHorizontal, UsersRound } from "lucide-react";
import { ChannelAvatar } from "@/components/channel-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toggleChannelPrivacy } from "@/lib/channel-privacy";
import type { Channel } from "@/lib/domain";
import { removeChannel, reorderChannels } from "@/lib/store";
import { cn } from "@/lib/utils";

type InsertionSide = "before" | "after";

export function SortableChannelGrid({
  channels,
  hiddenChannelIds,
}: {
  channels: Channel[];
  hiddenChannelIds: Set<string>;
}) {
  const [activeId, setActiveId] = useState<string>();
  const channelIds = channels.map((channel) => channel.id);
  const activeChannel = channels.find((channel) => channel.id === activeId);
  const activeIndex = activeId ? channelIds.indexOf(activeId) : -1;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const clearDrag = () => {
    setActiveId(undefined);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.id);
    setActiveId(id);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) {
      const oldIndex = channelIds.indexOf(String(active.id));
      const newIndex = channelIds.indexOf(String(over.id));
      if (oldIndex >= 0 && newIndex >= 0) {
        reorderChannels(arrayMove(channelIds, oldIndex, newIndex));
      }
    }
    clearDrag();
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={clearDrag}
    >
      <SortableContext items={channelIds} strategy={rectSortingStrategy}>
        <div
          className={cn(
            "grid gap-4 md:grid-cols-2 xl:grid-cols-4",
            activeId && "!cursor-grabbing [&_*]:!cursor-grabbing",
          )}
        >
          {channels.map((channel, index) => (
            <SortableChannelCard
              key={channel.id}
              channel={channel}
              isHidden={hiddenChannelIds.has(channel.id)}
              index={index}
              activeIndex={activeIndex}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay
        adjustScale={false}
        dropAnimation={{ duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}
      >
        {activeChannel ? (
          <ChannelDragPreview
            channel={activeChannel}
            isHidden={hiddenChannelIds.has(activeChannel.id)}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableChannelCard({
  channel,
  isHidden,
  index,
  activeIndex,
}: {
  channel: Channel;
  isHidden: boolean;
  index: number;
  activeIndex: number;
}) {
  const {
    attributes,
    listeners,
    isDragging,
    isOver,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: channel.id,
    transition: { duration: 280, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
  });
  const insertionSide: InsertionSide | undefined =
    isOver && activeIndex >= 0 && activeIndex !== index
      ? activeIndex < index
        ? "after"
        : "before"
      : undefined;

  return (
    <div
      ref={setNodeRef}
      className="relative min-w-0"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      {insertionSide && !isDragging && (
        <span
          className={cn(
            "pointer-events-none absolute -top-1 -bottom-1 z-40 w-[3px] rounded-full bg-blue-400 shadow-[0_0_14px_rgb(96_165_250/0.9)]",
            insertionSide === "before" ? "-left-[10px]" : "-right-[10px]",
          )}
        >
          <span className="absolute -left-[5px] top-1/2 size-[13px] -translate-y-1/2 rounded-full border-[3px] border-background bg-blue-400" />
        </span>
      )}

      <article
        className={cn(
          "group relative overflow-hidden rounded-2xl border border-border/70 bg-card transition-[border-color,box-shadow,opacity] duration-200 hover:border-brand/50",
          isDragging && "opacity-20",
        )}
      >
        <div
          className="pointer-events-none absolute inset-x-0 -top-px h-px opacity-70"
          style={{
            background: `linear-gradient(90deg, transparent, ${channel.color}, transparent)`,
          }}
        />

        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <ChannelIdentity channel={channel} isHidden={isHidden} />
            <div className="flex shrink-0 items-center gap-1">
              <button
                ref={setActivatorNodeRef}
                type="button"
                className="grid size-7 touch-none cursor-grab place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing [&_svg]:pointer-events-none"
                title="Arraste para reorganizar"
                {...attributes}
                {...listeners}
                aria-label={`Reorganizar ${channel.name}`}
              >
                <GripVertical className="size-4" />
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground"
                aria-label={
                  isHidden ? "Mostrar informações do canal" : "Ocultar informações do canal"
                }
                title={isHidden ? "Mostrar informações do canal" : "Ocultar informações do canal"}
                aria-pressed={isHidden}
                onClick={() => toggleChannelPrivacy(channel.id)}
              >
                {isHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem>Editar canal</DropdownMenuItem>
                  <DropdownMenuItem>Pausar produção</DropdownMenuItem>
                  <DropdownMenuItem>Duplicar</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => removeChannel(channel.id)}
                  >
                    Remover
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <Link
          to="/channel/$channelId"
          params={{ channelId: channel.id }}
          className="flex items-center justify-between border-t border-border/50 bg-background/30 px-5 py-3 text-xs text-brand-soft transition hover:bg-brand/10"
        >
          <span>Abrir canal</span>
          <ArrowRight className="size-4" />
        </Link>
      </article>
    </div>
  );
}

function ChannelIdentity({ channel, isHidden }: { channel: Channel; isHidden: boolean }) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 transition duration-200",
        isHidden && "pointer-events-none select-none blur-md",
      )}
      aria-hidden={isHidden}
    >
      <ChannelAvatar channel={channel} size="lg" className="!size-12" />
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold">{channel.name}</h3>
        <p className="truncate text-xs text-muted-foreground">{channel.handle}</p>
        <div className="mt-1 flex flex-col items-start gap-0.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <UsersRound className="size-3" />
            {channel.subscribers || "0 inscritos"}
          </span>
          <span className="whitespace-nowrap">{channel.language}</span>
          {channel.niche && <span className="truncate">{channel.niche}</span>}
        </div>
      </div>
    </div>
  );
}

function ChannelDragPreview({ channel, isHidden }: { channel: Channel; isHidden: boolean }) {
  return (
    <div className="pointer-events-none w-full overflow-hidden rounded-2xl border border-brand/70 bg-card shadow-2xl shadow-black/40 ring-1 ring-brand/25">
      <div className="p-5">
        <ChannelIdentity channel={channel} isHidden={isHidden} />
      </div>
      <div className="flex items-center justify-between border-t border-border/50 bg-background/30 px-5 py-3 text-xs text-brand-soft">
        <span>Solte para posicionar</span>
        <GripVertical className="size-4" />
      </div>
    </div>
  );
}
