// Minimal external store used with useSyncExternalStore to decouple frequent updates
export type Unsubscribe = () => void;

class SimpleStore<T> {
  private value: T;
  private listeners = new Set<() => void>();

  constructor(initial: T) {
    this.value = initial;
  }

  getSnapshot = (): T => this.value;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  set = (next: T) => {
    if (Object.is(next, this.value)) return;
    this.value = next;
    this.listeners.forEach((l) => l());
  };
}

export const isPlayingStore = new SimpleStore<boolean>(false);
export const volumeStore = new SimpleStore<number>(0.5);
export const currentTimeStore = new SimpleStore<number>(0);
export const durationStore = new SimpleStore<number>(0);
