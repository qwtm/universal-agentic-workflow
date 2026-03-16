/** Escape HTML special characters to prevent injection in webview content. */
export function escHtml(val: unknown): string {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function badge(
  text: string,
  color: "green" | "yellow" | "red" | "blue" | "grey"
): string {
  const colors: Record<string, string> = {
    green: "#2ea44f",
    yellow: "#d29922",
    red: "#da3633",
    blue: "#0969da",
    grey: "#8b949e",
  };
  return `<span style="background:${colors[color]};color:#fff;padding:1px 6px;border-radius:10px;font-size:11px;">${escHtml(text)}</span>`;
}

export function statusBadge(status: string): string {
  const map: Record<string, "green" | "yellow" | "red" | "blue" | "grey"> = {
    open: "blue",
    active: "yellow",
    closed: "green",
    skipped: "grey",
    completed: "green",
    failed: "red",
    pending: "grey",
  };
  return badge(status, map[status] ?? "grey");
}

/**
 * Render a table from live schema columns and row data.
 * Columns come from PRAGMA table_info so the table always matches the actual DB schema.
 * A column-specific renderer can return a badge/tag string; otherwise the value is escaped.
 */
export function renderDynamicTable(
  columns: string[],
  rows: unknown[],
  renderers: Record<string, (val: unknown) => string> = {}
): string {
  if (!rows.length) return `<p class="empty">No records found.</p>`;
  const headers = columns.map((c) => `<th>${escHtml(c)}</th>`).join("");
  const bodyRows = (rows as Record<string, unknown>[]).map((row) => {
    const cells = columns.map((c) => {
      const val = row[c];
      const rendered = renderers[c] ? renderers[c](val) : escHtml(val);
      return `<td>${rendered}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<table><thead><tr>${headers}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

export function pageShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body { font-family: var(--vscode-font-family, sans-serif); font-size: 13px; padding: 12px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  h2 { margin: 0 0 12px; font-size: 15px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--vscode-panel-border, #333); }
  th { font-weight: 600; }
  .empty { opacity: .6; font-style: italic; }
</style>
<title>${escHtml(title)}</title>
</head>
<body>
${body}
</body>
</html>`;
}

export function sectionHeader(title: string, openCommand?: string): string {
  const action = openCommand
    ? `<a style="font-size:12px;opacity:.8;" href="command:${openCommand}">Open interactive view</a>`
    : "";
  return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><h2 style="margin:0;">${escHtml(title)}</h2>${action}</div>`;
}
