import { Link, useNavigate } from "react-router-dom";
import { clearUser, getUser } from "../auth";

export default function AdminHomePage() {
  const navigate = useNavigate();
  const user = getUser();

  const logout = () => {
    clearUser();
    navigate("/login", { replace: true });
  };

  if (!user?.teacher) {
    return (
      <div className="container">
        <div className="shell" style={{ maxWidth: 720 }}>
          <div className="header">
            <div className="brand">
              <div className="logoDot" />
              <div>
                <div className="title">Echo</div>
                <div className="subtitle">Admin</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="cardBody">
              <div className="muted">You do not have access to this page.</div>
              <div className="row" style={{ marginTop: 16 }}>
                <Link className="btn" to="/books">
                  Back to Books
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tiles = [
    {
      title: "Book Management",
      description: "Create, edit and delete books and parts, including uploaded media and text content.",
      actionLabel: "Open",
      onClick: () => navigate("/admin/book-management"),
      disabled: false,
      soon: false,
    },
    {
      title: "Student Progress",
      description: "Review reading attempts, scores and progress history for individual students.",
      actionLabel: "Open",
      onClick: () => navigate("/admin/student-progress"),
      disabled: false,
      soon: false,
    },
    {
      title: "Teacher Analytics",
      description: "View higher-level summaries across classes, books and learning activity.",
      actionLabel: "Coming Soon",
      disabled: true,
      soon: true,
    },
    {
      title: "User Management",
      description: "Create, edit and delete user records stored in server/data/users.json.",
      actionLabel: "Open",
      onClick: () => navigate("/admin/user-management"),
      disabled: false,
      soon: false,
    },
  ];

  return (
    <div className="container">
      <div className="shell">
        <div className="header">
          <div className="brand">
            <div className="logoDot" />
            <div>
              <div className="title">Echo</div>
              <div className="subtitle">
                Admin Home • {user.firstName} {user.lastName}
              </div>
            </div>
          </div>

          <div className="row">
            <span className="badge">Admin</span>
            <Link className="btn" to="/books">
              ← Book Selection
            </Link>
            <button className="btn" onClick={logout}>
              Logout
            </button>
          </div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <div style={{ fontWeight: 800 }}>Administration</div>
            <span className="muted">Select an administration function</span>
          </div>

          <div className="cardBody">
            <div className="muted" style={{ marginBottom: 16 }}>
              This area is for teacher-only maintenance and administration features.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 12,
              }}
            >
              {tiles.map((tile) => (
                <div
                  key={tile.title}
                  className="card"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                >
                  <div className="cardBody">
                    <div
                      className="row"
                      style={{ justifyContent: "space-between", alignItems: "flex-start" }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{tile.title}</div>
                      {tile.soon && <span className="badge">Soon</span>}
                    </div>

                    <div className="muted" style={{ marginTop: 8, minHeight: 54 }}>
                      {tile.description}
                    </div>

                    <div className="row" style={{ marginTop: 14 }}>
                      <button
                        className={`btn ${!tile.disabled ? "btnPrimary" : ""}`}
                        onClick={tile.onClick}
                        disabled={tile.disabled}
                        style={tile.disabled ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
                      >
                        {tile.actionLabel}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="divider" />

            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="muted">
                Use Book Management for reading content and User Management for teachers/students.
              </div>
              <Link className="btn" to="/books">
                Back to Books
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}