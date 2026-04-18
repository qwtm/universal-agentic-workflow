import * as vscode from "vscode";
import { WorkflowTreeProvider } from "./providers/WorkflowTreeProvider";
import { RequirementsPanel } from "./providers/RequirementsPanel";
import { ReviewPanel } from "./providers/ReviewPanel";
import { AdrPanel } from "./providers/AdrPanel";
import { DiscoveryPanel } from "./providers/DiscoveryPanel";
import { IssuesPanel } from "./providers/IssuesPanel";
import { StagesPanel } from "./providers/StagesPanel";
import { WorkflowStatePanel } from "./providers/WorkflowStatePanel";
import { PanelRegistry } from "./providers/PanelRegistry";
import { ReportBuilder } from "./reporter/ReportBuilder";
import { DbWatcher } from "./watchers/DbWatcher";
import { WorkflowDashboardPanel } from "./providers/WorkflowDashboardPanel";
import { WorkflowSectionPanel } from "./providers/WorkflowSectionPanel";

export function activate(context: vscode.ExtensionContext) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  const watcher = new DbWatcher();
  const treeProvider = new WorkflowTreeProvider(workspaceRoot);

  vscode.window.registerTreeDataProvider("uwf.workflowTree", treeProvider);

  watcher.onRefresh(() => {
    treeProvider.refresh();
    PanelRegistry.refreshAll(workspaceRoot);
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("uwf.openRequirements", () => {
      RequirementsPanel.show(context, workspaceRoot);
    }),
    vscode.commands.registerCommand("uwf.openReview", () => {
      ReviewPanel.show(context, workspaceRoot);
    }),
    vscode.commands.registerCommand("uwf.openAdrs", () => {
      AdrPanel.show(context, workspaceRoot);
    }),
    vscode.commands.registerCommand("uwf.openDiscoveries", () => {
      DiscoveryPanel.show(context, workspaceRoot);
    }),
    vscode.commands.registerCommand("uwf.openWorkflowState", () => {
      WorkflowStatePanel.show(context, workspaceRoot);
    }),
    vscode.commands.registerCommand("uwf.openDashboard", () => {
      WorkflowDashboardPanel.show(context, workspaceRoot);
    }),
    vscode.commands.registerCommand("uwf.openDashboardSection", (sectionId?: string) => {
      if (!sectionId) return;
      WorkflowSectionPanel.show(workspaceRoot, sectionId);
    }),
    vscode.commands.registerCommand("uwf.openStages", () => {
      StagesPanel.show(context, workspaceRoot);
    }),
    vscode.commands.registerCommand("uwf.openIssues", () => {
      IssuesPanel.show(context, workspaceRoot);
    }),
    vscode.commands.registerCommand("uwf.exportReport", async () => {
      const format = await vscode.window.showQuickPick(["JSON", "CSV"], {
        placeHolder: "Select export format",
      });
      if (!format) return;
      await ReportBuilder.export(workspaceRoot, format.toLowerCase() as "json" | "csv");
      vscode.window.showInformationMessage(`UWF report exported as ${format}.`);
    }),
    vscode.commands.registerCommand("uwf.refreshAll", () => {
      treeProvider.refresh();
      vscode.window.showInformationMessage("UWF: Refreshed.");
    }),
    { dispose: () => watcher.dispose() }
  );
}

export function deactivate() {}
