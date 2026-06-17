import { memo } from "react";
import { Text, View } from "react-native";
import { LegendList } from "@legendapp/list/react-native";
import { assertNeverEvent, type TimelineEvent } from "@litter/shared";
import { cn } from "@/ui";

/** One virtualized timeline for a session — every event type, recycled rows. */
export const Timeline = memo(function Timeline({
  events,
  footer,
}: {
  events: TimelineEvent[];
  footer?: React.ReactElement;
}) {
  return (
    <LegendList
      data={events}
      keyExtractor={(e) => e.id}
      renderItem={({ item }) => <Row event={item} />}
      estimatedItemSize={72}
      recycleItems
      maintainVisibleContentPosition
      alignItemsAtEnd
      ListFooterComponent={footer}
      contentContainerStyle={{ padding: 12, gap: 8 }}
    />
  );
});

const Row = memo(function Row({ event }: { event: TimelineEvent }) {
  switch (event.type) {
    case "user_message":
      return <Bubble role="user" text={event.text} />;
    case "assistant_message":
      return <Bubble role="assistant" text={event.text} streaming={event.streaming} />;
    case "thinking_started":
      return <Meta text="Thinking…" />;
    case "thinking_finished":
      return <Meta text={event.text ? `💭 ${event.text}` : "Thought"} />;
    case "tool_call":
      return <ToolCard name={event.call.name} status={event.call.status} input={event.call.input} />;
    case "tool_result":
      return <ToolResult content={event.result.content} isError={event.result.isError} />;
    case "task_created":
    case "task_started":
    case "task_progress":
    case "task_completed":
    case "task_failed":
      return <Meta text={`Task ${event.state}`} />;
    case "git_event":
      return <Meta text={`git: ${event.summary}`} />;
    case "terminal_event":
      return <Term data={event.data} stream={event.stream} />;
    case "system_event":
      return <Meta text={event.message} level={event.level} />;
    default:
      return assertNeverEvent(event);
  }
});

function Bubble({
  role,
  text,
  streaming,
}: {
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
}) {
  const user = role === "user";
  return (
    <View className={cn("flex-row", user ? "justify-end" : "justify-start")}>
      <View
        className={cn(
          "max-w-[86%] rounded-2xl px-3 py-2",
          user ? "bg-accent" : "border border-border bg-surface",
        )}
      >
        <Text className={cn("text-[15px] leading-[21px]", user ? "text-white" : "text-fg")}>
          {text}
          {streaming ? <Text className="text-accent"> ▋</Text> : null}
        </Text>
      </View>
    </View>
  );
}

function previewInput(input: unknown): string {
  if (!input) return "";
  if (typeof input === "object") {
    const o = input as Record<string, unknown>;
    if (typeof o.command === "string") return o.command;
    if (typeof o.file_path === "string") return o.file_path;
    if (typeof o.query === "string") return o.query;
  }
  return typeof input === "string" ? input : "";
}

function ToolCard({ name, status, input }: { name: string; status: string; input?: unknown }) {
  const ok = status === "success";
  return (
    <View className="rounded-xl bg-surface-alt px-3 py-2">
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-[13px] text-fg">⚙ {name}</Text>
        <Text className={cn("text-[11px]", ok ? "text-success" : status === "error" ? "text-danger" : "text-fg-muted")}>
          {status}
        </Text>
      </View>
      {previewInput(input) ? (
        <Text numberOfLines={2} className="mt-1 font-mono text-[11px] text-fg-muted">
          {previewInput(input)}
        </Text>
      ) : null}
    </View>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ToolResult({ content, isError }: { content: any; isError: boolean }) {
  if (content?.kind === "diff") {
    return (
      <View className="overflow-hidden rounded-xl border border-border bg-[#0d0d12]">
        <Text className="border-b border-border px-3 py-1 font-mono text-[11px] text-fg-muted">{content.path || "diff"}</Text>
        <Text numberOfLines={14} className="px-3 py-2 font-mono text-[11px] text-fg-muted">{content.patch}</Text>
      </View>
    );
  }
  const text = content?.kind === "text" ? content.text : content?.kind === "json" ? JSON.stringify(content.value) : "";
  if (!text) return null;
  return (
    <View className={cn("rounded-xl bg-[#0d0d12] px-3 py-2", isError && "border border-danger/40")}>
      <Text numberOfLines={12} className="font-mono text-[12px] text-[#cdd0d6]">{text}</Text>
    </View>
  );
}

function Term({ data, stream }: { data: string; stream: string }) {
  return (
    <View className="rounded-xl bg-black p-2">
      <Text numberOfLines={20} className={cn("font-mono text-[12px]", stream === "stderr" ? "text-danger" : "text-[#d6d6d6]")}>
        {data}
      </Text>
    </View>
  );
}

function Meta({ text, level }: { text: string; level?: "info" | "warning" | "error" }) {
  return (
    <Text className={cn("py-0.5 text-center text-[11px]", level === "error" ? "text-danger" : "text-fg-faint")}>
      {text}
    </Text>
  );
}
