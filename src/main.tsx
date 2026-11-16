import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Refuels } from "./pages/Refuels";
import { Expenses } from "./pages/Expenses";
import { Vehicles } from "./pages/Vehicles";
import { Settings } from "./pages/Settings";
import { useVehicles } from "./lib/data";
import "./index.css";

function AppRoutes() {
  const { session, loading } = useAuth();
  const { vehicles } = useVehicles();

  if (loading) {
    return <div className="min-h-screen bg-slate-50" />;
  }
  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<Layout vehicles={vehicles} />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tanken" element={<Refuels />} />
        <Route path="/kosten" element={<Expenses />} />
        <Route path="/voertuigen" element={<Vehicles />} />
        <Route path="/instellingen" element={<Settings />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
