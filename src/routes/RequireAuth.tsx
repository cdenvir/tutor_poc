import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getUser } from "../auth";

export default function RequireAuth({ children }: { children: React.ReactElement }) {
  const user = getUser();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}