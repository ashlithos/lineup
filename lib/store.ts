"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Booking } from "./types";

const KEY = "penciled.bookings.v1";
// Remembers that this browser has reached the database before, so a later
// network blip can't quietly demote a server account to a local one.
const SEEN_SERVER = "penciled.server.v1";
type Mode = "server" | "local";
export type LoadState = "loading" | "ready" | "failed";

function loadLocal(): Booking[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Booking[]) : [];
  } catch {
    return [];
  }
}

function saveLocal(bookings: Booking[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(bookings));
  } catch {
    /* ignore */
  }
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type Draft = Omit<Booking, "id" | "createdAt" | "status">;

export function useBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [ready, setReady] = useState(false);
  const [load, setLoad] = useState<LoadState>("loading");
  const mode = useRef<Mode>("local");

  // Decide backend on mount. 501 means "no database configured" and
  // localStorage is the real backend. Anything else that goes wrong means the
  // database exists and didn't answer — and an app that responds to that by
  // showing an empty list is telling the user their bookings are gone. So a
  // failed load stays failed, loudly, and never adopts localStorage.
  const loadBookings = useCallback(async (): Promise<void> => {
    const goLocal = () => {
      mode.current = "local";
      setBookings(loadLocal());
      setLoad("ready");
      setReady(true);
    };

    // Three goes before giving up — most failures here are a database waking
    // up, and the user never needs to know it happened.
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch("/api/bookings", { cache: "no-store" });

        if (res.status === 501) {
          goLocal();
          return;
        }
        if (!res.ok) throw new Error(`bookings responded ${res.status}`);

        mode.current = "server";
        try {
          window.localStorage.setItem(SEEN_SERVER, "1");
        } catch {
          /* private mode — the flag is a convenience, not a requirement */
        }

        const { bookings: serverBookings } = (await res.json()) as {
          bookings: Booking[];
        };
        const local = loadLocal();
        if (serverBookings.length === 0 && local.length > 0) {
          // First connect — push existing local bookings up, then adopt them.
          const up = await fetch("/api/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookings: local }),
          });
          if (up.ok) {
            const { bookings: migrated } = (await up.json()) as {
              bookings: Booking[];
            };
            window.localStorage.removeItem(KEY);
            setBookings(migrated);
          } else {
            setBookings(serverBookings);
          }
        } else {
          setBookings(serverBookings);
        }
        setLoad("ready");
        setReady(true);
        return;
      } catch {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          continue;
        }

        // Out of retries. If this browser has never reached a database, the
        // failure is probably that there isn't one — localStorage is right.
        let seenServer = false;
        try {
          seenServer = window.localStorage.getItem(SEEN_SERVER) === "1";
        } catch {
          /* ignore */
        }
        if (!seenServer && mode.current !== "server") {
          goLocal();
          return;
        }

        // Otherwise: say so. Do not show an empty app, and do not write
        // anything new to localStorage, where it would be stranded.
        mode.current = "server";
        setLoad("failed");
        setReady(true);
        return;
      }
    }
  }, []);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  // Persist to localStorage only in local mode, and never off the back of a
  // failed load — that would overwrite a good local copy with an empty one.
  useEffect(() => {
    if (ready && load === "ready" && mode.current === "local") saveLocal(bookings);
  }, [bookings, ready, load]);

  const add = useCallback(
    async (b: Draft & { status?: Booking["status"] }) => {
      if (mode.current === "server") {
        const res = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ booking: b }),
        });
        if (res.ok) {
          const { bookings: created } = (await res.json()) as {
            bookings: Booking[];
          };
          setBookings((prev) => [...prev, ...created]);
        }
      } else {
        setBookings((prev) => [
          ...prev,
          {
            ...b,
            id: uid(),
            createdAt: new Date().toISOString(),
            status: b.status ?? "upcoming",
          },
        ]);
      }
    },
    [],
  );

  const update = useCallback((id: string, patch: Partial<Booking>) => {
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    if (mode.current === "server") {
      void fetch(`/api/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    }
  }, []);

  const remove = useCallback((id: string) => {
    setBookings((prev) => prev.filter((b) => b.id !== id));
    if (mode.current === "server") {
      void fetch(`/api/bookings/${id}`, { method: "DELETE" });
    }
  }, []);

  // Re-pull from the backend (e.g. after adding a booking elsewhere).
  const refresh = useCallback(async () => {
    if (mode.current === "server") {
      const res = await fetch("/api/bookings", { cache: "no-store" });
      if (res.ok) {
        const { bookings: fresh } = (await res.json()) as { bookings: Booking[] };
        setBookings(fresh);
      }
    } else {
      setBookings(loadLocal());
    }
  }, []);

  // Local-only convenience (sample data / demo clear). No-op risk on server is fine.
  const replaceAll = useCallback((next: Booking[]) => {
    setBookings(next);
  }, []);

  return {
    bookings,
    ready,
    load,
    retry: () => loadBookings(),
    add,
    update,
    remove,
    replaceAll,
    refresh,
  };
}
