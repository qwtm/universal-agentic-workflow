import * as vscode from "vscode";
import { AdrReader } from "../db/readers/AdrReader";
import { escHtml, badge, renderDynamicTable, pageShell, sectionHeader } from "./webviewUtils";
import { PanelRegistry } from "./PanelRegistry";

const STATUS_COLORS: Record<string, "green" | "yellow" | "red" | "grey"> = {
  accepted: "green", proposed: "yellow", rejected: "red",
  superseded: "grey", deprecated: "grey",
};

export class AdrPanel {
  private static panel: vscode.WebviewPanel | undefined;

  static show(context: vscode.ExtensionContext, workspaceRoot: string) {
    if (AdrPanel.panel) {
      AdrPanel.panel.reveal();
      AdrPanel.refresh(workspaceRoot);
      return;
    }
    AdrPanel.panel = vscode.window.createWebviewPanel(
      "uwf.adrs", "UWF: ADRs",
      vscode.ViewColumn.One,
      { enableScripts: false, enableCommandUris: true, retainContextWhenHidden: true }
    );
    PanelRegistry.register("adrs", (root) => AdrPanel.refresh(root));
    AdrPanel.panel.onDidDispose(() => {
      PanelRegistry.unregister("adrs");
      AdrPanel.panel = undefined;
    }, null, context.subscriptions);
    AdrPanel.refresh(workspaceRoot);
  }

  static refresh(workspaceRoot: string) {
    if (!AdrPanel.panel) return;
    const reader = new AdrReader(workspaceRoot);
    let body: string;
    if (!reader.exists()) {
      body = `<p class="empty">No ADR database found.</p>`;
    } else {
      try {
        const cols = reader.columns("adrs");
        const rows = reader.listAll();
        body = renderDynamicTable(cols, rows, {
          status: (v) => badge(String(v ?? ""), STATUS_COLORS[String(v).toLowerCase()] ?? "grey"),
        });
      } catch (e) {
        body = `<p class="empty">Error: ${escHtml(String(e))}</p>`;
      } finally {
        reader.close();
      }
    }
    AdrPanel.panel.webview.html = pageShell("UWF ADRs", `${sectionHeader("Architecture Decision Records", "uwf.openDashboard")}${body}`);
  }
}
