import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { StageReader } from "../db/readers/StageReader";
import { WorkflowStateReader } from "../db/readers/WorkflowStateReader";
import { IssuesReader } from "../db/readers/IssuesReader";
import { RequirementsReader } from "../db/readers/RequirementsReader";
import { DiscoveryReader } from "../db/readers/DiscoveryReader";
import { ReviewReader } from "../db/readers/ReviewReader";
import { AdrReader } from "../db/readers/AdrReader";

export interface WorkflowStageConfig {
  name: string;
  agent: string;
  outputs: string[];
}

export interface WorkflowConfig {
  file: string;
  workflow: string;
  artifactPrefix: string;
  outputPath: string;
  stages: WorkflowStageConfig[];
}

export interface DashboardSection {
  id: string;
  title: string;
  summary: string;
  details: string[];
}

export interface WorkflowInsights {
  generatedAt: string;
  archetype: string;
  currentPhase: string;
  status: string;
  artifactPath: string;
  sections: DashboardSection[];
  stagesRows: Array<Record<string, unknown>>;
  issuesRows: Array<Record<string, unknown>>;
  requirementsRows: Array<Record<string, unknown>>;
  discoveriesRows: Array<Record<string, unknown>>;
  adrsRows: Array<Record<string, unknown>>;
  reviewRows: Array<Record<string, unknown>>;
}

function parseStagesYaml(yamlPath: string): WorkflowConfig | null {
  try {
    const text = fs.readFileSync(yamlPath, "utf8");
    const lines = text.split(/\r?\n/);
    const workflow = lines.find((l) => /^workflow:\s*/.test(l))?.replace(/^workflow:\s*/, "").trim() ?? "unknown";
    const artifactPrefix = lines.find((l) => /^artifact_prefix:\s*/.test(l))?.replace(/^artifact_prefix:\s*/, "").trim() ?? "workflow";
    const outputPath = lines.find((l) => /^output_path:\s*/.test(l))?.replace(/^output_path:\s*/, "").trim() ?? "./tmp/workflow-artifacts";

    const stages: WorkflowStageConfig[] = [];
    let current: WorkflowStageConfig | null = null;
    let inOutputs = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line.startsWith("- name:")) {
        if (current) stages.push(current);
        current = {
          name: line.replace("- name:", "").trim(),
          agent: "unknown",
          outputs: [],
        };
        inOutputs = false;
        continue;
      }

      if (!current) continue;

      if (line.startsWith("agent:")) {
        current.agent = line.replace("agent:", "").trim();
        inOutputs = false;
        continue;
      }

      if (line.startsWith("outputs:")) {
        inOutputs = true;
        continue;
      }

      if (inOutputs && line.startsWith("- ")) {
        current.outputs.push(line.replace(/^-\s*/, "").replace(/^"|"$/g, "").trim());
        continue;
      }

      if (inOutputs && line && !line.startsWith("#") && !line.startsWith("- ")) {
        inOutputs = false;
      }
    }

    if (current) stages.push(current);

    return {
      file: yamlPath,
      workflow,
      artifactPrefix,
      outputPath,
      stages,
    };
  } catch (error) {
    console.error(`Failed to read or parse workflow stages YAML at ${yamlPath}:`, error);
    return null;
  }
}

function loadWorkflowConfig(workspaceRoot: string): WorkflowConfig | null {
  const conf = vscode.workspace.getConfiguration("uwf");
  const relativePath = conf.get<string>("workflowStagesPath") ?? ".github/skills/uwf-sw_dev/stages.yaml";
  const fullPath = path.join(workspaceRoot, relativePath);
  if (fs.existsSync(fullPath)) {
    return parseStagesYaml(fullPath);
  }

  const skillsDir = path.join(workspaceRoot, ".github", "skills");
  if (!fs.existsSync(skillsDir)) return null;
  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const d of skillDirs) {
    const candidate = path.join(skillsDir, d.name, "stages.yaml");
    if (fs.existsSync(candidate)) return parseStagesYaml(candidate);
  }
  return null;
}

function toRowArray<T>(rows: T[]): Array<Record<string, unknown>> {
  return rows as Array<Record<string, unknown>>;
}

export class WorkflowInsightsService {
  static collect(workspaceRoot: string): WorkflowInsights {
    const stateReader = new WorkflowStateReader(workspaceRoot);
    const stageReader = new StageReader(workspaceRoot);
    const issuesReader = new IssuesReader(workspaceRoot);
    const reqReader = new RequirementsReader(workspaceRoot);
    const discReader = new DiscoveryReader(workspaceRoot);
    const reviewReader = new ReviewReader(workspaceRoot);
    const adrReader = new AdrReader(workspaceRoot);

    try {
      const state = stateReader.exists() ? stateReader.getCurrent() : null;
      const stageRows = stageReader.exists() ? stageReader.listAll() : [];
      const issuesRows = issuesReader.exists() ? issuesReader.listAll() : [];
      const requirementsRows = reqReader.exists() ? reqReader.listAll() : [];
      const discoveriesRows = discReader.exists() ? discReader.listAll() : [];
      const adrsRows = adrReader.exists() ? adrReader.listAll() : [];
      const reviewRuns = reviewReader.exists() ? reviewReader.listReviews() : [];
      const reviewRows = reviewRuns.flatMap((r) => reviewReader.listFindings(r.id));

      const config = loadWorkflowConfig(workspaceRoot);
      const completedStages = stageRows.filter((s) => s.status === "completed").length;
      const activeStages = stageRows.filter((s) => s.status === "active").length;
      const openIssues = issuesRows.filter((i) => i.status === "open" || i.status === "active").length;
      const openDiscoveries = discoveriesRows.filter((d) => d.status !== "closed").length;

      const plannedArtifacts = config?.stages.flatMap((s) => s.outputs) ?? [];

      return {
        generatedAt: new Date().toISOString(),
        archetype: config?.workflow ?? "unknown",
        currentPhase: state?.phase ?? "unknown",
        status: state?.status ?? "unknown",
        artifactPath: state?.artifact_path ?? config?.outputPath ?? "./tmp/workflow-artifacts",
        sections: [
          {
            id: "workflow-state",
            title: "Workflow State",
            summary: `${state?.phase ?? "unknown"} · ${state?.status ?? "unknown"}`,
            details: [
              `Archetype: ${config?.workflow ?? "unknown"}`,
              `Current agent: ${state?.current_agent ?? "—"}`,
              `Artifact path: ${state?.artifact_path ?? config?.outputPath ?? "—"}`,
            ],
          },
          {
            id: "stages",
            title: "Stages",
            summary: `${completedStages}/${stageRows.length} completed · ${activeStages} active`,
            details: (config?.stages ?? []).slice(0, 8).map((s) => `${s.name} → ${s.agent}`),
          },
          {
            id: "artifacts",
            title: "Artifacts",
            summary: `${plannedArtifacts.length} planned outputs`,
            details: plannedArtifacts.slice(0, 8),
          },
          {
            id: "issues",
            title: "Issues",
            summary: `${openIssues} open/active · ${issuesRows.length} total`,
            details: issuesRows.slice(0, 6).map((i) => `${i.id}: ${i.title}`),
          },
          {
            id: "requirements",
            title: "Requirements",
            summary: `${requirementsRows.length} captured`,
            details: requirementsRows.slice(0, 6).map((r) => `${r.id}: ${r.title}`),
          },
          {
            id: "discoveries",
            title: "Discoveries",
            summary: `${openDiscoveries} open gaps/signals`,
            details: discoveriesRows.slice(0, 6).map((d) => `${d.id}: ${d.category ?? "unknown"}`),
          },
        ],
        stagesRows: toRowArray(stageRows),
        issuesRows: toRowArray(issuesRows),
        requirementsRows: toRowArray(requirementsRows),
        discoveriesRows: toRowArray(discoveriesRows),
        adrsRows: toRowArray(adrsRows),
        reviewRows: toRowArray(reviewRows),
      };
    } finally {
      stateReader.close();
      stageReader.close();
      issuesReader.close();
      reqReader.close();
      discReader.close();
      reviewReader.close();
      adrReader.close();
    }
  }
}
