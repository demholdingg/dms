import { redirect } from "next/navigation";
import { loginAction } from "@/actions";
import Flash from "@/components/Flash";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return (
    <div className="login card">
      <h1>Masuk</h1>
      <p className="muted-text small">Gunakan username dan password Paperless-ngx Anda.</p>
      <Flash />
      <form action={loginAction}>
        <label>
          Username
          <input type="text" name="username" autoComplete="username" required autoFocus />
        </label>
        <label>
          Password
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        <button className="btn" type="submit">Masuk</button>
      </form>
    </div>
  );
}
