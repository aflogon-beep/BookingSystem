import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/** Select nativo con el estilo de Input: en móvil abre el selector del sistema. */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select
        data-slot="native-select"
        className={cn(
          "h-11 w-full min-w-0 appearance-none rounded-[10px] border border-input bg-surface pr-9 pl-3 text-[0.95rem] text-foreground outline-none tablet:h-10 tablet:text-sm",
          "focus-visible:border-[#66aaf0] focus-visible:ring-[3px] focus-visible:ring-primary/15",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { NativeSelect };
