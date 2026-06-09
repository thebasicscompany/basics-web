"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  AssetRecordType,
  Box,
  DefaultToolbar,
  Tldraw,
  b64Vecs,
  createShapeId,
  renderPlaintextFromRichText,
  toRichText,
  type Editor,
  type TLComponents,
  type TLDefaultColorStyle,
  type TLShape,
} from "tldraw";
import "tldraw/tldraw.css";
import type { VisualAction, VisualPoint } from "@basics/contracts";

/** Logical stage size; visual.* event coordinates are percentages of this. */
const STAGE_WIDTH = 1600;
const STAGE_HEIGHT = 900;

const SKETCH_DEBOUNCE_MS = 2000;

/**
 * Vertical toolbar so the drawing tools sit on the right edge instead of
 * conflicting with the voice control bar at the bottom center. The
 * right-edge placement itself is done in CSS (see `.lesson-board` rules).
 */
function VerticalToolbar() {
  return <DefaultToolbar orientation="vertical" />;
}

/** Hide chrome the lesson doesn't need; keep the toolbar and style panel. */
const drawModeComponents: TLComponents = {
  Toolbar: VerticalToolbar,
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

/** View-only chrome: no drawing toolbar or style panel at all. */
const readOnlyComponents: TLComponents = {
  ...drawModeComponents,
  Toolbar: null,
  StylePanel: null,
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

async function renderMermaidSvg(
  source: string,
): Promise<{ svg: string; width: number; height: number } | null> {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "neutral",
  });
  try {
    const id = `mmd_${crypto.randomUUID().replaceAll("-", "")}`;
    const { svg } = await mermaid.render(id, source);
    return measureSvg(svg);
  } catch (error) {
    console.warn("Failed to render mermaid diagram", error);
    return null;
  }
}

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
  /**
   * Whether the learner may draw. When false the board is read-only and the
   * drawing toolbar is hidden; the tutor can still draw programmatically.
   */
  canDraw?: boolean;
  /** Called with a plain-language description of the learner's own drawing. */
  onSketch?: (description: string) => void;
};

export function TldrawBoard({
  actions,
  canDraw = false,
  onSketch,
}: TldrawBoardProps) {
  const editorRef = useRef<Editor | null>(null);
  const appliedRef = useRef<Set<string>>(new Set());
  const applyingRef = useRef(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const sketchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSketchRef = useRef(onSketch);
  const canDrawRef = useRef(canDraw);
  useEffect(() => {
    onSketchRef.current = onSketch;
  }, [onSketch]);

  // Toggle read-only mode with the agent-granted drawing permission.
  useEffect(() => {
    canDrawRef.current = canDraw;
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    editor.updateInstanceState({ isReadonly: !canDraw });
    if (!canDraw) {
      editor.setCurrentTool("select");
    }
  }, [canDraw]);

  /**
   * Run an editor mutation while suppressing the learner-sketch listener and
   * temporarily lifting read-only mode so the tutor can always draw.
   */
  const mutate = useCallback((editor: Editor, fn: () => void) => {
    applyingRef.current = true;
    const wasReadonly = editor.getInstanceState().isReadonly;
    try {
      if (wasReadonly) {
        editor.updateInstanceState({ isReadonly: false });
      }
      editor.run(fn, { ignoreShapeLock: true });
    } finally {
      if (wasReadonly) {
        editor.updateInstanceState({ isReadonly: true });
      }
      applyingRef.current = false;
    }
  }, []);

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
            mutate(editor, () => editor.deleteShapes(ids));
          }
          return;
        }
        case "visual.draw_path": {
          const points = action.points.map(toStage);
          const origin = points[0];
          mutate(editor, () =>
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
            mutate(editor, () =>
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
            mutate(editor, () =>
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
          mutate(editor, () =>
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
        case "visual.add_diagram": {
          const rendered =
            action.format === "mermaid"
              ? await renderMermaidSvg(action.source)
              : measureSvg(action.source);
          if (!rendered) {
            return;
          }

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

          mutate(editor, () => {
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
            if (action.title) {
              editor.createShape({
                id: createShapeId(),
                type: "text",
                x: position.x,
                y: position.y - 48,
                meta,
                props: {
                  richText: toRichText(action.title),
                  color: "black",
                  size: "m",
                },
              });
            }
          });
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
    [mutate],
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

  const describeSketch = useCallback((editor: Editor): string | null => {
    const shapes = editor
      .getCurrentPageShapes()
      .filter((shape) => shape.meta?.source !== "tutor")
      .slice(0, 24);
    if (shapes.length === 0) {
      return null;
    }
    return shapes
      .map((shape) => describeShape(editor, shape))
      .filter(Boolean)
      .join("; ");
  }, []);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      editor.updateInstanceState({ isReadonly: !canDrawRef.current });
      editor.zoomToBounds(new Box(0, 0, STAGE_WIDTH, STAGE_HEIGHT), {
        inset: 32,
      });

      applyNewActions(editor, actions);

      // Watch for learner-made changes and publish a debounced description.
      const unlisten = editor.store.listen(
        () => {
          if (applyingRef.current || !onSketchRef.current) {
            return;
          }
          if (sketchTimerRef.current) {
            clearTimeout(sketchTimerRef.current);
          }
          sketchTimerRef.current = setTimeout(() => {
            const description = describeSketch(editor);
            if (description) {
              onSketchRef.current?.(description);
            }
          }, SKETCH_DEBOUNCE_MS);
        },
        { scope: "document", source: "user" },
      );

      return () => {
        unlisten();
        if (sketchTimerRef.current) {
          clearTimeout(sketchTimerRef.current);
        }
        editorRef.current = null;
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; live updates flow through the effect below
    [applyNewActions, describeSketch],
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
        components={canDraw ? drawModeComponents : readOnlyComponents}
        onMount={handleMount}
        options={{ maxPages: 1 }}
      />
    </div>
  );
}

function describeShape(editor: Editor, shape: TLShape): string | null {
  const bounds = editor.getShapePageBounds(shape);
  const where = bounds
    ? ` near ${Math.round((bounds.midX / STAGE_WIDTH) * 100)}% across, ${Math.round(
        (bounds.midY / STAGE_HEIGHT) * 100,
      )}% down`
    : "";

  switch (shape.type) {
    case "draw":
      return `a freehand stroke${where}`;
    case "geo": {
      const geo = (shape.props as { geo?: string }).geo ?? "shape";
      return `a ${geo}${where}`;
    }
    case "arrow":
      return `an arrow${where}`;
    case "line":
      return `a line${where}`;
    case "text": {
      const richText = (shape.props as { richText?: unknown }).richText;
      const text = richText
        ? renderPlaintextFromRichText(
            editor,
            richText as Parameters<typeof renderPlaintextFromRichText>[1],
          )
        : "";
      return text ? `text saying "${text}"${where}` : null;
    }
    case "note": {
      const richText = (shape.props as { richText?: unknown }).richText;
      const text = richText
        ? renderPlaintextFromRichText(
            editor,
            richText as Parameters<typeof renderPlaintextFromRichText>[1],
          )
        : "";
      return `a note${text ? ` saying "${text}"` : ""}${where}`;
    }
    default:
      return `a ${shape.type}${where}`;
  }
}
