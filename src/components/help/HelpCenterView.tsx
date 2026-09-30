import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Zap,
  Maximize2,
  Tag,
  ArrowUpDown,
  Layers,
  MousePointerClick,
  Sparkles,
  Keyboard,
  Cpu,
  Lock,
  RefreshCw,
  FileText,
  Palette,
  HelpCircle,
  Activity,
  Copy,
  Globe,
  Clock,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Info,
  SlidersHorizontal,
  X,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  CornerDownRight,
  ListFilter,
  Check,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { getAppVersion } from '@/lib/version';
import {
  HELP_CATEGORIES,
  HELP_GUIDES,
  KEYBOARD_SHORTCUTS,
  CONTEXT_MENU_GUIDES,
  FAQ_ITEMS,
  searchHelpContent,
  type HelpCategoryKey,
  type HelpGuide,
  type ShortcutItem,
} from './helpData';

interface HelpCenterViewProps {
  onNavigate?: (tab: 'dashboard' | 'archive' | 'closed' | 'tools' | 'settings' | 'help') => void;
}

export const HelpCenterView: React.FC<HelpCenterViewProps> = ({ onNavigate }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<HelpCategoryKey>('all');
  const [expandedGuides, setExpandedGuides] = useState<Record<string, boolean>>({});

  // Compute search and filtered results
  const searchResults = useMemo(() => {
    return searchHelpContent(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory]);

  const toggleGuideExpand = (guideId: string) => {
    setExpandedGuides((prev) => ({
      ...prev,
      [guideId]: !prev[guideId],
    }));
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSelectedCategory('all');
  };

  // Icon mapper helper
  const getCategoryIcon = (iconName: string, className = 'w-4 h-4') => {
    switch (iconName) {
      case 'Zap':
        return <Zap className={className} />;
      case 'Sparkles':
        return <Sparkles className={className} />;
      case 'SlidersHorizontal':
        return <SlidersHorizontal className={className} />;
      case 'Cpu':
        return <Cpu className={className} />;
      case 'Lock':
        return <Lock className={className} />;
      case 'HelpCircle':
        return <HelpCircle className={className} />;
      case 'BookOpen':
      default:
        return <BookOpen className={className} />;
    }
  };

  const getGuideIcon = (category: HelpCategoryKey, className = 'w-5 h-5') => {
    switch (category) {
      case 'getting-started':
        return <Zap className={className} />;
      case 'organization':
        return <Sparkles className={className} />;
      case 'power-tools':
        return <SlidersHorizontal className={className} />;
      case 'performance':
        return <Cpu className={className} />;
      case 'privacy-backups':
        return <Lock className={className} />;
      case 'faq':
      default:
        return <HelpCircle className={className} />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12 animate-in fade-in duration-200">
      {/* 1. Header Hero Banner */}
      <Card className="border-border bg-card shadow-lg p-6 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-primary/15 text-primary border border-primary/25 shadow-xs shrink-0">
              <BookOpen className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">TwoTab Knowledge Center</h2>
                <Badge variant="outline" className="text-xs text-primary border-primary/30 bg-primary/10 font-semibold">
                  {getAppVersion()}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-xl leading-relaxed">
                Task-oriented guides, power tools documentation, dormant tab memory optimization, keyboard shortcuts, and local privacy architecture.
              </p>
            </div>
          </div>

          {/* Quick jump to Dashboard */}
          {onNavigate && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('dashboard')}
              className="text-xs shrink-0 gap-1.5 border-border hover:bg-muted"
            >
              Back to Dashboard
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {/* Search & Filter Bar */}
        <div className="mt-6 pt-5 border-t border-border space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guides, tools, shortcuts, workflows, or FAQs (e.g. 'dead links', 'dormant', '⌘S', 'onetab')..."
              className="pl-9 pr-9 h-10 text-xs bg-muted/30 border-border focus-visible:ring-1 focus-visible:ring-primary rounded-xl"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter Pills Ribbon */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            {HELP_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs whitespace-nowrap transition-all ${
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {getCategoryIcon(cat.iconName, 'w-3.5 h-3.5')}
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Search results banner if searching */}
      {searchQuery && (
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-primary" />
            <span>
              Found <strong>{searchResults.totalMatches}</strong> matching result{searchResults.totalMatches === 1 ? '' : 's'} for{' '}
              <span className="text-foreground font-semibold">"{searchQuery}"</span>
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSearch}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            Clear Search
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* 2. Quick-Start Essentials (Featured 4-Card Hero Grid) - Show when not filtering heavily */}
      {!searchQuery && (selectedCategory === 'all' || selectedCategory === 'getting-started') && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Zap className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Core Workflows at a Glance</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Card className="p-4 border-border bg-card shadow-xs flex flex-col justify-between space-y-3 hover:border-primary/40 transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Zap className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-foreground">1-Click Window Capture</h4>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono">⌘S</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Stash all open tabs in your current window into an organized collection. Liberates hundreds of megabytes of RAM while protecting pinned tabs.
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                {onNavigate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate('dashboard')}
                    className="h-7 text-[11px] text-primary hover:text-primary hover:bg-primary/10 gap-1 px-2.5"
                  >
                    Go to Dashboard
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </Card>

            <Card className="p-4 border-border bg-card shadow-xs flex flex-col justify-between space-y-3 hover:border-primary/40 transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Maximize2 className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-foreground">Tab Group Inspector</h4>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5">Modal Workspace</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Double-click any card to filter by domain chips, drag-to-reorder tabs, select tabs for batch deletion, or extract sub-groups into new collections.
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                {onNavigate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate('dashboard')}
                    className="h-7 text-[11px] text-primary hover:text-primary hover:bg-primary/10 gap-1 px-2.5"
                  >
                    Try Inspector
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </Card>

            <Card className="p-4 border-border bg-card shadow-xs flex flex-col justify-between space-y-3 hover:border-primary/40 transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-foreground">Power Tools Hub</h4>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5">4 Tools</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Audit dead 404 links with Wayback recovery, purge marketing tracking duplicates, cluster library by domains, and review dormant stale tabs.
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                {onNavigate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate('tools')}
                    className="h-7 text-[11px] text-primary hover:text-primary hover:bg-primary/10 gap-1 px-2.5"
                  >
                    Open Power Tools
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </Card>

            <Card className="p-4 border-border bg-card shadow-xs flex flex-col justify-between space-y-3 hover:border-primary/40 transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Cpu className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-foreground">Zero-Bandwidth Restoration</h4>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5">Memory Engine</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Reopen 50+ tabs without crashing your browser or spiking CPU. Background tabs stay in lightweight dormant mode until you actively click them.
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                {onNavigate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate('settings')}
                    className="h-7 text-[11px] text-primary hover:text-primary hover:bg-primary/10 gap-1 px-2.5"
                  >
                    View Settings
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* 3. Progressive Disclosure Feature Guides */}
      {searchResults.guides.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                Feature Guides & Modules ({searchResults.guides.length})
              </h3>
            </div>
          </div>

          <div className="space-y-4">
            {searchResults.guides.map((guide) => {
              const isExpanded = !!expandedGuides[guide.id];

              return (
                <Card
                  key={guide.id}
                  className="border-border bg-card shadow-xs overflow-hidden transition-all hover:border-border/80"
                >
                  <CardHeader className="pb-3 border-b border-border/60 bg-muted/10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                          {getGuideIcon(guide.category, 'w-4 h-4')}
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-sm font-bold text-foreground">
                              {guide.title}
                            </CardTitle>
                            {guide.badge && (
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 px-1.5 font-medium border-primary/30 text-primary bg-primary/5"
                              >
                                {guide.badge}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {guide.summary}
                          </p>
                        </div>
                      </div>

                      {/* Action CTA if present */}
                      {guide.actionTarget && onNavigate && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onNavigate(guide.actionTarget!)}
                          className="text-xs h-7 shrink-0 gap-1 border-border text-foreground hover:bg-muted"
                        >
                          {guide.actionLabel || 'Open'}
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-3.5">
                    {/* 3-Pillar Context Matrix (What it does -> How it works -> What to expect) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3 rounded-lg bg-muted/20 border border-border/40 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                          <Info className="w-3 h-3" />
                          What is this?
                        </span>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {guide.whatItDoes}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-muted/20 border border-border/40 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                          <SlidersHorizontal className="w-3 h-3" />
                          How does it work?
                        </span>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {guide.howItWorks}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-muted/20 border border-border/40 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          What to expect?
                        </span>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {guide.whatToExpect}
                        </p>
                      </div>
                    </div>

                    {/* Expandable Step-by-Step & Pro Tips (Progressive Disclosure) */}
                    {(guide.steps || guide.proTip) && (
                      <div>
                        {isExpanded ? (
                          <div className="pt-3 border-t border-border/60 space-y-3 animate-in fade-in duration-200">
                            {guide.steps && guide.steps.length > 0 && (
                              <div className="space-y-1.5">
                                <h5 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                  <CornerDownRight className="w-3.5 h-3.5 text-primary" />
                                  Step-by-Step Instructions:
                                </h5>
                                <ol className="space-y-1 pl-5 list-decimal text-xs text-muted-foreground leading-relaxed">
                                  {guide.steps.map((step, idx) => (
                                    <li key={idx} className="pl-1">
                                      {step}
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            )}

                            {guide.proTip && (
                              <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20 flex items-start gap-2.5">
                                <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                <div className="space-y-0.5">
                                  <span className="text-xs font-bold text-foreground">Pro Tip</span>
                                  <p className="text-xs text-muted-foreground leading-relaxed">
                                    {guide.proTip}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : null}

                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => toggleGuideExpand(guide.id)}
                            className="text-[11px] font-medium text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                          >
                            {isExpanded ? (
                              <>
                                Hide Detailed Steps & Tips
                                <ChevronUp className="w-3.5 h-3.5" />
                              </>
                            ) : (
                              <>
                                View Detailed Steps & Pro Tips
                                <ChevronDown className="w-3.5 h-3.5" />
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Interactive Keyboard Shortcuts Cheatsheet */}
      {searchResults.shortcuts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Keyboard className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Keyboard Shortcuts Cheatsheet ({searchResults.shortcuts.length})
            </h3>
          </div>

          <Card className="border-border bg-card shadow-xs overflow-hidden">
            <div className="divide-y divide-border">
              {searchResults.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-muted/15 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground">{shortcut.action}</span>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-muted-foreground">
                        {shortcut.category}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {shortcut.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground font-mono">Mac:</span>
                      <kbd className="px-2 py-0.5 rounded-md bg-muted text-foreground font-mono font-semibold text-xs border border-border shadow-2xs">
                        {shortcut.macKey}
                      </kbd>
                    </div>
                    <span className="text-muted-foreground/40 text-xs">/</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground font-mono">Win:</span>
                      <kbd className="px-2 py-0.5 rounded-md bg-muted text-foreground font-mono font-semibold text-xs border border-border shadow-2xs">
                        {shortcut.winKey}
                      </kbd>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* 5. Right-Click Context Menu Reference */}
      {searchResults.contextMenus.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <MousePointerClick className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Right-Click Browser Context Menus
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {searchResults.contextMenus.map((ctx) => (
              <Card key={ctx.id} className="p-3.5 border-border bg-card shadow-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-foreground">{ctx.title}</h4>
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-primary border-primary/30 bg-primary/5">
                    Context Action
                  </Badge>
                </div>
                <p className="text-[11px] font-mono text-muted-foreground bg-muted/30 p-1.5 rounded border border-border/40">
                  {ctx.trigger}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {ctx.behavior}
                </p>
                <div className="text-[11px] text-primary/90 font-medium flex items-center gap-1 pt-0.5">
                  <Check className="w-3 h-3 shrink-0" />
                  {ctx.benefit}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 6. Comprehensive Task-Oriented FAQs (Accordion) */}
      {searchResults.faqs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <HelpCircle className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Frequently Asked Questions ({searchResults.faqs.length})
            </h3>
          </div>

          <Card className="border-border bg-card shadow-lg p-5">
            <Accordion type="single" collapsible className="w-full space-y-2">
              {searchResults.faqs.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id} className="border-border">
                  <AccordionTrigger className="text-foreground font-semibold hover:text-primary transition-colors text-xs sm:text-sm text-left py-3">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed text-xs space-y-2.5 pt-1">
                    <p>{faq.answer}</p>
                    {faq.steps && faq.steps.length > 0 && (
                      <ol className="space-y-1 pl-5 list-decimal text-xs text-muted-foreground leading-relaxed pt-1">
                        {faq.steps.map((step, idx) => (
                          <li key={idx} className="pl-1">
                            {step}
                          </li>
                        ))}
                      </ol>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>
        </div>
      )}

      {/* 7. Zero Search Results Empty State */}
      {searchResults.totalMatches === 0 && (
        <Card className="p-8 text-center border-border bg-card shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-full bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto">
            <Search className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-foreground">No matching topics found</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              We couldn't find any guides, shortcuts, or FAQs matching <strong>"{searchQuery}"</strong>. Try a different keyword or reset filters.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={clearSearch}
            className="text-xs border-border"
          >
            Clear Search & Reset Filters
          </Button>
        </Card>
      )}

      {/* 8. Calm Footer Reassurance Banner */}
      <div className="pt-4 text-center space-y-1.5 text-xs text-muted-foreground">
        <p className="flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
          <span>
            TwoTab is 100% open-source, local-first software. Your tabs never leave your device.
          </span>
        </p>
        <p className="text-[11px] text-muted-foreground/70">
          Running version {getAppVersion()} • Built with Manifest V3
        </p>
      </div>
    </div>
  );
};
