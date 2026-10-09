"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Avisos del prototipo: píldora oscura translúcida abajo a la izquierda (encima de las pestañas en móvil). */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-left"
      offset={16}
      mobileOffset={{ bottom: "calc(88px + env(safe-area-inset-bottom))", left: 16, right: 16 }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-center gap-2 rounded-[9px] bg-[rgb(29_29_31/0.92)] px-3.5 py-2.5 text-[0.84rem] text-white shadow-[0_10px_30px_rgb(10_20_32/0.25)] backdrop-blur-[10px]",
          icon: "[&_svg]:size-4",
          error: "[&_[data-icon]]:text-[#ff6961]",
          success: "[&_[data-icon]]:text-[#30d158]",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
