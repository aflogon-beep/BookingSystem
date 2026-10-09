"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { toggleBusinessLanguage } from "@/app/(panel)/panel/ajustes/actions";
import { focusRing } from "@/components/panel/styles";
import { LANGUAGE_CODES, LANGUAGES } from "@/lib/domain/settings";
import { cn } from "@/lib/utils";

export function LanguageChips({ active }: { active: readonly string[] }) {
  const [pending, startTransition] = useTransition();

  function toggle(code: string) {
    startTransition(async () => {
      const result = await toggleBusinessLanguage(code);
      if (result.ok) toast.success("Ajustes guardados");
      else toast.error(result.error);
    });
  }

  return (
    <div role="group" aria-labelledby="cf-languages" aria-describedby="cf-languages-hint" className="flex flex-wrap gap-1.5">
      {LANGUAGE_CODES.map((code) => {
        const on = active.includes(code);
        return (
          <button
            key={code}
            type="button"
            aria-pressed={on}
            disabled={pending}
            onClick={() => toggle(code)}
            className={cn(
              focusRing,
              "min-h-11 rounded-full border px-3.5 text-[0.84rem] font-medium tablet:min-h-8 tablet:px-[11px] tablet:text-[0.8rem]",
              "disabled:cursor-wait",
              on ? "border-[#b3d4f7] bg-primary-soft text-primary-dark" : "border-line bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            {LANGUAGES[code]}
          </button>
        );
      })}
    </div>
  );
}
