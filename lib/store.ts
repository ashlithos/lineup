"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Booking } from "./types";

const KEY = "penciled.bookings.v1";
type Mode = "server" | "local";

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
  const mode = useRef<Mode>("local");

  // Decide backend on mount: try the server (Supabase). If it isn't configured
  // (501) or unreachable, run on localStorage. Migrate local → server once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/bookings");
        if (res.ok) {
          mode.current = "server";
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
              if (!cancelled) setBookings(migrated);
            } else if (!cancelled) {
              setBookings(serverBookings);
            }
          } else if (!cancelled) {
            setBookings(serverBookings);
          }
        } else {
          mode.current = "local";
          if (!cancelled) setBookings(loadLocal());
        }
      } catch {
        mode.current = "local";
        if (!cancelled) setBookings(loadLocal());
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist to localStorage only in local mode.
  useEffect(() => {
    if (ready && mode.current === "local") saveLocal(bookings);
  }, [bookings, ready]);

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

  return { bookings, ready, add, update, remove, replaceAll, refresh };
}
