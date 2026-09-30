import React, { useState } from 'react';
import { type TabGroup } from '@/lib/storage';
import { LinkHealthTool } from './LinkHealthTool';
import { DuplicateCleanerTool } from './DuplicateCleanerTool';
import { DomainOrganizerTool } from './DomainOrganizerTool';
import { StaleTabsTool } from './StaleTabsTool';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  Copy,
  FolderTree,
  Clock,
  Sparkles,
  Wrench,
  Layers,
} from 'lucide-react';

interface ToolsViewProps {
  tabGroups: TabGroup[];
  onDataMutated?: () => void;
}

export type SubToolId = 'link-health' | 'duplicates' | 'domain-organizer' | 'stale-tabs';

export function ToolsView({ tabGroups, onDataMutated }: ToolsViewProps) {
  const [activeSubTool, setActiveSubTool] = useState<SubToolId>('link-health');

  const subTools = [
    {
      id: 'link-health' as const,
      label: 'Link Health',
      icon: Activity,
      status: 'active' as const,
      badge: 'Live',
      badgeVariant: 'default' as const,
      description: 'Scan dead links (404/410), redirect optimizer, and Wayback lookup',
    },
    {
      id: 'duplicates' as const,
      label: 'Duplicates',
      icon: Copy,
      status: 'active' as const,
      badge: 'Live',
      badgeVariant: 'default' as const,
      description: '4-tier mirror detection, tracking param stripper & 1-click duplicate cleaner',
    },
    {
      id: 'domain-organizer' as const,
      label: 'Domain Sorter',
      icon: FolderTree,
      status: 'active' as const,
      badge: 'Live',
      badgeVariant: 'default' as const,
      description: 'Host & subdomain clustering engine, 1-click consolidation, and library auto-organizer',
    },
    {
      id: 'stale-tabs' as const,
      label: 'Stale Tabs',
      icon: Clock,
      status: 'active' as const,
      badge: 'Live',
      badgeVariant: 'default' as const,
      description: 'Multi-horizon aging purifier, cold storage archiver & fragment consolidator',
    },
  ];

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Sub-Navigation Segmented Pill Bar */}
      <div className="shrink-0 flex items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-xl border border-border/60 overflow-x-auto max-w-full custom-scrollbar">
          {subTools.map((tool) => {
            const Icon = tool.icon;
            const isSelected = activeSubTool === tool.id;
            const isAvailable = tool.status === 'active';

            return (
              <button
                key={tool.id}
                onClick={() => {
                  if (isAvailable) {
                    setActiveSubTool(tool.id);
                  }
                }}
                disabled={!isAvailable}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                  isSelected
                    ? 'bg-card text-foreground shadow-sm ring-1 ring-border/80'
                    : isAvailable
                    ? 'text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer'
                    : 'text-muted-foreground/50 opacity-60 cursor-not-allowed'
                }`}
                title={tool.description}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                <span>{tool.label}</span>
                {tool.badge && (
                  <Badge
                    variant={tool.badgeVariant}
                    className={`text-[9px] px-1.5 py-0 h-3.5 font-bold ${
                      isSelected && isAvailable
                        ? 'bg-primary/15 text-primary border-primary/30'
                        : isAvailable
                        ? 'bg-muted text-foreground border-border/60'
                        : 'text-muted-foreground/70 border-border/50'
                    }`}
                  >
                    {tool.badge}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="font-medium">Power Tools Hub</span>
        </div>
      </div>

      {/* Active Sub-Tool Canvas */}
      <div className="flex-1 min-h-0">
        {activeSubTool === 'link-health' && (
          <LinkHealthTool tabGroups={tabGroups} onDataMutated={onDataMutated} />
        )}
        {activeSubTool === 'duplicates' && (
          <DuplicateCleanerTool tabGroups={tabGroups} onDataMutated={onDataMutated} />
        )}
        {activeSubTool === 'domain-organizer' && (
          <DomainOrganizerTool tabGroups={tabGroups} onDataMutated={onDataMutated} />
        )}
        {activeSubTool === 'stale-tabs' && (
          <StaleTabsTool tabGroups={tabGroups} onDataMutated={onDataMutated} />
        )}
      </div>
    </div>
  );
}
