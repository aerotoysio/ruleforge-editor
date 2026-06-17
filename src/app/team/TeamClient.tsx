"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ShieldAlert, UserPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";

type AdminUser = { id: string; email: string; name: string | null; createdAt: string | null; roles: string[] };
type AdminRole = { id: string; name: string; description: string | null; permissions: string[]; userCount: number };

// Capability catalog — mirrors PERM in src/lib/server/auth/types.ts.
const CAPS: { id: string; label: string }[] = [
  { id: "*", label: "Everything (admin)" },
  { id: "rules.edit", label: "Edit rules" },
  { id: "rules.publish", label: "Publish rules" },
  { id: "rules.delete", label: "Delete rules" },
  { id: "references.manage", label: "Manage references" },
  { id: "templates.manage", label: "Manage templates" },
  { id: "nodes.manage", label: "Manage nodes" },
  { id: "assets.manage", label: "Manage assets" },
  { id: "users.manage", label: "Manage users & roles" },
];

function chip(on: boolean): React.CSSProperties {
  return {
    padding: "3px 9px",
    borderRadius: 4,
    fontSize: 11.5,
    fontWeight: 600,
    cursor: "pointer",
    border: on ? "1px solid var(--accent, #a855f7)" : "1px solid var(--border)",
    background: on ? "var(--accent-soft, rgba(139,92,246,0.16))" : "var(--panel-2)",
    color: on ? "var(--accent, #a855f7)" : "var(--text-muted)",
    transition: "all .1s",
    display: "inline-flex",
    alignItems: "center",
  };
}

export function TeamClient({
  users: u0,
  roles: r0,
  isAdmin,
  currentUserId,
}: {
  users: AdminUser[];
  roles: AdminRole[];
  isAdmin: boolean;
  currentUserId: string | null;
}) {
  const [users, setUsers] = useState<AdminUser[]>(u0);
  const [roles, setRoles] = useState<AdminRole[]>(r0);
  const [busy, setBusy] = useState(false);

  const [addU, setAddU] = useState(false);
  const [uEmail, setUEmail] = useState("");
  const [uName, setUName] = useState("");
  const [uPass, setUPass] = useState("");
  const [uRoles, setURoles] = useState<string[]>([]);

  const [addR, setAddR] = useState(false);
  const [rName, setRName] = useState("");
  const [rDesc, setRDesc] = useState("");
  const [rPerms, setRPerms] = useState<string[]>([]);

  async function createUser() {
    if (!uEmail.trim() || !uPass.trim()) {
      toast.error("Email and password are required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: uEmail.trim(), name: uName.trim() || undefined, password: uPass, roles: uRoles }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error ?? "Failed to create user");
        return;
      }
      setUsers([...users, d.user as AdminUser].sort((a, b) => a.email.localeCompare(b.email)));
      setUEmail(""); setUName(""); setUPass(""); setURoles([]); setAddU(false);
      toast.success("User created");
    } finally {
      setBusy(false);
    }
  }

  async function toggleUserRole(usr: AdminUser, roleId: string) {
    const next = usr.roles.includes(roleId) ? usr.roles.filter((r) => r !== roleId) : [...usr.roles, roleId];
    const prev = users;
    setUsers(users.map((x) => (x.id === usr.id ? { ...x, roles: next } : x)));
    const res = await fetch(`/api/admin/users/${usr.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roles: next }),
    });
    if (!res.ok) {
      toast.error("Couldn't update roles");
      setUsers(prev);
    }
  }

  async function removeUser(usr: AdminUser) {
    if (!confirm(`Delete ${usr.email}? They'll lose access immediately.`)) return;
    const res = await fetch(`/api/admin/users/${usr.id}`, { method: "DELETE" });
    if (res.ok) {
      setUsers(users.filter((x) => x.id !== usr.id));
      toast.success("User deleted");
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Delete failed");
    }
  }

  async function createRole() {
    if (!rName.trim()) {
      toast.error("Role name is required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: rName.trim(), description: rDesc.trim() || undefined, permissions: rPerms }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error ?? "Failed to create role");
        return;
      }
      setRoles(
        [...roles, { id: d.id as string, name: rName.trim(), description: rDesc.trim() || null, permissions: rPerms, userCount: 0 }].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setRName(""); setRDesc(""); setRPerms([]); setAddR(false);
      toast.success("Role created");
    } finally {
      setBusy(false);
    }
  }

  async function toggleRolePerm(role: AdminRole, perm: string) {
    const next = role.permissions.includes(perm) ? role.permissions.filter((p) => p !== perm) : [...role.permissions, perm];
    const prev = roles;
    setRoles(roles.map((x) => (x.id === role.id ? { ...x, permissions: next } : x)));
    const res = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: role.id, name: role.name, description: role.description, permissions: next }),
    });
    if (!res.ok) {
      toast.error("Couldn't update permissions");
      setRoles(prev);
    }
  }

  async function removeRole(role: AdminRole) {
    if (!confirm(`Delete role "${role.name}"? Users assigned to it will lose it.`)) return;
    const res = await fetch(`/api/admin/roles/${role.id}`, { method: "DELETE" });
    if (res.ok) {
      setRoles(roles.filter((x) => x.id !== role.id));
      toast.success("Role deleted");
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Delete failed");
    }
  }

  if (!isAdmin) {
    return (
      <>
        <PageHeader eyebrow="Access control" title="Team & roles" />
        <div style={{ padding: "10px 28px" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", border: "1px solid var(--border)", borderRadius: 8, padding: 16, color: "var(--text-muted)", maxWidth: 560 }}>
            <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 600 }}>Admins only</div>
              <div style={{ fontSize: 13 }}>Managing users, roles, and permissions requires an administrator role.</div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Access control"
        title="Team & roles"
        description="Who can sign in, and what each role can do. Roles carry capability flags; assign roles to users below, then scope rules to teams from the Rules list."
      />
      <div style={{ padding: "8px 28px 56px", maxWidth: 1000 }}>
        {/* ── USERS ─────────────────────────────────────────── */}
        <div className="flex items-center" style={{ gap: 8, marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Users</h2>
          <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>{users.length}</span>
          <Button size="sm" variant="outline" style={{ marginLeft: "auto" }} onClick={() => setAddU((v) => !v)}>
            <UserPlus /> Add user
          </Button>
        </div>

        {addU && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 14, marginBottom: 14, display: "flex", flexDirection: "column", gap: 10, background: "var(--panel)" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px" }}><Input value={uEmail} onChange={(e) => setUEmail(e.target.value)} placeholder="email@aerotoys.io" /></div>
              <div style={{ flex: "1 1 160px" }}><Input value={uName} onChange={(e) => setUName(e.target.value)} placeholder="Display name (optional)" /></div>
              <div style={{ flex: "1 1 140px" }}><Input type="password" value={uPass} onChange={(e) => setUPass(e.target.value)} placeholder="Password" /></div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)", marginRight: 2 }}>Roles:</span>
              {roles.map((r) => (
                <button key={r.id} type="button" style={chip(uRoles.includes(r.id))} onClick={() => setURoles((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))}>
                  {r.name}
                </button>
              ))}
              {roles.length === 0 ? <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>create a role first</span> : null}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" onClick={createUser} disabled={busy}>Create user</Button>
              <Button size="sm" variant="ghost" onClick={() => setAddU(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {users.map((usr) => (
            <div key={usr.id} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "12px 14px", background: "var(--panel)" }}>
              <div className="flex items-center" style={{ gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 999, background: "var(--accent-soft, rgba(139,92,246,0.16))", color: "var(--accent,#a855f7)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {(usr.name || usr.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0" style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                    {usr.name || usr.email}
                    {usr.id === currentUserId ? <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}> · you</span> : null}
                  </div>
                  <div className="mono truncate" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{usr.email}</div>
                </div>
                {usr.id !== currentUserId ? (
                  <Button size="icon-sm" variant="ghost" onClick={() => removeUser(usr)} title="Delete user"><Trash2 /></Button>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 2 }}>Roles:</span>
                {roles.map((r) => {
                  const on = usr.roles.includes(r.id);
                  return (
                    <button key={r.id} type="button" style={chip(on)} onClick={() => toggleUserRole(usr, r.id)}>
                      {on ? <Check size={10} style={{ marginRight: 3 }} /> : null}
                      {r.name}
                    </button>
                  );
                })}
                {roles.length === 0 ? <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>no roles yet</span> : null}
              </div>
            </div>
          ))}
        </div>

        {/* ── ROLES ─────────────────────────────────────────── */}
        <div className="flex items-center" style={{ gap: 8, marginTop: 34, marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Roles &amp; permissions</h2>
          <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>{roles.length}</span>
          <Button size="sm" variant="outline" style={{ marginLeft: "auto" }} onClick={() => setAddR((v) => !v)}>
            <Plus /> Add role
          </Button>
        </div>

        {addR && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 14, marginBottom: 14, display: "flex", flexDirection: "column", gap: 10, background: "var(--panel)" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 180px" }}><Input value={rName} onChange={(e) => setRName(e.target.value)} placeholder="Role name — e.g. Pricing Team" /></div>
              <div style={{ flex: "2 1 240px" }}><Input value={rDesc} onChange={(e) => setRDesc(e.target.value)} placeholder="Description (optional)" /></div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)", marginRight: 2 }}>Permissions:</span>
              {CAPS.map((c) => (
                <button key={c.id} type="button" style={chip(rPerms.includes(c.id))} onClick={() => setRPerms((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))} title={c.id}>
                  {c.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" onClick={createRole} disabled={busy}>Create role</Button>
              <Button size="sm" variant="ghost" onClick={() => setAddR(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 12 }}>
          {roles.map((role) => (
            <div key={role.id} style={{ border: "1px solid var(--border)", borderRadius: 7, padding: 14, background: "var(--panel)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="flex items-start" style={{ gap: 8 }}>
                <div className="min-w-0" style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{role.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {role.id} · {role.userCount} {role.userCount === 1 ? "user" : "users"}
                  </div>
                  {role.description ? <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 3 }}>{role.description}</div> : null}
                </div>
                {role.id !== "admin" ? (
                  <Button size="icon-sm" variant="ghost" onClick={() => removeRole(role)} title="Delete role"><Trash2 /></Button>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {CAPS.map((c) => (
                  <button key={c.id} type="button" style={chip(role.permissions.includes(c.id))} onClick={() => toggleRolePerm(role, c.id)} title={c.id}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
