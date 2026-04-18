import * as vscode from "vscode";
import { ReviewReader } from "../db/readers/ReviewReader";
import { escHtml, badge, renderDynamicTable, pageShell, sectionHeader } from "./webviewUtils";
import { PanelRegistry } from "./PanelRegistry";

const SEVERITY_COLORS: Record<string, "red" | "yellow" | "blue" | "grey"> = {
  critical: "red", high: "red", medium: "yellow", low: "blue", info: "grey",
};
const VERDICT_COLORS: Record<string, "green" | "red" | "yellow"> = {
  pass: "green", fail: "red", conditional: "yellow",
};

export class ReviewPanel {
  private static panel: vscode.WebviewPanel | undefined;

  static show(context: vscode.ExtensionContext, workspaceRoot: string) {
    if (ReviewPanel.panel) {
      ReviewPanel.panel.reveal();
      ReviewPanel.refresh(workspaceRoot);
      return;
    }
    ReviewPanel.panel = vscode.window.createWebviewPanel(
      "uwf.review", "UWF: Review Findings",
      vscode.ViewColumn.One,
      { enableScripts: false, enableCommandUris: true, retainContextWhenHidden: true }
    );
    PanelRegistry.register("review", (root) => ReviewPanel.refresh(root));
    ReviewPanel.panel.onDidDispose(() => {
      PanelRegistry.unregister("review");
      ReviewPanel.panel = undefined;
    }, null, context.subscriptions);
    ReviewPanel.refresh(workspaceRoot);
  }

  static refresh(workspaceRoot: string) {
    if (!ReviewPanel.panel) return;
    const reader = new ReviewReader(workspaceRoot);
    let body: string;
    if (!reader.exists()) {
      body = `<p class="empty">No review database found.</p>`;
    } else {
      try {
        const reviews = reader.listReviews();
        if (!reviews.length) {
          body = `<p class="empty">No reviews recorded yet.</p>`;
        } else {
          const findingCols = reader.columns("findings");
          const sections = reviews.map((rv) => {
            const verdictBadge = badge(rv.verdict, VERDICT_COLORS[rv.verdict?.toLowerCase()] ?? "grey" as "green");
            const findings = reader.listFindings(rv.id);
            const findingsTable = renderDynamicTable(findingCols, findings, {
              severity: (v) => badge(String(v ?? ""), SEVERITY_COLORS[String(v).toLowerCase()] ?? "grey"),
            });
            return `<h3>Review #${escHtml(rv.id)} — ${escHtml(rv.role)} &nbsp;${verdictBadge}</h3>
              ${rv.notes ? `<p style="opacity:.8;">${escHtml(rv.notes)}</p>` : ""}
              ${findingsTable}`;
          }).join("<hr>");
          body = sections;
        }
      } catch (e) {
        body = `<p class="empty">Error: ${escHtml(String(e))}</p>`;
      } finally {
        reader.close();
      }
    }
    ReviewPanel.panel.webview.html = pageShell("UWF Review", `${sectionHeader("Review Findings", "uwf.openDashboard")}${body}`);
  }
}
