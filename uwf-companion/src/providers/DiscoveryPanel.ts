import * as vscode from "vscode";
import { DiscoveryReader } from "../db/readers/DiscoveryReader";
import { escHtml, badge, renderDynamicTable, pageShell, sectionHeader } from "./webviewUtils";
import { PanelRegistry } from "./PanelRegistry";

const IMPACT_COLORS: Record<string, "red" | "yellow" | "grey"> = {
  high: "red", medium: "yellow", low: "grey",
};

export class DiscoveryPanel {
  private static panel: vscode.WebviewPanel | undefined;

  static show(context: vscode.ExtensionContext, workspaceRoot: string) {
    if (DiscoveryPanel.panel) {
      DiscoveryPanel.panel.reveal();
      DiscoveryPanel.refresh(workspaceRoot);
      return;
    }
    DiscoveryPanel.panel = vscode.window.createWebviewPanel(
      "uwf.discoveries", "UWF: Discoveries",
      vscode.ViewColumn.One,
      { enableScripts: false, enableCommandUris: true, retainContextWhenHidden: true }
    );
    PanelRegistry.register("discoveries", (root) => DiscoveryPanel.refresh(root));
    DiscoveryPanel.panel.onDidDispose(() => {
      PanelRegistry.unregister("discoveries");
      DiscoveryPanel.panel = undefined;
    }, null, context.subscriptions);
    DiscoveryPanel.refresh(workspaceRoot);
  }

  static refresh(workspaceRoot: string) {
    if (!DiscoveryPanel.panel) return;
    const reader = new DiscoveryReader(workspaceRoot);
    let body: string;
    if (!reader.exists()) {
      body = `<p class="empty">No discoveries database found.</p>`;
    } else {
      try {
        const cols = reader.columns("discoveries");
        const rows = reader.listAll();
        body = renderDynamicTable(cols, rows, {
          impact: (v) => badge(String(v ?? ""), IMPACT_COLORS[String(v).toLowerCase()] ?? "grey"),
        });
      } catch (e) {
        body = `<p class="empty">Error: ${escHtml(String(e))}</p>`;
      } finally {
        reader.close();
      }
    }
    DiscoveryPanel.panel.webview.html = pageShell("UWF Discoveries", `${sectionHeader("Discovery Findings", "uwf.openDashboard")}${body}`);
  }
}
