declare global {
  interface Window {
    shiguangDesktop?: { onBeforeClose(callback: () => Promise<void>): () => void };
  }
}

/** Drain the existing save owner; never create a second persistence path. */
export async function prepareDesktopClose({ flush, isWriting, hasPending, isBlocked, timeout = 15000 }: {
  flush: () => Promise<void>; isWriting: () => boolean; hasPending: () => boolean;
  isBlocked: () => boolean; timeout?: number;
}) {
  const deadline = Date.now() + timeout;
  while (isWriting() && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (isWriting() || isBlocked()) throw Error('手帐尚未保存');
  await flush();
  if (isWriting() || hasPending() || isBlocked()) throw Error('手帐尚未保存');
}
