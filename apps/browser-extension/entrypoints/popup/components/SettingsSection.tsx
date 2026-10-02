import { Accordion } from "@base-ui/react/accordion";
import { ChevronDownIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

export function SettingsSection({
  id,
  title,
  summary,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Accordion.Item
      value={id}
      render={<Card size="sm" className="data-[size=sm]:gap-0 data-[size=sm]:py-0" />}
    >
      <Accordion.Header render={<h2 />}>
        <Accordion.Trigger
          aria-describedby={`${id}-summary`}
          className="group hover:bg-muted/50 focus-visible:ring-ring flex w-full items-center gap-3 rounded-xl p-4 text-left focus-visible:ring-2 focus-visible:outline-none"
        >
          <Icon aria-hidden="true" className="text-primary size-5 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-medium">{title}</span>
            <span id={`${id}-summary`} className="text-muted-foreground text-xs font-normal">
              {summary}
            </span>
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className="text-muted-foreground size-4 shrink-0 group-data-panel-open:rotate-180"
          />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Panel keepMounted>
        <CardContent className="flex flex-col gap-3 border-t py-4 text-sm">{children}</CardContent>
      </Accordion.Panel>
    </Accordion.Item>
  );
}
