type PageResult<T> = { data: T[] | null; error: { message: string } | null }

const PAGE_SIZE = 1000

/**
 * Supabase(PostgREST)は1リクエストで最大1000行しか返さず、超過分は黙って切り捨てられる。
 * 全件が前提の集計・ランキング系クエリは必ずこれで range ページングして取得する。
 * page は呼び出しごとに新しいクエリビルダーを作り .range(from, to) を付けて返すこと。
 * ページ間で行が重複・欠落しないよう、クエリには一意に定まる .order() を必ず指定する
 * （複合PKのテーブルは PK の全列を order に指定する）。
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`fetchAllRows: ${error.message}`)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE_SIZE) return all
  }
}
