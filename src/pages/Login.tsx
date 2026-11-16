import { FormEvent, useState } from "react";
import { supabase } from "../supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError("Inloggen mislukt: " + err.message);
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="bg-white shadow rounded-lg p-8 w-full max-w-sm space-y-4"
      >
        <h1 className="text-xl font-semibold text-slate-900">🚗 Hermes</h1>
        <p className="text-sm text-slate-500">Inloggen met je account.</p>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Wachtwoord"
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={busy}
          className="w-full bg-slate-900 text-white rounded px-3 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Bezig…" : "Inloggen"}
        </button>
      </form>
    </div>
  );
}
