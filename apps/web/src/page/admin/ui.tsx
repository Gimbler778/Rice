import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { ROLE_BADGE } from "./mock-data";
import type { UserRole } from "./types";

type TabButtonProps = {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
};

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize",
        ROLE_BADGE[role],
      )}
    >
      {role}
    </span>
  );
}

export function TabButton({ icon: Icon, label, active, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
        active
          ? "bg-background text-foreground shadow-sm border border-border"
          : "text-muted-foreground hover:text-foreground hover:bg-background/60",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </button>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
