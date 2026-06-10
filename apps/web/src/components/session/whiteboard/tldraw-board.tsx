"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  AssetRecordType,
  Box,
  Tldraw,
  b64Vecs,
  createShapeId,
  toRichText,
  type Editor,
  type TLComponents,
  type TLDefaultColorStyle,
} from "tldraw";
import "tldraw/tldraw.css";
import type { VisualAction, VisualPoint } from "@basics/contracts";

/** Logical stage size; visual.* event coordinates are percentages of this. */
const STAGE_WIDTH = 1600;
const STAGE_HEIGHT = 900;

/** View-only chrome: the board renders agent-driven visuals, nothing else. */
const readOnlyComponents: TLComponents = {
  Toolbar: null,
  StylePanel: null,
  MainMenu: null,
  PageMenu: null,
  NavigationPanel: null,
  ActionsMenu: null,
  QuickActions: null,
  HelpMenu: null,
  KeyboardShortcutsDialog: null,
  DebugMenu: null,
  DebugPanel: null,
};

const TLDRAW_COLORS: Array<{ name: TLDefaultColorStyle; rgb: [number, number, number] }> = [
  { name: "black", rgb: [29, 29, 29] },
  { name: "grey", rgb: [159, 168, 178] },
  { name: "light-violet", rgb: [224, 133, 244] },
  { name: "violet", rgb: [174, 62, 201] },
  { name: "blue", rgb: [66, 99, 235] },
  { name: "light-blue", rgb: [77, 171, 247] },
  { name: "yellow", rgb: [255, 192, 52] },
  { name: "orange", rgb: [247, 103, 7] },
  { name: "green", rgb: [9, 146, 104] },
  { name: "light-green", rgb: [64, 192, 87] },
  { name: "light-red", rgb: [255, 135, 135] },
  { name: "red", rgb: [224, 49, 49] },
];

function nearestTldrawColor(hex: string | undefined): TLDefaultColorStyle {
  if (!hex) {
    return "black";
  }
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);

  let best: TLDefaultColorStyle = "black";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of TLDRAW_COLORS) {
    const [cr, cg, cb] = candidate.rgb;
    const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate.name;
    }
  }
  return best;
}

function toStage(point: VisualPoint): { x: number; y: number } {
  return {
    x: (point.x / 100) * STAGE_WIDTH,
    y: (point.y / 100) * STAGE_HEIGHT,
  };
}

const TUTOR_META = { source: "tutor" } as const;

function measureSvg(
  svg: string,
): { svg: string; width: number; height: number } | null {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (root.nodeName !== "svg") {
    return null;
  }
  const viewBox = root.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
  let width = Number.parseFloat(root.getAttribute("width") ?? "");
  let height = Number.parseFloat(root.getAttribute("height") ?? "");
  if ((!width || !height) && viewBox && viewBox.length === 4) {
    width = viewBox[2];
    height = viewBox[3];
  }
  if (!width || !height) {
    width = 600;
    height = 400;
  }
  // Ensure intrinsic dimensions exist so the data URL renders as an image.
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  return {
    svg: new XMLSerializer().serializeToString(root),
    width,
    height,
  };
}

type TldrawBoardProps = {
  actions: VisualAction[];
};

/**
 * View-only whiteboard: replays `visual.*` session events. Mermaid diagrams
 * become native, editable tldraw shapes via `@tldraw/mermaid`; legacy
 * primitive events (shapes, labels, paths) from older sessions still render.
 */
export function TldrawBoard({ actions }: TldrawBoardProps) {
  const editorRef = useRef<Editor | null>(null);
  const appliedRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  /** Runs a (possibly async) editor mutation with read-only mode lifted. */
  const mutate = useCallback(
    async (editor: Editor, fn: () => unknown) => {
      editor.updateInstanceState({ isReadonly: false });
      try {
        await fn();
      } finally {
        editor.updateInstanceState({ isReadonly: true });
      }
    },
    [],
  );

  /** Places a static SVG document on the board as an image shape. */
  const placeSvgDiagram = useCallback(
    (
      editor: Editor,
      rendered: { svg: string; width: number; height: number },
      action: Extract<VisualAction, { type: "visual.add_diagram" }>,
      meta: Record<string, string>,
    ) => {
      const targetWidth = ((action.width ?? 50) / 100) * STAGE_WIDTH;
      const targetHeight = targetWidth * (rendered.height / rendered.width);
      const position = action.at
        ? toStage(action.at)
        : {
            x: (STAGE_WIDTH - targetWidth) / 2,
            y: STAGE_HEIGHT * 0.08,
          };

      const assetId = AssetRecordType.createId();
      const src = `data:image/svg+xml;utf8,${encodeURIComponent(rendered.svg)}`;

      editor.createAssets([
        AssetRecordType.create({
          id: assetId,
          type: "image",
          props: {
            name: action.title ?? "diagram",
            src,
            w: rendered.width,
            h: rendered.height,
            mimeType: "image/svg+xml",
            isAnimated: false,
          },
        }),
      ]);
      editor.createShape({
        id: createShapeId(),
        type: "image",
        x: position.x,
        y: position.y,
        meta,
        props: { assetId, w: targetWidth, h: targetHeight },
      });
    },
    [],
  );

  /**
   * Renders a Mermaid diagram as native tldraw shapes. Diagram families
   * @tldraw/mermaid doesn't support yet fall back to a static SVG image.
   */
  const placeMermaidDiagram = useCallback(
    async (
      editor: Editor,
      action: Extract<VisualAction, { type: "visual.add_diagram" }>,
      meta: Record<string, string>,
    ) => {
      const { createMermaidDiagram } = await import("@tldraw/mermaid");

      const position = action.at
        ? toStage(action.at)
        : { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT * 0.45 };

      const before = new Set(editor.getCurrentPageShapeIds());

      await createMermaidDiagram(editor, action.source, {
        blueprintRender: {
          position,
          centerOnPosition: !action.at,
        },
        onUnsupportedDiagram: async (svg) => {
          const rendered = measureSvg(svg);
          if (rendered) {
            placeSvgDiagram(editor, rendered, action, meta);
          }
        },
      });

      // Attribute the new shapes to the tutor and place the optional title.
      const created = editor
        .getCurrentPageShapes()
        .filter((shape) => !before.has(shape.id));

      if (created.length > 0) {
        editor.updateShapes(
          created.map((shape) => ({
            id: shape.id,
            type: shape.type,
            meta: { ...shape.meta, ...meta },
          })),
        );

        if (action.title) {
          let minX = Number.POSITIVE_INFINITY;
          let minY = Number.POSITIVE_INFINITY;
          for (const shape of created) {
            const bounds = editor.getShapePageBounds(shape.id);
            if (bounds) {
              minX = Math.min(minX, bounds.x);
              minY = Math.min(minY, bounds.y);
            }
          }
          if (Number.isFinite(minX) && Number.isFinite(minY)) {
            editor.createShape({
              id: createShapeId(),
              type: "text",
              x: minX,
              y: minY - 48,
              meta,
              props: {
                richText: toRichText(action.title),
                color: "black",
                size: "m",
              },
            });
          }
        }
      }
    },
    [placeSvgDiagram],
  );

  const applyAction = useCallback(
    async (editor: Editor, action: VisualAction) => {
      const meta = { ...TUTOR_META, eventId: action.id };
      const color = nearestTldrawColor(
        "style" in action ? action.style?.color : undefined,
      );

      switch (action.type) {
        case "visual.clear_surface": {
          const ids = editor.getCurrentPageShapes().map((shape) => shape.id);
          if (ids.length > 0) {
            await mutate(editor, () => editor.deleteShapes(ids));
          }
          return;
        }
        case "visual.add_diagram": {
          if (action.format === "mermaid") {
            await mutate(editor, () =>
              placeMermaidDiagram(editor, action, meta),
            );
          } else {
            const rendered = measureSvg(action.source);
            if (!rendered) {
              return;
            }
            await mutate(editor, () =>
              placeSvgDiagram(editor, rendered, action, meta),
            );
          }
          break;
        }
        // Legacy events from sessions recorded before Mermaid became the
        // single drawing path; replayed so old boards still rehydrate.
        case "visual.draw_path": {
          const points = action.points.map(toStage);
          const origin = points[0];
          await mutate(editor, () =>
            editor.createShape({
              id: createShapeId(),
              type: "draw",
              x: origin.x,
              y: origin.y,
              meta,
              props: {
                color,
                segments: [
                  {
                    type: "free",
                    path: b64Vecs.encodePoints(
                      points.map((point) => ({
                        x: point.x - origin.x,
                        y: point.y - origin.y,
                        z: 0.5,
                      })),
                    ),
                  },
                ],
                isComplete: true,
              },
            }),
          );
          break;
        }
        case "visual.add_shape": {
          const origin = toStage(action.origin);
          if (action.shape === "rectangle" || action.shape === "ellipse") {
            const w = ((action.width ?? 20) / 100) * STAGE_WIDTH;
            const h = ((action.height ?? 15) / 100) * STAGE_HEIGHT;
            await mutate(editor, () =>
              editor.createShape({
                id: createShapeId(),
                type: "geo",
                x: origin.x,
                y: origin.y,
                meta,
                props: {
                  geo: action.shape === "rectangle" ? "rectangle" : "ellipse",
                  w,
                  h,
                  color,
                },
              }),
            );
          } else {
            const end = action.end
              ? toStage(action.end)
              : { x: origin.x + 160, y: origin.y };
            await mutate(editor, () =>
              editor.createShape({
                id: createShapeId(),
                type: "arrow",
                x: origin.x,
                y: origin.y,
                meta,
                props: {
                  start: { x: 0, y: 0 },
                  end: { x: end.x - origin.x, y: end.y - origin.y },
                  color,
                  arrowheadStart: "none",
                  arrowheadEnd: action.shape === "arrow" ? "arrow" : "none",
                },
              }),
            );
          }
          break;
        }
        case "visual.add_text": {
          const at = toStage(action.at);
          await mutate(editor, () =>
            editor.createShape({
              id: createShapeId(),
              type: "text",
              x: at.x,
              y: at.y,
              meta,
              props: {
                richText: toRichText(action.text),
                color,
                size: "m",
              },
            }),
          );
          break;
        }
        case "visual.set_draw_mode":
        case "visual.focus":
          return;
      }

      // Bring newly drawn tutor content into view unless it is already visible.
      const bounds = editor.getCurrentPageBounds();
      if (bounds && !editor.getViewportPageBounds().contains(bounds)) {
        editor.zoomToBounds(bounds, {
          inset: 96,
          animation: { duration: 320 },
        });
      }
    },
    [mutate, placeMermaidDiagram, placeSvgDiagram],
  );

  const applyNewActions = useCallback(
    (editor: Editor, incoming: VisualAction[]) => {
      const fresh = incoming.filter((action) => !appliedRef.current.has(action.id));
      for (const action of fresh) {
        appliedRef.current.add(action.id);
        queueRef.current = queueRef.current.then(() =>
          applyAction(editor, action).catch((error: unknown) => {
            console.warn("Failed to apply whiteboard action", error);
          }),
        );
      }
    },
    [applyAction],
  );

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      editor.updateInstanceState({ isReadonly: true });
      editor.zoomToBounds(new Box(0, 0, STAGE_WIDTH, STAGE_HEIGHT), {
        inset: 32,
      });

      applyNewActions(editor, actions);

      return () => {
        editorRef.current = null;
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; live updates flow through the effect below
    [applyNewActions],
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (editor) {
      applyNewActions(editor, actions);
    }
  }, [actions, applyNewActions]);

  return (
    <div className="lesson-board relative h-full w-full">
      <Tldraw
        components={readOnlyComponents}
        onMount={handleMount}
        options={{ maxPages: 1 }}
      />
    </div>
  );
}
