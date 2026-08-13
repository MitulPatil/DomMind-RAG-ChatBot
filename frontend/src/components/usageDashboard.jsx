import { useEffect, useState } from "react";
import { authFetch } from "../api";

export function UsageDashboard() {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    setError(null);

    authFetch(`/rag/usage?days=${days}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) setUsage(data.usage);
        else setError(data.error);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return <div className="table-loading">Loading usage data...</div>;
  }

  if (error) {
    return <div className="page-error">Failed to load usage: {error}</div>;
  }

  if (!usage) return null;

  return (
    <div className="usage-shell">
      <div className="usage-header">
        <div className="workspace-label">Usage overview</div>
        <div className="usage-topbar">
          <div>
            <div className="workspace-title">API Usage</div>
            <div className="workspace-subtitle">
              Review recent model activity, token volume, and estimated cost across operations.
            </div>
          </div>

          <select
            value={days}
            onChange={e => setDays(parseInt(e.target.value, 10))}
            className="field"
            style={{ width: "180px", padding: "14px 16px" }}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      <div className="usage-grid">
        {[
          { label: "Total Calls", value: usage.totals.totalCalls.toLocaleString() },
          { label: "Total Tokens", value: usage.totals.totalTokens.toLocaleString() },
          {
            label: "Estimated Cost",
            value: `$${usage.totals.totalCostUSD.toFixed(4)}`,
            note: "Approximate"
          }
        ].map(card => (
          <div key={card.label} className="usage-card">
            <div className="usage-card-label">{card.label}</div>
            <div className="usage-card-value">{card.value}</div>
            {card.note && <div className="usage-card-note">{card.note}</div>}
          </div>
        ))}
      </div>

      <div className="usage-table-shell">
        <div className="usage-table-header">Breakdown by operation</div>

        {usage.operations.length === 0 ? (
          <div className="table-empty">No API calls in this period.</div>
        ) : (
          <table className="usage-table">
            <thead>
              <tr>
                <th>Operation</th>
                <th>Model</th>
                <th>Calls</th>
                <th>Tokens</th>
                <th>Estimated Cost</th>
              </tr>
            </thead>
            <tbody>
              {usage.operations.map((op, index) => (
                <tr key={index}>
                  <td className="usage-operation">{op.operation}</td>
                  <td>{op.model.replace("gemini-", "")}</td>
                  <td>{parseInt(op.call_count, 10).toLocaleString()}</td>
                  <td>{parseInt(op.total_tokens, 10).toLocaleString()}</td>
                  <td>
                    {op.estimatedCost
                      ? `$${op.estimatedCost.totalCostUSD.toFixed(6)}`
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
