import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="card">
      <h1>Akses ditolak</h1>
      <p>Anda tidak memiliki izin untuk mengakses halaman ini.</p>
      <Link className="btn" href="/">Kembali ke beranda</Link>
    </div>
  );
}
