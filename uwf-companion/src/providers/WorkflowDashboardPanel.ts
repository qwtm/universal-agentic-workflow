import * as vscode from "vscode";
import { escHtml, pageShell } from "./webviewUtils";
import { PanelRegistry } from "./PanelRegistry";
import { WorkflowInsightsService } from "../services/WorkflowInsightsService";

export class WorkflowDashboardPanel {
  private static panel: vscode.WebviewPanel | undefined;

  static show(context: vscode.ExtensionContext, workspaceRoot: string) {
    if (WorkflowDashboardPanel.panel) {
      WorkflowDashboardPanel.panel.reveal();
      WorkflowDashboardPanel.refresh(workspaceRoot);
      return;
    }

    WorkflowDashboardPanel.panel = vscode.window.createWebviewPanel(
      "uwf.dashboard",
      "UWF: Workflow Dashboard",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    WorkflowDashboardPanel.panel.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === "openSection" && typeof msg.sectionId === "string") {
        vscode.commands.executeCommand("uwf.openDashboardSection", msg.sectionId);
      }
      if (msg?.type === "refresh") {
        // Refresh the dashboard panel itself, in addition to the global refresh command.
        WorkflowDashboardPanel.refresh(workspaceRoot);
        vscode.commands.executeCommand("uwf.refreshAll");
      }
    }, null, context.subscriptions);

    PanelRegistry.register("dashboard", (root) => WorkflowDashboardPanel.refresh(root));
    WorkflowDashboardPanel.panel.onDidDispose(() => {
      PanelRegistry.unregister("dashboard");
      WorkflowDashboardPanel.panel = undefined;
    }, null, context.subscriptions);

    WorkflowDashboardPanel.refresh(workspaceRoot);
  }

  static refresh(workspaceRoot: string) {
    if (!WorkflowDashboardPanel.panel) return;
    const data = WorkflowInsightsService.collect(workspaceRoot);
    const cards = data.sections.map((section) => `
      <section class="card">
        <header>
          <div>
            <h3>${escHtml(section.title)}</h3>
            <p class="summary">${escHtml(section.summary)}</p>
          </div>
          <button data-section="${escHtml(section.id)}">Open interactive view ↗</button>
        </header>
        <ul>
          ${section.details.length ? section.details.map((d) => `<li>${escHtml(d)}</li>`).join("") : '<li class="empty">No data yet.</li>'}
        </ul>
      </section>
    `).join("\n");

    const body = `
      <style>
        .meta { margin-bottom: 10px; opacity: .8; }
        .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); }
        .card { border: 1px solid var(--vscode-panel-border, #444); border-radius: 8px; padding: 10px; }
        .card header { display: flex; justify-content: space-between; align-items: start; gap: 12px; }
        .card h3 { margin: 0; font-size: 14px; }
        .summary { margin: 3px 0 8px; opacity: .85; }
        ul { margin: 0; padding-left: 18px; }
        li { line-height: 1.5; }
        button { border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 12px; }
        button:hover { filter: brightness(1.07); }
      </style>
      <div class="toolbar">
        <h2>Universal Agentic Workflow Dashboard</h2>
        <button id="refreshBtn">Refresh</button>
      </div>
      <p class="meta">Archetype <strong>${escHtml(data.archetype)}</strong> · Phase <strong>${escHtml(data.currentPhase)}</strong> · Status <strong>${escHtml(data.status)}</strong> · Artifact root <code>${escHtml(data.artifactPath)}</code></p>
      <div class="grid">${cards}</div>
      <script>
        const vscode = acquireVsCodeApi();
        document.querySelectorAll('button[data-section]').forEach((btn) => {
          btn.addEventListener('click', () => {
            vscode.postMessage({ type: 'openSection', sectionId: btn.getAttribute('data-section') });
          });
        });
        document.getElementById('refreshBtn')?.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
      </script>
    `;

    WorkflowDashboardPanel.panel.webview.html = pageShell("UWF Workflow Dashboard", body);
  }
}
