import { UPUTE } from "@/lib/pirulica/upute";

export function HowTo({ compact = false }: { compact?: boolean }) {
  return (
    <section className="rounded-[24px] bg-surface px-4 py-4 shadow-[var(--shadow-card)]">
      <h3 className="text-sm font-medium text-ink">{UPUTE.title}</h3>
      {compact ? null : (
        <p className="mt-1 text-sm text-muted text-pretty">{UPUTE.lead}</p>
      )}
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink text-pretty">
        {UPUTE.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted text-pretty">{UPUTE.install}</p>
      <p className="mt-2 text-xs text-muted text-pretty">{UPUTE.alarm}</p>
    </section>
  );
}
