/**
 * Armazenamento chave → string sobre o localStorage, com queda para memória
 * quando ele não existe ou lança exceção (aba anônima com cota zero,
 * storage desabilitado, Safari em modo privado antigo...). Nunca lança.
 * Não interpreta o conteúdo: o parse fica em logic/save-data.ts.
 */

export interface KeyValueStore {
  get(key: string): string | null;
  /** false se não deu para gravar (o dado fica só em memória nesta sessão). */
  set(key: string, value: string): boolean;
  remove(key: string): void;
  /** true se está gravando de verdade no navegador. */
  readonly persistent: boolean;
}

export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key) ?? null,
    set(key, value) {
      map.set(key, value);
      return true;
    },
    remove(key) {
      map.delete(key);
    },
    persistent: false,
  };
}

export function createStore(): KeyValueStore {
  let ls: Storage | null = null;
  try {
    ls = window.localStorage;
    const probe = '__web-swing-probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
  } catch {
    ls = null;
  }
  if (!ls) return createMemoryStore();
  const storage = ls;
  const fallback = createMemoryStore();
  return {
    get(key) {
      try {
        return storage.getItem(key) ?? fallback.get(key);
      } catch {
        return fallback.get(key);
      }
    },
    set(key, value) {
      try {
        storage.setItem(key, value);
        return true;
      } catch {
        fallback.set(key, value);
        return false;
      }
    },
    remove(key) {
      try {
        storage.removeItem(key);
      } catch {
        // sem storage: só a memória
      }
      fallback.remove(key);
    },
    persistent: true,
  };
}
