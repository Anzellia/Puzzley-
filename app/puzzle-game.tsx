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
  Download,
  Images,
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

const LEVELS = [
  { rows: 2, columns: 2, count: 4 },
  { rows: 3, columns: 4, count: 12 },
] as const;

type Screen = "start" | "gallery" | "game";
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
          top: row === 0 ? 0 : ((-horizontal[row - 1][column]) as Edge),
          right:
            column === columns - 1 ? 0 : vertical[row][column],
          bottom: row === rows - 1 ? 0 : horizontal[row][column],
          left:
            column === 0 ? 0 : ((-vertical[row][column - 1]) as Edge),
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

function buildPiecePath(
  piece: PuzzlePiece,
  rows: number,
  columns: number,
) {
  const { cellWidth, cellHeight, cellX, cellY } = getPieceMetrics(
    piece,
    rows,
    columns,
  );
  const depth = Math.min(cellWidth, cellHeight) * 0.19;
  const path = new Path2D();
  path.moveTo(cellX, cellY);
  addEdge(
    path,
    cellX,
    cellY,
    cellX + cellWidth,
    cellY,
    piece.edges.top,
    depth,
  );
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

  for (const piece of pieces) {
    const path = buildPiecePath(piece, rows, columns);
    context.save();
    context.shadowColor = "rgba(0, 0, 0, 0.34)";
    context.shadowBlur = 15;
    context.shadowOffsetY = 6;
    context.fillStyle = "rgba(255,255,255,0.012)";
    context.fill(path);
    context.restore();

    context.save();
    context.clip(path);
    context.drawImage(image, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    context.restore();

    context.lineJoin = "round";
    context.strokeStyle = "rgba(3, 13, 19, 0.4)";
    context.lineWidth = 5;
    context.stroke(path);
    context.strokeStyle = "rgba(255, 255, 255, 0.38)";
    context.lineWidth = 2;
    context.stroke(path);
  }
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
  const [stageSize, setStageSize] = useState<Size>({ width: 0, height: 0 });
  const [boardSize, setBoardSize] = useState<Size>({ width: 0, height: 0 });

  const inputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const piecesRef = useRef<PuzzlePiece[]>([]);
  const freePositionsRef = useRef<Record<string, RelativePosition>>({});
  const stageSizeRef = useRef<Size>({ width: 0, height: 0 });
  const boardSizeRef = useRef<Size>({ width: 0, height: 0 });
  const zCounterRef = useRef(10);

  const level = LEVELS[levelIndex];

  const loadGallery = useCallback(async () => {
    setGalleryLoading(true);
    try {
      setGallery(await listGalleryImages());
    } catch {
      toast.error("无法读取本地图库");
    } finally {
      setGalleryLoading(false);
    }
  }, []);

  const openGallery = useCallback(() => {
    setScreen("gallery");
    setActiveImage(null);
    setActiveRecord(null);
    void loadGallery();
  }, [loadGallery]);

  const beginLevel = useCallback(
    (nextLevelIndex: number, existingPieces?: PuzzlePiece[]) => {
      const nextLevel = LEVELS[nextLevelIndex];
      const nextPieces = existingPieces
        ? existingPieces.map((piece) => ({
            ...piece,
            status: "waiting" as PieceStatus,
            zIndex: 1,
          }))
        : generatePieces(nextLevel.rows, nextLevel.columns);
      const order = shuffle(nextPieces.map((piece) => piece.id));
      const visible = Math.min(6, order.length);
      const leftCount = Math.ceil(visible / 2);
      const rightCount = visible - leftCount;
      const nextTray: TrayState = {
        left: order.slice(0, leftCount),
        right: order.slice(leftCount, leftCount + rightCount),
        queue: order.slice(visible),
      };
      setLevelIndex(nextLevelIndex);
      setPieces(nextPieces);
      piecesRef.current = nextPieces;
      setTray(nextTray);
      setFreePositions({});
      freePositionsRef.current = {};
      setDragging(null);
      setComplete(false);
      zCounterRef.current = 10;
    },
    [],
  );

  const startWithRecord = useCallback(
    async (record: GalleryImage) => {
      try {
        const image = await loadBlobImage(record.normalized);
        setActiveRecord(record);
        setActiveImage(image);
        setScreen("game");
        beginLevel(0);
      } catch {
        toast.error("无法打开这张图片");
      }
    },
    [beginLevel],
  );

  const handleUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.error("请选择图片文件");
        return;
      }

      setUploading(true);
      try {
        const record = await normalizeUploadedImage(file);
        await saveGalleryImage(record);
        setGallery((current) => [record, ...current]);
        await startWithRecord(record);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "无法处理这张图片",
        );
      } finally {
        setUploading(false);
      }
    },
    [startWithRecord],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await removeGalleryImage(deleteTarget.id);
      setGallery((current) =>
        current.filter((item) => item.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
    } catch {
      toast.error("无法删除这张图片");
    }
  }, [deleteTarget]);

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

  useLayoutEffect(() => {
    if (screen !== "game" || !stageRef.current || !boardRef.current) return;
    const measure = () => {
      const stageRect = stageRef.current?.getBoundingClientRect();
      const boardRect = boardRef.current?.getBoundingClientRect();
      if (stageRect) {
        const nextStage = { width: stageRect.width, height: stageRect.height };
        setStageSize(nextStage);
        stageSizeRef.current = nextStage;
      }
      if (boardRect) {
        const nextBoard = { width: boardRect.width, height: boardRect.height };
        setBoardSize(nextBoard);
        boardSizeRef.current = nextBoard;
      }
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
  }, [screen, complete]);

  const updatePiecePosition = useCallback((id: string, clientX: number, clientY: number) => {
    const stage = stageRef.current;
    const piece = piecesRef.current.find((item) => item.id === id);
    if (!stage || !piece) return;
    const stageRect = stage.getBoundingClientRect();
    const metrics = getPieceMetrics(piece, level.rows, level.columns);
    const scale = boardSizeRef.current.width / FRAME_WIDTH;
    const halfWidth = Math.max(18, (metrics.canvasWidth * scale) / 2);
    const halfHeight = Math.max(18, (metrics.canvasHeight * scale) / 2);
    const lift = Math.min(36, boardSizeRef.current.width * 0.065);
    const x = Math.min(
      Math.max(clientX - stageRect.left, halfWidth + 4),
      stageRect.width - halfWidth - 4,
    );
    const y = Math.min(
      Math.max(clientY - stageRect.top - lift, halfHeight + 4),
      stageRect.height - halfHeight - 4,
    );
    const nextPosition = {
      x: stageRect.width ? x / stageRect.width : 0.5,
      y: stageRect.height ? y / stageRect.height : 0.5,
    };
    setFreePositions((current) => {
      const next = { ...current, [id]: nextPosition };
      freePositionsRef.current = next;
      return next;
    });
  }, [level.columns, level.rows]);

  const startDrag = useCallback(
    (
      id: string,
      event: React.PointerEvent,
      slot?: { side: "left" | "right"; index: number },
    ) => {
      if (complete) return;
      event.preventDefault();
      zCounterRef.current += 1;
      const nextZ = zCounterRef.current;

      if (slot) {
        setTray((current) => {
          const next = {
            left: [...current.left],
            right: [...current.right],
            queue: [...current.queue],
          };
          const replacement = next.queue.shift() ?? null;
          next[slot.side][slot.index] = replacement;
          return next;
        });
      }

      setPieces((current) => {
        const next = current.map((piece) =>
          piece.id === id
            ? { ...piece, status: "free" as PieceStatus, zIndex: nextZ }
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

    const handleMove = (event: PointerEvent) => {
      event.preventDefault();
      updatePiecePosition(dragging, event.clientX, event.clientY);
    };

    const finishDrag = (event: PointerEvent) => {
      event.preventDefault();
      updatePiecePosition(dragging, event.clientX, event.clientY);
      const stage = stageRef.current;
      const board = boardRef.current;
      const piece = piecesRef.current.find((item) => item.id === dragging);
      if (stage && board && piece) {
        const stageRect = stage.getBoundingClientRect();
        const boardRect = board.getBoundingClientRect();
        const position = freePositionsRef.current[dragging];
        if (position) {
          const centerX = position.x * stageRect.width + stageRect.left;
          const centerY = position.y * stageRect.height + stageRect.top;
          const targetX =
            boardRect.left +
            ((piece.column + 0.5) / level.columns) * boardRect.width;
          const targetY =
            boardRect.top + ((piece.row + 0.5) / level.rows) * boardRect.height;
          const threshold =
            Math.min(
              boardRect.width / level.columns,
              boardRect.height / level.rows,
            ) * 0.34;

          if (Math.hypot(centerX - targetX, centerY - targetY) <= threshold) {
            setPieces((current) => {
              const next = current.map((item) =>
                item.id === dragging
                  ? { ...item, status: "locked" as PieceStatus }
                  : item,
              );
              piecesRef.current = next;
              if (next.every((item) => item.status === "locked")) {
                window.setTimeout(() => setComplete(true), 160);
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
      }
      setDragging(null);
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", finishDrag, { passive: false });
    window.addEventListener("pointercancel", finishDrag, { passive: false });
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [dragging, level.columns, level.rows, updatePiecePosition]);

  const exportArtwork = useCallback(async () => {
    if (!activeImage) return;
    const canvas = document.createElement("canvas");
    drawFinalArtwork(
      canvas,
      activeImage,
      pieces,
      level.rows,
      level.columns,
    );
    try {
      const blob = await canvasToBlob(canvas);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `拼图-${level.count}块.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("无法导出图片");
    }
  }, [activeImage, level.columns, level.count, level.rows, pieces]);

  const restartLevel = useCallback(() => {
    beginLevel(levelIndex, piecesRef.current);
  }, [beginLevel, levelIndex]);

  const nextLevel = useCallback(() => {
    beginLevel(1);
  }, [beginLevel]);

  const renderSlot = (
    id: string | null,
    side: "left" | "right",
    index: number,
  ) => {
    const piece = pieces.find((item) => item.id === id);
    if (!piece || !activeImage) return null;
    return (
      <button
        type="button"
        key={`${side}-${index}`}
        className="piece-slot"
        onPointerDown={(event) => startDrag(piece.id, event, { side, index })}
        aria-label={`拖动第 ${piece.row + 1} 行第 ${piece.column + 1} 列拼图`}
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
          <div className="start-grid" aria-hidden="true" />
          <div className="start-lockup">
            <div className="start-mark" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <h1>拼图</h1>
            <Button className="primary-action" size="lg" onClick={openGallery}>
              开始
              <ArrowRight />
            </Button>
          </div>
        </section>
      )}

      {screen === "gallery" && (
        <section className="gallery-screen">
          <header className="gallery-header">
            <div>
              <p className="eyebrow">PUZZLE</p>
              <h1>图库</h1>
            </div>
            <Button
              className="upload-action"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <RotateCcw className="spin" /> : <Plus />}
              {uploading ? "处理中" : "上传图片"}
            </Button>
          </header>

          <div className="gallery-content">
            {galleryLoading ? (
              <div className="gallery-empty">正在读取图库</div>
            ) : gallery.length === 0 ? (
              <div className="gallery-empty">
                <Images aria-hidden="true" />
                <Button
                  className="primary-action"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload />
                  上传图片
                </Button>
              </div>
            ) : (
              <div className="gallery-grid">
                {gallery.map((record) => (
                  <article className="gallery-card" key={record.id}>
                    <button
                      type="button"
                      className="gallery-image-button"
                      onClick={() => void startWithRecord(record)}
                      aria-label={`使用 ${record.name} 开始拼图`}
                    >
                      <span className="transparency-grid" />
                      <GalleryThumbnail blob={record.thumbnail} name={record.name} />
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="delete-button"
                      aria-label={`删除 ${record.name}`}
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
                  disabled={uploading}
                  aria-label="上传新图片"
                >
                  <Plus />
                </button>
              </div>
            )}
          </div>
          <p className="local-note">图片仅保存在当前设备的浏览器中</p>
        </section>
      )}

      {screen === "game" && activeImage && activeRecord && (
        <section className={`game-screen ${complete ? "is-complete" : ""}`}>
          <header className="game-header">
            <span>第 {levelIndex + 1} 关</span>
            <strong>{level.count} 块</strong>
          </header>

          <div ref={stageRef} className="game-stage">
            {!complete && (
              <div className={`slot-column slot-column-left slots-${tray.left.length}`}>
                {tray.left.map((id, index) => renderSlot(id, "left", index))}
              </div>
            )}

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
                    .filter((piece) => piece.status === "locked")
                    .map((piece) => {
                      const metrics = getPieceMetrics(
                        piece,
                        level.rows,
                        level.columns,
                      );
                      return (
                        <div
                          className="locked-piece"
                          key={piece.id}
                          style={{
                            left: `${((metrics.cellX - metrics.pad) / FRAME_WIDTH) * 100}%`,
                            top: `${((metrics.cellY - metrics.pad) / FRAME_HEIGHT) * 100}%`,
                            width: `${(metrics.canvasWidth / FRAME_WIDTH) * 100}%`,
                            height: `${(metrics.canvasHeight / FRAME_HEIGHT) * 100}%`,
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

            {!complete && (
              <div className={`slot-column slot-column-right slots-${tray.right.length}`}>
                {tray.right.map((id, index) => renderSlot(id, "right", index))}
              </div>
            )}

            {!complete &&
              pieces
                .filter((piece) => piece.status === "free")
                .map((piece) => {
                  const position = freePositions[piece.id];
                  if (!position || !stageSize.width || !boardSize.width) return null;
                  const metrics = getPieceMetrics(
                    piece,
                    level.rows,
                    level.columns,
                  );
                  const scale = boardSize.width / FRAME_WIDTH;
                  return (
                    <button
                      type="button"
                      key={piece.id}
                      className={`free-piece ${dragging === piece.id ? "is-dragging" : ""}`}
                      style={{
                        left: `${position.x * 100}%`,
                        top: `${position.y * 100}%`,
                        width: `${metrics.canvasWidth * scale}px`,
                        height: `${metrics.canvasHeight * scale}px`,
                        zIndex: piece.zIndex + 20,
                      }}
                      onPointerDown={(event) => startDrag(piece.id, event)}
                      aria-label={`移动第 ${piece.row + 1} 行第 ${piece.column + 1} 列拼图`}
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
                导出图片
              </Button>
              <Button variant="outline" onClick={restartLevel}>
                <RotateCcw />
                重新开始
              </Button>
              {levelIndex === 0 ? (
                <Button className="primary-action" onClick={nextLevel}>
                  下一关
                  <ArrowRight />
                </Button>
              ) : (
                <Button className="primary-action" onClick={openGallery}>
                  <Images />
                  返回图库
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
            <AlertDialogTitle>删除这张图片？</AlertDialogTitle>
            <AlertDialogDescription>
              图片将从当前设备的图库中删除，无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmDelete()}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster theme="dark" position="top-center" />
    </main>
  );
}
