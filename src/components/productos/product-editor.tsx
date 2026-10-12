"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  ImageUp,
  Languages,
  LoaderCircle,
  Plus,
  Save,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { deleteProduct, saveProduct } from "@/app/(panel)/panel/productos/actions";
import { FieldHint } from "@/components/ajustes/box";
import { startNavigationProgress } from "@/components/navigation-progress";
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
import { compressPhoto } from "@/lib/photo-compress";
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
import {
  DEFAULT_NEEDS,
  RESOURCE_LIMITS,
  RESOURCE_TYPES,
  RESOURCE_TYPE_TEXT,
  needsAnyResource,
  type NeedsRequired,
  type ProductNeeds,
  type ResourceType,
} from "@/lib/domain/resources";
import {
  DIFFICULTIES,
  DIFFICULTY_TEXT,
  PRODUCT_PAGE_LIMITS,
  isDifficulty,
  linesToList,
  listToLines,
  moveItem,
  type ProductContent,
  type ProductStop,
} from "@/lib/domain/product-page";
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
  /** Fotos en orden: la primera es la portada. */
  photos: string[];
  active: boolean;
  prices: { ticketTypeId: string; priceCents: number }[];
  rules: { weekdays: number[]; times: string[]; language: string; validFrom: string | null; validTo: string | null }[];
  needs: ProductNeeds;
  needsRequired: NeedsRequired;
  content: ProductContent;
  stops: ProductStop[];
};

type DraftRule = { key: number; weekdays: number[]; timesRaw: string; language: string; validFrom: string; validTo: string };

type DraftStop = { key: number; title: string; titleEn: string; description: string; descriptionEn: string; durationRaw: string };

/** Ficha web: las listas se editan como texto, una por línea. */
type DraftContent = {
  tagline: string;
  taglineEn: string;
  highlights: string;
  highlightsEn: string;
  included: string;
  includedEn: string;
  notIncluded: string;
  notIncludedEn: string;
  bring: string;
  bringEn: string;
  goodToKnow: string;
  goodToKnowEn: string;
  difficulty: string;
};

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
  photos: string[];
  prices: Record<string, { on: boolean; raw: string }>;
  rules: DraftRule[];
  /** «Esta actividad necesita recursos»: si no, se guardan todos a 0. */
  usesResources: boolean;
  needs: Record<ResourceType, string>;
  needsRequired: NeedsRequired;
  content: DraftContent;
  stops: DraftStop[];
};

const TABS: { id: ProductTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "fotos", label: "Fotos" },
  { id: "ficha", label: "Ficha web" },
  { id: "precios", label: "Entradas y precios" },
  { id: "horarios", label: "Horarios" },
  { id: "equipo", label: "Equipo" },
];

const PREVIEW_DAYS = 14;
const PREVIEW_MAX_CHIPS = 36;

let ruleKey = 0;
const nextRuleKey = () => ++ruleKey;

function toDraftContent(content: ProductContent): DraftContent {
  return {
    tagline: content.tagline,
    taglineEn: content.taglineEn,
    highlights: listToLines(content.highlights),
    highlightsEn: listToLines(content.highlightsEn),
    included: listToLines(content.included),
    includedEn: listToLines(content.includedEn),
    notIncluded: listToLines(content.notIncluded),
    notIncludedEn: listToLines(content.notIncludedEn),
    bring: listToLines(content.bring),
    bringEn: listToLines(content.bringEn),
    goodToKnow: content.goodToKnow,
    goodToKnowEn: content.goodToKnowEn,
    difficulty: content.difficulty ?? "",
  };
}

function fromDraftContent(content: DraftContent): ProductContent {
  return {
    tagline: content.tagline,
    taglineEn: content.taglineEn,
    highlights: linesToList(content.highlights),
    highlightsEn: linesToList(content.highlightsEn),
    included: linesToList(content.included),
    includedEn: linesToList(content.includedEn),
    notIncluded: linesToList(content.notIncluded),
    notIncludedEn: linesToList(content.notIncludedEn),
    bring: linesToList(content.bring),
    bringEn: linesToList(content.bringEn),
    goodToKnow: content.goodToKnow,
    goodToKnowEn: content.goodToKnowEn,
    difficulty: isDifficulty(content.difficulty) ? content.difficulty : null,
  };
}

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
    photos: [...product.photos],
    prices,
    rules: product.rules.map((rule) => ({
      key: nextRuleKey(),
      weekdays: [...rule.weekdays],
      timesRaw: rule.times.join(", "),
      language: rule.language,
      validFrom: rule.validFrom ?? "",
      validTo: rule.validTo ?? "",
    })),
    usesResources: needsAnyResource(product.needs),
    // Sin recursos, al activarlo se propone lo de un producto nuevo (un guía).
    needs: Object.fromEntries(
      RESOURCE_TYPES.map((type) => [type, String(needsAnyResource(product.needs) ? product.needs[type] : DEFAULT_NEEDS[type])]),
    ) as Record<ResourceType, string>,
    needsRequired: { ...product.needsRequired },
    content: toDraftContent(product.content),
    stops: product.stops.map((stop) => ({
      key: nextRuleKey(),
      title: stop.title,
      titleEn: stop.titleEn,
      description: stop.description,
      descriptionEn: stop.descriptionEn,
      durationRaw: stop.durationMin === null ? "" : String(stop.durationMin),
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
      photoPath: draft.photos[0] ?? null,
      gallery: draft.photos.slice(1),
      active,
      prices,
      rules: draft.rules.map((rule) => ({
        weekdays: rule.weekdays,
        times: parseTimes(rule.timesRaw),
        language: rule.language,
        validFrom: rule.validFrom || null,
        validTo: rule.validTo || null,
      })),
      needs: draft.usesResources
        ? {
            guide: toNumber(draft.needs.guide),
            vehicle: toNumber(draft.needs.vehicle),
            equipment: toNumber(draft.needs.equipment),
          }
        : { guide: 0, vehicle: 0, equipment: 0 },
      needsRequired: draft.needsRequired,
      content: fromDraftContent(draft.content),
      // Una parada sin nada escrito no cuenta.
      stops: draft.stops
        .filter((stop) => [stop.title, stop.titleEn, stop.description, stop.descriptionEn, stop.durationRaw].some((value) => value.trim()))
        .map((stop) => ({
          title: stop.title,
          titleEn: stop.titleEn,
          description: stop.description,
          descriptionEn: stop.descriptionEn,
          durationMin: stop.durationRaw.trim() ? toNumber(stop.durationRaw) : null,
        })),
    },
  };
}

type EditorProps = {
  product: EditorProduct;
  ticketTypes: EditorTicketType[];
  languages: string[];
  currency: string;
  /** Cuántos recursos hay de cada tipo en Equipo. */
  available: Record<ResourceType, number>;
  today: string;
};

export function ProductEditor({ product, ticketTypes, languages, currency, available, today }: EditorProps) {
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
      startNavigationProgress();
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
            {tab === "general" ? <GeneralTab draft={draft} update={update} /> : null}
            {tab === "fotos" ? (
              <PhotosTab draft={draft} setDraft={setDraft} uploading={uploading} setUploading={setUploading} unsaved={unsavedPhotos} />
            ) : null}
            {tab === "ficha" ? <PageTab draft={draft} setDraft={setDraft} /> : null}
            {tab === "precios" ? (
              <PricesTab draft={draft} update={update} ticketTypes={ticketTypes} currency={currency} />
            ) : null}
            {tab === "horarios" ? <ScheduleTab draft={draft} setDraft={setDraft} languages={languages} today={today} /> : null}
            {tab === "equipo" ? <EquipmentTab draft={draft} update={update} available={available} /> : null}
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

function GeneralTab({ draft, update }: TabProps) {
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
      <Field id="pf-desc" label="Descripción" hint="Se muestra al cliente en la web de reservas. Separa párrafos con una línea en blanco." className="col-span-full">
        <textarea
          id="pf-desc"
          rows={5}
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

type PhotosTabProps = {
  draft: Draft;
  setDraft: (update: (draft: Draft) => Draft) => void;
  uploading: boolean;
  setUploading: (uploading: boolean) => void;
  unsaved: Set<string>;
};

/**
 * Galería del producto. Las fotos se suben directamente a Storage desde el navegador (las
 * políticas solo dejan al equipo); el producto guarda solo las rutas, y el servidor las valida al
 * guardar. La primera foto es la portada (tarjetas, cabecera de la web y vista previa).
 */
function PhotosTab({ draft, setDraft, uploading, setUploading, unsaved }: PhotosTabProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { supabaseUrl } = getPublicEnv();
  const free = PRODUCT_PAGE_LIMITS.photos - draft.photos.length;

  async function discardUnsaved(path: string) {
    if (!unsaved.has(path)) return;
    unsaved.delete(path);
    await createClient().storage.from(PRODUCT_PHOTO_BUCKET).remove([path]);
  }

  async function uploadOne(original: File): Promise<string | null> {
    if (!photoExtension(original.type)) {
      toast.error(`«${original.name}» no es JPG, PNG ni WebP`);
      return null;
    }
    // Se reduce antes de subirla: la web carga mucho más rápido y caben fotos de más de 5 MB.
    const file = await compressPhoto(original);
    const extension = photoExtension(file.type);
    if (!extension) {
      toast.error(`«${original.name}» no es JPG, PNG ni WebP`);
      return null;
    }
    if (file.size > PRODUCT_PHOTO_MAX_BYTES) {
      toast.error(`«${original.name}» pesa más de 5 MB`);
      return null;
    }
    const path = `${crypto.randomUUID()}.${extension}`;
    const { error } = await createClient()
      .storage.from(PRODUCT_PHOTO_BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (error) {
      toast.error("No se pudo subir una foto. Inténtalo de nuevo.");
      return null;
    }
    unsaved.add(path);
    return path;
  }

  async function upload(files: File[]) {
    if (!files.length) return;
    if (files.length > free) toast.error(`Caben ${PRODUCT_PAGE_LIMITS.photos} fotos: se suben las ${free} primeras.`);
    setUploading(true);
    for (const file of files.slice(0, free)) {
      const path = await uploadOne(file);
      if (path) setDraft((current) => ({ ...current, photos: [...current.photos, path] }));
    }
    setUploading(false);
  }

  const move = (from: number, to: number) => setDraft((current) => ({ ...current, photos: moveItem(current.photos, from, to) }));

  function remove(path: string) {
    setDraft((current) => ({ ...current, photos: current.photos.filter((item) => item !== path) }));
    void discardUnsaved(path);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-[46ch] text-[0.84rem] text-muted-foreground">
          La primera es la <b className="font-medium text-foreground">portada</b>: sale en las tarjetas y arriba en la web. El
          resto forman la galería, en este orden.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          aria-label="Añadir fotos"
          className="sr-only"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            void upload(files);
          }}
        />
        <Button type="button" variant="outline" disabled={uploading || free <= 0} onClick={() => inputRef.current?.click()}>
          {uploading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ImageUp aria-hidden="true" />}
          {uploading ? "Subiendo…" : "Añadir fotos"}
        </Button>
      </div>

      {draft.photos.length ? (
        <ol aria-label="Fotos del tour" className="grid grid-cols-2 gap-2.5 tablet:grid-cols-3">
          {draft.photos.map((path, index) => {
            const n = index + 1;
            return (
              <li
                key={path}
                aria-label={index === 0 ? `Foto ${n}, portada` : `Foto ${n}`}
                className={cn(
                  "group relative overflow-hidden rounded-xl border border-black/5 bg-surface-2",
                  index === 0 && "col-span-2 tablet:row-span-2",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={productPhotoUrl(supabaseUrl, path)}
                  alt=""
                  className={cn("block w-full object-cover", index === 0 ? "aspect-[16/10] tablet:h-full" : "aspect-[4/3]")}
                />
                {index === 0 ? (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/92 px-2 py-0.5 text-[0.72rem] font-semibold shadow-sm">
                    <Star aria-hidden="true" className="size-3 fill-current text-warn" />
                    Portada
                  </span>
                ) : null}
                <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between gap-1">
                  <div className="flex gap-1">
                    <PhotoButton label={`Mover foto ${n} antes`} disabled={index === 0} onClick={() => move(index, index - 1)}>
                      <ChevronLeft aria-hidden="true" />
                    </PhotoButton>
                    <PhotoButton
                      label={`Mover foto ${n} después`}
                      disabled={index === draft.photos.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      <ChevronRight aria-hidden="true" />
                    </PhotoButton>
                    {index > 0 ? (
                      <PhotoButton label={`Usar foto ${n} de portada`} onClick={() => move(index, 0)}>
                        <Star aria-hidden="true" />
                      </PhotoButton>
                    ) : null}
                  </div>
                  <PhotoButton label={`Quitar foto ${n}`} onClick={() => remove(path)}>
                    <X aria-hidden="true" />
                  </PhotoButton>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-line px-4 py-10 text-center outline-none hover:bg-surface-2 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ImageUp aria-hidden="true" className="size-6 text-muted-foreground" />
          <b className="font-semibold">Sin fotos</b>
          <span className="text-[0.84rem] text-muted-foreground">Sin fotos se usa una ilustración con el color del tour.</span>
        </button>
      )}
      <FieldHint>
        Hasta {PRODUCT_PAGE_LIMITS.photos} fotos JPG, PNG o WebP; se reducen solas antes de subirlas. Mejor en horizontal.
      </FieldHint>
    </div>
  );
}

function PhotoButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full bg-white/92 text-foreground shadow-sm outline-none hover:bg-white focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

const TEXTAREA =
  "w-full min-w-0 rounded-[10px] border border-input bg-surface px-3 py-2 text-[0.95rem] text-foreground outline-none placeholder:text-faint focus-visible:border-[#66aaf0] focus-visible:ring-[3px] focus-visible:ring-primary/15 tablet:text-sm";

/** Ficha web: lo que ve el cliente en la página del tour, además de la descripción. */
function PageTab({ draft, setDraft }: { draft: Draft; setDraft: (update: (draft: Draft) => Draft) => void }) {
  const content = draft.content;
  const set = (patch: Partial<DraftContent>) => setDraft((current) => ({ ...current, content: { ...current.content, ...patch } }));

  const lists: { key: "highlights" | "included" | "notIncluded" | "bring"; label: string; placeholder: string; max: number }[] = [
    {
      key: "highlights",
      label: "Lo más destacado",
      placeholder: "Atardecer sobre el mar de nubes\nObservación de estrellas con telescopio",
      max: PRODUCT_PAGE_LIMITS.highlights,
    },
    { key: "included", label: "Incluye", placeholder: "Transporte\nGuía titulado\nChocolate caliente", max: PRODUCT_PAGE_LIMITS.list },
    { key: "notIncluded", label: "No incluye", placeholder: "Comida\nPropinas", max: PRODUCT_PAGE_LIMITS.list },
    { key: "bring", label: "Qué llevar", placeholder: "Calzado cómodo\nRopa de abrigo", max: PRODUCT_PAGE_LIMITS.list },
  ];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[0.84rem] text-muted-foreground">
        Todo es opcional: en la web solo se ve lo que rellenes. En las listas, escribe una cosa por línea.
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        <Field id="pw-tagline" label="Frase corta" hint="Va bajo el nombre, en grande. Ej.: «Mar de nubes y cielo Starlight»." className="col-span-full">
          <Input
            id="pw-tagline"
            value={content.tagline}
            maxLength={PRODUCT_PAGE_LIMITS.tagline}
            aria-describedby="pw-tagline-hint"
            onChange={(event) => set({ tagline: event.target.value })}
          />
        </Field>
        {lists.map((item) => (
          <Field
            key={item.key}
            id={`pw-${item.key}`}
            label={item.label}
            hint={`Una por línea · hasta ${item.max}`}
            className={item.key === "highlights" ? "col-span-full" : undefined}
          >
            <textarea
              id={`pw-${item.key}`}
              rows={4}
              value={content[item.key]}
              placeholder={item.placeholder}
              aria-describedby={`pw-${item.key}-hint`}
              onChange={(event) => set({ [item.key]: event.target.value })}
              className={TEXTAREA}
            />
          </Field>
        ))}
        <Field id="pw-difficulty" label="Dificultad">
          <NativeSelect id="pw-difficulty" value={content.difficulty} onChange={(event) => set({ difficulty: event.target.value })}>
            <option value="">Sin indicar</option>
            {DIFFICULTIES.map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {DIFFICULTY_TEXT.es[difficulty]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          id="pw-know"
          label="Información importante"
          hint="Lo que conviene saber antes de reservar: requisitos, accesibilidad, qué pasa si llueve…"
          className="col-span-full"
        >
          <textarea
            id="pw-know"
            rows={3}
            value={content.goodToKnow}
            maxLength={PRODUCT_PAGE_LIMITS.goodToKnow}
            aria-describedby="pw-know-hint"
            onChange={(event) => set({ goodToKnow: event.target.value })}
            className={TEXTAREA}
          />
        </Field>
      </div>

      <StopsEditor draft={draft} setDraft={setDraft} />

      <fieldset className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5 rounded-xl border border-line-2 p-3.5">
        <legend className="px-1 text-[0.8rem] font-medium text-[#2a3644]">
          En inglés <span className="font-normal text-muted-foreground">(web en inglés; si lo dejas vacío, se ve en español)</span>
        </legend>
        <Field id="pw-tagline-en" label="Frase corta en inglés" className="col-span-full">
          <Input
            id="pw-tagline-en"
            lang="en"
            value={content.taglineEn}
            maxLength={PRODUCT_PAGE_LIMITS.tagline}
            onChange={(event) => set({ taglineEn: event.target.value })}
          />
        </Field>
        {lists.map((item) => {
          const key = `${item.key}En` as const;
          return (
            <Field key={key} id={`pw-${key}`} label={`${item.label} en inglés`} className={item.key === "highlights" ? "col-span-full" : undefined}>
              <textarea
                id={`pw-${key}`}
                lang="en"
                rows={3}
                value={content[key]}
                onChange={(event) => set({ [key]: event.target.value })}
                className={TEXTAREA}
              />
            </Field>
          );
        })}
        <Field id="pw-know-en" label="Información importante en inglés" className="col-span-full">
          <textarea
            id="pw-know-en"
            lang="en"
            rows={3}
            value={content.goodToKnowEn}
            maxLength={PRODUCT_PAGE_LIMITS.goodToKnow}
            onChange={(event) => set({ goodToKnowEn: event.target.value })}
            className={TEXTAREA}
          />
        </Field>
      </fieldset>
    </div>
  );
}

function StopsEditor({ draft, setDraft }: { draft: Draft; setDraft: (update: (draft: Draft) => Draft) => void }) {
  const setStops = (change: (stops: DraftStop[]) => DraftStop[]) => setDraft((current) => ({ ...current, stops: change(current.stops) }));
  const updateStop = (key: number, patch: Partial<DraftStop>) =>
    setStops((stops) => stops.map((stop) => (stop.key === key ? { ...stop, ...patch } : stop)));
  const full = draft.stops.length >= PRODUCT_PAGE_LIMITS.stops;

  return (
    <section aria-labelledby="pw-stops" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="pw-stops" className="text-[0.95rem]">
            Itinerario
          </h3>
          <p className="text-[0.8rem] text-muted-foreground">Las paradas del recorrido, en orden. La duración es opcional.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={full}
          onClick={() =>
            setStops((stops) => [
              ...stops,
              { key: nextRuleKey(), title: "", titleEn: "", description: "", descriptionEn: "", durationRaw: "" },
            ])
          }
        >
          <Plus aria-hidden="true" />
          Añadir parada
        </Button>
      </div>
      {draft.stops.length ? (
        <ol aria-label="Paradas del itinerario" className="flex flex-col">
          {draft.stops.map((stop, index) => {
            const id = `ps${stop.key}`;
            const n = index + 1;
            return (
              <li key={stop.key} aria-label={`Parada ${n}`} className="relative flex gap-3 pb-4 last:pb-0">
                <div aria-hidden="true" className="flex flex-col items-center">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[0.78rem] font-semibold text-white">
                    {n}
                  </span>
                  {index < draft.stops.length - 1 ? <span className="mt-1 w-px flex-1 bg-line" /> : null}
                </div>
                <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5 rounded-xl border border-line p-3">
                  <Field id={`${id}-title`} label="Título" className="col-span-full">
                    <Input
                      id={`${id}-title`}
                      value={stop.title}
                      maxLength={PRODUCT_PAGE_LIMITS.stopTitle}
                      placeholder="Ej.: Mirador de Chipeque"
                      onChange={(event) => updateStop(stop.key, { title: event.target.value })}
                    />
                  </Field>
                  <Field id={`${id}-desc`} label="Qué se hace" className="col-span-full">
                    <textarea
                      id={`${id}-desc`}
                      rows={2}
                      value={stop.description}
                      maxLength={PRODUCT_PAGE_LIMITS.stopDescription}
                      onChange={(event) => updateStop(stop.key, { description: event.target.value })}
                      className={TEXTAREA}
                    />
                  </Field>
                  <Field id={`${id}-dur`} label="Duración (min)">
                    <Input
                      id={`${id}-dur`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={1440}
                      value={stop.durationRaw}
                      onChange={(event) => updateStop(stop.key, { durationRaw: event.target.value })}
                    />
                  </Field>
                  <Field id={`${id}-title-en`} label="Título en inglés">
                    <Input
                      id={`${id}-title-en`}
                      lang="en"
                      value={stop.titleEn}
                      maxLength={PRODUCT_PAGE_LIMITS.stopTitle}
                      onChange={(event) => updateStop(stop.key, { titleEn: event.target.value })}
                    />
                  </Field>
                  <Field id={`${id}-desc-en`} label="Qué se hace, en inglés" className="col-span-full">
                    <textarea
                      id={`${id}-desc-en`}
                      lang="en"
                      rows={2}
                      value={stop.descriptionEn}
                      maxLength={PRODUCT_PAGE_LIMITS.stopDescription}
                      onChange={(event) => updateStop(stop.key, { descriptionEn: event.target.value })}
                      className={TEXTAREA}
                    />
                  </Field>
                  <div className="col-span-full flex flex-wrap justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Subir parada ${n}`}
                      disabled={index === 0}
                      onClick={() => setStops((stops) => moveItem(stops, index, index - 1))}
                    >
                      <ChevronUp aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Bajar parada ${n}`}
                      disabled={index === draft.stops.length - 1}
                      onClick={() => setStops((stops) => moveItem(stops, index, index + 1))}
                    >
                      <ChevronDown aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar parada ${n}`}
                      onClick={() => setStops((stops) => stops.filter((item) => item.key !== stop.key))}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-line px-4 py-6 text-center">
          <b className="font-semibold">Sin itinerario</b>
          <span className="text-[0.84rem] text-muted-foreground">Añade las paradas para que el cliente vea el recorrido.</span>
        </div>
      )}
    </section>
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
      <div className="flex flex-col gap-1.5 max-tablet:w-full">
        <span id={`${id}-days`} className="text-[0.8rem] font-medium text-[#2a3644]">
          Días
        </span>
        <div role="group" aria-labelledby={`${id}-days`} className="grid grid-cols-7 gap-1 tablet:flex">
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
                  "h-10 min-w-0 rounded-[7px] border border-line bg-surface font-mono text-[0.76rem] font-medium text-muted-foreground outline-none tablet:size-[31px]",
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
      <Field id={`${id}-from`} label="Desde" className="w-[150px] max-tablet:flex-[1_1_130px]">
        <Input id={`${id}-from`} type="date" value={rule.validFrom} onChange={(event) => onChange({ validFrom: event.target.value })} />
      </Field>
      <Field id={`${id}-to`} label="Hasta" className="w-[150px] max-tablet:flex-[1_1_130px]">
        <Input id={`${id}-to`} type="date" value={rule.validTo} onChange={(event) => onChange({ validTo: event.target.value })} />
      </Field>
      <Button type="button" variant="ghost" size="icon" aria-label={`Quitar regla ${index + 1}`} onClick={onRemove}>
        <Trash2 aria-hidden="true" />
      </Button>
    </li>
  );
}

function EquipmentTab({ draft, update, available }: TabProps & { available: Record<ResourceType, number> }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <Switch
          id="pn-uses"
          checked={draft.usesResources}
          onCheckedChange={(usesResources) => update({ usesResources })}
        />
        <label htmlFor="pn-uses" className="text-[0.9rem]">
          Esta actividad necesita recursos <span className="text-muted-foreground">(guías, vehículos o material)</span>
        </label>
      </div>
      {draft.usesResources ? (
        <>
          <p className="text-[0.84rem] text-muted-foreground">
            Qué necesita cada salida. Se asigna automáticamente con la primera reserva, respetando idiomas y sin
            solapes. Si un recurso es <b className="font-medium text-foreground">obligatorio</b>, la salida solo admite
            reservas si está libre durante toda la visita; si no, se vende igual y sale en avisos.
          </p>
          <ul aria-label="Recursos por salida" className="divide-y divide-line-2 rounded-xl border border-line">
            {RESOURCE_TYPES.map((type) => {
              const id = `pn-${type}`;
              const count = available[type];
              const qty = toNumber(draft.needs[type]);
              return (
                <li key={type} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <label htmlFor={id} className="font-semibold">
                      {RESOURCE_TYPE_TEXT[type].plural}
                    </label>
                    <p id={`${id}-hint`} className="text-[0.78rem] text-muted-foreground">
                      {count} {count === 1 ? "disponible" : "disponibles"} en Equipo
                      {qty > 0 ? (draft.needsRequired[type] ? " · si no hay uno libre, no se vende" : " · si falta, se vende y avisa") : null}
                    </p>
                  </div>
                  <Input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    className="w-[84px]"
                    min={RESOURCE_LIMITS.need.min}
                    max={RESOURCE_LIMITS.need.max}
                    value={draft.needs[type]}
                    aria-describedby={`${id}-hint`}
                    onChange={(event) => update({ needs: { ...draft.needs, [type]: event.target.value } })}
                  />
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`${id}-required`}
                      checked={draft.needsRequired[type]}
                      disabled={!(qty > 0)}
                      onCheckedChange={(required) => update({ needsRequired: { ...draft.needsRequired, [type]: required } })}
                    />
                    <label htmlFor={`${id}-required`} className="text-[0.86rem]">
                      Obligatorio
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="text-[0.84rem] text-muted-foreground">
          Las salidas solo dependen de sus plazas: no se asigna ningún recurso.
        </p>
      )}
      <p className="text-[0.8rem] text-muted-foreground">
        Las fichas de guías, vehículos y material están en{" "}
        <Link href="/panel/equipo" className="text-primary underline-offset-4 hover:underline">
          Equipo
        </Link>
        .
      </p>
    </div>
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
  const cover = draft.photos[0];
  const photoUrl = cover ? productPhotoUrl(getPublicEnv().supabaseUrl, cover) : null;
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
          {draft.content.tagline.trim() ? <p className="text-[0.86rem] font-medium text-[#2a3644]">{draft.content.tagline}</p> : null}
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
      startNavigationProgress();
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
