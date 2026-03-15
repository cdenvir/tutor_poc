import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";

import LoginPage from "./pages/LoginPage";
import MainPage from "./pages/MainPage";
import BookSelectionPage from "./pages/BookSelectionPage";
import RequireAuth from "./routes/RequireAuth";
import AdminBookManagement from "./pages/AdminBookManagement";
import AdminHomePage from "./pages/AdminHomePage";
import AdminUserManagement from "./pages/AdminUserManagement";
import AdminStudentProgress from "./pages/AdminStudentProgress";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <RequireAuth>
              <Navigate to="/books" replace />
            </RequireAuth>
          }
        />

        <Route
          path="/books"
          element={
            <RequireAuth>
              <BookSelectionPage />
            </RequireAuth>
          }
        />

        <Route
          path="/read/:bookId/:partId"
          element={
            <RequireAuth>
              <MainPage />
            </RequireAuth>
          }
        />

        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminHomePage />
            </RequireAuth>
          }
        />

        <Route
          path="/admin/book-management"
          element={
            <RequireAuth>
              <AdminBookManagement />
            </RequireAuth>
          }
        />

        <Route
          path="/admin/user-management"
          element={
            <RequireAuth>
              <AdminUserManagement />
            </RequireAuth>
          }
        />

        <Route
          path="/admin/student-progress"
          element={
            <RequireAuth>
              <AdminStudentProgress />
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/books" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);