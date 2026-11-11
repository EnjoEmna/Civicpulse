const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, "../../uploads");

const EVIDENCE_DIR = path.join(UPLOAD_ROOT, "evidence");

const MAX_FILE_SIZE_BYTES =
  Number(process.env.MAX_EVIDENCE_FILE_SIZE) || 10 * 1024 * 1024; // 10 MB

const MAX_FILES_PER_UPLOAD = Number(process.env.MAX_EVIDENCE_FILES) || 5;

const MIME_TYPE_MAP = {
  "image/jpeg": { ext: ".jpg", category: "image" },
  "image/jpg": { ext: ".jpg", category: "image" },
  "image/png": { ext: ".png", category: "image" },
  "image/webp": { ext: ".webp", category: "image" },
  "image/gif": { ext: ".gif", category: "image" },
  "video/mp4": { ext: ".mp4", category: "video" },
  "video/webm": { ext: ".webm", category: "video" },
  "video/quicktime": { ext: ".mov", category: "video" },
  "application/pdf": { ext: ".pdf", category: "document" },
};

const ALLOWED_MIME_TYPES = Object.keys(MIME_TYPE_MAP);

function ensureEvidenceDir() {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
}

function getFileCategory(mimeType) {
  return MIME_TYPE_MAP[mimeType]?.category || "document";
}

function generateStorageKey(originalName, mimeType) {
  const rawExt = path.extname(originalName || "").toLowerCase();
  const allowedExts = new Set(Object.values(MIME_TYPE_MAP).map((m) => m.ext));
  const safeExt = allowedExts.has(rawExt)
    ? rawExt
    : MIME_TYPE_MAP[mimeType]?.ext || "";

  return `${Date.now()}-${crypto.randomUUID()}${safeExt}`;
}

function getPublicFileUrl(storageKey) {
  const safeKey = path.basename(storageKey);
  const relativePath = `/uploads/evidence/${encodeURIComponent(safeKey)}`;
  const publicBase = process.env.PUBLIC_ASSET_URL?.replace(/\/+$/, "");

  return publicBase ? `${publicBase}${relativePath}` : relativePath;
}

function removeStoredFile(storageKey) {
  if (!storageKey) return;

  const safeName = path.basename(storageKey);
  const resolvedTarget = path.resolve(EVIDENCE_DIR, safeName);
  const resolvedBase = path.resolve(EVIDENCE_DIR);

  if (
    resolvedTarget !== resolvedBase &&
    resolvedTarget.startsWith(`${resolvedBase}${path.sep}`) &&
    fs.existsSync(resolvedTarget)
  ) {
    fs.unlinkSync(resolvedTarget);
  }
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureEvidenceDir();
      cb(null, EVIDENCE_DIR);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    cb(null, generateStorageKey(file.originalname, file.mimetype));
  },
});

function fileFilter(_req, file, cb) {
  if (!MIME_TYPE_MAP[file.mimetype]) {
    const error = new Error(
      `Unsupported file type "${file.mimetype}". Allowed types: JPEG, PNG, WebP, GIF, MP4, WebM, MOV, PDF.`,
    );
    error.statusCode = 400;
    error.code = "INVALID_FILE_TYPE";
    return cb(error);
  }

  cb(null, true);
}

const evidenceUpload = multer({
  storage: diskStorage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILES_PER_UPLOAD,
  },
});

const uploadHandler = evidenceUpload.fields([
  { name: "files", maxCount: MAX_FILES_PER_UPLOAD },
  { name: "file", maxCount: MAX_FILES_PER_UPLOAD },
]);

function uploadEvidenceMiddleware(req, res, next) {
  uploadHandler(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        const messageByCode = {
          LIMIT_FILE_SIZE: `File exceeds the maximum allowed size of ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB`,
          LIMIT_FILE_COUNT: `You can upload at most ${MAX_FILES_PER_UPLOAD} files at once`,
          LIMIT_UNEXPECTED_FILE: `Too many files or invalid field name. Use "files" or "file" (max ${MAX_FILES_PER_UPLOAD}).`,
        };
        const error = new Error(messageByCode[err.code] || err.message);
        error.statusCode = 400;
        error.code = err.code;
        return next(error);
      }
      return next(err);
    }

    const fromFiles = req.files?.files || [];
    const fromSingle = req.files?.file || [];
    req.uploadedFiles = [...fromFiles, ...fromSingle];
    next();
  });
}

module.exports = {
  UPLOAD_ROOT,
  EVIDENCE_DIR,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_UPLOAD,
  ALLOWED_MIME_TYPES,
  ensureEvidenceDir,
  getFileCategory,
  generateStorageKey,
  getPublicFileUrl,
  removeStoredFile,
  evidenceUpload,
  uploadEvidenceMiddleware,
};
