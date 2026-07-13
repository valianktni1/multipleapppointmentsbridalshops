import React from "react";
import { Navigate } from "react-router-dom";
import { usePlatformAuth } from "@/context/PlatformAuthContext";

export default function PlatformProtected({ children }) {
  const { user, checking } = usePlatformAuth();
  if (checking || user === null)
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--ivory)" }}>
        <span className="eyebrow">Loading…</span>
      </div>
    );
  if (!user) return <Navigate to="/superadmin" replace />;
  return children;
}
