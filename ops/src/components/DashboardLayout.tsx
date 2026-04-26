import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "./Icon";

export interface WidgetDef {
  id: string;
  label: string;
  // Render fn produces the actual card. Receives `editing` so the card
  // can dim its content / hide live updates while the user rearranges.
  render: () => React.ReactNode;
}

export interface SectionDef {
  id: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Tailwind-ish class governing the grid columns. */
  gridClass: string;
  /** SortableContext strategy — rectSortingStrategy works for grids. */
  strategy: typeof rectSortingStrategy;
  widgets: WidgetDef[];
}

export interface DashboardLayout {
  /** Schema version. Bump if the shape changes incompatibly. */
  version: number;
  /** Order of sections by id. */
  sectionOrder: string[];
  /** Per-section widget id order. */
  widgetOrderBySection: Record<string, string[]>;
  /** Widget ids the user explicitly hid via the × button in edit mode. */
  hidden: string[];
}

const STORAGE_KEY = "beacon-ops-layout";
const SCHEMA_VERSION = 1;

/** Read the persisted layout if present, else null. Resilient to
 *  corrupt JSON or wrong-version blobs — both fall back to defaults. */
export function loadLayout(): DashboardLayout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DashboardLayout>;
    if (parsed.version !== SCHEMA_VERSION) return null;
    if (!Array.isArray(parsed.sectionOrder)) return null;
    if (!parsed.widgetOrderBySection || typeof parsed.widgetOrderBySection !== "object") {
      return null;
    }
    return {
      version: SCHEMA_VERSION,
      sectionOrder: parsed.sectionOrder,
      widgetOrderBySection: parsed.widgetOrderBySection,
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
    };
  } catch {
    return null;
  }
}

function saveLayout(l: DashboardLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(l));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Reconcile the persisted layout with the current set of sections /
 * widgets the app knows how to render. New widgets get appended to
 * the end of their section; widgets that no longer exist are dropped.
 * This way an app upgrade that adds a card doesn't strand it.
 */
function reconcile(
  sections: SectionDef[],
  saved: DashboardLayout | null,
): DashboardLayout {
  const defaultLayout: DashboardLayout = {
    version: SCHEMA_VERSION,
    sectionOrder: sections.map((s) => s.id),
    widgetOrderBySection: Object.fromEntries(
      sections.map((s) => [s.id, s.widgets.map((w) => w.id)]),
    ),
    hidden: [],
  };
  if (!saved) return defaultLayout;

  // Filter section order to only ids we still recognise, append unknown
  // sections at the end of the saved order.
  const knownSectionIds = new Set(sections.map((s) => s.id));
  const sectionOrder = saved.sectionOrder.filter((id) => knownSectionIds.has(id));
  for (const id of defaultLayout.sectionOrder) {
    if (!sectionOrder.includes(id)) sectionOrder.push(id);
  }

  const widgetOrderBySection: Record<string, string[]> = {};
  for (const section of sections) {
    const knownWidgetIds = new Set(section.widgets.map((w) => w.id));
    const savedOrder = saved.widgetOrderBySection[section.id] ?? [];
    const order = savedOrder.filter((id) => knownWidgetIds.has(id));
    for (const w of section.widgets) {
      if (!order.includes(w.id) && !saved.hidden.includes(w.id)) {
        order.push(w.id);
      }
    }
    widgetOrderBySection[section.id] = order;
  }

  // Filter hidden to only widgets we still know about.
  const allKnownWidgetIds = new Set(sections.flatMap((s) => s.widgets.map((w) => w.id)));
  const hidden = saved.hidden.filter((id) => allKnownWidgetIds.has(id));

  return {
    version: SCHEMA_VERSION,
    sectionOrder,
    widgetOrderBySection,
    hidden,
  };
}

interface Props {
  sections: SectionDef[];
  /** "Edit" toggle controlled by the parent so it can live in the topbar. */
  editing: boolean;
  /** Optional renderer for non-draggable content (other sections of the
   *  page) intercalated between the sortable sections at fixed positions
   *  identified by id. e.g. {"after-business": <FreeTier />}. */
  staticRender?: Record<string, React.ReactNode>;
}

/**
 * The drag-and-drop layout. Two-level sortable:
 *   * outer SortableContext orders sections
 *   * each section has its own inner SortableContext over its widgets
 *
 * In view mode (editing=false) we render plain divs without DndContext
 * to avoid the runtime overhead and any chance of accidental drags
 * confusing screen readers.
 */
export function DashboardLayoutGrid({ sections, editing, staticRender }: Props) {
  const [layout, setLayout] = useState<DashboardLayout>(() =>
    reconcile(sections, loadLayout()),
  );

  // Re-reconcile whenever the available sections change (new widget
  // shipped in a deploy, etc).
  useEffect(() => {
    setLayout((prev) => reconcile(sections, prev));
    // Disable exhaustive-deps complaint: we genuinely only want this to
    // re-run when the section/widget identity set changes, not on every
    // render. Recompute the digest of (sectionId, widgetIds).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsDigest(sections)]);

  useEffect(() => saveLayout(layout), [layout]);

  const sectionsById = useMemo(() => {
    const m = new Map<string, SectionDef>();
    for (const s of sections) m.set(s.id, s);
    return m;
  }, [sections]);

  const widgetById = useMemo(() => {
    const m = new Map<string, WidgetDef>();
    for (const s of sections) for (const w of s.widgets) m.set(w.id, w);
    return m;
  }, [sections]);

  function onSectionDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setLayout((l) => {
      const oldIdx = l.sectionOrder.indexOf(String(active.id));
      const newIdx = l.sectionOrder.indexOf(String(over.id));
      if (oldIdx < 0 || newIdx < 0) return l;
      return { ...l, sectionOrder: arrayMove(l.sectionOrder, oldIdx, newIdx) };
    });
  }

  function onWidgetDragEnd(sectionId: string) {
    return (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      setLayout((l) => {
        const order = l.widgetOrderBySection[sectionId] ?? [];
        const oldIdx = order.indexOf(String(active.id));
        const newIdx = order.indexOf(String(over.id));
        if (oldIdx < 0 || newIdx < 0) return l;
        return {
          ...l,
          widgetOrderBySection: {
            ...l.widgetOrderBySection,
            [sectionId]: arrayMove(order, oldIdx, newIdx),
          },
        };
      });
    };
  }

  function hideWidget(id: string) {
    setLayout((l) => ({
      ...l,
      hidden: l.hidden.includes(id) ? l.hidden : [...l.hidden, id],
      widgetOrderBySection: Object.fromEntries(
        Object.entries(l.widgetOrderBySection).map(([sid, ids]) => [
          sid,
          ids.filter((wid) => wid !== id),
        ]),
      ),
    }));
  }

  function showWidget(id: string) {
    const widget = widgetById.get(id);
    if (!widget) return;
    // Find which section this widget belongs to in its default config
    const sectionId =
      sections.find((s) => s.widgets.some((w) => w.id === id))?.id ?? "";
    if (!sectionId) return;
    setLayout((l) => ({
      ...l,
      hidden: l.hidden.filter((h) => h !== id),
      widgetOrderBySection: {
        ...l.widgetOrderBySection,
        [sectionId]: [...(l.widgetOrderBySection[sectionId] ?? []), id],
      },
    }));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }, // small drag distance so taps don't trigger
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // ----- Read-only path (most of the time) ----------------------------
  if (!editing) {
    return (
      <>
        {layout.sectionOrder.map((sid) => {
          const section = sectionsById.get(sid);
          if (!section) return null;
          const ids = layout.widgetOrderBySection[sid] ?? [];
          return (
            <div key={sid}>
              <SectionHeading section={section} />
              <div className={section.gridClass}>
                {ids.map((wid) => {
                  const w = widgetById.get(wid);
                  if (!w) return null;
                  return <div key={wid}>{w.render()}</div>;
                })}
              </div>
              {staticRender?.[`after-${sid}`]}
            </div>
          );
        })}
      </>
    );
  }

  // ----- Edit mode (drag + remove + add) -----------------------------
  const hiddenWidgets = layout.hidden
    .map((id) => widgetById.get(id))
    .filter((w): w is WidgetDef => Boolean(w));

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSectionDragEnd}>
        <SortableContext items={layout.sectionOrder} strategy={verticalListSortingStrategy}>
          {layout.sectionOrder.map((sid) => {
            const section = sectionsById.get(sid);
            if (!section) return null;
            return (
              <SortableSection
                key={sid}
                section={section}
                widgetById={widgetById}
                widgetOrder={layout.widgetOrderBySection[sid] ?? []}
                onWidgetDragEnd={onWidgetDragEnd(sid)}
                onHide={hideWidget}
                sensors={sensors}
              />
            );
          })}
        </SortableContext>
      </DndContext>

      {hiddenWidgets.length > 0 && (
        <div className="add-widget-panel">
          <div className="add-widget-title">Hidden widgets</div>
          <div className="add-widget-list">
            {hiddenWidgets.map((w) => (
              <button
                key={w.id}
                type="button"
                className="add-widget-btn"
                onClick={() => showWidget(w.id)}
              >
                <Icon.Plus />
                <span>{w.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function sectionsDigest(sections: SectionDef[]): string {
  return sections
    .map((s) => `${s.id}:${s.widgets.map((w) => w.id).join(",")}`)
    .join("|");
}

function SectionHeading({ section }: { section: SectionDef }) {
  return (
    <div className="section-head">
      {section.icon && <span className="section-icon">{section.icon}</span>}
      <div>
        <div className="section-title">{section.title}</div>
        {section.subtitle && <div className="section-sub">{section.subtitle}</div>}
      </div>
    </div>
  );
}

interface SortableSectionProps {
  section: SectionDef;
  widgetById: Map<string, WidgetDef>;
  widgetOrder: string[];
  onWidgetDragEnd: (e: DragEndEvent) => void;
  onHide: (id: string) => void;
  sensors: ReturnType<typeof useSensors>;
}

function SortableSection({
  section,
  widgetById,
  widgetOrder,
  onWidgetDragEnd,
  onHide,
  sensors,
}: SortableSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="dnd-section">
      <div className="dnd-section-head">
        <button
          type="button"
          className="dnd-section-handle"
          {...attributes}
          {...listeners}
          aria-label={`Drag section ${section.title}`}
          title="Drag to reorder section"
        >
          <Icon.GripVertical />
        </button>
        <SectionHeading section={section} />
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onWidgetDragEnd}>
        <SortableContext items={widgetOrder} strategy={section.strategy}>
          <div className={section.gridClass}>
            {widgetOrder.map((wid) => {
              const w = widgetById.get(wid);
              if (!w) return null;
              return (
                <SortableWidget key={wid} widget={w} onHide={onHide} />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableWidget({
  widget,
  onHide,
}: {
  widget: WidgetDef;
  onHide: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="dnd-widget">
      <div className="dnd-widget-controls">
        <button
          type="button"
          className="dnd-handle"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${widget.label}`}
          title={`Drag ${widget.label}`}
        >
          <Icon.GripVertical />
        </button>
        <button
          type="button"
          className="dnd-remove"
          onClick={() => onHide(widget.id)}
          aria-label={`Hide ${widget.label}`}
          title={`Hide ${widget.label}`}
        >
          ×
        </button>
      </div>
      {widget.render()}
    </div>
  );
}

export { rectSortingStrategy, verticalListSortingStrategy };
