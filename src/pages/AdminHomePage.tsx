import { useNavigate } from "react-router-dom";
import { getUser } from "../auth";

export default function AdminHomePage() {
  const navigate = useNavigate();
  const user = getUser();

  if (!user?.teacher) {
    return (
      <div style={{ padding: 24, color: "#fff" }}>
        You do not have access to this page.
      </div>
    );
  }

  return (
    <div style={{ padding: 24, color: "#fff" }}>
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          background: "#1e1e1e",
          border: "1px solid #333",
          borderRadius: 12,
          padding: 24,
        }}
      >
        <h1 style={{ marginTop: 0 }}>Admin</h1>
        <p style={{ color: "#bbb", marginBottom: 24 }}>
          Select an administration function.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          <button
            onClick={() => navigate("/admin/book-management")}
            style={{
              padding: 20,
              borderRadius: 10,
              border: "1px solid #444",
              background: "#2a2a2a",
              color: "#fff",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              Book Management
            </div>
            <div style={{ color: "#bbb", fontSize: 14 }}>
              Create, edit and delete books and parts.
            </div>
          </button>
        </div>
        <button disabled>Student Progress</button>
        <button disabled>Teacher Analytics</button>
        <button disabled>User Management</button>

        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => navigate("/books")}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #444",
              background: "#2a2a2a",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Back to Books
          </button>
        </div>
      </div>
    </div>
  );
}