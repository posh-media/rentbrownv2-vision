import Image from "next/image";
import { FileCheck2, Landmark, ShieldCheck } from "lucide-react";
import { MoneyFigure } from "@rentbrown/ui";

import { Brand } from "../../components/layout/brand";

const bullets = [
  { icon: ShieldCheck, text: "Documents reviewed before every round opens" },
  { icon: FileCheck2, text: "Principal, profit and maturity shown separately" },
  { icon: Landmark, text: "Funds settle to your verified bank account" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden bg-primary lg:block">
        <Image
          src="/properties/ikoyi-residences.jpg"
          alt="Ikoyi Residences, fictional property"
          fill
          priority
          sizes="50vw"
          className="object-cover opacity-60"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[var(--inverse-strong)] via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-6 p-10">
          <div className="glass-dark w-80 rounded-lg p-5">
            <p className="eyebrow text-primary-foreground/70">One slot, shown honestly</p>
            {[
              { label: "Principal", value: 10_000_000 },
              { label: "Expected profit", value: 1_650_000 },
              { label: "Maturity value", value: 11_650_000 },
            ].map((row) => (
              <div key={row.label} className="mt-3 flex items-baseline justify-between">
                <span className="text-sm text-primary-foreground/80">{row.label}</span>
                <MoneyFigure amount={row.value} size="sm" tone="inverse" />
              </div>
            ))}
            <p className="mt-3 text-[11px] text-primary-foreground/60">
              16.5% over 12 months · fictional example
            </p>
          </div>
          <ul className="flex flex-col gap-2.5">
            {bullets.map((b) => (
              <li key={b.text} className="flex items-center gap-2.5 text-sm font-medium text-primary-foreground/90">
                <b.icon className="size-4 shrink-0" aria-hidden />
                {b.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Brand />
        <div className="flex flex-1 items-center">
          <div className="w-full max-w-md py-10">{children}</div>
        </div>
      </div>
    </div>
  );
}
