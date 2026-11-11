// Servidor de TAFCO Main con las rutas de doors (src/app/api-mobile/doors/*).
// Por ahora corre desde la copia tafco-main-doors-chk en la PC de desarrollo
// (yarn dev, puerto 3000); cuando se suba al servidor de planta vuelve a
// 'http://192.168.15.167:3000/api-mobile/doors', igual que ULC Checklist.
export const API_BASE = 'http://192.168.15.155:3000/api-mobile/doors';

// canReview: Hanger de Door Room / Foreman / admin (lo decide el servidor al
// iniciar sesión). Ellos ven el menú de inicio y aprueban checklists.
export type User = { ID: string; Name: string; Type?: string; canReview?: boolean };

// Etapas de cada door (tafco-main lib/doorStages.ts): BUILD, MOLDING, TRIM
// (Door + Frame, con aprobación de Foreman / Hanger) y HANGER.
export type StageStatus =
  | 'LOCKED'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'FAILED'
  | 'WAITING_APPROVAL'
  // Door Hanger pasó pero la puerta no tiene fotos (son obligatorias).
  | 'WAITING_PHOTOS'
  | 'REJECTED'
  | 'APPROVED';

export type StageInfo = { key: string; title: string; needsApproval: boolean };

// Una fila de [Assigned PanelsA] con Panel Identifier 'Door' / '2R Door'.
export type Door = {
  idOk: string;
  jobNumber: string;
  partNumber: string | null;
  panel: string | null;
  panelIdentifier: string | null;
  width: string | null;
  hgt: string | null;
  qty: number | null;
  status: string | null;
  completedDate: string | null;
  photoCount: number;
  stages: Record<string, StageStatus>;
  // Medidas completas de cada pieza (api-mobile/doors/doors).
  measures?: { DOOR: boolean; FRAME: boolean };
  // Solo al pedir un door (?door=): lo que dice el packing list (.docx) en
  // [Door Specs]. null mientras esa tabla no tenga datos del door.
  specs?: { label: string; value: string }[] | null;
};

// Una línea de un QC sheet (CheckItem en tafco-main lib/doorStages.ts).
export type CheckItem = {
  id: string;
  section: string;
  label: string;
  field?: 'text' | 'number';
  atLeast?: string;
  ref?: 'hgt' | 'width';
  quantity?: boolean;
  measurement?: boolean;
  type?: 'text' | string[];
  dropdown?: boolean; // opciones del Type en dropdown en vez de chips
  noAnswer?: boolean; // sin YES / NO: solo lo que se escribe (cantidad, tipo)
  optionalType?: boolean;
  allowNA?: boolean;
  // Botón NO junto a YES. P. ej. "Squared on each side?": el NO no es
  // FAILED, el foreman decide al aprobar.
  allowNo?: boolean;
  // Inputs con nombre en la línea del punto, sin YES / N/A (Heat: Ohm,
  // Length). Todos obligatorios; se guardan en Answer.inputs por id.
  inputs?: { id: string; label: string; numeric?: boolean }[];
  choices?: { label: string; pass: boolean }[];
  // Al elegir esta opción hay que escribir qué (ej. YES -> qué hace falta).
  noteOn?: string;
  // Lo que dice el Word (packing list) para esta línea: con eso arranca
  // el Type / # of hinges mientras no haya respuesta guardada.
  prefill?: { type?: string; quantity?: string };
};

export type Answer = {
  id: string;
  result: 'YES' | 'NO' | 'NA';
  choice?: string;
  value?: string;
  quantity?: string;
  inputs?: Record<string, string>; // Heat: { ohm, length }
  measurement?: string;
  type?: string;
  comment?: string;
};

// Checklist regresado por la revisión final: comentario y puntos a corregir.
export type Correction = {
  comment: string;
  items: string[];
  by: number | null;
  byName: string | null;
  at: string;
};

export type StagePart = {
  key: string;
  title: string;
  items: CheckItem[];
  // Se desbloquea cuando esta misma parte de la etapa anterior está completa.
  locked: boolean;
  // Quien lo llenó lo puede editar; Foreman / Hanger / admin solo lo pueden ver.
  // Si la revisión final lo rechazó, cualquiera de doors corrige los puntos marcados.
  canEdit: boolean;
  canView: boolean;
  correction?: Correction | null;
  review?: ChecklistReviewStatus;
  // Quién lo aprobó (el ID tecleado en el modal de APPROVE), ya aprobado.
  approval?: { by: number | null; byName: string | null; at: string } | null;
  // Door Molding / Frame Molding: la pieza se puede mandar a reorden.
  canReorder?: boolean;
  // Reordenes de esta pieza (la última es la razón del intento actual).
  reorders?: PieceReorder[];
  saved: {
    status: 'COMPLETE' | 'INCOMPLETE';
    answers: Answer[];
    comment: string;
    filledBy: number | null;
    filledByName: string | null;
    filledAt: string;
    correctedByName?: string | null;
    correctedAt?: string | null;
  } | null;
};

// Aprobación de cada checklist: guardado y pasado queda WAITING hasta que en
// el mismo checklist le dan APPROVE con el ID de un Hanger de Door Room, un
// Foreman o un admin (api-mobile/doors/review).
export type ChecklistReviewStatus =
  | 'NOT_SAVED'
  | 'FAILED'
  | 'WAITING'
  | 'APPROVED'
  | 'TO_FIX'
  // Door Hanger pasó; faltan las fotos de la puerta.
  | 'WAITING_PHOTOS';
export type StageDetail = {
  stage: StageInfo;
  paperworkReceived: boolean;
  isApprover: boolean;
  // Hanger de Door Room / Foreman / admin: Door Hanger y revisión final.
  canReview?: boolean;
  bypassLocks: boolean;
  // Medida del door (HGT / WIDTH del job) y tolerancia +0 / -1/16".
  size: { hgt: number | null; width: number | null };
  // Frame opening (FRAME part); size is the door's own (DOOR part).
  frameSize: { hgt: number | null; width: number | null };
  tolerance: { plus: number; minus: number };
  previousStage: string | null;
  status: StageStatus;
  doorDone: boolean;
  editable: boolean;
  canApprove: boolean;
  approval: {
    result: 'APPROVED' | 'REJECTED';
    comment: string;
    by: number | null;
    byName: string | null;
    at: string;
  } | null;
  parts: StagePart[];
};

// Checklist que sigue después de pasar uno (POST stage -> next), o null.
export type NextChecklist = {
  stageKey: string;
  stageTitle: string;
  partKey: string;
  partTitle: string;
} | null;

// Confirmación de que llegó el paperwork del job (una vez por job).
export type JobPaperwork = {
  receivedBy: number | null;
  receivedByName: string | null;
  receivedAt: string;
} | null;

// Acepta decimal (57.4375) o fracción (57 7/16, 57-7/16, 7/16). Igual que
// parseInches en tafco-main (lib/doorStages.ts).
export function parseInches(text: string | null | undefined): number | null {
  const clean = String(text ?? '')
    .replace(/["”]/g, '')
    .trim();
  if (!clean) return null;
  const m = /^(\d+(?:\.\d+)?)?(?:[\s-]+)?(?:(\d+)\/(\d+))?$/.exec(clean);
  if (!m || (!m[1] && !m[2])) return null;
  const whole = m[1] ? parseFloat(m[1]) : 0;
  const fraction = m[2] && Number(m[3]) !== 0 ? Number(m[2]) / Number(m[3]) : 0;
  return whole + fraction;
}

// Usuarios que pueden entrar a cualquier etapa aunque esté bloqueada (sin
// paperwork o sin la etapa anterior aprobada), para pruebas / revisión.
// Mantener igual que UNLOCK_ALL_USERS en tafco-main (lib/doorStages.ts).
// Reorden de una pieza (api-mobile/doors/reorder): el defecto como sale en
// el label NCM, quién la mandó y quién lo aprobó.
export type PieceReorder = {
  part: 'DOOR' | 'FRAME';
  defect: string | null;
  at: string;
  byName: string | null;
  approvedByName: string | null;
  // Alguien escaneó la pieza nueva y confirmó que llegó. null = la reorden
  // sigue abierta (no se puede medir ni contestar la pieza).
  receivedAt?: string | null;
  receivedByName?: string | null;
};

// Defectos de [Defect Types] (los mismos de MoldSchedule). requiresNote =
// "Other": hay que escribir cuál.
export type DefectType = { id: number; name: string; requiresNote: boolean };

// Rutas de MoldSchedule en el mismo servidor (label NCM: impresoras y print).
export const MOLDS_API_BASE = API_BASE.replace(/\/doors$/, '/molds');

export const UNLOCK_ALL_USERS = ['1529'];
export const canBypassLocks = (user: User | null | undefined) =>
  !!user && UNLOCK_ALL_USERS.includes(String(user.ID));

export const doorName = (door: Door) => door.partNumber || door.panel || 'Door';

// Las fechas de la base son la hora local de la planta guardada sin zona
// (GETDATE()); el servidor las manda como si fueran UTC. Se leen con getUTC*
// para mostrar la hora tal como se guardó, igual que tafco-main
// (lib/shifts.ts). Con getHours() saldrían 5 horas antes.
const asDate = (value: string | Date | null | undefined) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};
export function fmtDate(value: string | Date | null | undefined): string {
  const d = asDate(value);
  return d ? `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}` : '';
}
export function fmtDateTime(value: string | Date | null | undefined): string {
  const d = asDate(value);
  if (!d) return '';
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${fmtDate(d)} ${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

// Mismo criterio que isDoneStatus en tafco-main (lib/panelStatus.ts).
const DONE_STATUSES = [
  'COMPLETE',
  'COMPLETED',
  'REPAIRED',
  'REPAIR',
  'DEFECTIVE',
];
export const isDoorDone = (door: Door) =>
  DONE_STATUSES.includes(
    String(door.status ?? '')
      .trim()
      .toUpperCase(),
  );
