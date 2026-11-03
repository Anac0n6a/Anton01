import { useEffect, useState } from "react";

import { api, type KeyRow, type Org } from "./api";

const rub = (value: number) =>
  value.toLocaleString("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  });

export function App() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState<string>();
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api
      .orgs()
      .then((list) => {
        setOrgs(list);
        setOrgId(list[0]?.id);
      })
      .catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    api
      .keys(orgId)
      .then(setKeys)
      .catch((err) => setError(String(err)));
  }, [orgId]);

  const org = orgs.find((o) => o.id === orgId);

  return (
    <main
      style={{
        fontFamily: "system-ui",
        maxWidth: 880,
        margin: "2rem auto",
        padding: "0 1rem",
      }}
    >
      <h1>Кабинет API</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <label>
        Организация:{" "}
        <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>

      {org && (
        <p>
          Баланс: <b>{rub(org.balance)}</b> · кредитный лимит{" "}
          {rub(org.creditLimit)}
        </p>
      )}

      <h2>Ключи</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th>Название</th>
            <th>Создан</th>
            <th>Запросов</th>
            <th>Потрачено</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id} style={{ borderBottom: "1px solid #eee" }}>
              <td>{key.name}</td>
              <td>{new Date(key.createdAt).toLocaleDateString("ru-RU")}</td>
              <td>{key.requests.toLocaleString("ru-RU")}</td>
              <td>{rub(key.spent)}</td>
              <td>{key.revokedAt ? "отозван" : "активен"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
