export {
  openProjectStore,
  type ProjectStore,
  type ProjectStoreOptions,
} from "./store.ts";
export { readMigrationHistory } from "./migrations.ts";
export {
  atomicWriteFile,
  IMPORT_TEMP_MARKER,
  recoverGrantDirectory,
  resolveGrantFile,
  TEMP_FILE_PREFIX,
  type AtomicWriteOptions,
  type AtomicWritePhase,
  type AtomicWriteResult,
  type RecoveryResult,
} from "./file-boundary/atomic-write.ts";
export {
  classifyFsError,
  FileBoundaryError,
  type FileBoundaryCode,
} from "./file-boundary/errors.ts";
export {
  createGrantTable,
  isImportedOriginal,
  protectImportedFile,
  readGrantedFile,
  type DirectoryGrant,
  type FileGrant,
  type GrantMode,
  type GrantTable,
} from "./file-boundary/grants.ts";
export {
  createFileHost,
  FileHostProtocolError,
  type FileHost,
  type FileHostOptions,
} from "./file-boundary/file-host.ts";
export {
  type DirectorySelection,
  type FileSelection,
  type FileSelectRequest,
} from "./file-boundary/handlers.ts";
