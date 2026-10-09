"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, Clock, ImageUp, Languages, LoaderCircle, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { deleteProduct, saveProduct } from "@/app/(panel)/panel/productos/actions";
import { FieldHint } from "@/components/ajustes/box";
import { ProductArt } from "@/components/productos/product-art";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Pill } from "@/components/ui/pill";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/db/browser";
import { formatCents } from "@/lib/domain/money";
import {
  PRODUCT_COLORS,
  PRODUCT_LIMITS,
  PRODUCT_PHOTO_BUCKET,
  PRODUCT_PHOTO_MAX_BYTES,
  durationLabel,
  formatPriceInput,
  parsePriceInput,
  photoExtension,
  productPhotoUrl,
  type ProductInput,
  type ProductTab,
} from "@/lib/domain/product";
import { LANGUAGES, isLanguageCode } from "@/lib/domain/settings";
import { WEEKDAY_INITIALS, WEEKDAY_NAMES, parseTimes, previewSessions, shortDateLabel } from "@/lib/domain/schedule";
import { getPublicEnv } from "@/lib/env";
import { cn } from "@/lib/utils";

export type EditorTicketType = { id: string; name: string; note: string; takesSeat: boolean };

export type EditorProduct = {
  id: string | null;
  name: string;
  description: string;
  meetingPoint: string;
  nameEn: string;
  descriptionEn: string;
  meetingPointEn: string;
  place: string;
  durationMin: number;
  capacity: number;
  minPax: number;
  pickup: boolean;
  color: string;
  photoPath: string | null;
  active: boolean;
  prices: { ticketTypeId: string; priceCents: number }[];
  rules: { weekdays: number[]; times: string[]; language: string; validFrom: string | null; validTo: string | null }[];
};

type DraftRule = { key: number; weekdays: number[]; timesRaw: string; language: string; validFrom: string; validTo: string };

type Draft = {
  name: string;
  description: string;
  meetingPoint: string;
  nameEn: string;
  descriptionEn: string;
  meetingPointEn: string;
  place: string;
  durationMin: string;
  capacity: string;
  minPax: string;
  pickup: boolean;
  color: string;
  photoPath: string | null;
  prices: Record<string, { on: boolean; raw: string }>;
  rules: DraftRule[];
};

const TABS: { id: ProductTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "precios", label: "Entradas y precios" },
  { id: "horarios", label: "Horarios" },
];

const PREVIEW_DAYS = 14;
const PREVIEW_MAX_CHIPS = 36;

let ruleKey = 0;
const nextRuleKey = () => ++ruleKey;

function toDraft(product: EditorProduct, ticketTypes: readonly EditorTicketType[]): Draft {
  const prices: Draft["prices"] = {};
  for (const ticketType of ticketTypes) {
    const price = product.prices.find((item) => item.ticketTypeId === ticketType.id);
    prices[ticketType.id] = { on: !!price, raw: price ? formatPriceInput(price.priceCents) : "" };
  }
  return {
    name: product.name,
    description: product.description,
    meetingPoint: product.meetingPoint,
    nameEn: product.nameEn,
    descriptionEn: product.descriptionEn,
    meetingPointEn: product.meetingPointEn,
    place: product.place,
    durationMin: String(product.durationMin),
    capacity: String(product.capacity),
    minPax: String(product.minPax),
    pickup: product.pickup,
    color: product.color,
    photoPath: product.photoPath,
    prices,
    rules: product.rules.map((rule) => ({
      key: nextRuleKey(),
      weekdays: [...rule.weekdays],
      timesRaw: rule.times.join(", "),
      language: rule.language,
      validFrom: rule.validFrom ?? "",
      validTo: rule.validTo ?? "",
    })),
  };
}

// Un campo numérico vacío se envía como NaN para que el servidor diga «escribe un número».
const toNumber = (raw: string) => (raw.trim() === "" ? Number.NaN : Number(raw));

type Built = { ok: true; input: ProductInput } | { ok: false; error: string; tab: ProductTab };

/** Pasa el borrador al formato del servidor. Solo comprueba lo que el servidor no puede explicar mejor. */
function buildInput(draft: Draft, active: boolean, ticketTypes: readonly EditorTicketType[]): Built {
  if (!draft.name.trim()) return { ok: false, error: "Ponle nombre al producto", tab: "general" };
  const prices: ProductInput["prices"] = [];
  for (const ticketType of ticketTypes) {
    const price = draft.prices[ticketType.id];
    if (!price?.on) continue;
    const cents = parsePriceInput(price.raw);
    if (cents === null) return { ok: false, error: `Pon un precio válido a «${ticketType.name}», por ejemplo 45 o 12,50`, tab: "precios" };
    prices.push({ ticketTypeId: ticketType.id, priceCents: cents });
  }
  if (!prices.length) return { ok: false, error: "Activa al menos un tipo de entrada", tab: "precios" };
  return {
    ok: true,
    input: {
      name: draft.name,
      description: draft.description,
      meetingPoint: draft.meetingPoint,
      nameEn: draft.nameEn,
      descriptionEn: draft.descriptionEn,
      meetingPointEn: draft.meetingPointEn,
      place: draft.place,
      durationMin: toNumber(draft.durationMin),
      capacity: toNumber(draft.capacity),
      minPax: toNumber(draft.minPax),
      pickup: draft.pickup,
      color: draft.color as ProductInput["color"],
      photoPath: draft.photoPath,
      active,
      prices,
      rules: draft.rules.map((rule) => ({
        weekdays: rule.weekdays,
        times: parseTimes(rule.timesRaw),
        language: rule.language,
        validFrom: rule.validFrom || null,
        validTo: rule.validTo || null,
      })),
    },
  };
}

type EditorProps = {
  product: EditorProduct;
  ticketTypes: EditorTicketType[];
  languages: string[];
  currency: string;
  today: string;
};

export function ProductEditor({ product, ticketTypes, languages, currency, today }: EditorProps) {
  const router = useRouter();
  const isNew = product.id === null;
  const [draft, setDraft] = useState(() => toDraft(product, ticketTypes));
  const [tab, setTab] = useState<ProductTab>("general");
  const [saving, startSaving] = useTransition();
  const [uploading, setUploading] = useState(false);
  // Fotos subidas en esta edición y aún sin guardar: si se cambian otra vez, se borran. Vive aquí
  // y no en la pestaña General porque esta se desmonta al cambiar de pestaña.
  const [unsavedPhotos] = useState(() => new Set<string>());
  const baseId = useId();

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  function save() {
    const built = buildInput(draft, product.active, ticketTypes);
    if (!built.ok) {
      setTab(built.tab);
      toast.error(built.error);
      return;
    }
    startSaving(async () => {
      const result = await saveProduct(product.id, built.input);
      if (!result.ok) {
        setTab(result.tab);
        toast.error(result.error);
        return;
      }
      toast.success("Producto guardado");
      router.push("/panel/productos");
    });
  }

  const title = isNew ? "Nuevo producto" : product.name || "Producto";

  return (
    <section className="flex flex-col gap-4 tablet:gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-1 px-1">
          <Link href="/panel/productos">
            <ArrowLeft aria-hidden="true" />
            Productos
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-[1.25rem] tablet:text-[1.45rem]">{title}</h1>
        <p className="mt-[3px] text-[0.86rem] text-muted-foreground">
          {isNew ? "Rellena las pestañas y guarda." : "Los cambios se aplican al guardar."}
        </p>
      </div>

      <div className="grid items-start gap-[18px] desk:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card">
          <Tabs baseId={baseId} tab={tab} onChange={setTab} />
          <div
            role="tabpanel"
            id={`${baseId}-panel-${tab}`}
            aria-labelledby={`${baseId}-tab-${tab}`}
            className="p-4 tablet:p-5"
          >
            {tab === "general" ? (
              <GeneralTab
                draft={draft}
                update={update}
                photo={{ uploading, setUploading, unsaved: unsavedPhotos }}
              />
            ) : null}
            {tab === "precios" ? (
              <PricesTab draft={draft} update={update} ticketTypes={ticketTypes} currency={currency} />
            ) : null}
            {tab === "horarios" ? <ScheduleTab draft={draft} setDraft={setDraft} languages={languages} today={today} /> : null}
          </div>
        </div>
        <CustomerPreview draft={draft} seed={product.id ?? "nuevo"} ticketTypes={ticketTypes} />
      </div>

      <div className="sticky bottom-[calc(58px+env(safe-area-inset-bottom,0px))] z-30 -mx-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-line bg-white/94 px-4 py-2.5 backdrop-blur-md tablet:bottom-0 tablet:-mx-6 tablet:px-6">
        <span className="hidden text-[0.8rem] text-muted-foreground tablet:inline">
          {isNew ? "Producto nuevo sin guardar" : "Editando · los cambios no afectan a reservas ya hechas"}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {product.id ? <DeleteProduct id={product.id} name={product.name} /> : null}
          <Button asChild variant="outline">
            <Link href="/panel/productos">Descartar</Link>
          </Button>
          <Button onClick={save} disabled={saving || uploading}>
            {saving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
            Guardar producto
          </Button>
        </div>
      </div>
    </section>
  );
}

function Tabs({ baseId, tab, onChange }: { baseId: string; tab: ProductTab; onChange: (tab: ProductTab) => void }) {
  const listRef = useRef<HTMLDivElement>(null);

  // Flechas izquierda/derecha para moverse entre pestañas (patrón ARIA de pestañas).
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const index = TABS.findIndex((item) => item.id === tab);
    const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    if (!next) return;
    onChange(next.id);
    listRef.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${baseId}-tab-${next.id}`)}`)?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Secciones del producto"
      onKeyDown={onKeyDown}
      className="flex gap-0.5 overflow-x-auto border-b border-line px-2"
    >
      {TABS.map((item) => {
        const selected = item.id === tab;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${baseId}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              "-mb-px min-h-11 border-b-2 border-transparent px-3 text-[0.86rem] font-medium whitespace-nowrap text-muted-foreground outline-none",
              "focus-visible:rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50",
              selected && "border-primary text-primary-dark",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-[#2a3644]">
        {label}
      </Label>
      {children}
      {hint ? <FieldHint id={`${id}-hint`}>{hint}</FieldHint> : null}
    </div>
  );
}

type TabProps = { draft: Draft; update: (patch: Partial<Draft>) => void };

type PhotoState = { uploading: boolean; setUploading: (uploading: boolean) => void; unsaved: Set<string> };

function GeneralTab({ draft, update, photo }: TabProps & { photo: PhotoState }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5">
      <Field id="pf-name" label="Nombre del tour" className="col-span-full">
        <Input
          id="pf-name"
          value={draft.name}
          maxLength={PRODUCT_LIMITS.name}
          placeholder="Ej.: Ruta de los volcanes"
          onChange={(event) => update({ name: event.target.value })}
        />
      </Field>
      <Field id="pf-desc" label="Descripción" hint="Se muestra al cliente en la web de reservas." className="col-span-full">
        <textarea
          id="pf-desc"
          rows={3}
          value={draft.description}
          maxLength={PRODUCT_LIMITS.description}
          aria-describedby="pf-desc-hint"
          onChange={(event) => update({ description: event.target.value })}
          className="w-full min-w-0 rounded-[10px] border border-input bg-surface px-3 py-2 text-[0.95rem] text-foreground outline-none placeholder:text-faint focus-visible:border-[#66aaf0] focus-visible:ring-[3px] focus-visible:ring-primary/15 tablet:text-sm"
        />
      </Field>
      <Field id="pf-meet" label="Punto de encuentro">
        <Input
          id="pf-meet"
          value={draft.meetingPoint}
          maxLength={PRODUCT_LIMITS.meetingPoint}
          onChange={(event) => update({ meetingPoint: event.target.value })}
        />
      </Field>
      <Field id="pf-place" label="Zona del recorrido" hint="Se usa para saber dónde está el equipo.">
        <Input
          id="pf-place"
          value={draft.place}
          maxLength={PRODUCT_LIMITS.place}
          placeholder="Ej.: Parque Nacional del Teide"
          aria-describedby="pf-place-hint"
          onChange={(event) => update({ place: event.target.value })}
        />
      </Field>
      <Field id="pf-dur" label="Duración (min)">
        <Input
          id="pf-dur"
          type="number"
          inputMode="numeric"
          min={PRODUCT_LIMITS.duration.min}
          max={PRODUCT_LIMITS.duration.max}
          step={15}
          value={draft.durationMin}
          onChange={(event) => update({ durationMin: event.target.value })}
        />
      </Field>
      <Field id="pf-cap" label="Aforo por salida">
        <Input
          id="pf-cap"
          type="number"
          inputMode="numeric"
          min={PRODUCT_LIMITS.capacity.min}
          max={PRODUCT_LIMITS.capacity.max}
          value={draft.capacity}
          onChange={(event) => update({ capacity: event.target.value })}
        />
      </Field>
      <Field id="pf-min" label="Mínimo para salir" hint="Por debajo verás un aviso.">
        <Input
          id="pf-min"
          type="number"
          inputMode="numeric"
          min={1}
          max={PRODUCT_LIMITS.capacity.max}
          value={draft.minPax}
          aria-describedby="pf-min-hint"
          onChange={(event) => update({ minPax: event.target.value })}
        />
      </Field>
      <div className="col-span-full flex items-center gap-2.5">
        <Switch id="pf-pick" checked={draft.pickup} onCheckedChange={(pickup) => update({ pickup })} />
        <label htmlFor="pf-pick" className="text-[0.9rem]">
          Ofrece recogida en hotel <span className="text-muted-foreground">(se pide el hotel al reservar)</span>
        </label>
      </div>
      <fieldset className="col-span-full grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5 rounded-xl border border-line-2 p-3.5">
        <legend className="px-1 text-[0.8rem] font-medium text-[#2a3644]">
          En inglés <span className="font-normal text-muted-foreground">(web en inglés; si lo dejas vacío, se ve en español)</span>
        </legend>
        <Field id="pf-name-en" label="Nombre en inglés" className="col-span-full">
          <Input
            id="pf-name-en"
            lang="en"
            value={draft.nameEn}
            maxLength={PRODUCT_LIMITS.name}
            placeholder="E.g.: Volcano route"
            onChange={(event) => update({ nameEn: event.target.value })}
          />
        </Field>
        <Field id="pf-desc-en" label="Descripción en inglés" className="col-span-full">
          <textarea
            id="pf-desc-en"
            lang="en"
            rows={3}
            value={draft.descriptionEn}
            maxLength={PRODUCT_LIMITS.description}
            onChange={(event) => update({ descriptionEn: event.target.value })}
            className="w-full min-w-0 rounded-[10px] border border-input bg-surface px-3 py-2 text-[0.95rem] text-foreground outline-none placeholder:text-faint focus-visible:border-[#66aaf0] focus-visible:ring-[3px] focus-visible:ring-primary/15 tablet:text-sm"
          />
        </Field>
        <Field id="pf-meet-en" label="Punto de encuentro en inglés">
          <Input
            id="pf-meet-en"
            lang="en"
            value={draft.meetingPointEn}
            maxLength={PRODUCT_LIMITS.meetingPoint}
            onChange={(event) => update({ meetingPointEn: event.target.value })}
          />
        </Field>
      </fieldset>
      <PhotoField draft={draft} update={update} {...photo} />
      <div className="col-span-full flex flex-col gap-1.5">
        <span id="pf-color" className="text-[0.8rem] font-medium text-[#2a3644]">
          Color
        </span>
        <div role="group" aria-labelledby="pf-color" className="flex flex-wrap gap-1.5">
          {PRODUCT_COLORS.map((color, index) => (
            <button
              key={color}
              type="button"
              aria-label={`Color ${index + 1}`}
              aria-pressed={draft.color === color}
              onClick={() => update({ color })}
              className="grid size-11 place-items-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 tablet:size-9"
            >
              <span
                className="block size-7 rounded-full"
                style={{
                  background: color,
                  boxShadow: draft.color === color ? `0 0 0 2px #fff, 0 0 0 4px ${color}` : undefined,
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Sube la foto directamente a Storage desde el navegador (las políticas solo dejan al equipo).
 * El producto guarda solo la ruta, y el servidor la valida al guardar.
 */
function PhotoField({ draft, update, uploading, setUploading, unsaved }: TabProps & PhotoState) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function discardUnsaved(path: string | null) {
    if (!path || !unsaved.has(path)) return;
    unsaved.delete(path);
    await createClient().storage.from(PRODUCT_PHOTO_BUCKET).remove([path]);
  }

  async function upload(file: File) {
    const extension = photoExtension(file.type);
    if (!extension) return toast.error("La foto tiene que ser JPG, PNG o WebP");
    if (file.size > PRODUCT_PHOTO_MAX_BYTES) return toast.error("La foto pesa más de 5 MB");
    setUploading(true);
    const path = `${crypto.randomUUID()}.${extension}`;
    const { error } = await createClient()
      .storage.from(PRODUCT_PHOTO_BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    setUploading(false);
    if (error) return toast.error("No se pudo subir la foto. Inténtalo de nuevo.");
    const previous = draft.photoPath;
    unsaved.add(path);
    update({ photoPath: path });
    await discardUnsaved(previous);
  }

  return (
    <div className="col-span-full flex flex-col gap-1.5">
      <span className="text-[0.8rem] font-medium text-[#2a3644]">Imagen</span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Foto del tour"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
        <Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ImageUp aria-hidden="true" />}
          {draft.photoPath ? "Cambiar foto" : "Subir foto"}
        </Button>
        {draft.photoPath ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const previous = draft.photoPath;
              update({ photoPath: null });
              void discardUnsaved(previous);
            }}
          >
            <X aria-hidden="true" />
            Quitar foto
          </Button>
        ) : null}
      </div>
      <FieldHint>
        {draft.photoPath ? "La foto se verá en la web de reservas." : "Sin foto se usa una ilustración con el color del tour."}{" "}
        JPG, PNG o WebP de hasta 5 MB.
      </FieldHint>
    </div>
  );
}

function PricesTab({
  draft,
  update,
  ticketTypes,
  currency,
}: TabProps & { ticketTypes: readonly EditorTicketType[]; currency: string }) {
  const setPrice = (id: string, patch: Partial<{ on: boolean; raw: string }>) => {
    const current = draft.prices[id] ?? { on: false, raw: "" };
    update({ prices: { ...draft.prices, [id]: { ...current, ...patch } } });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.84rem] text-muted-foreground">
        Los tipos de entrada se definen en Ajustes. Activa los que vende este tour y pon su precio.
      </p>
      {ticketTypes.length ? (
        <ul aria-label="Precios" className="divide-y divide-line-2 rounded-xl border border-line">
          {ticketTypes.map((ticketType) => {
            const price = draft.prices[ticketType.id] ?? { on: false, raw: "" };
            const priceId = `pp-${ticketType.id}`;
            return (
              <li key={ticketType.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <Switch
                  checked={price.on}
                  aria-label={`Vende ${ticketType.name}`}
                  onCheckedChange={(on) => setPrice(ticketType.id, { on })}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <b className="font-semibold">{ticketType.name}</b>
                    {ticketType.takesSeat ? null : <Pill>no ocupa plaza</Pill>}
                  </div>
                  {ticketType.note ? <p className="text-[0.78rem] text-muted-foreground">{ticketType.note}</p> : null}
                </div>
                <div className="flex w-[150px] items-center gap-1.5">
                  <label htmlFor={priceId} className="sr-only">
                    Precio de {ticketType.name}
                  </label>
                  <Input
                    id={priceId}
                    inputMode="decimal"
                    value={price.raw}
                    disabled={!price.on}
                    placeholder="0"
                    onChange={(event) => setPrice(ticketType.id, { raw: event.target.value })}
                    className="text-right tabular-nums"
                  />
                  <span className="text-[0.8rem] text-muted-foreground">{currency}</span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[0.86rem]">
          No hay tipos de entrada.{" "}
          <Link href="/panel/ajustes/entradas" className="text-primary underline-offset-4 hover:underline">
            Créalos en Ajustes
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function ScheduleTab({
  draft,
  setDraft,
  languages,
  today,
}: {
  draft: Draft;
  setDraft: (update: (draft: Draft) => Draft) => void;
  languages: string[];
  today: string;
}) {
  const updateRule = (key: number, patch: Partial<DraftRule>) =>
    setDraft((current) => ({
      ...current,
      rules: current.rules.map((rule) => (rule.key === key ? { ...rule, ...patch } : rule)),
    }));

  const addRule = () =>
    setDraft((current) => ({
      ...current,
      rules: [
        ...current.rules,
        { key: nextRuleKey(), weekdays: [1, 2, 3, 4, 5], timesRaw: "10:00", language: languages[0] ?? "es", validFrom: "", validTo: "" },
      ],
    }));

  const removeRule = (key: number) =>
    setDraft((current) => ({ ...current, rules: current.rules.filter((rule) => rule.key !== key) }));

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.84rem] text-muted-foreground">
          Cada regla son unos días, unas horas y un idioma. Usa Desde/Hasta para temporadas.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={addRule}>
          <Plus aria-hidden="true" />
          Añadir regla
        </Button>
      </div>
      {draft.rules.length ? (
        <ol aria-label="Reglas de horario">
          {draft.rules.map((rule, index) => (
            <RuleRow
              key={rule.key}
              rule={rule}
              index={index}
              languages={languages}
              onChange={(patch) => updateRule(rule.key, patch)}
              onRemove={() => removeRule(rule.key)}
            />
          ))}
        </ol>
      ) : (
        <div className="my-3 flex flex-col items-center gap-1 rounded-xl border border-dashed border-line px-4 py-8 text-center">
          <b className="font-semibold">Sin reglas</b>
          <span className="text-[0.84rem] text-muted-foreground">Sin reglas este producto no genera salidas.</span>
        </div>
      )}
      <SessionsPreview draft={draft} today={today} />
    </div>
  );
}

function RuleRow({
  rule,
  index,
  languages,
  onChange,
  onRemove,
}: {
  rule: DraftRule;
  index: number;
  languages: string[];
  onChange: (patch: Partial<DraftRule>) => void;
  onRemove: () => void;
}) {
  const id = `r${rule.key}`;
  // Si la regla tiene un idioma que ya no está en Ajustes, se muestra igualmente para poder cambiarlo.
  const options = languages.includes(rule.language) ? languages : [...languages, rule.language];

  return (
    <li
      aria-label={`Regla ${index + 1}`}
      className="flex flex-wrap items-end gap-3 border-b border-dashed border-line py-3.5 last:border-b-0"
    >
      <div className="flex flex-col gap-1.5">
        <span id={`${id}-days`} className="text-[0.8rem] font-medium text-[#2a3644]">
          Días
        </span>
        <div role="group" aria-labelledby={`${id}-days`} className="flex gap-1">
          {WEEKDAY_INITIALS.map((initial, dayIndex) => {
            const day = dayIndex + 1;
            const on = rule.weekdays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-label={WEEKDAY_NAMES[dayIndex]}
                aria-pressed={on}
                onClick={() =>
                  onChange({ weekdays: on ? rule.weekdays.filter((item) => item !== day) : [...rule.weekdays, day].sort((a, b) => a - b) })
                }
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
      </div>
      <Field id={`${id}-times`} label="Horas de salida" className="min-w-[140px] flex-1">
        <Input
          id={`${id}-times`}
          value={rule.timesRaw}
          placeholder="09:00, 17:30"
          onChange={(event) => onChange({ timesRaw: event.target.value })}
        />
      </Field>
      <Field id={`${id}-lang`} label="Idioma" className="w-[140px]">
        <NativeSelect id={`${id}-lang`} value={rule.language} onChange={(event) => onChange({ language: event.target.value })}>
          {options.map((code) => (
            <option key={code} value={code}>
              {isLanguageCode(code) ? LANGUAGES[code] : code.toUpperCase()}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${id}-from`} label="Desde" className="w-[150px] max-tablet:flex-1">
        <Input id={`${id}-from`} type="date" value={rule.validFrom} onChange={(event) => onChange({ validFrom: event.target.value })} />
      </Field>
      <Field id={`${id}-to`} label="Hasta" className="w-[150px] max-tablet:flex-1">
        <Input id={`${id}-to`} type="date" value={rule.validTo} onChange={(event) => onChange({ validTo: event.target.value })} />
      </Field>
      <Button type="button" variant="ghost" size="icon" aria-label={`Quitar regla ${index + 1}`} onClick={onRemove}>
        <Trash2 aria-hidden="true" />
      </Button>
    </li>
  );
}

function SessionsPreview({ draft, today }: { draft: Draft; today: string }) {
  const sessions = useMemo(
    () =>
      previewSessions(
        draft.rules.map((rule) => ({
          weekdays: rule.weekdays,
          times: parseTimes(rule.timesRaw),
          language: rule.language,
          validFrom: rule.validFrom || null,
          validTo: rule.validTo || null,
        })),
        today,
        PREVIEW_DAYS,
      ),
    [draft.rules, today],
  );
  const capacity = Number(draft.capacity) || 0;

  return (
    <section aria-labelledby="preview-title" className="mt-3 flex flex-col gap-2">
      <h3 id="preview-title" className="text-[0.68rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        Salidas de los próximos 14 días
      </h3>
      {sessions.length ? (
        <>
          <ul aria-label="Salidas previstas" className="flex flex-wrap gap-1.5">
            {sessions.slice(0, PREVIEW_MAX_CHIPS).map((session) => (
              <li key={`${session.date} ${session.time}`}>
                <Pill mono>
                  {shortDateLabel(session.date)} {session.time}&nbsp;{session.language.toUpperCase()}
                </Pill>
              </li>
            ))}
            {sessions.length > PREVIEW_MAX_CHIPS ? (
              <li>
                <Pill mono>+{sessions.length - PREVIEW_MAX_CHIPS}</Pill>
              </li>
            ) : null}
          </ul>
          <p className="text-[0.8rem] text-muted-foreground">
            {sessions.length} {sessions.length === 1 ? "salida" : "salidas"} · {sessions.length * capacity} plazas a la venta en 14
            días
          </p>
        </>
      ) : (
        <p className="text-[0.8rem] text-muted-foreground">Con estas reglas no sale ninguna salida.</p>
      )}
    </section>
  );
}

function CustomerPreview({ draft, seed, ticketTypes }: { draft: Draft; seed: string; ticketTypes: readonly EditorTicketType[] }) {
  const photoUrl = draft.photoPath ? productPhotoUrl(getPublicEnv().supabaseUrl, draft.photoPath) : null;
  const prices = ticketTypes
    .map((ticketType) => draft.prices[ticketType.id])
    .filter((price) => price?.on)
    .map((price) => parsePriceInput(price?.raw ?? "") ?? 0)
    .filter((cents) => cents > 0);
  const languages = [...new Set(draft.rules.map((rule) => rule.language.toUpperCase()))];
  const duration = Number(draft.durationMin);

  return (
    <aside aria-label="Así lo verá el cliente" className="flex flex-col gap-3">
      <div className="text-[0.68rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Así lo verá el cliente</div>
      <div className="flex flex-col overflow-hidden rounded-[18px] border border-black/5 bg-surface shadow-card">
        <ProductArt seed={seed} color={draft.color} photoUrl={photoUrl} />
        <div className="flex flex-col gap-2 px-4 py-3.5">
          <h2 className="text-[1rem]">{draft.name.trim() || "Nombre del tour"}</h2>
          <p className="line-clamp-3 text-[0.84rem] text-muted-foreground">{draft.description.trim() || "Descripción del tour"}</p>
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[0.78rem] text-muted-foreground">
            {Number.isInteger(duration) && duration > 0 ? (
              <span className="inline-flex items-center gap-[5px]">
                <Clock className="size-3.5" aria-hidden="true" />
                {durationLabel(duration)}
              </span>
            ) : null}
            {languages.length ? (
              <span className="inline-flex items-center gap-[5px]">
                <Languages className="size-3.5" aria-hidden="true" />
                {languages.join(" · ")}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-[0.8rem] text-muted-foreground">Desde</span>
            <b className="text-[1.15rem] font-semibold">{formatCents(prices.length ? Math.min(...prices) : 0)}</b>
          </div>
        </div>
      </div>
    </aside>
  );
}

function DeleteProduct({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteProduct(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success(`«${name}» eliminado`);
      router.push("/panel/productos");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" className="text-danger max-tablet:hidden" onClick={() => setOpen(true)}>
        Eliminar
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar «{name}»?</DialogTitle>
          <DialogDescription>Se eliminará «{name}» y dejará de generar salidas.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-[0.86rem] text-muted-foreground">No se puede deshacer.</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
