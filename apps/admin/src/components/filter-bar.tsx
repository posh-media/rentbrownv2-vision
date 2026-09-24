"use client";

import * as React from "react";
import { Input, Select, cn } from "@rentbrown/ui";
import { Search } from "lucide-react";

export interface FilterOption {
  value: string;
  label: string;
}

export function FilterBar({
  query,
  onQueryChange,
  placeholder = "Search…",
  children,
  className,
}: {
  query?: string;
  onQueryChange?: (value: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>
      {onQueryChange ? (
        <div className="relative w-full min-w-56 sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tertiary" />
          <Input
            value={query ?? ""}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={placeholder}
            className="h-9 pl-9 text-xs"
            aria-label="Search"
          />
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function FilterSelect({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  label?: string;
  className?: string;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={cn("h-9 w-auto min-w-36 text-xs font-medium", className)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
