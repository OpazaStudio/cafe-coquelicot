"use client";

import { useActionState } from "react";
import {
  SETTING_FIELDS,
  SETTING_GROUPS,
  type SettingGroup,
  type Settings,
} from "@/lib/settings-fields";
import { Panel, btnPrimary, input } from "../ui";
import { updateSettings, type SettingsState } from "./actions";

const GROUP_ORDER: SettingGroup[] = [
  "identity",
  "address",
  "contact",
  "host",
  "mediator",
  "shipping",
];

export function SettingsForm({ initial }: { initial: Settings }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    updateSettings,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-6">
      {GROUP_ORDER.map((group) => (
        <Panel key={group} title={SETTING_GROUPS[group]}>
          <div className="grid gap-4 md:grid-cols-2">
            {SETTING_FIELDS.filter((f) => f.group === group).map((field) => (
              <label
                key={field.key}
                className={`flex flex-col gap-1.5${field.multiline ? " md:col-span-2" : ""}`}
              >
                <span className="text-sm font-medium text-ink">{field.label}</span>
                {field.multiline ? (
                  <textarea
                    name={field.key}
                    defaultValue={initial[field.key]}
                    rows={3}
                    maxLength={2000}
                    className={input}
                  />
                ) : (
                  <input
                    type={field.kind ?? "text"}
                    name={field.key}
                    defaultValue={initial[field.key]}
                    maxLength={500}
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
            Paramètres enregistrés.
          </p>
        )}
      </div>
    </form>
  );
}
