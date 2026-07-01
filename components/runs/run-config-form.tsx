"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { workflowKinds, type RunConfig, type WorkflowKind } from "@/lib/domain/types";
import { workflowLabels } from "@/lib/workflows/labels";

export type ModelDefaults = {
  cheapModel: string;
  strongModel: string;
};

export type RunConfigFormValues = {
  workflow: WorkflowKind;
  cheapModel: string;
  strongModel: string;
  maxOutputTokens: string;
  costLimitUsd: string;
};

export function defaultRunConfigFormValues(defaults: ModelDefaults): RunConfigFormValues {
  return {
    workflow: "cheap_first",
    cheapModel: defaults.cheapModel,
    strongModel: defaults.strongModel,
    maxOutputTokens: "",
    costLimitUsd: ""
  };
}

export type RunConfigValidationResult =
  | { ok: true; config: RunConfig }
  | { ok: false; error: string };

export function validateRunConfigForm(
  values: RunConfigFormValues,
  defaults: ModelDefaults
): RunConfigValidationResult {
  const parsedCostLimit =
    values.costLimitUsd.trim() === "" ? undefined : Number(values.costLimitUsd);
  if (parsedCostLimit !== undefined && (!Number.isFinite(parsedCostLimit) || parsedCostLimit <= 0)) {
    return { ok: false, error: "Cost budget must be a positive number." };
  }

  const parsedMaxTokens =
    values.maxOutputTokens.trim() === "" ? undefined : Number(values.maxOutputTokens);
  if (
    parsedMaxTokens !== undefined &&
    (!Number.isFinite(parsedMaxTokens) || !Number.isInteger(parsedMaxTokens) || parsedMaxTokens <= 0)
  ) {
    return { ok: false, error: "Max output tokens must be a positive integer." };
  }

  const cheapModel = values.cheapModel.trim();
  const strongModel = values.strongModel.trim();
  if (!cheapModel) {
    return { ok: false, error: "Cheap model is required." };
  }
  if (!strongModel) {
    return { ok: false, error: "Strong model is required." };
  }

  const config: RunConfig = {
    workflow: values.workflow,
    costLimitUsd: parsedCostLimit,
    maxOutputTokens: parsedMaxTokens
  };
  if (cheapModel !== defaults.cheapModel) {
    config.cheapModel = cheapModel;
  }
  if (strongModel !== defaults.strongModel) {
    config.strongModel = strongModel;
  }

  return { ok: true, config };
}

type RunConfigFormProps = {
  values: RunConfigFormValues;
  modelDefaults: ModelDefaults;
  onChange: (values: RunConfigFormValues) => void;
  disabled?: boolean;
  showMockHint?: boolean;
  idPrefix?: string;
};

export function RunConfigForm({
  values,
  modelDefaults,
  onChange,
  disabled = false,
  showMockHint = true,
  idPrefix = "run-config"
}: RunConfigFormProps) {
  function update<K extends keyof RunConfigFormValues>(key: K, value: RunConfigFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-workflow`}>Workflow</Label>
        <Select
          value={values.workflow}
          disabled={disabled}
          onValueChange={(value) => update("workflow", value as WorkflowKind)}
        >
          <SelectTrigger id={`${idPrefix}-workflow`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {workflowKinds.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {workflowLabels[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-cheap-model`}>Cheap model</Label>
        <Input
          id={`${idPrefix}-cheap-model`}
          value={values.cheapModel}
          disabled={disabled}
          onChange={(event) => update("cheapModel", event.target.value)}
          placeholder={modelDefaults.cheapModel}
          className="font-mono text-sm"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-strong-model`}>Strong model</Label>
        <Input
          id={`${idPrefix}-strong-model`}
          value={values.strongModel}
          disabled={disabled}
          onChange={(event) => update("strongModel", event.target.value)}
          placeholder={modelDefaults.strongModel}
          className="font-mono text-sm"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-max-tokens`}>Max output tokens (optional)</Label>
        <Input
          id={`${idPrefix}-max-tokens`}
          type="number"
          min="1"
          step="1"
          placeholder="1024"
          value={values.maxOutputTokens}
          disabled={disabled}
          onChange={(event) => update("maxOutputTokens", event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-cost-limit`}>Cost budget USD (optional)</Label>
        <Input
          id={`${idPrefix}-cost-limit`}
          type="number"
          step="0.0001"
          min="0.0001"
          placeholder="0.02"
          value={values.costLimitUsd}
          disabled={disabled}
          onChange={(event) => update("costLimitUsd", event.target.value)}
        />
      </div>

      {showMockHint ? (
        <p className="text-muted-foreground text-sm">
          Without <code className="font-mono">OPENROUTER_API_KEY</code>, runs use the deterministic mock
          provider and model fields are ignored.
        </p>
      ) : null}
    </div>
  );
}
