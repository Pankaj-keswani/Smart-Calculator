// In-memory stand-in for @react-native-async-storage/async-storage (nothing is persisted on the website).
const mem = new Map<string, string>();
const AsyncStorage = {
  getItem: async (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
  setItem: async (k: string, v: string) => { mem.set(k, v); },
  removeItem: async (k: string) => { mem.delete(k); },
  multiRemove: async (ks: string[]) => { ks.forEach((k) => mem.delete(k)); },
  clear: async () => { mem.clear(); },
  getAllKeys: async () => [...mem.keys()],
};
export default AsyncStorage;
