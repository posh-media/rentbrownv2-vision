"use client";

import * as React from "react";
import type { Page } from "@rentbrown/types";
import { Button, EmptyState, Skeleton, StatePanel, cn } from "@rentbrown/ui";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

export interface ColumnDef<T> {
  /** Sort key sent to the data source when `sortable`. */
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: "left" | "right";
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  page?: Page<T>;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  sort?: string;
  onSortChange?: (sort: string | undefined) => void;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
  emptyTitle?: string;
  emptyCopy?: string;
  /** Render extra content inside the pagination footer. */
  footerNote?: React.ReactNode;
}

export function DataTable<T>({
  columns,
  page,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  sort,
  onSortChange,
  onPageChange,
  onRowClick,
  rowKey,
  emptyTitle = "Nothing here",
  emptyCopy = "No rows match the current filters.",
  footerNote,
}: DataTableProps<T>) {
  const items = page?.items ?? [];
  const total = page?.total ?? 0;
  const currentPage = page?.page ?? 1;
  const pageSize = page?.pageSize ?? 15;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(total, currentPage * pageSize);

  const toggleSort = (id: string) => {
    if (!onSortChange) return;
    if (sort === id) onSortChange(`-${id}`);
    else if (sort === `-${id}`) onSortChange(undefined);
    else onSortChange(id);
  };

  return (
    <div className="financial-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b bg-surface-subtle text-left">
              {columns.map((col) => {
                const active = sort === col.id || sort === `-${col.id}`;
                const desc = sort === `-${col.id}`;
                return (
                  <th
                    key={col.id}
                    className={cn(
                      "px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground",
                      col.align === "right" && "text-right",
                      col.headerClassName,
                    )}
                  >
                    {col.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.id)}
                        className={cn("inline-flex items-center gap-1 uppercase tracking-wide", active && "text-primary")}
                      >
                        {col.header}
                        {active ? (
                          desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />
                        ) : (
                          <ArrowUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {columns.map((col) => (
                      <td key={col.id} className="px-4 py-3.5">
                        <Skeleton className="h-3.5 w-4/5" />
                      </td>
                    ))}
                  </tr>
                ))
              : items.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-b last:border-0",
                      onRowClick && "cursor-pointer transition-colors hover:bg-surface-subtle/60",
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.id}
                        className={cn("px-4 py-3 align-middle", col.align === "right" && "text-right", col.className)}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {!isLoading && isError ? (
        <div className="p-6">
          <StatePanel
            tone="error"
            title="Couldn't load this list"
            copy={errorMessage ?? "Something went wrong while loading."}
            action={onRetry ? <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button> : undefined}
          />
        </div>
      ) : null}

      {!isLoading && !isError && items.length === 0 ? (
        <div className="p-6">
          <EmptyState title={emptyTitle} copy={emptyCopy} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
        <span className="tabular">
          {total === 0 ? "0 rows" : `Showing ${from}–${to} of ${total}`}
          {footerNote ? <span className="ml-2">{footerNote}</span> : null}
        </span>
        {onPageChange && totalPages > 1 ? (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-1 tabular">
              Page {currentPage} of {totalPages}
            </span>
            <Button size="sm" variant="ghost" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} aria-label="Next page">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
