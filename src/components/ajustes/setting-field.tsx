"use client";

import { useId, useRef, useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { toast } from "sonner";

import { saveSetting } from "@/app/(panel)/panel/ajustes/actions";
import { FieldHint } from "@/components/ajustes/box";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { SettingsField } from "@/lib/domain/settings";
import { cn } from "@/lib/utils";

/** Guarda un campo de Ajustes al salir de él (o al cambiar, en los select) y avisa con un toast. */
function useAutoSave(field: SettingsField, initial: string) {
  const saved = useRef(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function commit(value: string) {
    if (value === saved.current) return;
    startTransition(async () => {
      const result = await saveSetting(field, value);
      if (result.ok) {
        saved.current = value;
        setError(null);
        toast.success("Ajustes guardados");
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return { commit, error, pending };
}

type FieldShellProps = {
  id: string;
  label: string;
  hint?: ReactNode;
  error: string | null;
  className?: string;
  children: ReactNode;
};

function FieldShell({ id, label, hint, error, className, children }: FieldShellProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-[#2a3644]">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[0.75rem] text-danger">
          {error}
        </p>
      ) : null}
      {hint ? <FieldHint id={`${id}-hint`}>{hint}</FieldHint> : null}
    </div>
  );
}

type SettingInputProps = Omit<ComponentProps<typeof Input>, "id" | "defaultValue" | "onBlur"> & {
  field: SettingsField;
  label: string;
  defaultValue: string | number;
  hint?: ReactNode;
  /** Texto pegado a la derecha del campo («horas antes»). */
  suffix?: string;
  className?: string;
};

export function SettingInput({ field, label, defaultValue, hint, suffix, className, ...inputProps }: SettingInputProps) {
  const id = `cf-${field}-${useId()}`;
  const { commit, error, pending } = useAutoSave(field, String(defaultValue));
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;

  const input = (
    <Input
      id={id}
      name={field}
      defaultValue={defaultValue}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      aria-busy={pending || undefined}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit(event.currentTarget.value);
      }}
      className={suffix ? "rounded-r-none" : undefined}
      {...inputProps}
    />
  );

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      {suffix ? (
        <div className="flex">
          {input}
          <span className="flex flex-none items-center rounded-r-[10px] border border-l-0 border-input bg-surface-2 px-3 text-[0.86rem] whitespace-nowrap text-muted-foreground">
            {suffix}
          </span>
        </div>
      ) : (
        input
      )}
    </FieldShell>
  );
}

type SettingSelectProps = {
  field: SettingsField;
  label: string;
  defaultValue: string;
  options: readonly string[];
  hint?: ReactNode;
  className?: string;
};

export function SettingSelect({ field, label, defaultValue, options, hint, className }: SettingSelectProps) {
  const id = `cf-${field}-${useId()}`;
  const { commit, error, pending } = useAutoSave(field, defaultValue);

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <NativeSelect
        id={id}
        name={field}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-busy={pending || undefined}
        onChange={(event) => commit(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </NativeSelect>
    </FieldShell>
  );
}
