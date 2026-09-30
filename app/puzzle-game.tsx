"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  ChevronDown,
  Download,
  Globe2,
  Images,
  Move,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

const FRAME_WIDTH = 1200;
const FRAME_HEIGHT = 800;
const DB_NAME = "anzellia-puzzle-gallery";
const STORE_NAME = "images";
const SAVE_KEY = "puzzley-recent-v2";
const LANGUAGE_KEY = "puzzley-language";

const LEVELS = [
  { rows: 2, columns: 2, count: 4 },
  { rows: 3, columns: 4, count: 12 },
  { rows: 10, columns: 15, count: 150 },
  { rows: 14, columns: 21, count: 294 },
] as const;

type Screen = "start" | "gallery" | "levels" | "game";
type Language = "zh" | "en" | "ja";
type Edge = -1 | 0 | 1;
type PieceStatus = "waiting" | "free" | "locked";

type GalleryImage = {
  id: string;
  name: string;
  normalized: Blob;
  thumbnail: Blob;
  createdAt: number;
};

type PieceEdges = {
  top: Edge;
  right: Edge;
  bottom: Edge;
  left: Edge;
};

type PuzzlePiece = {
  id: string;
  row: number;
  column: number;
  edges: PieceEdges;
  status: PieceStatus;
  zIndex: number;
};

type TrayState = {
  left: Array<string | null>;
  right: Array<string | null>;
  queue: string[];
};

type RelativePosition = { x: number; y: number };
type Size = { width: number; height: number };
type ViewState = { scale: number; x: number; y: number };
type SavedGame = {
  version: 2;
  imageId: string;
  levelIndex: number;
  pieces: PuzzlePiece[];
  tray: TrayState;
  freePositions: Record<string, RelativePosition>;
  view: ViewState;
  savedAt: number;
};

const COPY = {
  zh: {
    start: "开始",
    gallery: "图库",
    upload: "上传图片",
    processing: "处理中",
    loading: "正在读取图库",
    local: "图片仅保存在当前设备的浏览器中",
    choose: "选择关卡",
    recent: "上次拼到",
    noSave: "暂无未完成的拼图",
    level: "第 {n} 关",
    pieces: "{n} 块",
    completed: "已完成 {done}/{total}",
    back: "返回图库",
    resetView: "恢复视图",
    drawer: "未归位碎片",
    drawerHint: "滑动浏览 · 长按取出",
    export: "导出图片",
    restart: "重新开始",
    next: "下一关",
    deleteTitle: "删除这张图片？",
    deleteBody: "图片将从当前设备的图库中删除，无法恢复。",
    cancel: "取消",
    delete: "删除",
    readError: "无法读取本地图库",
    openError: "无法打开这张图片",
    fileError: "请选择图片文件",
    processError: "无法处理这张图片",
    deleteError: "无法删除这张图片",
    exportError: "无法导出图片",
    saveError: "无法保存最近进度，请检查浏览器存储空间",
    saved: "进度已自动保存",
    movePiece: "移动第 {r} 行第 {c} 列拼图",
    useImage: "使用 {name} 选择关卡",
    deleteImage: "删除 {name}",
    newImage: "上传新图片",
    language: "切换语言",
  },
  en: {
    start: "Start",
    gallery: "Gallery",
    upload: "Upload image",
    processing: "Processing",
    loading: "Loading gallery",
    local: "Images stay in this browser on this device",
    choose: "Choose a level",
    recent: "Continue",
    noSave: "No unfinished puzzle",
    level: "Level {n}",
    pieces: "{n} pieces",
    completed: "{done}/{total} completed",
    back: "Back to gallery",
    resetView: "Reset view",
    drawer: "Unplaced pieces",
    drawerHint: "Scroll to browse · hold to pick up",
    export: "Export PNG",
    restart: "Restart",
    next: "Next level",
    deleteTitle: "Delete this image?",
    deleteBody: "This image will be permanently removed from this device.",
    cancel: "Cancel",
    delete: "Delete",
    readError: "Could not read the local gallery",
    openError: "Could not open this image",
    fileError: "Please choose an image file",
    processError: "Could not process this image",
    deleteError: "Could not delete this image",
    exportError: "Could not export the image",
    saveError: "Could not save progress. Check browser storage.",
    saved: "Progress saved automatically",
    movePiece: "Move puzzle piece row {r}, column {c}",
    useImage: "Use {name} to choose a level",
    deleteImage: "Delete {name}",
    newImage: "Upload a new image",
    language: "Change language",
  },
  ja: {
    start: "はじめる",
    gallery: "ギャラリー",
    upload: "画像をアップロード",
    processing: "処理中",
    loading: "読み込み中",
    local: "画像はこの端末のブラウザ内だけに保存されます",
    choose: "ステージ選択",
    recent: "続きから",
    noSave: "未完成のパズルはありません",
    level: "ステージ {n}",
    pieces: "{n} ピース",
    completed: "{done}/{total} 完成",
    back: "ギャラリーへ",
    resetView: "表示をリセット",
    drawer: "未配置のピース",
    drawerHint: "スワイプで閲覧・長押しで取り出す",
    export: "PNGを書き出す",
    restart: "やり直す",
    next: "次のステージ",
    deleteTitle: "この画像を削除しますか？",
    deleteBody: "この端末のギャラリーから完全に削除されます。",
    cancel: "キャンセル",
    delete: "削除",
    readError: "ギャラリーを読み込めません",
    openError: "画像を開けません",
    fileError: "画像ファイルを選択してください",
    processError: "画像を処理できません",
    deleteError: "画像を削除できません",
    exportError: "画像を書き出せません",
    saveError: "進行状況を保存できません。ストレージを確認してください。",
    saved: "進行状況は自動保存されます",
    movePiece: "{r} 行 {c} 列のピースを移動",
    useImage: "{name} でステージを選ぶ",
    deleteImage: "{name} を削除",
    newImage: "新しい画像をアップロード",
    language: "言語を変更",
  },
} as const;

function format(text: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    text,
  );
}

type PieceMetrics = {
  cellWidth: number;
  cellHeight: number;
  cellX: number;
  cellY: number;
  pad: number;
  canvasWidth: number;
  canvasHeight: number;
};

function openGalleryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function listGalleryImages(): Promise<GalleryImage[]> {
  const db = await openGalleryDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const result = (request.result as GalleryImage[]).sort(
        (a, b) => b.createdAt - a.createdAt,
      );
      resolve(result);
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function saveGalleryImage(record: GalleryImage): Promise<void> {
  const db = await openGalleryDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function removeGalleryImage(id: string): Promise<void> {
  const db = await openGalleryDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png") {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("无法生成图片"));
    }, type);
  });
}

function loadBlobImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取这张图片"));
    };
    image.src = url;
  });
}

async function normalizeUploadedImage(file: File): Promise<GalleryImage> {
  const image = await loadBlobImage(file);
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("图片尺寸无效");
  }

  const canvas = document.createElement("canvas");
  canvas.width = FRAME_WIDTH;
  canvas.height = FRAME_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法处理图片");

  context.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  const scale = Math.min(
    FRAME_WIDTH / image.naturalWidth,
    FRAME_HEIGHT / image.naturalHeight,
  );
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    (FRAME_WIDTH - width) / 2,
    (FRAME_HEIGHT - height) / 2,
    width,
    height,
  );

  const thumbnailCanvas = document.createElement("canvas");
  thumbnailCanvas.width = 360;
  thumbnailCanvas.height = 240;
  const thumbnailContext = thumbnailCanvas.getContext("2d");
  if (!thumbnailContext) throw new Error("浏览器无法生成缩略图");
  thumbnailContext.clearRect(0, 0, 360, 240);
  thumbnailContext.imageSmoothingEnabled = true;
  thumbnailContext.imageSmoothingQuality = "high";
  thumbnailContext.drawImage(canvas, 0, 0, 360, 240);

  return {
    id: crypto.randomUUID(),
    name: file.name,
    normalized: await canvasToBlob(canvas),
    thumbnail: await canvasToBlob(thumbnailCanvas),
    createdAt: Date.now(),
  };
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function randomEdge(): Edge {
  return Math.random() > 0.5 ? 1 : -1;
}

function generatePieces(rows: number, columns: number): PuzzlePiece[] {
  const horizontal = Array.from({ length: rows - 1 }, () =>
    Array.from({ length: columns }, randomEdge),
  );
  const vertical = Array.from({ length: rows }, () =>
    Array.from({ length: columns - 1 }, randomEdge),
  );

  const pieces: PuzzlePiece[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      pieces.push({
        id: `${row}-${column}`,
        row,
        column,
        edges: {
          top: row === 0 ? 0 : (-horizontal[row - 1][column] as Edge),
          right: column === columns - 1 ? 0 : vertical[row][column],
          bottom: row === rows - 1 ? 0 : horizontal[row][column],
          left: column === 0 ? 0 : (-vertical[row][column - 1] as Edge),
        },
        status: "waiting",
        zIndex: 1,
      });
    }
  }
  return pieces;
}

function getPieceMetrics(
  piece: PuzzlePiece,
  rows: number,
  columns: number,
): PieceMetrics {
  const cellWidth = FRAME_WIDTH / columns;
  const cellHeight = FRAME_HEIGHT / rows;
  const pad = Math.min(cellWidth, cellHeight) * 0.22 + 8;
  return {
    cellWidth,
    cellHeight,
    cellX: piece.column * cellWidth,
    cellY: piece.row * cellHeight,
    pad,
    canvasWidth: Math.ceil(cellWidth + pad * 2),
    canvasHeight: Math.ceil(cellHeight + pad * 2),
  };
}

function pointOnEdge(
  x1: number,
  y1: number,
  ux: number,
  uy: number,
  nx: number,
  ny: number,
  length: number,
  along: number,
  normal: number,
) {
  return {
    x: x1 + ux * length * along + nx * normal,
    y: y1 + uy * length * along + ny * normal,
  };
}

function addEdge(
  path: Path2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  edge: Edge,
  depth: number,
) {
  if (edge === 0) {
    path.lineTo(x2, y2);
    return;
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const nx = uy;
  const ny = -ux;
  const n = depth * edge;
  const p = (along: number, normal = 0) =>
    pointOnEdge(x1, y1, ux, uy, nx, ny, length, along, normal);

  const a = p(0.28);
  path.lineTo(a.x, a.y);

  const c1 = p(0.34);
  const c2 = p(0.36, n * 0.04);
  const b = p(0.39, n * 0.12);
  path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);

  const c3 = p(0.4, n * 0.72);
  const c4 = p(0.44, n);
  const tip = p(0.5, n);
  path.bezierCurveTo(c3.x, c3.y, c4.x, c4.y, tip.x, tip.y);

  const c5 = p(0.56, n);
  const c6 = p(0.6, n * 0.72);
  const d = p(0.61, n * 0.12);
  path.bezierCurveTo(c5.x, c5.y, c6.x, c6.y, d.x, d.y);

  const c7 = p(0.64, n * 0.04);
  const c8 = p(0.66);
  const e = p(0.72);
  path.bezierCurveTo(c7.x, c7.y, c8.x, c8.y, e.x, e.y);
  path.lineTo(x2, y2);
}

function buildPiecePath(piece: PuzzlePiece, rows: number, columns: number) {
  const { cellWidth, cellHeight, cellX, cellY } = getPieceMetrics(
    piece,
    rows,
    columns,
  );
  const depth = Math.min(cellWidth, cellHeight) * 0.19;
  const path = new Path2D();
  path.moveTo(cellX, cellY);
  addEdge(path, cellX, cellY, cellX + cellWidth, cellY, piece.edges.top, depth);
  addEdge(
    path,
    cellX + cellWidth,
    cellY,
    cellX + cellWidth,
    cellY + cellHeight,
    piece.edges.right,
    depth,
  );
  addEdge(
    path,
    cellX + cellWidth,
    cellY + cellHeight,
    cellX,
    cellY + cellHeight,
    piece.edges.bottom,
    depth,
  );
  addEdge(
    path,
    cellX,
    cellY + cellHeight,
    cellX,
    cellY,
    piece.edges.left,
    depth,
  );
  path.closePath();
  return path;
}

function makeCheckerPattern(context: CanvasRenderingContext2D) {
  const tile = document.createElement("canvas");
  tile.width = 64;
  tile.height = 64;
  const tileContext = tile.getContext("2d");
  if (!tileContext) return "rgba(110, 243, 197, 0.18)";
  tileContext.fillStyle = "rgba(255,255,255,0.11)";
  tileContext.fillRect(0, 0, 64, 64);
  tileContext.fillStyle = "rgba(110,243,197,0.14)";
  tileContext.fillRect(0, 0, 32, 32);
  tileContext.fillRect(32, 32, 32, 32);
  return context.createPattern(tile, "repeat") ?? "rgba(110,243,197,0.18)";
}

function drawPiece(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  piece: PuzzlePiece,
  rows: number,
  columns: number,
) {
  const metrics = getPieceMetrics(piece, rows, columns);
  canvas.width = metrics.canvasWidth;
  canvas.height = metrics.canvasHeight;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(metrics.pad - metrics.cellX, metrics.pad - metrics.cellY);
  const path = buildPiecePath(piece, rows, columns);

  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.42)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 8;
  context.fillStyle = makeCheckerPattern(context);
  context.fill(path);
  context.restore();

  context.save();
  context.clip(path);
  context.fillStyle = makeCheckerPattern(context);
  context.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  context.drawImage(image, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  context.restore();

  context.lineJoin = "round";
  context.strokeStyle = "rgba(3, 20, 28, 0.58)";
  context.lineWidth = 6;
  context.stroke(path);
  context.strokeStyle = "rgba(255, 255, 255, 0.64)";
  context.lineWidth = 2;
  context.stroke(path);
  context.restore();
}

function drawGuide(
  canvas: HTMLCanvasElement,
  pieces: PuzzlePiece[],
  rows: number,
  columns: number,
) {
  canvas.width = FRAME_WIDTH;
  canvas.height = FRAME_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  context.fillStyle = makeCheckerPattern(context);
  context.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  context.lineJoin = "round";
  for (const piece of pieces) {
    const path = buildPiecePath(piece, rows, columns);
    context.strokeStyle = "rgba(110, 243, 197, 0.34)";
    context.lineWidth = 5;
    context.stroke(path);
    context.strokeStyle = "rgba(255, 255, 255, 0.24)";
    context.lineWidth = 2;
    context.stroke(path);
  }
}

function drawFinalArtwork(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  pieces: PuzzlePiece[],
  rows: number,
  columns: number,
) {
  canvas.width = FRAME_WIDTH;
  canvas.height = FRAME_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  // Build the decorative puzzle treatment on a separate layer, then mask the
  // entire layer with the source alpha. This keeps transparent margins, holes,
  // and partially transparent pixels genuinely transparent in previews/PNGs.
  const effects = document.createElement("canvas");
  effects.width = FRAME_WIDTH;
  effects.height = FRAME_HEIGHT;
  const effectContext = effects.getContext("2d");
  if (!effectContext) return;

  for (const piece of pieces) {
    const path = buildPiecePath(piece, rows, columns);
    effectContext.lineJoin = "round";
    effectContext.strokeStyle = "rgba(3, 13, 19, 0.4)";
    effectContext.lineWidth = 5;
    effectContext.stroke(path);
    effectContext.strokeStyle = "rgba(255, 255, 255, 0.38)";
    effectContext.lineWidth = 2;
    effectContext.stroke(path);
  }
  effectContext.globalCompositeOperation = "destination-in";
  effectContext.drawImage(image, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  context.drawImage(image, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  context.globalCompositeOperation = "source-atop";
  context.drawImage(effects, 0, 0);
  context.globalCompositeOperation = "source-over";
}

function PieceCanvas({
  image,
  piece,
  rows,
  columns,
}: {
  image: HTMLImageElement;
  piece: PuzzlePiece;
  rows: number;
  columns: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawPiece(ref.current, image, piece, rows, columns);
  }, [image, piece, rows, columns]);
  return <canvas ref={ref} className="piece-canvas" aria-hidden="true" />;
}

function GuideCanvas({
  pieces,
  rows,
  columns,
}: {
  pieces: PuzzlePiece[];
  rows: number;
  columns: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawGuide(ref.current, pieces, rows, columns);
  }, [pieces, rows, columns]);
  return <canvas ref={ref} className="board-canvas" aria-hidden="true" />;
}

function FinalCanvas({
  image,
  pieces,
  rows,
  columns,
  canvasRef,
}: {
  image: HTMLImageElement;
  pieces: PuzzlePiece[];
  rows: number;
  columns: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  useEffect(() => {
    if (canvasRef.current) {
      drawFinalArtwork(canvasRef.current, image, pieces, rows, columns);
    }
  }, [canvasRef, image, pieces, rows, columns]);
  return <canvas ref={canvasRef} className="board-canvas final-canvas" />;
}

function GalleryThumbnail({ blob, name }: { blob: Blob; name: string }) {
  const [source] = useState(() => URL.createObjectURL(blob));
  useEffect(() => {
    return () => URL.revokeObjectURL(source);
  }, [source]);
  // Blob URLs are local browser data and cannot use the framework image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={source} alt={name} draggable={false} />;
}

export function PuzzleGame() {
  const [screen, setScreen] = useState<Screen>("start");
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "zh";
    const stored = localStorage.getItem(LANGUAGE_KEY) as Language | null;
    return stored && stored in COPY ? stored : "zh";
  });
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GalleryImage | null>(null);
  const [activeRecord, setActiveRecord] = useState<GalleryImage | null>(null);
  const [activeImage, setActiveImage] = useState<HTMLImageElement | null>(null);
  const [levelIndex, setLevelIndex] = useState(0);
  const [pieces, setPieces] = useState<PuzzlePiece[]>([]);
  const [tray, setTray] = useState<TrayState>({
    left: [],
    right: [],
    queue: [],
  });
  const [freePositions, setFreePositions] = useState<
    Record<string, RelativePosition>
  >({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 });
  const [stageSize, setStageSize] = useState<Size>({ width: 0, height: 0 });
  const [boardSize, setBoardSize] = useState<Size>({ width: 0, height: 0 });
  const [recent, setRecent] = useState<SavedGame | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const value = localStorage.getItem(SAVE_KEY);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const piecesRef = useRef<PuzzlePiece[]>([]);
  const freePositionsRef = useRef<Record<string, RelativePosition>>({});
  const stageSizeRef = useRef<Size>({ width: 0, height: 0 });
  const boardSizeRef = useRef<Size>({ width: 0, height: 0 });
  const zCounterRef = useRef(10);
  const saveTimerRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const gestureRef = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    distance: number;
    center: { x: number; y: number };
    start: ViewState;
  }>({
    pointers: new Map(),
    distance: 0,
    center: { x: 0, y: 0 },
    start: { scale: 1, x: 0, y: 0 },
  });
  const level = LEVELS[levelIndex];
  const t = COPY[language];

  const changeLanguage = () => {
    const next: Language =
      language === "zh" ? "en" : language === "en" ? "ja" : "zh";
    setLanguage(next);
    localStorage.setItem(LANGUAGE_KEY, next);
  };

  const loadGallery = useCallback(async () => {
    setGalleryLoading(true);
    try {
      setGallery(await listGalleryImages());
    } catch {
      toast.error(COPY[language].readError);
    } finally {
      setGalleryLoading(false);
    }
  }, [language]);
  const openGallery = useCallback(() => {
    setScreen("gallery");
    setActiveImage(null);
    setActiveRecord(null);
    setDrawerOpen(false);
    void loadGallery();
  }, [loadGallery]);

  const buildTray = (nextPieces: PuzzlePiece[]): TrayState => {
    const order = shuffle(nextPieces.map((piece) => piece.id));
    return {
      left: order.slice(0, 3),
      right: order.slice(3, 6),
      queue: order.slice(6),
    };
  };
  const beginLevel = useCallback(
    (nextLevelIndex: number, existing?: PuzzlePiece[]) => {
      const spec = LEVELS[nextLevelIndex];
      const nextPieces = existing
        ? existing.map((piece) => ({
            ...piece,
            status: "waiting" as PieceStatus,
            zIndex: 1,
          }))
        : generatePieces(spec.rows, spec.columns);
      setLevelIndex(nextLevelIndex);
      setPieces(nextPieces);
      piecesRef.current = nextPieces;
      setTray(buildTray(nextPieces));
      setFreePositions({});
      freePositionsRef.current = {};
      setView({ scale: 1, x: 0, y: 0 });
      setDragging(null);
      setComplete(false);
      setDrawerOpen(false);
      zCounterRef.current = 10;
    },
    [],
  );

  const selectRecord = useCallback(
    async (record: GalleryImage) => {
      try {
        setActiveRecord(record);
        setActiveImage(await loadBlobImage(record.normalized));
        setScreen("levels");
      } catch {
        toast.error(COPY[language].openError);
      }
    },
    [language],
  );
  const startLevel = (index: number) => {
    beginLevel(index);
    setScreen("game");
  };
  const resumeRecent = useCallback(async () => {
    if (!recent) return;
    const record = gallery.find((item) => item.id === recent.imageId);
    if (!record) {
      localStorage.removeItem(SAVE_KEY);
      setRecent(null);
      toast.error(t.openError);
      return;
    }
    try {
      setActiveRecord(record);
      setActiveImage(await loadBlobImage(record.normalized));
      setLevelIndex(recent.levelIndex);
      setPieces(recent.pieces);
      piecesRef.current = recent.pieces;
      setTray(recent.tray);
      setFreePositions(recent.freePositions);
      freePositionsRef.current = recent.freePositions;
      setView(recent.view);
      zCounterRef.current = Math.max(
        10,
        ...recent.pieces.map((piece) => piece.zIndex),
      );
      setScreen("game");
    } catch {
      toast.error(t.openError);
    }
  }, [gallery, recent, t.openError]);

  const handleUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.error(COPY[language].fileError);
        return;
      }
      setUploading(true);
      try {
        const record = await normalizeUploadedImage(file);
        await saveGalleryImage(record);
        setGallery((current) => [record, ...current]);
        await selectRecord(record);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : COPY[language].processError,
        );
      } finally {
        setUploading(false);
      }
    },
    [language, selectRecord],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await removeGalleryImage(deleteTarget.id);
      setGallery((current) =>
        current.filter((item) => item.id !== deleteTarget.id),
      );
      if (recent?.imageId === deleteTarget.id) {
        localStorage.removeItem(SAVE_KEY);
        setRecent(null);
      }
      setDeleteTarget(null);
    } catch {
      toast.error(t.deleteError);
    }
  }, [deleteTarget, recent, t.deleteError]);

  useEffect(() => {
    piecesRef.current = pieces;
  }, [pieces]);
  useEffect(() => {
    freePositionsRef.current = freePositions;
  }, [freePositions]);
  useEffect(() => {
    stageSizeRef.current = stageSize;
  }, [stageSize]);
  useEffect(() => {
    boardSizeRef.current = boardSize;
  }, [boardSize]);

  useEffect(() => {
    if (screen !== "game" || complete || !activeRecord || pieces.length === 0)
      return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const save: SavedGame = {
        version: 2,
        imageId: activeRecord.id,
        levelIndex,
        pieces,
        tray,
        freePositions,
        view,
        savedAt: Date.now(),
      };
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(save));
        setRecent(save);
      } catch {
        toast.error(t.saveError);
      }
    }, 350);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [
    activeRecord,
    complete,
    freePositions,
    levelIndex,
    pieces,
    screen,
    t.saveError,
    tray,
    view,
  ]);

  useLayoutEffect(() => {
    if (screen !== "game" || !stageRef.current || !boardRef.current) return;
    const measure = () => {
      const sr = stageRef.current?.getBoundingClientRect();
      const br = boardRef.current?.getBoundingClientRect();
      if (sr) {
        const size = { width: sr.width, height: sr.height };
        setStageSize(size);
        stageSizeRef.current = size;
      }
      if (br) {
        const size = {
          width: br.width / view.scale,
          height: br.height / view.scale,
        };
        setBoardSize(size);
        boardSizeRef.current = size;
      }
      setFreePositions((current) =>
        Object.fromEntries(
          Object.entries(current).map(([id, p]) => [
            id,
            {
              x: Math.min(0.94, Math.max(0.06, p.x)),
              y: Math.min(0.94, Math.max(0.06, p.y)),
            },
          ]),
        ),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stageRef.current);
    observer.observe(boardRef.current);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", measure);
    };
  }, [screen, complete, view.scale]);

  const updatePiecePosition = useCallback(
    (id: string, clientX: number, clientY: number) => {
      const stage = stageRef.current;
      const piece = piecesRef.current.find((item) => item.id === id);
      if (!stage || !piece) return;
      const rect = stage.getBoundingClientRect();
      const metrics = getPieceMetrics(piece, level.rows, level.columns);
      const scale = (boardSizeRef.current.width / FRAME_WIDTH) * view.scale;
      const hw = Math.max(14, (metrics.canvasWidth * scale) / 2);
      const hh = Math.max(14, (metrics.canvasHeight * scale) / 2);
      const x = Math.min(
        Math.max(clientX - rect.left, hw + 3),
        rect.width - hw - 3,
      );
      const y = Math.min(
        Math.max(clientY - rect.top - 20, hh + 3),
        rect.height - hh - 3,
      );
      const next = {
        x: rect.width ? x / rect.width : 0.5,
        y: rect.height ? y / rect.height : 0.5,
      };
      setFreePositions((current) => {
        const value = { ...current, [id]: next };
        freePositionsRef.current = value;
        return value;
      });
    },
    [level.columns, level.rows, view.scale],
  );

  const removeFromTray = (id: string) =>
    setTray((current) => {
      const next = {
        left: [...current.left],
        right: [...current.right],
        queue: current.queue.filter((value) => value !== id),
      };
      for (const side of ["left", "right"] as const) {
        const index = next[side].indexOf(id);
        if (index >= 0) next[side][index] = next.queue.shift() ?? null;
      }
      return next;
    });
  const startDrag = useCallback(
    (id: string, event: React.PointerEvent, fromTray = false) => {
      if (complete) return;
      event.preventDefault();
      if (fromTray) removeFromTray(id);
      setDrawerOpen(false);
      zCounterRef.current += 1;
      const z = zCounterRef.current;
      setPieces((current) => {
        const next = current.map((piece) =>
          piece.id === id
            ? { ...piece, status: "free" as PieceStatus, zIndex: z }
            : piece,
        );
        piecesRef.current = next;
        return next;
      });
      updatePiecePosition(id, event.clientX, event.clientY);
      setDragging(id);
    },
    [complete, updatePiecePosition],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      event.preventDefault();
      updatePiecePosition(dragging, event.clientX, event.clientY);
    };
    const finish = (event: PointerEvent) => {
      event.preventDefault();
      updatePiecePosition(dragging, event.clientX, event.clientY);
      const stage = stageRef.current,
        board = boardRef.current,
        piece = piecesRef.current.find((item) => item.id === dragging),
        position = freePositionsRef.current[dragging];
      if (stage && board && piece && position) {
        const sr = stage.getBoundingClientRect(),
          br = board.getBoundingClientRect();
        const cx = position.x * sr.width + sr.left,
          cy = position.y * sr.height + sr.top;
        const tx = br.left + ((piece.column + 0.5) / level.columns) * br.width,
          ty = br.top + ((piece.row + 0.5) / level.rows) * br.height;
        const threshold =
          Math.min(br.width / level.columns, br.height / level.rows) * 0.4;
        if (Math.hypot(cx - tx, cy - ty) <= threshold) {
          setPieces((current) => {
            const next = current.map((item) =>
              item.id === dragging
                ? { ...item, status: "locked" as PieceStatus }
                : item,
            );
            piecesRef.current = next;
            if (next.every((item) => item.status === "locked")) {
              localStorage.removeItem(SAVE_KEY);
              setRecent(null);
              window.setTimeout(() => setComplete(true), 120);
            }
            return next;
          });
          setFreePositions((current) => {
            const next = { ...current };
            delete next[dragging];
            freePositionsRef.current = next;
            return next;
          });
        }
      }
      setDragging(null);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish, { passive: false });
    window.addEventListener("pointercancel", finish, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [dragging, level.columns, level.rows, updatePiecePosition]);

  const gestureDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const g = gestureRef.current;
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()];
      g.distance = Math.hypot(a.x - b.x, a.y - b.y);
      g.center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      g.start = view;
    }
  };
  const gestureMove = (event: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g.pointers.has(event.pointerId)) return;
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (g.pointers.size === 2) {
      event.preventDefault();
      const [a, b] = [...g.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y),
        center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      setView({
        scale: Math.min(
          3,
          Math.max(0.75, (g.start.scale * distance) / g.distance),
        ),
        x: g.start.x + center.x - g.center.x,
        y: g.start.y + center.y - g.center.y,
      });
    }
  };
  const gestureUp = (event: React.PointerEvent) =>
    gestureRef.current.pointers.delete(event.pointerId);

  const exportArtwork = useCallback(async () => {
    if (!activeImage) return;
    const canvas = document.createElement("canvas");
    drawFinalArtwork(canvas, activeImage, pieces, level.rows, level.columns);
    try {
      const blob = await canvasToBlob(canvas),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = `puzzley-${level.count}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t.exportError);
    }
  }, [activeImage, level, pieces, t.exportError]);
  const restartLevel = () => beginLevel(levelIndex, piecesRef.current);
  const waitingPieces = pieces.filter((piece) => piece.status !== "locked");
  const renderSlot = (
    id: string | null,
    side: "left" | "right",
    index: number,
  ) => {
    const piece = pieces.find((item) => item.id === id);
    if (!piece || !activeImage)
      return <span className="piece-slot empty" key={`${side}-${index}`} />;
    return (
      <button
        type="button"
        key={`${side}-${index}`}
        className="piece-slot"
        onPointerDown={(event) => startDrag(piece.id, event, true)}
        aria-label={format(t.movePiece, {
          r: piece.row + 1,
          c: piece.column + 1,
        })}
      >
        <PieceCanvas
          image={activeImage}
          piece={piece}
          rows={level.rows}
          columns={level.columns}
        />
      </button>
    );
  };

  const languageButton = (
    <button
      type="button"
      className="language-button"
      onClick={changeLanguage}
      aria-label={t.language}
    >
      <Globe2 />
      <span>{language.toUpperCase()}</span>
    </button>
  );
  return (
    <main className="app-root">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleUpload}
      />
      {screen === "start" && (
        <section className="start-screen">
          {languageButton}
          <div className="start-grid" aria-hidden="true" />
          <div className="start-lockup">
            <div className="start-mark" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <h1>拼图</h1>
            <Button
              className="primary-action"
              size="lg"
              onClick={() => {
                setScreen("gallery");
                void loadGallery();
              }}
            >
              {t.start}
              <ArrowRight />
            </Button>
          </div>
        </section>
      )}
      {screen === "gallery" && (
        <section className="gallery-screen">
          <header className="gallery-header">
            <div>
              <p className="eyebrow">PUZZLEY</p>
              <h1>{t.gallery}</h1>
            </div>
            <div className="header-actions">
              {languageButton}
              <Button
                className="upload-action"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <RotateCcw className="spin" /> : <Plus />}
                {uploading ? t.processing : t.upload}
              </Button>
            </div>
          </header>
          <div className="gallery-content">
            {galleryLoading ? (
              <div className="gallery-empty">{t.loading}</div>
            ) : gallery.length === 0 ? (
              <div className="gallery-empty">
                <Images />
                <Button
                  className="primary-action"
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload />
                  {t.upload}
                </Button>
              </div>
            ) : (
              <div className="gallery-grid">
                {gallery.map((record) => (
                  <article className="gallery-card" key={record.id}>
                    <button
                      type="button"
                      className="gallery-image-button"
                      onClick={() => void selectRecord(record)}
                      aria-label={format(t.useImage, { name: record.name })}
                    >
                      <span className="transparency-grid" />
                      <GalleryThumbnail
                        blob={record.thumbnail}
                        name={record.name}
                      />
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="delete-button"
                      aria-label={format(t.deleteImage, { name: record.name })}
                      onClick={() => setDeleteTarget(record)}
                    >
                      <Trash2 />
                    </Button>
                  </article>
                ))}
                <button
                  type="button"
                  className="gallery-add-card"
                  onClick={() => inputRef.current?.click()}
                  aria-label={t.newImage}
                >
                  <Plus />
                </button>
              </div>
            )}
          </div>
          <p className="local-note">{t.local}</p>
        </section>
      )}
      {screen === "levels" && activeRecord && (
        <section className="level-screen">
          <header className="level-header">
            <Button variant="ghost" onClick={openGallery}>
              <Images />
              {t.back}
            </Button>
            {languageButton}
          </header>
          <div className="level-content">
            <p className="eyebrow">PUZZLEY</p>
            <h1>{t.choose}</h1>
            <div className="level-grid">
              <button
                className="level-card recent-card"
                disabled={!recent || recent.imageId !== activeRecord.id}
                onClick={() => void resumeRecent()}
              >
                {recent && recent.imageId === activeRecord.id ? (
                  <>
                    <GalleryThumbnail
                      blob={activeRecord.thumbnail}
                      name={activeRecord.name}
                    />
                    <span>
                      <strong>{t.recent}</strong>
                      <small>
                        {format(t.level, { n: recent.levelIndex + 1 })} ·{" "}
                        {format(t.completed, {
                          done: recent.pieces.filter(
                            (p) => p.status === "locked",
                          ).length,
                          total: recent.pieces.length,
                        })}
                      </small>
                    </span>
                  </>
                ) : (
                  <span>
                    <strong>{t.recent}</strong>
                    <small>{t.noSave}</small>
                  </span>
                )}
              </button>
              {LEVELS.map((item, index) => (
                <button
                  className="level-card"
                  key={item.count}
                  onClick={() => startLevel(index)}
                >
                  <b>0{index + 1}</b>
                  <span>
                    <strong>{format(t.level, { n: index + 1 })}</strong>
                    <small>
                      {item.rows} × {item.columns} ·{" "}
                      {format(t.pieces, { n: item.count })}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
      {screen === "game" && activeImage && (
        <section className={`game-screen ${complete ? "is-complete" : ""}`}>
          <header className="game-header">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setScreen("levels");
                setDrawerOpen(false);
              }}
              aria-label={t.choose}
            >
              <ChevronDown className="back-chevron" />
            </Button>
            <span>{format(t.level, { n: levelIndex + 1 })}</span>
            <strong>{format(t.pieces, { n: level.count })}</strong>
            <button
              className="drawer-toggle"
              onClick={() => setDrawerOpen((value) => !value)}
              aria-expanded={drawerOpen}
            >
              {t.drawer}
              <ChevronDown />
            </button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setView({ scale: 1, x: 0, y: 0 })}
              aria-label={t.resetView}
            >
              <Move />
            </Button>
            {languageButton}
          </header>
          {!complete && (
            <aside className={`top-drawer ${drawerOpen ? "open" : ""}`}>
              <p>{t.drawerHint}</p>
              <div className="drawer-scroll">
                {waitingPieces.map((piece) => (
                  <button
                    key={piece.id}
                    className="drawer-piece"
                    onPointerDown={(event) => {
                      holdTimerRef.current = window.setTimeout(
                        () =>
                          startDrag(
                            piece.id,
                            event,
                            piece.status === "waiting",
                          ),
                        320,
                      );
                    }}
                    onPointerUp={() => {
                      if (holdTimerRef.current)
                        window.clearTimeout(holdTimerRef.current);
                    }}
                    onPointerCancel={() => {
                      if (holdTimerRef.current)
                        window.clearTimeout(holdTimerRef.current);
                    }}
                    aria-label={format(t.movePiece, {
                      r: piece.row + 1,
                      c: piece.column + 1,
                    })}
                  >
                    <PieceCanvas
                      image={activeImage}
                      piece={piece}
                      rows={level.rows}
                      columns={level.columns}
                    />
                  </button>
                ))}
              </div>
            </aside>
          )}
          <div
            ref={stageRef}
            className="game-stage"
            onPointerDown={gestureDown}
            onPointerMove={gestureMove}
            onPointerUp={gestureUp}
            onPointerCancel={gestureUp}
          >
            {!complete && (
              <div className="slot-column slot-column-left">
                {tray.left.map((id, i) => renderSlot(id, "left", i))}
              </div>
            )}
            <div
              className="board-transform"
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              }}
            >
              <div ref={boardRef} className="puzzle-board">
                {complete ? (
                  <FinalCanvas
                    image={activeImage}
                    pieces={pieces}
                    rows={level.rows}
                    columns={level.columns}
                    canvasRef={exportCanvasRef}
                  />
                ) : (
                  <>
                    <GuideCanvas
                      pieces={pieces}
                      rows={level.rows}
                      columns={level.columns}
                    />
                    {pieces
                      .filter((p) => p.status === "locked")
                      .map((piece) => {
                        const m = getPieceMetrics(
                          piece,
                          level.rows,
                          level.columns,
                        );
                        return (
                          <div
                            className="locked-piece"
                            key={piece.id}
                            style={{
                              left: `${((m.cellX - m.pad) / FRAME_WIDTH) * 100}%`,
                              top: `${((m.cellY - m.pad) / FRAME_HEIGHT) * 100}%`,
                              width: `${(m.canvasWidth / FRAME_WIDTH) * 100}%`,
                              height: `${(m.canvasHeight / FRAME_HEIGHT) * 100}%`,
                              zIndex: piece.zIndex,
                            }}
                          >
                            <PieceCanvas
                              image={activeImage}
                              piece={piece}
                              rows={level.rows}
                              columns={level.columns}
                            />
                          </div>
                        );
                      })}
                  </>
                )}
              </div>
            </div>
            {!complete && (
              <div className="slot-column slot-column-right">
                {tray.right.map((id, i) => renderSlot(id, "right", i))}
              </div>
            )}
            {!complete &&
              pieces
                .filter((p) => p.status === "free")
                .map((piece) => {
                  const position = freePositions[piece.id];
                  if (!position || !stageSize.width || !boardSize.width)
                    return null;
                  const m = getPieceMetrics(piece, level.rows, level.columns),
                    scale = (boardSize.width / FRAME_WIDTH) * view.scale;
                  return (
                    <button
                      type="button"
                      key={piece.id}
                      className={`free-piece ${dragging === piece.id ? "is-dragging" : ""}`}
                      style={{
                        left: `${position.x * 100}%`,
                        top: `${position.y * 100}%`,
                        width: m.canvasWidth * scale,
                        height: m.canvasHeight * scale,
                        zIndex: piece.zIndex + 20,
                      }}
                      onPointerDown={(event) => startDrag(piece.id, event)}
                      aria-label={format(t.movePiece, {
                        r: piece.row + 1,
                        c: piece.column + 1,
                      })}
                    >
                      <PieceCanvas
                        image={activeImage}
                        piece={piece}
                        rows={level.rows}
                        columns={level.columns}
                      />
                    </button>
                  );
                })}
          </div>
          {complete && (
            <div className="result-actions">
              <Button variant="outline" onClick={() => void exportArtwork()}>
                <Download />
                {t.export}
              </Button>
              <Button variant="outline" onClick={restartLevel}>
                <RotateCcw />
                {t.restart}
              </Button>
              {levelIndex < LEVELS.length - 1 ? (
                <Button
                  className="primary-action"
                  onClick={() => beginLevel(levelIndex + 1)}
                >
                  {t.next}
                  <ArrowRight />
                </Button>
              ) : (
                <Button className="primary-action" onClick={openGallery}>
                  <Images />
                  {t.back}
                </Button>
              )}
            </div>
          )}
        </section>
      )}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void confirmDelete()}
            >
              {t.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster theme="dark" position="top-center" />
    </main>
  );
}
