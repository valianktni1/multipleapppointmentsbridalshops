import React from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function Protected({ children }) {
  const { user, checking } = useAuth();
  const { tenant } = useParams();
  if (checking || user === null)
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--ivory)" }}>
        <span className="eyebrow">Loading…</span>
      </div>
    );
  if (!user) return <Navigate to={`/${tenant}/admin/login`} replace />;
  return children;
}
