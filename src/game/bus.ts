export const gameBus = new EventTarget();

export function emit<T>(name: string, detail: T): void {
  gameBus.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on<T>(name: string, handler: (detail: T) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<T>).detail);
  gameBus.addEventListener(name, listener);
  return () => gameBus.removeEventListener(name, listener);
}
