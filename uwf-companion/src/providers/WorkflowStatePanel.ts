import * as vscode from "vscode";
import { WorkflowStateReader } from "../db/readers/WorkflowStateReader";
import { escHtml, badge, renderDynamicTable, pageShell, sectionHeader } from "./webviewUtils";
import { PanelRegistry } from "./PanelRegistry";

const STATUS_COLORS: Record<string, "green" | "yellow" | "red" | "grey"> = {
  idle: "grey", running: "yellow", complete: "green", error: "red", paused: "grey",
};

const PHASE_COLORS: Record<string, "green" | "yellow" | "blue" | "grey"> = {
  idea: "grey", intake: "blue", discovery: "blue", requirements: "blue",
  planning: "blue", implementation: "yellow", review: "yellow",
  complete: "green", done: "green",
};

const STATE_CARD_STYLE = `
  <style>
    .state-card { border: 1px solid var(--vscode-panel-border, #444); border-radius: 6px; padding: 12px; margin-bottom: 8px; }
    .state-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
    .label { min-width: 130px; opacity: .7; font-size: 12px; }
    code { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; opacity: .85; }
    h2 { margin: 16px 0 8px; font-size: 14px; }
    h2:first-child { margin-top: 0; }
  </style>
`;

export class WorkflowStatePanel {
  private static panel: vscode.WebviewPanel | undefined;

  static show(context: vscode.ExtensionContext, workspaceRoot: string) {
    if (WorkflowStatePanel.panel) {
      WorkflowStatePanel.panel.reveal();
      WorkflowStatePanel.refresh(workspaceRoot);
      return;
    }
    WorkflowStatePanel.panel = vscode.window.createWebviewPanel(
      "uwf.workflowState", "UWF: Workflow State",
      vscode.ViewColumn.One,
      { enableScripts: false, enableCommandUris: true, retainContextWhenHidden: true }
    );
    PanelRegistry.register("workflowState", (root) => WorkflowStatePanel.refresh(root));
    WorkflowStatePanel.panel.onDidDispose(() => {
      PanelRegistry.unregister("workflowState");
      WorkflowStatePanel.panel = undefined;
    }, null, context.subscriptions);
    WorkflowStatePanel.refresh(workspaceRoot);
  }

  static refresh(workspaceRoot: string) {
    if (!WorkflowStatePanel.panel) return;
    const reader = new WorkflowStateReader(workspaceRoot);
    let body: string;
    if (!reader.exists()) {
      body = `<p class="empty">No workflow state database found at .github/skills/uwf-state-manager/uwf-state.db</p>`;
    } else {
      try {
        const state = reader.getCurrent();
        const historyCols = reader.columns("workflow_history");
        const history = reader.getHistory();

        const stateBlock = state
          ? `<div class="state-card">
              <div class="state-row"><span class="label">Phase</span>${badge(state.phase, PHASE_COLORS[state.phase?.toLowerCase()] ?? "grey")}</div>
              <div class="state-row"><span class="label">Status</span>${badge(state.status, STATUS_COLORS[state.status?.toLowerCase()] ?? "grey")}</div>
              <div class="state-row"><span class="label">Mode</span>${escHtml(state.mode ?? "—")}</div>
              <div class="state-row"><span class="label">Current agent</span>${escHtml(state.current_agent ?? "—")}</div>
              <div class="state-row"><span class="label">Artifact path</span><code>${escHtml(state.artifact_path ?? "—")}</code></div>
              <div class="state-row"><span class="label">Ready for impl.</span>${state.ready_for_implementation ? badge("yes", "green") : badge("no", "grey")}</div>
            </div>`
          : `<p class="empty">No workflow state recorded yet.</p>`;

        const historyTable = renderDynamicTable(historyCols, history, {
          to_phase: (v) => badge(String(v ?? ""), PHASE_COLORS[String(v).toLowerCase()] ?? "grey"),
        });

        body = `${STATE_CARD_STYLE}
          ${sectionHeader("Current State", "uwf.openDashboard")}
          ${stateBlock}
          <h2>Phase History <span style="font-weight:400;font-size:12px;opacity:.6;">(last 50)</span></h2>
          ${history.length ? historyTable : '<p class="empty">No history yet.</p>'}
        `;
      } catch (e) {
        body = `<p class="empty">Error: ${escHtml(String(e))}</p>`;
      } finally {
        reader.close();
      }
    }
    WorkflowStatePanel.panel.webview.html = pageShell("UWF Workflow State", body);
  }
}
