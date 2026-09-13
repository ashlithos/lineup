import { NextResponse } from "next/server";
import { googleAccessToken } from "@/lib/google";
import { buildWeek } from "@/lib/freetime";
import { buildSheetGrid, type CellKind, type SheetGrid } from "@/lib/sheetGrid";
import type { Booking } from "@/lib/types";

export const dynamic = "force-dynamic";

// Creates a real Google Sheet from a trip's timetable — days across, hours
// down, blocks merged down their length. Formatting is what makes the grid
// readable, so it's written in the same call that creates the file.

interface Style {
  bg?: [number, number, number]; // 0–1 RGB, as the Sheets API wants it
  fg?: [number, number, number];
  bold?: boolean;
  italic?: boolean;
}

// The app's own palette, so the sheet and the screen agree.
const STYLES: Record<CellKind, Style> = {
  label: { bg: [0.13, 0.14, 0.17], fg: [1, 1, 1], bold: true },
  header: { bg: [0.96, 0.96, 0.97], bold: true },
  event: { bg: [0.43, 0.37, 0.78], fg: [1, 1, 1], bold: true },
  hold: { bg: [0.98, 0.94, 0.86], fg: [0.61, 0.38, 0.04], bold: true },
  meal: { bg: [0.95, 0.94, 1], fg: [0.38, 0.32, 0.67], bold: true },
  travel: { bg: [0.93, 0.94, 0.95] },
  transit: { bg: [0.96, 0.96, 0.97], fg: [0.36, 0.39, 0.44] },
  buffer: { bg: [0.96, 0.96, 0.97], fg: [0.36, 0.39, 0.44] },
  unknown: { bg: [0.96, 0.96, 0.97], italic: true },
  place: { fg: [0.36, 0.39, 0.44] },
  plain: {},
};

// Pinned so the merge ranges below can name the sheet they belong to; without
// it Google assigns a random id and every merge misses.
const SHEET_ID = 0;

const rgb = (c?: [number, number, number]) =>
  c ? { red: c[0], green: c[1], blue: c[2] } : undefined;

function sheetPayload(grid: SheetGrid) {
  const cols = grid.rows[0].length;
  const merges: object[] = [];

  const rowData = grid.rows.map((row, r) => ({
    values: row.map((c, col) => {
      if (!c) return {}; // covered by a merge — leave the cell untouched
      if (c.rowSpan > 1) {
        merges.push({
          sheetId: SHEET_ID,
          startRowIndex: r,
          endRowIndex: r + c.rowSpan,
          startColumnIndex: col,
          endColumnIndex: col + 1,
        });
      }
      const s = STYLES[c.kind];
      return {
        userEnteredValue: { stringValue: c.text },
        userEnteredFormat: {
          backgroundColor: rgb(s.bg),
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
          wrapStrategy: "WRAP",
          textFormat: {
            bold: s.bold ?? false,
            italic: s.italic ?? false,
            foregroundColor: rgb(s.fg),
            fontSize: 10,
          },
        },
      };
    }),
  }));

  return {
    properties: { title: grid.title },
    sheets: [
      {
        properties: {
          sheetId: SHEET_ID,
          title: "Timetable",
          gridProperties: {
            rowCount: Math.max(grid.rows.length + 4, 40),
            columnCount: Math.max(cols + 2, 12),
            frozenRowCount: 2,
            frozenColumnCount: 1,
          },
        },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData,
            columnMetadata: Array.from({ length: cols }, (_, i) => ({
              pixelSize: i === 0 ? 90 : 150,
            })),
            // Tight hour rows: a whole trip should fit on one screen.
            rowMetadata: grid.rows.map((_, r) => ({
              pixelSize:
                r < grid.firstHourRow ||
                r >= grid.firstHourRow + grid.hourCount
                  ? 30
                  : 26,
            })),
          },
        ],
        merges,
      },
    ],
  };
}

export async function POST(req: Request) {
  const body = (await req.json()) as { bookings?: Booking[]; title?: string };
  const bookings = body.bookings ?? [];
  if (!bookings.length) {
    return NextResponse.json({ error: "no-bookings" }, { status: 400 });
  }

  const auth = await googleAccessToken();
  if ("error" in auth) {
    // 400 with the reason: the client offers "Connect Google" rather than failing.
    return NextResponse.json({ error: auth.error }, { status: 400 });
  }

  const days = buildWeek(bookings, { meals: true });
  if (!days.length) {
    return NextResponse.json({ error: "no-days" }, { status: 400 });
  }
  const grid = buildSheetGrid(days, bookings, body.title?.trim() || "Timetable");

  const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sheetPayload(grid)),
  });
  const data = (await res.json()) as {
    spreadsheetUrl?: string;
    error?: { message?: string; status?: string };
  };
  if (!res.ok || !data.spreadsheetUrl) {
    // The Gmail-only connection predates Sheets access — say so plainly, so the
    // client can send them back through consent instead of showing a raw error.
    const insufficient =
      res.status === 403 &&
      /insufficient|scope|permission/i.test(data.error?.message ?? "");
    return NextResponse.json(
      { error: insufficient ? "reconnect" : (data.error?.message ?? "sheets-failed") },
      { status: insufficient ? 400 : 502 },
    );
  }
  return NextResponse.json({ url: data.spreadsheetUrl });
}
