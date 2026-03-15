import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearUser, getUser, setUser, type UserRecord } from "../auth";

type Gender = "M" | "F" | "X";

type UserForm = {
  username: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  yearOfBirth: string;
  teacher: boolean;
  englishName: string;
};

function teacherHeaders(extra?: Record<string, string>) {
  return { "x-echo-teacher": "true", ...(extra ?? {}) };
}

function emptyForm(): UserForm {
  return {
    username: "",
    firstName: "",
    lastName: "",
    gender: "X",
    yearOfBirth: "",
    teacher: false,
    englishName: "",
  };
}

function formFromUser(user: UserRecord): UserForm {
  return {
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    gender: user.gender,
    yearOfBirth: String(user.yearOfBirth),
    teacher: user.teacher,
    englishName: user.englishName ?? "",
  };
}

async function apiGetUsers(): Promise<UserRecord[]> {
  const r = await fetch("/api/users", {
    cache: "no-store",
    headers: teacherHeaders(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Failed to load users.");
  return (j.users ?? []) as UserRecord[];
}

export default function AdminUserManagement() {
  const navigate = useNavigate();
  const loggedInUser = getUser();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [activeUserId, setActiveUserId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState<UserForm>(emptyForm());
  const [editForm, setEditForm] = useState<UserForm>(emptyForm());
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isTeacher = Boolean(loggedInUser?.teacher);

  const reload = async (preferredUserId?: number | null) => {
    try {
      setErr(null);
      const data = await apiGetUsers();
      setUsers(data);

      setActiveUserId((prev) => {
        const target = preferredUserId ?? prev;
        if (target != null && data.some((u) => u.id === target)) return target;
        return data[0]?.id ?? null;
      });
    } catch (e: any) {
      setErr(e?.message || "Failed to load users.");
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const activeUser = useMemo(
    () => users.find((u) => u.id === activeUserId) ?? null,
    [users, activeUserId]
  );

  useEffect(() => {
    if (activeUser) {
      setEditForm(formFromUser(activeUser));
    } else {
      setEditForm(emptyForm());
    }
  }, [activeUser]);

  const logout = () => {
    clearUser();
    navigate("/login", { replace: true });
  };

  const setCreateField = <K extends keyof UserForm>(key: K, value: UserForm[K]) => {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
  };

  const setEditField = <K extends keyof UserForm>(key: K, value: UserForm[K]) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);

    try {
      const r = await fetch("/api/users", {
        method: "POST",
        headers: teacherHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          username: createForm.username,
          firstName: createForm.firstName,
          lastName: createForm.lastName,
          gender: createForm.gender,
          yearOfBirth: Number(createForm.yearOfBirth),
          teacher: createForm.teacher,
          englishName: createForm.englishName.trim() || undefined,
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Failed to create user.");

      const created = j.user as UserRecord;
      setCreateForm(emptyForm());
      setMsg(`Created user #${created.id} (${created.username}).`);
      await reload(created.id);
    } catch (e: any) {
      setErr(e?.message || "Failed to create user.");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async () => {
    if (!activeUser) return;

    setBusy(true);
    setErr(null);
    setMsg(null);

    try {
      const r = await fetch(`/api/users/${activeUser.id}`, {
        method: "PUT",
        headers: teacherHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          username: editForm.username,
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          gender: editForm.gender,
          yearOfBirth: Number(editForm.yearOfBirth),
          teacher: editForm.teacher,
          englishName: editForm.englishName.trim() || undefined,
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Failed to update user.");

      const updated = j.user as UserRecord;

      if (loggedInUser?.id === updated.id) {
        setUser(updated);
      }

      setMsg(`Updated user #${updated.id}.`);
      await reload(updated.id);
    } catch (e: any) {
      setErr(e?.message || "Failed to update user.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!activeUser) return;

    const ok = window.confirm(`Delete user "${activeUser.username}"?`);
    if (!ok) return;

    setBusy(true);
    setErr(null);
    setMsg(null);

    try {
      const r = await fetch(`/api/users/${activeUser.id}`, {
        method: "DELETE",
        headers: teacherHeaders(),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Failed to delete user.");

      if (loggedInUser?.id === activeUser.id) {
        clearUser();
        navigate("/login", { replace: true });
        return;
      }

      setMsg(`Deleted user #${activeUser.id}.`);
      await reload(null);
    } catch (e: any) {
      setErr(e?.message || "Failed to delete user.");
    } finally {
      setBusy(false);
    }
  };

  if (!loggedInUser) return null;

  if (!isTeacher) {
    return (
      <div className="container">
        <div className="shell">
          <div className="header">
            <div className="brand">
              <div className="logoDot" />
              <div>
                <div className="title">Echo</div>
                <div className="subtitle">User Management</div>
              </div>
            </div>
            <div className="row">
              <Link className="btn" to="/books">
                ← Book Selection
              </Link>
              <button className="btn" onClick={logout}>
                Logout
              </button>
            </div>
          </div>
          <div className="card">
            <div className="cardBody">
              <div className="muted">⚠ Teacher access required.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderForm = (
    form: UserForm,
    setField: <K extends keyof UserForm>(key: K, value: UserForm[K]) => void,
    submitLabel: string,
    onSubmit: () => void,
    submitClassName = "btn btnPrimary"
  ) => (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <Field label="Username *">
          <input
            value={form.username}
            onChange={(e) => setField("username", e.target.value)}
            className="echoInput"
          />
        </Field>

        <Field label="English Name">
          <input
            value={form.englishName}
            onChange={(e) => setField("englishName", e.target.value)}
            className="echoInput"
          />
        </Field>

        <Field label="First Name *">
          <input
            value={form.firstName}
            onChange={(e) => setField("firstName", e.target.value)}
            className="echoInput"
          />
        </Field>

        <Field label="Last Name *">
          <input
            value={form.lastName}
            onChange={(e) => setField("lastName", e.target.value)}
            className="echoInput"
          />
        </Field>

        <Field label="Gender *">
          <select
            value={form.gender}
            onChange={(e) => setField("gender", e.target.value as Gender)}
            className="echoInput"
          >
            <option value="M">M</option>
            <option value="F">F</option>
            <option value="X">X</option>
          </select>
        </Field>

        <Field label="Year Of Birth *">
          <input
            type="number"
            value={form.yearOfBirth}
            onChange={(e) => setField("yearOfBirth", e.target.value)}
            className="echoInput"
          />
        </Field>
      </div>

      <label className="row" style={{ gap: 8 }}>
        <input
          type="checkbox"
          checked={form.teacher}
          onChange={(e) => setField("teacher", e.target.checked)}
        />
        <span className="muted" style={{ fontSize: 14 }}>Teacher</span>
      </label>

      <div className="row">
        <button className={submitClassName} onClick={onSubmit} disabled={busy}>
          {submitLabel}
        </button>
      </div>
    </div>
  );

  return (
    <div className="container">
      <div className="shell">
        <div className="header">
          <div className="brand">
            <div className="logoDot" />
            <div>
              <div className="title">Echo</div>
              <div className="subtitle">Admin • User Management</div>
            </div>
          </div>

          <div className="row">
            <Link className="btn" to="/admin">
              ← Admin Home
            </Link>
            <Link className="btn" to="/books">
              Book Selection
            </Link>
            <button className="btn" onClick={logout}>
              Logout
            </button>
          </div>
        </div>

        {(err || msg) && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="cardBody">
              {err && <div className="muted">⚠ {err}</div>}
              {!err && msg && <div className="muted">{msg}</div>}
            </div>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "320px minmax(0, 1fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div className="card">
            <div className="cardHeader">
              <div style={{ fontWeight: 800 }}>Users</div>
              <span className="badge">{users.length}</span>
            </div>
            <div className="cardBody" style={{ display: "grid", gap: 10 }}>
              {users.map((u) => (
                <button
                  key={u.id}
                  className="btn"
                  onClick={() => setActiveUserId(u.id)}
                  style={{
                    textAlign: "left",
                    justifyContent: "space-between",
                    background:
                      activeUserId === u.id
                        ? "linear-gradient(135deg, rgba(124,58,237,0.45), rgba(96,165,250,0.25))"
                        : undefined,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      #{u.id} • {u.username}
                    </div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {u.firstName} {u.lastName}
                      {u.englishName ? ` • ${u.englishName}` : ""}
                    </div>
                  </div>
                  <span className="badge">{u.teacher ? "Teacher" : "Student"}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <div className="card">
              <div className="cardHeader">
                <div style={{ fontWeight: 800 }}>Add User</div>
                <span className="muted">ID is auto-generated</span>
              </div>
              <div className="cardBody">
                {renderForm(createForm, setCreateField, "Create User", handleCreate)}
              </div>
            </div>

            <div className="card">
              <div className="cardHeader">
                <div style={{ fontWeight: 800 }}>Edit User</div>
                <span className="muted">
                  {activeUser ? `Editing #${activeUser.id}` : "Select a user"}
                </span>
              </div>
              <div className="cardBody">
                {!activeUser ? (
                  <div className="muted">Select a user from the list to edit or delete.</div>
                ) : (
                  <>
                    {renderForm(editForm, setEditField, "Save Changes", handleUpdate)}
                    <div className="divider" />
                    <div className="row">
                      <button className="btn btnDanger" onClick={handleDelete} disabled={busy}>
                        Delete User
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="muted" style={{ marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}