import * as vscode from "vscode";
import { collectWorkflowInsights } from "./WorkflowInsights";
import { escHtml, pageShell } from "./webviewUtils";
import { PanelRegistry } from "./PanelRegistry";

const TOP_ACTIONS = `
<div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:10px;">
  <a class="btn" href="command:uwf.openWorkflowState">Workflow State</a>
  <a class="btn" href="command:uwf.openStages">Stages</a>
  <a class="btn" href="command:uwf.openIssues">Issues</a>
  <a class="btn" href="command:uwf.openRequirements">Requirements</a>
</div>`;

const ALLOWED_WEBVIEW_COMMANDS = new Set<string>([
  "uwf.openWorkflowState",
  "uwf.openStages",
  "uwf.openIssues",
  "uwf.openRequirements",
]);

const EXTRA_STYLE = `
<style>
.section { border:1px solid var(--vscode-panel-border,#444); border-radius:8px; padding:10px; margin-bottom:12px; }
.section-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.section-header h3 { margin:0; font-size:13px; }
.btn { display:inline-block; background:var(--vscode-button-background); color:var(--vscode-button-foreground); border:0; border-radius:4px; padding:4px 8px; cursor:pointer; text-decoration:none; font-size:12px; }
.small { font-size:12px; opacity:.75; }
ul { margin:4px 0 0 16px; }
</style>`;

export class DashboardPanel {
  private static panel: vscode.WebviewPanel | undefined;

  static show(context: vscode.ExtensionContext, workspaceRoot: string) {
    if (DashboardPanel.panel) {
      DashboardPanel.panel.reveal();
      DashboardPanel.refresh(workspaceRoot);
      return;
    }

    DashboardPanel.panel = vscode.window.createWebviewPanel(
      "uwf.dashboard",
      "UWF: Workflow Dashboard",
      vscode.ViewColumn.One,
      { enableScripts: false, enableCommandUris: true, retainContextWhenHidden: true }
    );

    DashboardPanel.panel.webview.onDidReceiveMessage((msg) => {
      const command = msg?.command;
      if (typeof command === "string" && ALLOWED_WEBVIEW_COMMANDS.has(command)) {
        void vscode.commands.executeCommand(command);
      }
    }, undefined, context.subscriptions);

    PanelRegistry.register("dashboard", (root) => DashboardPanel.refresh(root));
    DashboardPanel.panel.onDidDispose(() => {
      PanelRegistry.unregister("dashboard");
      DashboardPanel.panel = undefined;
    }, null, context.subscriptions);

    DashboardPanel.refresh(workspaceRoot);
  }

  static refresh(workspaceRoot: string) {
    if (!DashboardPanel.panel) return;
    const insights = collectWorkflowInsights(workspaceRoot);
    const stageCountRows = Object.entries(insights.stageCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, count]) => `<li><code>${escHtml(k)}</code>: ${count}</li>`)
      .join("");

    const plannedArtifacts = insights.artifactInsights.slice(0, 40).map((artifact) => {
      const icon = artifact.exists === null ? "🔷" : artifact.exists ? "✅" : "⬜";
      return `<li>${icon} <b>${escHtml(artifact.workflow)}</b> / ${escHtml(artifact.stage)} <span class="small">${escHtml(artifact.path)}</span></li>`;
    }).join("");

    const workflowCards = insights.workflows.map((workflow) => {
      const stageSample = workflow.stages.slice(0, 8).map((s) => `<li>${escHtml(s.name)} <span class="small">${escHtml(s.agent)}</span></li>`).join("");
      return `<div class="section">
        <div class="section-header">
          <h3>${escHtml(workflow.workflow)} <span class="small">(${escHtml(workflow.skill)})</span></h3>
          <a href="command:uwf.openStages">Open</a>
        </div>
        <div class="small">Archetype output path: <code>${escHtml(workflow.outputPath)}</code></div>
        <ul>${stageSample || "<li>No stages declared.</li>"}</ul>
      </div>`;
    }).join("");

    const html = pageShell("UWF Dashboard", `${EXTRA_STYLE}
      ${TOP_ACTIONS}
      <div class="section">
        <div class="section-header"><h3>Live Workflow State</h3><a href="command:uwf.openWorkflowState">Open webview</a></div>
        <div>Current workflow: <b>${escHtml(insights.currentWorkflow ?? "—")}</b></div>
        <div>Phase / status: <b>${escHtml(insights.currentPhase ?? "—")}</b> / <b>${escHtml(insights.currentStatus ?? "—")}</b></div>
      </div>
      <div class="section">
        <div class="section-header"><h3>Executed Stages</h3><a href="command:uwf.openStages">Open webview</a></div>
        <ul>${stageCountRows || "<li>No stage runs yet.</li>"}</ul>
      </div>
      <div class="section">
        <div class="section-header"><h3>Artifacts (declared + observed)</h3><a href="command:uwf.openStages">Open webview</a></div>
        <ul>${plannedArtifacts || "<li>No artifact declarations found in stages.yaml files.</li>"}</ul>
      </div>
      ${workflowCards || '<p class="empty">No declarative stage archetypes found.</p>'}
    `);

    DashboardPanel.panel.webview.html = html;
  }
}
