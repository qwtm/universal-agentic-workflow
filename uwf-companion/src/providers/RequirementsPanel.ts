import * as vscode from "vscode";
import { RequirementsReader } from "../db/readers/RequirementsReader";
import { escHtml, badge, renderDynamicTable, pageShell, sectionHeader } from "./webviewUtils";
import { PanelRegistry } from "./PanelRegistry";

const PRIORITY_COLORS: Record<string, "red" | "yellow" | "blue" | "grey"> = {
  must: "red", should: "yellow", could: "blue", wont: "grey",
};

export class RequirementsPanel {
  private static panel: vscode.WebviewPanel | undefined;

  static show(context: vscode.ExtensionContext, workspaceRoot: string) {
    if (RequirementsPanel.panel) {
      RequirementsPanel.panel.reveal();
      RequirementsPanel.refresh(workspaceRoot);
      return;
    }
    RequirementsPanel.panel = vscode.window.createWebviewPanel(
      "uwf.requirements", "UWF: Requirements",
      vscode.ViewColumn.One,
      { enableScripts: false, enableCommandUris: true, retainContextWhenHidden: true }
    );
    PanelRegistry.register("requirements", (root) => RequirementsPanel.refresh(root));
    RequirementsPanel.panel.onDidDispose(() => {
      PanelRegistry.unregister("requirements");
      RequirementsPanel.panel = undefined;
    }, null, context.subscriptions);
    RequirementsPanel.refresh(workspaceRoot);
  }

  static refresh(workspaceRoot: string) {
    if (!RequirementsPanel.panel) return;
    const reader = new RequirementsReader(workspaceRoot);
    let body: string;
    if (!reader.exists()) {
      body = `<p class="empty">No requirements database found.</p>`;
    } else {
      try {
        const cols = reader.columns("requirements");
        const rows = reader.listAll();
        body = renderDynamicTable(cols, rows, {
          priority: (v) => badge(String(v ?? ""), PRIORITY_COLORS[String(v).toLowerCase()] ?? "grey"),
        });
      } catch (e) {
        body = `<p class="empty">Error: ${escHtml(String(e))}</p>`;
      } finally {
        reader.close();
      }
    }
    RequirementsPanel.panel.webview.html = pageShell("UWF Requirements", `${sectionHeader("Requirements", "uwf.openDashboard")}${body}`);
  }
}
