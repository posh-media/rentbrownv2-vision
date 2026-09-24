import { cn } from "@rentbrown/ui";

/** Eyebrow + serif title + optional lead, used to open every band. */
export function SectionHeading({
  eyebrow,
  title,
  body,
  inverse = false,
  as: Tag = "h2",
  className,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  inverse?: boolean;
  /** "h1" on index pages — one per page. */
  as?: "h1" | "h2";
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <p className={cn("eyebrow", inverse ? "text-primary-foreground/60" : "text-secondary")}>{eyebrow}</p>
      <Tag
        className={cn(
          "mt-3 font-display text-3xl leading-tight tracking-tight sm:text-4xl",
          inverse ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {title}
      </Tag>
      {body ? (
        <p className={cn("mt-4 text-base leading-relaxed", inverse ? "text-primary-foreground/75" : "text-muted-foreground")}>
          {body}
        </p>
      ) : null}
    </div>
  );
}
