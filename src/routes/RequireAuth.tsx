import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getUser } from "../auth";

type RequireAuthProps = {
  children: React.ReactElement;
  teacherOnly?: boolean;
};

export default function RequireAuth({ children, teacherOnly = false }: RequireAuthProps) {
  const user = getUser();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (teacherOnly && !user.teacher) {
    return <Navigate to="/books" replace />;
  }

  return children;
}