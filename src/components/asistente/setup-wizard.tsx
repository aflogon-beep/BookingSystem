"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CircleCheck, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { completeSetup } from "@/app/(panel)/panel/asistente/actions";
import { FieldHint } from "@/components/ajustes/box";
import { focusRing } from "@/components/panel/styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { PRODUCT_LIMITS } from "@/lib/domain/product";
import { RESOURCE_LIMITS } from "@/lib/domain/resources";
import { WEEKDAY_INITIALS, WEEKDAY_NAMES, daysLabel, parseTimes, previewSessions } from "@/lib/domain/schedule";
import { CURRENCIES, LANGUAGE_CODES, LANGUAGES, SETTINGS_LIMITS, isLanguageCode } from "@/lib/domain/settings";
import { SETUP_STEPS, checkSetupStep, type SetupContext, type SetupDraft, type SetupStep } from "@/lib/domain/setup";
import { cn } from "@/lib/utils";

const LAST_STEP: SetupStep = 5;

const chip = (on: boolean) =>
  cn(
    focusRing,
    "min-h-11 rounded-full border px-3.5 text-[0.84rem] font-medium tablet:min-h-8 tablet:px-[11px] tablet:text-[0.8rem]",
    on ? "border-[#b3d4f7] bg-primary-soft text-primary-dark" : "border-line bg-surface text-muted-foreground hover:text-foreground",
  );

function Field({ id, label, className, children }: { id: string; label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-[#2a3644]">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** Asistente de configuración inicial (prototipo: renderWizard), en cinco pasos y un resumen. */
export function SetupWizard({ initialDraft, context, today }: { initialDraft: SetupDraft; context: SetupContext; today: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [step, setStep] = useState<SetupStep>(0);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const update = (patch: Partial<SetupDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const updateTour = (patch: Partial<SetupDraft["tour"]>) => setDraft((current) => ({ ...current, tour: { ...current.tour, ...patch } }));

  function goTo(next: SetupStep) {
    setStep(next);
    setError("");
    // Al cambiar de paso, el foco va al título para que se lea el paso nuevo.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function next() {
    const problem = checkSetupStep(step, draft, context);
    if (problem) {
      setError(problem);
      return;
    }
    goTo(Math.min(step + 1, LAST_STEP) as SetupStep);
  }

  function finish() {
    setError("");
    startTransition(async () => {
      const result = await completeSetup(draft);
      if (!result.ok) {
        if (result.step !== LAST_STEP) goTo(result.step);
        setError(result.error);
        return;
      }
      toast.success("Panel creado con tus primeras salidas");
      router.push("/panel");
    });
  }

  const { title, subtitle } = SETUP_STEPS[step];
  const sessions = previewSessions(
    [{ weekdays: draft.tour.weekdays, times: parseTimes(draft.tour.times), language: draft.tour.language, validFrom: null, validTo: null }],
    today,
    14,
  ).length;

  return (
    <section aria-labelledby="wz-title" className="mx-auto flex w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card">
      <div className="flex flex-col gap-3 border-b border-line px-5 pt-5 pb-4 tablet:px-6">
        <span className="text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          Asistente · {step + 1} de {SETUP_STEPS.length}
        </span>
        <div aria-hidden="true" className="flex gap-1.5">
          {SETUP_STEPS.map((item, index) => (
            <span key={item.title} className={cn("h-1 flex-1 rounded-full", index <= step ? "bg-primary" : "bg-line")} />
          ))}
        </div>
        <div>
          <h1 id="wz-title" ref={headingRef} tabIndex={-1} className="text-[1.35rem] outline-none">
            {title}
          </h1>
          {subtitle ? <p className="mt-1 text-[0.9rem] text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 py-5 tablet:px-6">
        {step === 0 ? <Welcome /> : null}
        {step === 1 ? <BusinessStep draft={draft} update={update} updateTour={updateTour} /> : null}
        {step === 2 ? <TicketsStep draft={draft} update={update} /> : null}
        {step === 3 ? <TeamStep draft={draft} update={update} /> : null}
        {step === 4 ? <TourStep draft={draft} updateTour={updateTour} update={update} sessions={sessions} /> : null}
        {step === 5 ? <Summary draft={draft} sessions={sessions} /> : null}
        {error ? (
          <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2 text-[0.84rem] text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3.5 tablet:px-6">
        <Button type="button" variant="outline" disabled={step === 0 || pending} onClick={() => goTo((step - 1) as SetupStep)}>
          <ArrowLeft aria-hidden="true" />
          Atrás
        </Button>
        {step === LAST_STEP ? (
          <Button type="button" disabled={pending} onClick={finish}>
            {pending ? "Creando…" : "Crear mi panel"}
            <ArrowRight aria-hidden="true" />
          </Button>
        ) : (
          <Button type="button" onClick={next}>
            Continuar
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </div>
    </section>
  );
}

function Welcome() {
  return (
    <div className="flex flex-col gap-3 text-[0.9rem]">
      <p>Cinco pasos cortos con tus datos: negocio, entradas, equipo y primer tour. Al terminar tendrás salidas en el calendario y el tour a la venta en tu web.</p>
      <p className="text-muted-foreground">
        Lo que pongas se añade a lo que ya tengas: no se borra nada. Después puedes cambiarlo todo en Ajustes, Productos y Equipo.
      </p>
    </div>
  );
}

type StepProps = { draft: SetupDraft; update: (patch: Partial<SetupDraft>) => void };

function BusinessStep({ draft, update, updateTour }: StepProps & { updateTour: (patch: Partial<SetupDraft["tour"]>) => void }) {
  function toggle(code: string) {
    const languages = draft.languages.includes(code)
      ? draft.languages.filter((item) => item !== code)
      : LANGUAGE_CODES.filter((item) => item === code || draft.languages.includes(item));
    update({ languages, guides: draft.guides.map((guide) => ({ ...guide, languages: guide.languages.filter((item) => languages.includes(item)) })) });
    if (!languages.includes(draft.tour.language)) updateTour({ language: languages[0] ?? "es" });
  }

  return (
    <>
      <Field id="wz-name" label="Nombre de tu empresa">
        <Input
          id="wz-name"
          value={draft.businessName}
          maxLength={SETTINGS_LIMITS.businessName}
          autoComplete="organization"
          placeholder="Ej.: Tenerife Walking Tours"
          onChange={(event) => update({ businessName: event.target.value })}
        />
      </Field>
      <Field id="wz-currency" label="Moneda" className="max-w-[200px]">
        <NativeSelect id="wz-currency" value={draft.currency} onChange={(event) => update({ currency: event.target.value })}>
          {CURRENCIES.map((currency) => (
            <option key={currency}>{currency}</option>
          ))}
        </NativeSelect>
      </Field>
      <div className="flex flex-col gap-1.5">
        <span id="wz-languages" className="text-[0.8rem] font-medium text-[#2a3644]">
          Idiomas en los que haces tours
        </span>
        <div role="group" aria-labelledby="wz-languages" aria-describedby="wz-languages-hint" className="flex flex-wrap gap-1.5">
          {LANGUAGE_CODES.map((code) => (
            <button key={code} type="button" aria-pressed={draft.languages.includes(code)} onClick={() => toggle(code)} className={chip(draft.languages.includes(code))}>
              {LANGUAGES[code]}
            </button>
          ))}
        </div>
        <FieldHint id="wz-languages-hint">Cada salida tendrá un idioma y solo se le asignarán guías que lo hablen.</FieldHint>
      </div>
    </>
  );
}

function TicketsStep({ draft, update }: StepProps) {
  return (
    <ul aria-label="Tipos de entrada" className="flex flex-col gap-2">
      {draft.tickets.map((ticket, index) => (
        <li key={ticket.ref} className={cn("flex items-center gap-3 rounded-xl border-[1.5px] px-3.5 py-3", ticket.on ? "border-primary bg-primary-soft" : "border-line")}>
          <Switch
            checked={ticket.on}
            aria-label={`Vendo ${ticket.name}`}
            onCheckedChange={(on) => update({ tickets: draft.tickets.map((item, i) => (i === index ? { ...item, on } : item)) })}
          />
          <span className="min-w-0 text-[0.9rem]">
            <b className="font-semibold">{ticket.name}</b>
            {ticket.note ? <span className="text-[0.82rem] text-muted-foreground"> · {ticket.note}</span> : null}
            {ticket.takesSeat ? null : <span className="text-[0.82rem] text-muted-foreground"> · no ocupa plaza</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function TeamStep({ draft, update }: StepProps) {
  const setGuide = (index: number, patch: Partial<SetupDraft["guides"][number]>) =>
    update({ guides: draft.guides.map((guide, i) => (i === index ? { ...guide, ...patch } : guide)) });
  const setVehicle = (index: number, patch: Partial<SetupDraft["vehicles"][number]>) =>
    update({ vehicles: draft.vehicles.map((vehicle, i) => (i === index ? { ...vehicle, ...patch } : vehicle)) });

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.8rem] font-medium text-[#2a3644]">Guías</span>
          <Button type="button" variant="outline" size="sm" onClick={() => update({ guides: [...draft.guides, { name: "", languages: draft.languages.slice(0, 1) }] })}>
            <Plus aria-hidden="true" />
            Añadir guía
          </Button>
        </div>
        {draft.guides.length ? (
          <ul className="flex flex-col gap-2">
            {draft.guides.map((guide, index) => (
              <li key={index} className="flex flex-wrap items-center gap-2">
                <label htmlFor={`wz-g-${index}`} className="sr-only">
                  Nombre del guía {index + 1}
                </label>
                <Input
                  id={`wz-g-${index}`}
                  value={guide.name}
                  maxLength={RESOURCE_LIMITS.name}
                  placeholder="Nombre del guía"
                  onChange={(event) => setGuide(index, { name: event.target.value })}
                  className="min-w-[160px] flex-1"
                />
                <div role="group" aria-label={`Idiomas del guía ${index + 1}`} className="flex flex-wrap gap-1">
                  {draft.languages.map((code) => {
                    const on = guide.languages.includes(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        aria-pressed={on}
                        aria-label={isLanguageCode(code) ? LANGUAGES[code] : code}
                        onClick={() => setGuide(index, { languages: on ? guide.languages.filter((item) => item !== code) : [...guide.languages, code] })}
                        className={chip(on)}
                      >
                        {code.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar guía ${index + 1}`}
                  onClick={() => update({ guides: draft.guides.filter((_, i) => i !== index) })}
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.84rem] text-muted-foreground">Sin guías por ahora. Puedes darlos de alta luego en Equipo.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.8rem] font-medium text-[#2a3644]">
            Vehículos <span className="font-normal text-muted-foreground">· opcional</span>
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => update({ vehicles: [...draft.vehicles, { name: "", seats: "16" }] })}>
            <Plus aria-hidden="true" />
            Añadir vehículo
          </Button>
        </div>
        {draft.vehicles.length ? (
          <ul className="flex flex-col gap-2">
            {draft.vehicles.map((vehicle, index) => (
              <li key={index} className="flex flex-wrap items-center gap-2">
                <label htmlFor={`wz-v-${index}`} className="sr-only">
                  Nombre del vehículo {index + 1}
                </label>
                <Input
                  id={`wz-v-${index}`}
                  value={vehicle.name}
                  maxLength={RESOURCE_LIMITS.name}
                  placeholder="Ej.: Minibús 01"
                  onChange={(event) => setVehicle(index, { name: event.target.value })}
                  className="min-w-[160px] flex-1"
                />
                <div className="flex w-[140px] items-center gap-1.5">
                  <label htmlFor={`wz-vs-${index}`} className="sr-only">
                    Plazas del vehículo {index + 1}
                  </label>
                  <Input
                    id={`wz-vs-${index}`}
                    type="number"
                    inputMode="numeric"
                    min={RESOURCE_LIMITS.seats.min}
                    max={RESOURCE_LIMITS.seats.max}
                    value={vehicle.seats}
                    onChange={(event) => setVehicle(index, { seats: event.target.value })}
                    className="text-right tabular-nums"
                  />
                  <span className="text-[0.8rem] text-muted-foreground">plazas</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar vehículo ${index + 1}`}
                  onClick={() => update({ vehicles: draft.vehicles.filter((_, i) => i !== index) })}
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.84rem] text-muted-foreground">Si tus tours son a pie, no hace falta.</p>
        )}
      </div>
    </>
  );
}

function TourStep({
  draft,
  update,
  updateTour,
  sessions,
}: StepProps & { updateTour: (patch: Partial<SetupDraft["tour"]>) => void; sessions: number }) {
  const id = useId();
  const tour = draft.tour;
  return (
    <>
      <Field id="wz-t-name" label="Nombre del tour">
        <Input
          id="wz-t-name"
          value={tour.name}
          maxLength={PRODUCT_LIMITS.name}
          placeholder="Ej.: Casco histórico de La Laguna"
          onChange={(event) => updateTour({ name: event.target.value })}
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field id="wz-t-dur" label="Duración (min)">
          <Input
            id="wz-t-dur"
            type="number"
            inputMode="numeric"
            min={PRODUCT_LIMITS.duration.min}
            max={PRODUCT_LIMITS.duration.max}
            step={15}
            value={tour.durationMin}
            onChange={(event) => updateTour({ durationMin: event.target.value })}
          />
        </Field>
        <Field id="wz-t-cap" label="Aforo">
          <Input
            id="wz-t-cap"
            type="number"
            inputMode="numeric"
            min={PRODUCT_LIMITS.capacity.min}
            max={PRODUCT_LIMITS.capacity.max}
            value={tour.capacity}
            onChange={(event) => updateTour({ capacity: event.target.value })}
          />
        </Field>
        <Field id="wz-t-min" label="Mínimo">
          <Input
            id="wz-t-min"
            type="number"
            inputMode="numeric"
            min={1}
            value={tour.minPax}
            onChange={(event) => updateTour({ minPax: event.target.value })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {draft.tickets.map((ticket, index) =>
          ticket.on ? (
            <Field key={ticket.ref} id={`${id}-p${index}`} label={`Precio de ${ticket.name}`}>
              <div className="flex items-center gap-1.5">
                <Input
                  id={`${id}-p${index}`}
                  inputMode="decimal"
                  value={ticket.price}
                  placeholder="0"
                  onChange={(event) => update({ tickets: draft.tickets.map((item, i) => (i === index ? { ...item, price: event.target.value } : item)) })}
                  className="text-right tabular-nums"
                />
                <span className="text-[0.8rem] text-muted-foreground">{draft.currency}</span>
              </div>
            </Field>
          ) : null,
        )}
      </div>
      <Field id="wz-t-meet" label="Punto de encuentro">
        <Input
          id="wz-t-meet"
          value={tour.meetingPoint}
          maxLength={PRODUCT_LIMITS.meetingPoint}
          onChange={(event) => updateTour({ meetingPoint: event.target.value })}
        />
      </Field>
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
        <span id="wz-t-days" className="text-[0.8rem] font-medium text-[#2a3644]">
          Horario
        </span>
        <div role="group" aria-labelledby="wz-t-days" className="flex gap-1">
          {WEEKDAY_INITIALS.map((initial, dayIndex) => {
            const day = dayIndex + 1;
            const on = tour.weekdays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-label={WEEKDAY_NAMES[dayIndex]}
                aria-pressed={on}
                onClick={() => updateTour({ weekdays: on ? tour.weekdays.filter((item) => item !== day) : [...tour.weekdays, day].sort((a, b) => a - b) })}
                className={cn(
                  "size-10 rounded-[7px] border border-line bg-surface font-mono text-[0.76rem] font-medium text-muted-foreground outline-none tablet:size-[31px]",
                  "focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  on && "border-primary bg-primary text-white",
                )}
              >
                {initial}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
          <Field id="wz-t-times" label="Horas de salida">
            <Input id="wz-t-times" value={tour.times} placeholder="10:00, 17:00" aria-describedby="wz-t-hint" onChange={(event) => updateTour({ times: event.target.value })} />
          </Field>
          <Field id="wz-t-lang" label="Idioma">
            <NativeSelect id="wz-t-lang" value={tour.language} onChange={(event) => updateTour({ language: event.target.value })}>
              {draft.languages.map((code) => (
                <option key={code} value={code}>
                  {isLanguageCode(code) ? LANGUAGES[code] : code}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <p id="wz-t-hint" aria-live="polite" className="text-[0.75rem] text-faint">
          {sessions
            ? `Esto genera ${sessions} salidas en las próximas dos semanas.`
            : "Con este horario no saldría ninguna salida: revisa días y horas (formato 10:00)."}
        </p>
      </div>
    </>
  );
}

function Summary({ draft, sessions }: { draft: SetupDraft; sessions: number }) {
  const guides = draft.guides.filter((guide) => guide.name.trim()).length;
  const vehicles = draft.vehicles.filter((vehicle) => vehicle.name.trim()).length;
  const rows: [string, ReactNode][] = [
    ["Negocio", draft.businessName.trim()],
    ["Idiomas", draft.languages.map((code) => code.toUpperCase()).join(" · ")],
    [
      "Entradas",
      draft.tickets
        .filter((ticket) => ticket.on)
        .map((ticket) => ticket.name)
        .join(", "),
    ],
    ["Equipo", `${guides} ${guides === 1 ? "guía" : "guías"} · ${vehicles} ${vehicles === 1 ? "vehículo" : "vehículos"}`],
    [
      "Primer tour",
      <>
        {draft.tour.name.trim()}
        <br />
        <span className="text-[0.8rem] font-normal text-muted-foreground">
          {daysLabel(draft.tour.weekdays)} · {parseTimes(draft.tour.times).join(", ")} · {draft.tour.language.toUpperCase()}
        </span>
      </>,
    ],
  ];
  return (
    <>
      <CircleCheck aria-hidden="true" className="mx-auto size-12 text-ok" />
      <dl className="divide-y divide-line-2 rounded-xl border border-line">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 px-3.5 py-2.5 text-[0.9rem]">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[0.84rem] text-muted-foreground">
        Se generarán <b className="text-foreground">{sessions}</b> salidas en las próximas dos semanas.
      </p>
    </>
  );
}
