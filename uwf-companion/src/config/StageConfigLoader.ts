import * as fs from "fs";
import * as path from "path";

export interface StageBlueprint {
  name: string;
  agent: string;
  advancesPhaseTo: string | null;
  outputs: string[];
}

export interface WorkflowBlueprint {
  workflow: string;
  skill: string;
  outputPath: string;
  artifactPrefix: string | null;
  stages: StageBlueprint[];
}

function cleanValue(value: string): string {
  return value.trim().replace(/^['\"]|['\"]$/g, "");
}

function parseStagesYaml(content: string, skill: string): WorkflowBlueprint | null {
  const lines = content.split(/\r?\n/);
  let workflow = "";
  let outputPath = "./tmp/workflow-artifacts";
  let artifactPrefix: string | null = null;
  const stages: StageBlueprint[] = [];

  let current: StageBlueprint | null = null;
  let inOutputs = false;

  for (const rawLine of lines) {
    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (trimmed.startsWith("workflow:")) {
      workflow = cleanValue(trimmed.slice("workflow:".length));
      continue;
    }
    if (trimmed.startsWith("output_path:")) {
      outputPath = cleanValue(trimmed.slice("output_path:".length));
      continue;
    }
    if (trimmed.startsWith("artifact_prefix:")) {
      artifactPrefix = cleanValue(trimmed.slice("artifact_prefix:".length));
      continue;
    }

    if (trimmed.startsWith("- name:")) {
      current = {
        name: cleanValue(trimmed.slice("- name:".length)),
        agent: "",
        advancesPhaseTo: null,
        outputs: [],
      };
      stages.push(current);
      inOutputs = false;
      continue;
    }

    if (!current) {
      continue;
    }

    if (indent <= 2 && !trimmed.startsWith("-")) {
      inOutputs = false;
    }

    if (trimmed.startsWith("agent:")) {
      current.agent = cleanValue(trimmed.slice("agent:".length));
      continue;
    }

    if (trimmed.startsWith("advances_phase_to:")) {
      current.advancesPhaseTo = cleanValue(trimmed.slice("advances_phase_to:".length));
      continue;
    }

    if (trimmed === "outputs:") {
      inOutputs = true;
      continue;
    }

    if (inOutputs && trimmed.startsWith("- ")) {
      current.outputs.push(cleanValue(trimmed.slice(2)));
    }
  }

  if (!workflow || !stages.length) {
    return null;
  }

  return { workflow, skill, outputPath, artifactPrefix, stages };
}

export class StageConfigLoader {
  constructor(private readonly workspaceRoot: string) {}

  listWorkflowBlueprints(): WorkflowBlueprint[] {
    const skillsDir = path.join(this.workspaceRoot, ".github", "skills");
    if (!fs.existsSync(skillsDir)) {
      return [];
    }

    return fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const skill = entry.name;
        const stagesPath = path.join(skillsDir, skill, "stages.yaml");
        if (!fs.existsSync(stagesPath)) {
          return null;
        }
        return parseStagesYaml(fs.readFileSync(stagesPath, "utf8"), skill);
      })
      .filter((bp): bp is WorkflowBlueprint => Boolean(bp));
  }
}

export const __testables = { parseStagesYaml };
