export function PlaceholderPage({ title, task }: { title: string; task: string }) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-[1.25rem] tablet:text-[1.45rem]">{title}</h1>
      <div className="rounded-2xl border border-line bg-surface p-6 text-muted-foreground shadow-card">
        Disponible en la tarea {task} del roadmap.
      </div>
    </section>
  );
}
