const listeners = new Map<string, Set<() => void>>();

export function emitTabScrollToTop(tabName: string) {
  listeners.get(tabName)?.forEach((listener) => listener());
}

export function addTabScrollToTopListener(tabName: string, listener: () => void) {
  const tabListeners = listeners.get(tabName) ?? new Set<() => void>();
  tabListeners.add(listener);
  listeners.set(tabName, tabListeners);

  return () => {
    tabListeners.delete(listener);
    if (tabListeners.size === 0) listeners.delete(tabName);
  };
}
