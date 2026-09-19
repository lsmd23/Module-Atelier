/** Shared pagination shapes for list endpoints. Offset + limit, no cursors yet. */

export type PageRequest = { limit: number; offset: number };

export type Page<TItem> = {
  items: TItem[];
  limit: number;
  offset: number;
  hasMore: boolean;
};

/**
 * Builds a page from a query that fetched `limit + 1` rows, so `hasMore` is
 * known without a second counting query.
 */
export function pageFromRows<TRow, TItem>(
  rows: TRow[],
  page: PageRequest,
  map: (row: TRow) => TItem
): Page<TItem> {
  const hasMore = rows.length > page.limit;
  const visible = hasMore ? rows.slice(0, page.limit) : rows;
  return { items: visible.map(map), limit: page.limit, offset: page.offset, hasMore };
}

/** Guards against a write that reported success but returned no row. */
export function requireRow<TRow>(rows: TRow[], context: string): TRow {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`${context}: the database returned no row`);
  }
  return row;
}