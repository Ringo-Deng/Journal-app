export type StackAction = 'top' | 'bottom' | 'up' | 'down';
export type StackItem = { id: string; stackOrder?: number };

const STACK_MIN = 1;
const STACK_MAX = 19;

function stackValue(item: StackItem) {
  return Number.isFinite(item.stackOrder) ? item.stackOrder! : STACK_MAX;
}

export function stackSequence<T extends StackItem>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index, order: stackValue(item) }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map(({ item }) => item);
}

function distribute<T extends StackItem>(items: T[], low: number, high: number) {
  const ranks = new Map<string, number>();
  if (!items.length) return ranks;
  if (items.length === 1) {
    ranks.set(items[0].id, Math.round((low + high) / 2));
    return ranks;
  }
  items.forEach((item, index) => {
    ranks.set(item.id, Math.round(low + ((high - low) * index) / (items.length - 1)));
  });
  return ranks;
}

export function reorderStack<T extends StackItem>(
  items: T[],
  memberIds: Iterable<string>,
  action: StackAction,
): T[] {
  const ids = new Set(memberIds);
  const current = stackSequence(items);
  const selected = current.filter((item) => ids.has(item.id));
  if (!selected.length || selected.length === items.length) return items;

  const firstSelected = current.findIndex((item) => ids.has(item.id));
  const rest = current.filter((item) => !ids.has(item.id));
  const beforeCount = current
    .slice(0, firstSelected)
    .filter((item) => !ids.has(item.id)).length;
  const insertAt =
    action === 'top'
      ? rest.length
      : action === 'bottom'
        ? 0
        : Math.max(0, Math.min(rest.length, beforeCount + (action === 'up' ? 1 : -1)));
  const desired = [...rest.slice(0, insertAt), ...selected, ...rest.slice(insertAt)];
  if (desired.every((item, index) => item.id === current[index]?.id)) return items;

  const ranks =
    action === 'top'
      ? distribute(rest, STACK_MIN, STACK_MAX - 1)
      : action === 'bottom'
        ? distribute(rest, STACK_MIN + 1, STACK_MAX)
        : distribute(desired, STACK_MIN, STACK_MAX);
  if (action === 'top') selected.forEach((item) => ranks.set(item.id, STACK_MAX));
  if (action === 'bottom') selected.forEach((item) => ranks.set(item.id, STACK_MIN));

  return items.map((item) => ({ ...item, stackOrder: ranks.get(item.id) ?? STACK_MAX }) as T);
}
