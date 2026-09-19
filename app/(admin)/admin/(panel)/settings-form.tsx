"use client";

import { useActionState } from "react";
import {
  fieldMaxLength,
  fieldsForGroups,
  SETTING_GROUPS,
  type SettingGroup,
  type Settings,
} from "@/lib/settings-fields";
import { Panel, btnPrimary, input } from "./ui";

export type SettingsState = { error: string } | { ok: true } | undefined;

export type SettingsAction = (
  prev: SettingsState,
  formData: FormData,
) => Promise<SettingsState>;

export function SettingsForm({
  initial,
  groups,
  action: submit,
  savedLabel = "Paramètres enregistrés.",
}: {
  initial: Settings;
  groups: SettingGroup[];
  action: SettingsAction;
  savedLabel?: string;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    submit,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-6">
      {groups.map((group) => (
        <Panel key={group} title={SETTING_GROUPS[group]}>
          <div className="grid gap-4 md:grid-cols-2">
            {fieldsForGroups([group]).map((field) => (
              <label
                key={field.key}
                className={`flex flex-col gap-1.5${field.multiline ? " md:col-span-2" : ""}`}
              >
                <span className="text-sm font-medium text-ink">{field.label}</span>
                {field.multiline ? (
                  <textarea
                    name={field.key}
                    defaultValue={initial[field.key]}
                    rows={field.rows ?? 3}
                    maxLength={fieldMaxLength(field)}
                    className={input}
                  />
                ) : (
                  <input
                    type={field.kind ?? "text"}
                    name={field.key}
                    defaultValue={initial[field.key]}
                    maxLength={fieldMaxLength(field)}
                    className={input}
                  />
                )}
                {field.hint && <span className="text-xs text-muted">{field.hint}</span>}
              </label>
            ))}
          </div>
        </Panel>
      ))}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {state && "error" in state && (
          <p role="alert" className="text-sm font-medium text-danger">
            {state.error}
          </p>
        )}
        {state && "ok" in state && (
          <p role="status" className="text-sm font-medium text-ink">
            {savedLabel}
          </p>
        )}
      </div>
    </form>
  );
}
