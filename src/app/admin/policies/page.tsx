import { deletePolicyAction, savePolicyAction, togglePolicyAction } from "@/actions";
import ConfirmButton from "@/components/ConfirmButton";
import Flash from "@/components/Flash";
import { one, type SP } from "@/lib/params";
import { listTags } from "@/lib/paperless";
import { requireAdmin } from "@/lib/session";
import { getPolicy, listPolicies } from "@/lib/workflow";

export default async function Policies({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const policies = listPolicies();
  const tags = await listTags().catch(() => []);
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const editId = Number(one(sp.edit)) || 0;
  const edit = editId ? getPolicy(editId) : null;
  const stepsText = edit ? edit.steps.map((s) => `${s.label ?? ""}${s.label ? ": " : ""}${s.approvers.join(", ")}`).join("\n") : "";

  return (
    <>
      <h1>Kebijakan approval</h1>
      <Flash />
      <p className="muted-text">
        Kebijakan dipilih berdasarkan tag dokumen (prioritas angka terkecil menang). Kebijakan tanpa tag menjadi bawaan untuk dokumen yang tidak cocok dengan tag mana pun.
      </p>

      <div className="tbl">
        <table>
          <thead>
            <tr><th>Nama</th><th>Tag</th><th>Prioritas</th><th>Jenjang</th><th>Durasi</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.match_tag_id === null ? "Bawaan" : (tagName.get(p.match_tag_id) ?? `#${p.match_tag_id}`)}</td>
                <td>{p.priority}</td>
                <td>
                  {p.steps.map((s) => (
                    <div key={s.level}>
                      {s.level}. {s.label ? `${s.label}: ` : ""}{s.approvers.join(", ")}
                    </div>
                  ))}
                </td>
                <td>bawaan {p.default_days} hr · maks {p.max_days ?? "tanpa batas"}</td>
                <td>{p.active ? <span className="badge ok">Aktif</span> : <span className="badge muted">Nonaktif</span>}</td>
                <td>
                  <div className="row">
                    <a href={`/admin/policies?edit=${p.id}`}>Ubah</a>
                    <form action={togglePolicyAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="active" value={p.active ? "0" : "1"} />
                      <button className="link">{p.active ? "Nonaktifkan" : "Aktifkan"}</button>
                    </form>
                    <form action={deletePolicyAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <ConfirmButton className="link" message={`Hapus kebijakan "${p.name}"?`}>Hapus</ConfirmButton>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {policies.length === 0 && (
              <tr><td colSpan={7} className="muted-text">Belum ada kebijakan. Tanpa kebijakan, tidak ada permintaan yang bisa diajukan.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>{edit ? `Ubah kebijakan: ${edit.name}` : "Tambah kebijakan"}</h2>
      <form action={savePolicyAction} className="card" style={{ maxWidth: 680 }} key={edit?.id ?? "new"}>
        {edit && <input type="hidden" name="id" value={edit.id} />}
        <label>
          Nama
          <input type="text" name="name" required maxLength={80} defaultValue={edit?.name ?? ""} />
        </label>
        <div className="row">
          <label>
            Berlaku untuk tag
            <select name="tag" defaultValue={edit?.match_tag_id ?? ""}>
              <option value="">(Bawaan: semua dokumen lain)</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label>
            Prioritas
            <input type="number" name="priority" min={0} defaultValue={edit?.priority ?? 100} />
          </label>
          <label>
            Durasi bawaan (hari)
            <input type="number" name="default_days" min={1} defaultValue={edit?.default_days ?? 7} />
          </label>
          <label>
            Durasi maksimum (hari, kosong = tanpa batas)
            <input type="number" name="max_days" min={1} defaultValue={edit?.max_days ?? ""} />
          </label>
        </div>
        <label>
          Jenjang (satu baris per level, urut dari level 1). Format: <code>Label: user1, user2</code> atau cukup <code>user1, user2</code>. Salah satu approver di tiap level cukup untuk menyetujui.
          <textarea name="steps" rows={5} required defaultValue={stepsText} placeholder={"Atasan: budi\nDirektur: sari, andi"} />
        </label>
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={edit ? !!edit.active : true} /> Aktif
        </label>
        <div className="row">
          <button className="btn" type="submit">Simpan</button>
          {edit && <a className="btn secondary" href="/admin/policies">Batal</a>}
        </div>
      </form>
    </>
  );
}
