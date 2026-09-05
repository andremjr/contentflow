import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
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
import { NewChannelDialog } from "@/components/new-channel-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type InsertionSide = "before" | "after";

export function SortableChannelGrid({
  channels,
  hiddenChannelIds,
}: {
  channels: Channel[];
  hiddenChannelIds: Set<string>;
}) {
  const [activeId, setActiveId] = useState<string>();
  const [editingChannel, setEditingChannel] = useState<Channel>();
  const [removingChannel, setRemovingChannel] = useState<Channel>();
  const [removalConfirmation, setRemovalConfirmation] = useState("");
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
        void reorderChannels(arrayMove(channelIds, oldIndex, newIndex)).catch((error) =>
          toast.error(error.message),
        );
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
            "grid gap-3 md:grid-cols-2 xl:grid-cols-3",
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
              onEdit={setEditingChannel}
              onRemove={setRemovingChannel}
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

      <NewChannelDialog
        channel={editingChannel}
        open={Boolean(editingChannel)}
        onOpenChange={(open) => !open && setEditingChannel(undefined)}
        trigger={null}
      />

      <Dialog
        open={Boolean(removingChannel)}
        onOpenChange={(open) => {
          if (!open) {
            setRemovingChannel(undefined);
            setRemovalConfirmation("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover canal?</DialogTitle>
            <DialogDescription>
              Esta ação excluirá permanentemente o canal, seus projetos, métodos e itens da
              biblioteca.
            </DialogDescription>
          </DialogHeader>
          {removingChannel && (
            <div className="space-y-2">
              <Label htmlFor="remove-channel-confirmation">
                Digite o nome do canal abaixo para confirmar:
              </Label>
              <p className="rounded-md bg-muted px-3 py-2 text-sm font-medium">
                {removingChannel.name}
              </p>
              <Input
                id="remove-channel-confirmation"
                value={removalConfirmation}
                onChange={(event) => setRemovalConfirmation(event.target.value)}
                placeholder={removingChannel.name}
                autoFocus
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemovingChannel(undefined)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={removalConfirmation !== removingChannel?.name}
              onClick={async () => {
                try {
                  if (removingChannel) await removeChannel(removingChannel.id);
                  setRemovingChannel(undefined);
                  setRemovalConfirmation("");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Não foi possível remover.");
                }
              }}
            >
              Remover canal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}

function SortableChannelCard({
  channel,
  isHidden,
  index,
  activeIndex,
  onEdit,
  onRemove,
}: {
  channel: Channel;
  isHidden: boolean;
  index: number;
  activeIndex: number;
  onEdit: (channel: Channel) => void;
  onRemove: (channel: Channel) => void;
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
            "pointer-events-none absolute -top-px -bottom-px z-40 w-0.5 bg-brand",
            insertionSide === "before" ? "-left-[10px]" : "-right-[10px]",
          )}
        >
          <span className="absolute -left-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-brand" />
        </span>
      )}

      <article
        className={cn(
          "group relative flex min-h-48 flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors duration-150 hover:border-foreground/20 hover:bg-surface-1",
          isDragging && "opacity-20",
        )}
      >
        <div className="min-w-0 flex-1 p-5">
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
                  <DropdownMenuItem onSelect={() => onEdit(channel)}>Editar canal</DropdownMenuItem>
                  <DropdownMenuItem>Pausar produção</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onSelect={() => onRemove(channel)}>
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
          className="flex min-h-11 w-full shrink-0 items-center justify-between gap-2 border-t border-border px-5 text-xs font-semibold text-muted-foreground transition hover:bg-brand hover:text-white"
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
        "flex min-w-0 items-center gap-4 transition duration-200",
        isHidden && "pointer-events-none select-none blur-md",
      )}
      aria-hidden={isHidden}
    >
      <ChannelAvatar channel={channel} size="lg" className="!size-12" />
      <div className="min-w-0 flex-1">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{channel.name}</h3>
          <p className="truncate text-xs text-muted-foreground">{channel.handle}</p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
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
    <div className="pointer-events-none w-full overflow-hidden rounded-md border border-brand bg-card">
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
