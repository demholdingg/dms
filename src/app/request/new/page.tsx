import { createRequestAction } from "@/actions";
import DocSearch from "@/components/DocSearch";
import Flash from "@/components/Flash";
import { one, type SP } from "@/lib/params";
import { requireSession } from "@/lib/session";

export default async function NewRequest({ searchParams }: { searchParams: SP }) {
  await requireSession();
  const sp = await searchParams;
  const doc = one(sp.doc);
  return (
    <>
      <h1>Ajukan akses dokumen</h1>
      <Flash />
      <form action={createRequestAction} className="card" style={{ maxWidth: 640 }}>
        <DocSearch initialId={/^\d+$/.test(doc) ? doc : undefined} />
        <label>
          Alasan permintaan (minimal 10 karakter)
          <textarea name="reason" rows={4} required minLength={10} maxLength={1000} />
        </label>
        <label>
          Lama akses
          <select name="days" defaultValue="7">
            <option value="1">1 hari</option>
            <option value="3">3 hari</option>
            <option value="7">7 hari</option>
            <option value="14">14 hari</option>
            <option value="30">30 hari</option>
            <option value="90">90 hari</option>
            <option value="permanent">Permanen (jika kebijakan mengizinkan)</option>
          </select>
        </label>
        <button className="btn" type="submit">Ajukan</button>
        <p className="muted-text small">
          Permintaan akan diteruskan ke approver sesuai kebijakan dokumen. Akses hanya diberikan setelah semua level menyetujui.
        </p>
      </form>
    </>
  );
}
