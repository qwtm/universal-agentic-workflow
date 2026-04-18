import * as vscode from "vscode";
import { escHtml, pageShell, renderDynamicTable } from "./webviewUtils";
import { WorkflowInsightsService } from "../services/WorkflowInsightsService";
import { PanelRegistry } from "./PanelRegistry";

const SECTION_MAP: Record<string, { title: string; key: keyof ReturnType<typeof WorkflowInsightsService.collect> }> = {
  "workflow-state": { title: "Workflow State", key: "sections" },
  stages: { title: "Stages", key: "stagesRows" },
  artifacts: { title: "Artifacts", key: "sections" },
  issues: { title: "Issues", key: "issuesRows" },
  requirements: { title: "Requirements", key: "requirementsRows" },
  discoveries: { title: "Discoveries", key: "discoveriesRows" },
  adrs: { title: "ADRs", key: "adrsRows" },
  review: { title: "Review Findings", key: "reviewRows" },
};

export class WorkflowSectionPanel {
  static show(workspaceRoot: string, sectionId: string) {
    const def = SECTION_MAP[sectionId] ?? { title: sectionId, key: "sections" as const };
    const panel = vscode.window.createWebviewPanel(
      `uwf.section.${sectionId}`,
      `UWF: ${def.title} (Interactive)`,
      vscode.ViewColumn.Active,
      { enableScripts: false, retainContextWhenHidden: true }
    );

    const refresh = () => {
      const snapshot = WorkflowInsightsService.collect(workspaceRoot);
      const rows = snapshot[def.key];

      let body = "";
      if (sectionId === "artifacts") {
        const artifactSection = snapshot.sections.find((s) => s.id === "artifacts");
        body = `<h2>Planned Artifacts</h2><ul>${(artifactSection?.details ?? []).map((d) => `<li><code>${escHtml(d)}</code></li>`).join("")}</ul>`;
      } else if (sectionId === "workflow-state") {
        body = `<h2>Workflow State</h2><pre>${escHtml(JSON.stringify(snapshot.sections.find((s) => s.id === "workflow-state"), null, 2))}</pre>`;
      } else if (Array.isArray(rows) && rows.length) {
        const first = rows[0] as Record<string, unknown>;
        body = `<h2>${escHtml(def.title)}</h2>${renderDynamicTable(Object.keys(first), rows as unknown[])}`;
      } else {
        body = `<h2>${escHtml(def.title)}</h2><p class="empty">No records available.</p>`;
      }

      panel.webview.html = pageShell(`UWF ${def.title}`, body);
    };

    // Register this panel with the PanelRegistry so DbWatcher-driven refreshes
    // will re-render the drill-down view on DB writes.
    PanelRegistry.register(panel, refresh);

    // Ensure we clean up the registry entry when the panel is disposed.
    panel.onDidDispose(() => {
      PanelRegistry.unregister(panel);
    });

    // Initial render.
    refresh();
  }
}
