import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { Vehicle } from "../types";

const navItems = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/tanken", label: "Tanken & laden", end: false },
  { to: "/kosten", label: "Kosten", end: false },
  { to: "/voertuigen", label: "Voertuigen", end: false },
  { to: "/instellingen", label: "Instellingen", end: false },
];

export function Layout({ vehicles }: { vehicles: Vehicle[] }) {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            🚗 Hermes
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-300 hidden sm:inline">
              {vehicles.filter((v) => v.active).length} actief ·{" "}
              {vehicles.length} totaal
            </span>
            <button
              onClick={async () => {
                await signOut();
                navigate("/login");
              }}
              className="text-sm bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded"
            >
              Uitloggen
            </button>
          </div>
        </div>
        <nav className="mx-auto max-w-5xl px-4 pb-2 flex gap-1 overflow-x-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-sm whitespace-nowrap ${
                  isActive ? "bg-white text-slate-900 font-medium" : "text-slate-300 hover:bg-slate-800"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-5xl px-4 py-8 text-xs text-slate-400 flex justify-between flex-wrap gap-2">
        <span>Ingelogd als {session?.user?.email}</span>
        <span title="Versie uit package.json (nieuwe deploy = nieuwe versie na cache-purge)">
          Hermes v{__APP_VERSION__}
        </span>
      </footer>
    </div>
  );
}
