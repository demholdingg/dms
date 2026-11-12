import DocSearch from "@/components/DocSearch";
import { requireAdmin } from "@/lib/session";

export default async function AdminDocumentsPage() {
  await requireAdmin();

  return (
    <>
      <h1>Akses dokumen sebagai admin</h1>
      <p className="muted-text">
        Admin dapat membuka atau mengunduh dokumen tanpa mengajukan approval. Akses melalui tombol di bawah tetap dicatat di riwayat audit.
      </p>
      <div className="card" style={{ maxWidth: 640 }}>
        <DocSearch directAccess />
      </div>
    </>
  );
}
