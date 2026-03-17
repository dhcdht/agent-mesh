import type { Message, Task } from "@agent-mesh/shared";

export type EventType = "task.created" | "task.updated" | "message.created";

export interface MeshEvent {
  type: EventType;
  meshId: string;
  task?: Task;
  message?: Message;
}

export type EventSubscriber = (event: MeshEvent) => void;

export class EventBus {
  private readonly subscribers = new Map<string, Set<EventSubscriber>>();

  subscribe(meshId: string, fn: EventSubscriber): () => void {
    let set = this.subscribers.get(meshId);
    if (!set) {
      set = new Set();
      this.subscribers.set(meshId, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
      if (set?.size === 0) {
        this.subscribers.delete(meshId);
      }
    };
  }

  emit(event: MeshEvent): void {
    const set = this.subscribers.get(event.meshId);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(event);
      } catch (e) {
        console.error("[EventBus] subscriber error:", e);
      }
    }
  }
}
