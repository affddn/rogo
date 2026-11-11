import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { migrate, newId } from "./characters";
import type { Profile } from "@rogo/game/profile";

const KEY = "rgo-guide.characters.v2";

interface Store {
  characters: Profile[];
  activeId: string | null;
}

function read(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Store | null;
    if (s) {
      const characters = (s.characters ?? []).map(migrate).filter((p): p is Profile => !!p);
      const activeId = characters.some((c) => c.id === s.activeId)
        ? s.activeId
        : (characters[0]?.id ?? null);
      return { characters, activeId };
    }
  } catch {
    // storage blocked or corrupt: start empty
  }
  return { characters: [], activeId: null };
}

interface Ctx {
  /** the active character; null until the player adds one */
  profile: Profile | null;
  characters: Profile[];
  /** save edits to the active character */
  setProfile: (p: Profile) => void;
  select: (id: string) => void;
  /** add a character (a fresh id if it clashes) and switch to it */
  add: (p: Profile) => Profile;
  remove: (id: string) => void;
}

const ProfileContext = createContext<Ctx | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(read);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      // private window or blocked storage: characters just won't persist
    }
  }, [store]);

  const value = useMemo<Ctx>(() => {
    const active = store.characters.find((c) => c.id === store.activeId) ?? null;
    return {
      profile: active,
      characters: store.characters,
      setProfile: (p) =>
        setStore((s) => ({
          ...s,
          characters: s.characters.map((c) => (c.id === s.activeId ? { ...p, id: c.id } : c)),
        })),
      select: (id) => setStore((s) => ({ ...s, activeId: id })),
      add: (p) => {
        const added = store.characters.some((c) => c.id === p.id) ? { ...p, id: newId() } : p;
        setStore((s) => ({ characters: [...s.characters, added], activeId: added.id }));
        return added;
      },
      remove: (id) =>
        setStore((s) => {
          const characters = s.characters.filter((c) => c.id !== id);
          return {
            characters,
            activeId: s.activeId === id ? (characters[0]?.id ?? null) : s.activeId,
          };
        }),
    };
  }, [store]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): Ctx {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile needs ProfileProvider");
  return ctx;
}

/** The active character, for components that only render once one exists (see RequireCharacter). */
export function useCharacter(): Profile {
  const { profile } = useProfile();
  if (!profile)
    throw new Error("useCharacter needs a character; wrap the page in RequireCharacter");
  return profile;
}
