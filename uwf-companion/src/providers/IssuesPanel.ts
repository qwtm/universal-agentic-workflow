import * as vscode from "vscode";
import { IssuesReader } from "../db/readers/IssuesReader";
import { escHtml, badge, renderDynamicTable, pageShell, sectionHeader } from "./webviewUtils";
import { PanelRegistry } from "./PanelRegistry";

const STATUS_COLORS: Record<string, "green" | "yellow" | "blue" | "grey"> = {
  open: "blue", active: "yellow", closed: "green", skipped: "grey",
};

export class IssuesPanel {
  private static panel: vscode.WebviewPanel | undefined;

  static show(context: vscode.ExtensionContext, workspaceRoot: string) {
    if (IssuesPanel.panel) {
      IssuesPanel.panel.reveal();
      IssuesPanel.refresh(workspaceRoot);
      return;
    }
    IssuesPanel.panel = vscode.window.createWebviewPanel(
      "uwf.issues", "UWF: Issues",
      vscode.ViewColumn.One,
      { enableScripts: false, enableCommandUris: true, retainContextWhenHidden: true }
    );
    PanelRegistry.register("issues", (root) => IssuesPanel.refresh(root));
    IssuesPanel.panel.onDidDispose(() => {
      PanelRegistry.unregister("issues");
      IssuesPanel.panel = undefined;
    }, null, context.subscriptions);
    IssuesPanel.refresh(workspaceRoot);
  }

  static refresh(workspaceRoot: string) {
    if (!IssuesPanel.panel) return;
    const reader = new IssuesReader(workspaceRoot);
    let body: string;
    if (!reader.exists()) {
      body = `<p class="empty">No issues database found.</p>`;
    } else {
      try {
        const cols = reader.columns("issues");
        const rows = reader.listAll();
        body = renderDynamicTable(cols, rows, {
          status: (v) => badge(String(v ?? ""), STATUS_COLORS[String(v)] ?? "grey"),
        });
      } catch (e) {
        body = `<p class="empty">Error: ${escHtml(String(e))}</p>`;
      } finally {
        reader.close();
      }
    }
    IssuesPanel.panel.webview.html = pageShell("UWF Issues", `${sectionHeader("Issues Backlog", "uwf.openDashboard")}${body}`);
  }
}
