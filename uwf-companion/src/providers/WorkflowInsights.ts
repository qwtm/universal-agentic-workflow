import * as fs from "fs";
import * as path from "path";
import { StageReader } from "../db/readers/StageReader";
import { WorkflowStateReader } from "../db/readers/WorkflowStateReader";
import { StageConfigLoader, WorkflowBlueprint } from "../config/StageConfigLoader";

export interface ArtifactInsight {
  workflow: string;
  stage: string;
  path: string;
  exists: boolean;
}

export interface WorkflowInsights {
  currentWorkflow: string | null;
  currentPhase: string | null;
  currentStatus: string | null;
  workflows: WorkflowBlueprint[];
  stageCounts: Record<string, number>;
  artifactInsights: ArtifactInsight[];
}

function resolveTemplatePath(template: string, outputPath: string, workspaceRoot: string): string {
  const replaced = template
    .replaceAll("{{output_path}}", outputPath)
    .replaceAll("{{cwd}}", workspaceRoot);
  return path.isAbsolute(replaced) ? replaced : path.join(workspaceRoot, replaced);
}

export function collectWorkflowInsights(workspaceRoot: string): WorkflowInsights {
  const stageReader = new StageReader(workspaceRoot);
  const stateReader = new WorkflowStateReader(workspaceRoot);
  const configLoader = new StageConfigLoader(workspaceRoot);

  try {
    const runs = stageReader.exists() ? stageReader.listAll() : [];
    const currentState = stateReader.exists() ? stateReader.getCurrent() : null;
    const workflows = configLoader.listWorkflowBlueprints();

    const stageCounts: Record<string, number> = {};
    for (const run of runs) {
      const key = `${run.workflow}:${run.status}`;
      stageCounts[key] = (stageCounts[key] ?? 0) + 1;
    }

    const artifactInsights: ArtifactInsight[] = [];
    for (const workflow of workflows) {
      for (const stage of workflow.stages) {
        for (const artifact of stage.outputs) {
          const resolved = resolveTemplatePath(artifact, workflow.outputPath, workspaceRoot);
          artifactInsights.push({
            workflow: workflow.workflow,
            stage: stage.name,
            path: path.relative(workspaceRoot, resolved),
            exists: fs.existsSync(resolved),
          });
        }
      }
    }

    return {
      currentWorkflow: runs.length ? runs[runs.length - 1]?.workflow ?? null : null,
      currentPhase: currentState?.phase ?? null,
      currentStatus: currentState?.status ?? null,
      workflows,
      stageCounts,
      artifactInsights,
    };
  } finally {
    stageReader.close();
    stateReader.close();
  }
}
