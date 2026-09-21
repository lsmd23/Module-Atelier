import type { LocalDraft } from "./recovery";

/**
 * IndexedDB 本地草稿库。
 * 仅作恢复机制：服务端 revision 才是正式事实。
 */

const DB_NAME = "module-atelier-drafts";
const STORE = "drafts";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "documentId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
        t.onerror = () => reject(t.error);
      })
  );
}

export async function saveDraft(draft: LocalDraft): Promise<void> {
  await tx("readwrite", (s) => s.put(draft));
}

export async function loadDraft(documentId: string): Promise<LocalDraft | null> {
  const result = await tx("readonly", (s) => s.get(documentId));
  return (result as LocalDraft | undefined) ?? null;
}

export async function deleteDraft(documentId: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(documentId));
}

/** 设置中心「本地数据」用：列出全部本地草稿。 */
export async function listDrafts(): Promise<LocalDraft[]> {
  const result = await tx("readonly", (s) => s.getAll() as IDBRequest<LocalDraft[]>);
  return result ?? [];
}
