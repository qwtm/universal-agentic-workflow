import * as vscode from "vscode";
import { StageReader } from "../db/readers/StageReader";
import { IssuesReader } from "../db/readers/IssuesReader";
import { WorkflowStateReader } from "../db/readers/WorkflowStateReader";
import { StageConfigLoader } from "../config/StageConfigLoader";

export class WorkflowTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    description?: string,
    command?: vscode.Command
  ) {
    super(label, collapsibleState);
    this.description = description;
    this.command = command;
  }
}

export class WorkflowTreeProvider
  implements vscode.TreeDataProvider<WorkflowTreeItem>
{
  private _onDidChangeTreeData =
    new vscode.EventEmitter<WorkflowTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private stageReader: StageReader;
  private issuesReader: IssuesReader;
  private stateReader: WorkflowStateReader;
  private stageConfigLoader: StageConfigLoader;

  constructor(private readonly workspaceRoot: string) {
    this.stageReader = new StageReader(workspaceRoot);
    this.issuesReader = new IssuesReader(workspaceRoot);
    this.stateReader = new WorkflowStateReader(workspaceRoot);
    this.stageConfigLoader = new StageConfigLoader(workspaceRoot);
  }

  refresh() {
    this.stageReader.close();
    this.issuesReader.close();
    this.stateReader.close();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: WorkflowTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: WorkflowTreeItem): WorkflowTreeItem[] {
    if (element) return [];

    const items: WorkflowTreeItem[] = [];

    // Workflow state section — always visible
    {
      let desc = "not initialized";
      if (this.stateReader.exists()) {
        try {
          const state = this.stateReader.getCurrent();
          desc = state ? `${state.phase} · ${state.status}` : "—";
        } catch { desc = "unavailable"; }
      }
    items.push(new WorkflowTreeItem(
      "Workflow State",
      vscode.TreeItemCollapsibleState.None,
      desc,
      { command: "uwf.openWorkflowState", title: "Open Workflow State", arguments: [] }
    ));

    const archetypes = this.stageConfigLoader.listWorkflowBlueprints();
    items.push(new WorkflowTreeItem(
      `Archetypes (${archetypes.length})`,
      vscode.TreeItemCollapsibleState.None,
      archetypes.slice(0, 2).map((w) => w.workflow).join(", ") || "none",
      { command: "uwf.openDashboard", title: "Open Workflow Dashboard", arguments: [] }
    ));

    const plannedArtifacts = archetypes.reduce((acc, workflow) => {
      return acc + workflow.stages.reduce((innerAcc, stage) => innerAcc + stage.outputs.length, 0);
    }, 0);
    items.push(new WorkflowTreeItem(
      `Artifacts (${plannedArtifacts})`,
      vscode.TreeItemCollapsibleState.None,
      "declared in stages.yaml",
      { command: "uwf.openDashboard", title: "Open Workflow Dashboard", arguments: [] }
    ));
    }

    // Stages section
    if (this.stageReader.exists()) {
      try {
        const stages = this.stageReader.listAll();
        items.push(
          new WorkflowTreeItem(
            `Stages (${stages.length})`,
            vscode.TreeItemCollapsibleState.None,
            stages.filter((s) => s.status === "active").length + " active",
            { command: "uwf.openStages", title: "Open Stages", arguments: [] }
          )
        );
      } catch {
        items.push(new WorkflowTreeItem("Stages", vscode.TreeItemCollapsibleState.None, "unavailable"));
      }
    }

    // Issues section
    if (this.issuesReader.exists()) {
      try {
        const all = this.issuesReader.listAll();
        const counts = { open: 0, active: 0, closed: 0 };
        for (const i of all) {
          if (i.status in counts) counts[i.status as keyof typeof counts]++;
        }
        const parts = [
          counts.active ? `${counts.active} active` : "",
          counts.open ? `${counts.open} open` : "",
          counts.closed ? `${counts.closed} closed` : "",
        ].filter(Boolean).join(" · ");
        items.push(
          new WorkflowTreeItem(
            `Issues (${all.length})`,
            vscode.TreeItemCollapsibleState.None,
            parts || "empty",
            { command: "uwf.openIssues", title: "Open Issues", arguments: [] }
          )
        );
      } catch {
        items.push(new WorkflowTreeItem("Issues", vscode.TreeItemCollapsibleState.None, "unavailable"));
      }
    }

    items.push(
      new WorkflowTreeItem("Requirements", vscode.TreeItemCollapsibleState.None, undefined, {
        command: "uwf.openRequirements", title: "Open Requirements", arguments: [],
      }),
      new WorkflowTreeItem("ADRs", vscode.TreeItemCollapsibleState.None, undefined, {
        command: "uwf.openAdrs", title: "Open ADRs", arguments: [],
      }),
      new WorkflowTreeItem("Discoveries", vscode.TreeItemCollapsibleState.None, undefined, {
        command: "uwf.openDiscoveries", title: "Open Discoveries", arguments: [],
      }),
      new WorkflowTreeItem("Review Findings", vscode.TreeItemCollapsibleState.None, undefined, {
        command: "uwf.openReview", title: "Open Review", arguments: [],
      })
    );

    return items;
  }
}
