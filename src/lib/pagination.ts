/** Supabase returns at most 1,000 rows per request by default. Never truncate plans. */
export async function readAllRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<{ data: T[] | null; error: unknown }> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    if (page.error) return { data: null, error: page.error };
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < pageSize) return { data: rows, error: null };
  }
}
