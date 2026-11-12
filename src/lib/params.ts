export type SP = Promise<Record<string, string | string[] | undefined>>;

/** Ambil nilai pertama dari parameter query sebagai string. */
export const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";
