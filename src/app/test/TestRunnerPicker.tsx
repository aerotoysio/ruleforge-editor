"use client";

import Link from "next/link";
import { Play, FileCog } from "lucide-react";

type RuleStub = { id: string; name: string; endpoint: string };

export function TestRunnerPicker({ rules }: { rules: RuleStub[] }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Test runner</h1>
          <p>
            Pick a rule to run against a request payload. Pretty-prints the
            engine&apos;s envelope and renders the per-node trace.
          </p>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="tbl-wrap">
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
            No rules in this workspace yet.
          </div>
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Endpoint</th>
                <th style={{ width: 80, textAlign: "right" }} />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span
                        className="mono"
                        style={{ fontSize: 11.5, color: "var(--text-muted)" }}
                      >
                        {r.id}
                      </span>
                      <span style={{ fontWeight: 500 }}>{r.name}</span>
                    </div>
                  </td>
                  <td className="mono" style={{ color: "var(--text-dim)" }}>
                    {r.endpoint}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Link href={`/test/${encodeURIComponent(r.id)}`}>
                      <button className="btn primary sm">
                        <Play /> Run
                      </button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
