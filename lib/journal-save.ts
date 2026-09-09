import type { Book } from './journal';

export class JournalApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'JournalApiError';
    this.status = status;
  }
}

export type JournalState = { books: Book[]; revision: number };
export type SaveResult = { revision: number; historyWarning?: string };

export function shouldShowSaveStatus(status: string): boolean {
  return status.includes('历史备份未完成') || status.startsWith('保存失败') || status.startsWith('保存冲突');
}

/** Reconcile an uncertain response without overwriting another window's work. */
export async function saveJournalSnapshot(
  snapshot: JournalState,
  transport: { write: (snapshot: JournalState) => Promise<SaveResult>; read: () => Promise<JournalState> },
): Promise<SaveResult> {
  try {
    return await transport.write(snapshot);
  } catch (error) {
    if (error instanceof JournalApiError && error.status !== 409 && error.status < 500) throw error;
    let current: JournalState;
    try { current = await transport.read(); } catch { throw error; }
    if (JSON.stringify(current.books) === JSON.stringify(snapshot.books)) return { revision: current.revision };
    if (current.revision !== snapshot.revision) {
      throw new JournalApiError('其他窗口更新了手帐。本窗口的内容仍保留，请先处理保存冲突。', 409);
    }
    throw error;
  }
}
