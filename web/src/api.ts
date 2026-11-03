const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN ?? "dev-admin";

export interface Org {
  id: string;
  name: string;
  creditLimit: number;
  balance: number;
}

export interface KeyRow {
  id: string;
  name: string;
  createdAt: string;
  revokedAt: string | null;
  requests: number;
  spent: number;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "x-admin-token": ADMIN_TOKEN } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

export const api = {
  orgs: () => get<Org[]>("/admin/orgs"),
  keys: (orgId: string) => get<KeyRow[]>(`/admin/orgs/${orgId}/keys`),
};
