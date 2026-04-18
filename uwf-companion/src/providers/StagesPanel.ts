import * as vscode from "vscode";
import { StageReader } from "../db/readers/StageReader";
import { escHtml, badge, renderDynamicTable, pageShell, sectionHeader } from "./webviewUtils";
import { PanelRegistry } from "./PanelRegistry";

const STATUS_COLORS: Record<string, "green" | "yellow" | "red" | "grey"> = {
  completed: "green", active: "yellow", failed: "red",
  pending: "grey", skipped: "grey",
};

export class StagesPanel {
  private static panel: vscode.WebviewPanel | undefined;

  static show(context: vscode.ExtensionContext, workspaceRoot: string) {
    if (StagesPanel.panel) {
      StagesPanel.panel.reveal();
      StagesPanel.refresh(workspaceRoot);
      return;
    }
    StagesPanel.panel = vscode.window.createWebviewPanel(
      "uwf.stages", "UWF: Stages",
      vscode.ViewColumn.One,
      { enableScripts: false, enableCommandUris: true, retainContextWhenHidden: true }
    );
    PanelRegistry.register("stages", (root) => StagesPanel.refresh(root));
    StagesPanel.panel.onDidDispose(() => {
      PanelRegistry.unregister("stages");
      StagesPanel.panel = undefined;
    }, null, context.subscriptions);
    StagesPanel.refresh(workspaceRoot);
  }

  static refresh(workspaceRoot: string) {
    if (!StagesPanel.panel) return;
    const reader = new StageReader(workspaceRoot);
    let body: string;
    if (!reader.exists()) {
      body = `<p class="empty">No stages database found.</p>`;
    } else {
      try {
        const cols = reader.columns("stage_runs");
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
    StagesPanel.panel.webview.html = pageShell("UWF Stages", `${sectionHeader("Workflow Stages", "uwf.openDashboard")}${body}`);
  }
}
