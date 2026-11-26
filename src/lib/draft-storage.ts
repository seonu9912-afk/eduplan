/** Short-lived recovery copies, never a source for school calculations or automatic writes. */
export type LocalDraft<T = unknown> = {
  key: string;
  userId: string;
  workspaceId: string;
  baseVersion: number;
  document: T;
  savedAt: number;
  expiresAt: number;
};
let activeOwner: string | null = null;
export function beginDraftSession(userId: string) {
  activeOwner = userId;
  return pruneDrafts(userId);
}
const NAME = "eduplan-recovery-v1",
  STORE = "drafts",
  TTL = 4 * 60 * 60 * 1000;
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore(STORE, { keyPath: "key" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () =>
      reject(Error("이 기기에서 임시 보존을 사용할 수 없습니다."));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode),
        r = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(r.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function writeDraft<T>(
  input: Omit<LocalDraft<T>, "savedAt" | "expiresAt">,
) {
  const savedAt = Date.now();
  await transaction("readwrite", (s) => {
    if (activeOwner !== input.userId)
      throw Error("로그인 계정이 변경되어 임시 보존을 중지했습니다.");
    return s.put({ ...input, savedAt, expiresAt: savedAt + TTL });
  });
}
export async function readDraft<T>(
  key: string,
  userId: string,
): Promise<LocalDraft<T> | null> {
  const d = await transaction<LocalDraft<T> | undefined>("readonly", (s) =>
    s.get(key),
  );
  if (!d) return null;
  if (d.userId !== userId || d.expiresAt <= Date.now()) {
    await removeDraft(key);
    return null;
  }
  return d;
}
export async function removeDraft(key: string) {
  await transaction("readwrite", (s) => s.delete(key));
}
export async function clearDrafts() {
  activeOwner = null;
  await transaction("readwrite", (s) => s.clear());
}
export async function pruneDrafts(userId: string) {
  const entries = await transaction<LocalDraft[]>("readonly", (s) =>
    s.getAll(),
  );
  for (const d of entries)
    if (d.userId !== userId || d.expiresAt <= Date.now())
      await removeDraft(d.key);
}
