"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDbSync } from "../../src/hooks/useDbSync";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  Check,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  ClipboardList,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import AppShell from "../../src/components/layout/AppShell";
import StyledDatePicker from "../../src/components/common/StyledDatePicker";
import { taskService } from "../../src/services/task.service";
import { taskRepository } from "../../src/repositories/task.repository";
import { settingsService } from "../../src/services/settings.service";
import { DEFAULT_SETTINGS, SETTINGS_EVENT } from "../../src/lib/settings";
import type { Task } from "../../src/types/entities/task";
import type { Language } from "../../src/types/settings/settings";
import styles from "./page.module.css";

const TRANSLATIONS = {
  en: {
    title: "Tasks",
    subtitle: "Manage operational tasks, deadlines and completion status.",
    search: "Search tasks...",
    searchPlaceholder: "Search tasks by name...",
    task: "Task",
    tasks: "tasks",
    taskSingular: "task",
    deadline: "Deadline",
    status: "Status",
    actions: "Actions",
    allStatuses: "All Statuses",
    pending: "Pending",
    completed: "Completed",
    missed: "Missed",
    newToOld: "New to Old",
    closestDeadline: "Closest Deadline",
    addTask: "Add Task",
    finishedTasks: "Finished Tasks",
    total: "Total tasks",
    totalSub: "All recorded tasks",
    month: "This month",
    monthSub: "Scheduled this month",
    week: "This week",
    weekSub: "Scheduled this week",
    today: "Today",
    todaySub: "Scheduled today",
    missedLabel: "Missed",
    missedSub: "Past due tasks",
    taskName: "Task name",
    required: "Required",
    saving: "Saving...",
    create: "Create",
    save: "Save",
    cancel: "Cancel",
    editTask: "Edit Task",
    newTask: "NEW TASK",
    name: "Task name",
    delete: "Delete",
    modify: "Modify",
    loading: "Loading tasks...",
    noTasks: "No tasks yet",
    noTasksFound: "No tasks found",
    addFirst: "Add your first task to get started.",
    tryAnother: "Try another search term.",
    failedLoad: "Failed to load tasks.",
    failedSave: "Failed to save task.",
    deleteTask: "Delete Task",
    deleteQuestion: "Are you sure you want to delete this task?",
    deleteWarning: "This action cannot be undone.",
    confirmDelete: "Delete",
    deleting: "Deleting...",
    deleteAvailable: "Confirm available in",
    taskCompleted: "Task Completed",
    taskCompletedMessage: "has been successfully completed.",
    whatNext: "What would you like to do next?",
    finishTask: "Finish Task",
    setNewDate: "Set New Date",
    setNextDeadline: "Set the next deadline",
    nextDate: "Next Date",
    back: "Back",
    confirmNewDate: "Confirm New Date",
    pleaseSelectFuture: "Please select a future date.",
    taskCompletedSuccess: "Task completed successfully.",
    taskRescheduledSuccess: "Task completed and next deadline scheduled.",
    completeTask: "Complete task",
  },
  fr: {
    title: "Tâches",
    subtitle: "Gérer les tâches opérationnelles, les échéances et leur achèvement.",
    search: "Rechercher des tâches...",
    searchPlaceholder: "Rechercher par nom...",
    task: "Tâche",
    tasks: "tâches",
    taskSingular: "tâche",
    deadline: "Échéance",
    status: "Statut",
    actions: "Actions",
    allStatuses: "Tous les statuts",
    pending: "En attente",
    completed: "Terminée",
    missed: "Manquée",
    newToOld: "New to Old",
    closestDeadline: "Closest Deadline",
    addTask: "Ajouter une tâche",
    finishedTasks: "Tâches Terminées",
    total: "Total tâches",
    totalSub: "Toutes les tâches",
    month: "Ce mois",
    monthSub: "Prévu ce mois",
    week: "Cette semaine",
    weekSub: "Prévu cette semaine",
    today: "Aujourd'hui",
    todaySub: "Prévu aujourd'hui",
    missedLabel: "Manquées",
    missedSub: "En retard",
    taskName: "Nom de la tâche",
    required: "Obligatoire",
    saving: "Enregistrement...",
    create: "Créer",
    save: "Enregistrer",
    cancel: "Annuler",
    editTask: "Modifier la tâche",
    newTask: "NOUVELLE TÂCHE",
    name: "Nom de la tâche",
    delete: "Supprimer",
    modify: "Modifier",
    loading: "Chargement des tâches...",
    noTasks: "Aucune tâche pour le moment",
    noTasksFound: "Aucune tâche trouvée",
    addFirst: "Ajoutez votre première tâche.",
    tryAnother: "Essayez un autre terme de recherche.",
    failedLoad: "Échec du chargement des tâches.",
    failedSave: "Échec de l'enregistrement de la tâche.",
    deleteTask: "Supprimer la tâche",
    deleteQuestion: "Voulez-vous vraiment supprimer cette tâche ?",
    deleteWarning: "Cette action est irréversible.",
    confirmDelete: "Supprimer",
    deleting: "Suppression...",
    deleteAvailable: "Confirmation disponible dans",
    taskCompleted: "Tâche Terminée",
    taskCompletedMessage: "a été terminée avec succès.",
    whatNext: "Que souhaitez-vous faire ensuite ?",
    finishTask: "Terminer la tâche",
    setNewDate: "Définir une nouvelle date",
    setNextDeadline: "Définir la prochaine échéance",
    nextDate: "Prochaine date",
    back: "Retour",
    confirmNewDate: "Confirmer la nouvelle date",
    pleaseSelectFuture: "Veuillez sélectionner une date future.",
    taskCompletedSuccess: "Tâche terminée avec succès.",
    taskRescheduledSuccess: "Tâche terminée et prochaine échéance planifiée.",
    completeTask: "Terminer la tâche",
  },
  ar: {
    title: "المهام",
    subtitle: "إدارة المهام التشغيلية والمواعيد النهائية وحالة الإنجاز.",
    search: "البحث عن المهام...",
    searchPlaceholder: "البحث بالاسم...",
    task: "المهمة",
    tasks: "مهام",
    taskSingular: "مهمة",
    deadline: "الموعد النهائي",
    status: "الحالة",
    actions: "الإجراءات",
    allStatuses: "جميع الحالات",
    pending: "قيد الانتظار",
    completed: "مكتملة",
    missed: "متأخرة",
    newToOld: "New to Old",
    closestDeadline: "Closest Deadline",
    addTask: "إضافة مهمة",
    finishedTasks: "المهام المكتملة",
    total: "مجموع المهام",
    totalSub: "جميع المهام المسجلة",
    month: "هذا الشهر",
    monthSub: "مجدولة هذا الشهر",
    week: "هذا الأسبوع",
    weekSub: "مجدولة هذا الأسبوع",
    today: "اليوم",
    todaySub: "مجدولة اليوم",
    missedLabel: "المتأخرة",
    missedSub: "مهام متأخرة",
    taskName: "اسم المهمة",
    required: "مطلوب",
    saving: "جارٍ الحفظ...",
    create: "إنشاء",
    save: "حفظ",
    cancel: "إلغاء",
    editTask: "تعديل المهمة",
    newTask: "مهمة جديدة",
    name: "اسم المهمة",
    delete: "حذف",
    modify: "تعديل",
    loading: "جارٍ تحميل المهام...",
    noTasks: "لا توجد مهام بعد",
    noTasksFound: "لم يتم العثور على مهام",
    addFirst: "أضف أول مهمة.",
    tryAnother: "جرّب مصطلح بحث آخر.",
    failedLoad: "فشل تحميل المهام.",
    failedSave: "فشل حفظ المهمة.",
    deleteTask: "حذف المهمة",
    deleteQuestion: "هل أنت متأكد من رغبتك في حذف هذه المهمة؟",
    deleteWarning: "لا يمكن التراجع عن هذا الإجراء.",
    confirmDelete: "حذف",
    deleting: "جارٍ الحذف...",
    deleteAvailable: "يمكن التأكيد بعد",
    taskCompleted: "اكتملت المهمة",
    taskCompletedMessage: "تم إكمالها بنجاح.",
    whatNext: "ماذا تريد أن تفعل بعد ذلك؟",
    finishTask: "إنهاء المهمة",
    setNewDate: "تحديد تاريخ جديد",
    setNextDeadline: "حدد الموعد النهائي التالي",
    nextDate: "التاريخ التالي",
    back: "رجوع",
    confirmNewDate: "تأكيد التاريخ الجديد",
    pleaseSelectFuture: "الرجاء اختيار تاريخ مستقبلي.",
    taskCompletedSuccess: "اكتملت المهمة بنجاح.",
    taskRescheduledSuccess: "اكتملت المهمة وتم تحديد الموعد النهائي التالي.",
    completeTask: "إكمال المهمة",
  },
} as const;

type FormState = {
  name: string;
  deadline: string;
};

function getDeadlineCategory(deadline: number, now = Date.now()) {
  if (!Number.isFinite(deadline)) return "black";
  const d = new Date(deadline);
  const n = new Date(now);
  d.setHours(0, 0, 0, 0);
  n.setHours(0, 0, 0, 0);
  const diff = Math.floor((d.getTime() - n.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "black";
  if (diff === 0) return "red";
  if (diff <= 7) return "orange";
  if (diff <= 31) return "green";
  return "blue";
}

function getTaskUrgency(deadline: number, now = Date.now()): "far" | "upcoming" | "soon" | "urgent" | "missed" {
  const d = new Date(deadline);
  const n = new Date(now);
  d.setHours(0, 0, 0, 0);
  n.setHours(0, 0, 0, 0);
  const diff = Math.floor((d.getTime() - n.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "missed";
  if (diff <= 1) return "urgent";
  if (diff <= 7) return "soon";
  if (diff <= 30) return "upcoming";
  return "far";
}

function getStatusLabel(deadline: number, t: (typeof TRANSLATIONS)[Language]): string {
  if (!Number.isFinite(deadline)) return t.missed;
  const d = new Date(deadline);
  const n = new Date();
  d.setHours(0, 0, 0, 0);
  n.setHours(0, 0, 0, 0);
  const diff = Math.floor((d.getTime() - n.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return t.missed;
  if (diff === 0) return t.today;
  if (diff <= 7) return t.week;
  if (diff <= 31) return t.month;
  return t.pending;
}

function StatusFilter({
  value,
  onChange,
  onFinishedTasks,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  onFinishedTasks: () => void;
  t: { allStatuses: string; newToOld: string; closestDeadline: string; missed: string; finishedTasks: string };
}) {
  const options = useMemo(
    () => [
      { value: "", label: t.allStatuses },
      { value: "newToOld", label: t.newToOld },
      { value: "closest", label: t.closestDeadline },
      { value: "missed", label: t.missed },
    ],
    [t],
  );
  // Extra non-filter row: navigation action, never a selected value.
  const actionIndex = options.length;
  const itemCount = options.length + 1;

  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? t.allStatuses;

  function openMenu() {
    const idx = value ? options.findIndex((o) => o.value === value) : 0;
    setHighlighted(idx >= 0 ? idx : 0);
    setOpen(true);
  }

  function closeMenu(focusTrigger = false) {
    setOpen(false);
    setHighlighted(-1);
    if (focusTrigger) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) closeMenu();
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeMenu(true);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open ]);

  function activate(idx: number) {
    if (idx === actionIndex) {
      closeMenu();
      onFinishedTasks();
      return;
    }
    const opt = options[idx];
    if (opt) {
      onChange(opt.value);
      closeMenu();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((prev) => (prev + 1) % itemCount);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((prev) => (prev - 1 + itemCount) % itemCount);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (highlighted >= 0) activate(highlighted);
      else closeMenu();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === "Tab") {
      closeMenu();
    }
  }

  return (
    <div className={styles.filterDropdown} ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.filterTrigger} ${open ? styles.filterTriggerOpen : ""}`}
        onClick={() => {
          if (open) closeMenu();
          else openMenu();
        }}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t.allStatuses}
      >
        <span>{selectedLabel}</span>
        <span
          className={`${styles.filterChevron} ${open ? styles.filterChevronOpen : ""}`}
          aria-hidden="true"
        >
          <ChevronDown size={14} strokeWidth={2} />
        </span>
      </button>

      {open && (
        <div className={styles.filterMenu} role="listbox" aria-label={t.allStatuses}>
          {options.map((opt, idx) => (
            <button
              key={opt.value + idx}
              type="button"
              role="option"
              aria-selected={value === opt.value}
              tabIndex={-1}
              className={`${styles.filterOption} ${value === opt.value ? styles.filterOptionActive : ""} ${highlighted === idx ? styles.filterOptionHover : ""}`}
              onMouseEnter={() => setHighlighted(idx)}
              onClick={() => activate(idx)}
            >
              {opt.label}
            </button>
          ))}
          <div className={styles.filterDivider} role="separator" aria-hidden="true" />
          <button
            type="button"
            tabIndex={-1}
            className={`${styles.filterAction} ${highlighted === actionIndex ? styles.filterActionActive : ""}`}
            onMouseEnter={() => setHighlighted(actionIndex)}
            onClick={() => activate(actionIndex)}
          >
            <CheckCheck size={14} strokeWidth={2} aria-hidden="true" />
            {t.finishedTasks}
          </button>
        </div>
      )}
    </div>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ name: "", deadline: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState(3.5);
  const [deleting, setDeleting] = useState(false);
  const deleteStartRef = useRef<number | null>(null);
  const [completeTarget, setCompleteTarget] = useState<Task | null>(null);
  const [completeMode, setCompleteMode] = useState<"choice" | "date">("choice");
  const [newDeadline, setNewDeadline] = useState<string>(new Date().toISOString().slice(0, 10));
  const [completeError, setCompleteError] = useState("");
  const [completing, setCompleting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const router = useRouter();
  const t = TRANSLATIONS[language];

  async function loadSettings() {
    const s = await settingsService.get();
    setLanguage(s?.language ?? DEFAULT_SETTINGS.language);
  }

  async function loadTasks() {
    setLoading(true);
    try {
      const all = await taskService.getAll();
      all.sort((a, b) => a.deadline - b.deadline);
      setTasks(all);
    } catch {
      setError(t.failedLoad);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
    void loadTasks();
    const h = () => void loadSettings();
    window.addEventListener(SETTINGS_EVENT, h);
    return () => window.removeEventListener(SETTINGS_EVENT, h);
  }, []);

  useDbSync(() => {
    void loadTasks();
  }, []);

  useEffect(() => {
    if (!deleteTarget) {
      deleteStartRef.current = null;
      return;
    }
    deleteStartRef.current = Date.now();
    setDeleteCountdown(3.5);
    const interval = window.setInterval(() => {
      if (deleteStartRef.current === null) return;
      const elapsed = Date.now() - deleteStartRef.current;
      const remaining = Math.max(0, 3.5 - elapsed / 1000);
      const display = Math.ceil(remaining * 10) / 10;
      setDeleteCountdown(display > 0 ? display : 0);
      if (remaining <= 0) window.clearInterval(interval);
    }, 50);
    return () => window.clearInterval(interval);
  }, [deleteTarget]);

  const stats = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    const startWeek = new Date(now);
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    startWeek.setDate(now.getDate() + diffToMonday);
    startWeek.setHours(0, 0, 0, 0);
    const nextWeek = startWeek.getTime() + 7 * 24 * 60 * 60 * 1000;
    const todayStart = now.getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;

    const activeTasks = tasks.filter((t) => (t.status ?? "pending") !== "completed");

    let monthCount = 0;
    let weekCount = 0;
    let todayCount = 0;
    let missedCount = 0;

    for (const task of activeTasks) {
      if (!Number.isFinite(task.deadline)) continue;
      if (task.deadline >= startMonth && task.deadline < nextMonth) monthCount++;
      if (task.deadline >= startWeek.getTime() && task.deadline < nextWeek) weekCount++;
      if (task.deadline >= todayStart && task.deadline <= todayEnd) todayCount++;
      if (task.deadline < todayStart) missedCount++;
    }

    return {
      total: activeTasks.length,
      month: monthCount,
      week: weekCount,
      today: todayCount,
      missed: missedCount,
    };
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = [...tasks].filter((task) => (task.status ?? "pending") !== "completed");
    if (statusFilter === "newToOld") {
      result = [...result].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    } else if (statusFilter === "closest") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStart = today.getTime();
      const upcoming = result
        .filter((task) => {
          const d = new Date(task.deadline);
          d.setHours(0, 0, 0, 0);
          return d.getTime() >= todayStart;
        })
        .sort((a, b) => a.deadline - b.deadline);
      const missed = result
        .filter((task) => {
          const d = new Date(task.deadline);
          d.setHours(0, 0, 0, 0);
          return d.getTime() < todayStart;
        })
        .sort((a, b) => a.deadline - b.deadline);
      result = [...upcoming, ...missed];
    } else if (statusFilter === "missed") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStart = today.getTime();
      result = result
        .filter((task) => {
          const d = new Date(task.deadline);
          d.setHours(0, 0, 0, 0);
          return d.getTime() < todayStart;
        })
        .sort((a, b) => a.deadline - b.deadline);
    } else {
      result = [...result].sort((a, b) => a.deadline - b.deadline);
    }
    if (!q) return result;
    return result.filter((task) => [task.name].some((val) => String(val ?? "").toLowerCase().includes(q)));
  }, [tasks, search, statusFilter]);

  function openCreate() {
    setEditingId(null);
    setForm({ name: "", deadline: new Date().toISOString().slice(0, 10) });
    setError("");
    setShowForm(true);
  }

  function openEdit(task: Task) {
    setEditingId(task.id);
    setForm({ name: task.name, deadline: new Date(task.deadline).toISOString().slice(0, 10) });
    setError("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;
    setShowForm(false);
    setEditingId(null);
  }

  function openComplete(task: Task) {
    setCompleteTarget(task);
    setCompleteMode("choice");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setNewDeadline(tomorrow.toISOString().slice(0, 10));
    setCompleteError("");
  }

  function closeComplete() {
    if (completing) return;
    setCompleteTarget(null);
    setCompleteMode("choice");
    setCompleteError("");
  }

  async function handleFinish() {
    if (!completeTarget || completing) return;
    setCompleting(true);
    setCompleteError("");
    try {
      await taskService.complete(completeTarget.id);
      await loadTasks();
      setSuccessMessage(t.taskCompletedSuccess);
      setTimeout(() => setSuccessMessage(""), 3000);
      closeComplete();
    } catch (err) {
      setCompleteError(err instanceof Error ? err.message : t.failedSave);
    } finally {
      setCompleting(false);
    }
  }

  async function handleReschedule() {
    if (!completeTarget || completing) return;
    if (!newDeadline) {
      setCompleteError(t.pleaseSelectFuture);
      return;
    }
    const newTime = new Date(`${newDeadline}T12:00:00`).getTime();
    if (Number.isNaN(newTime)) {
      setCompleteError(t.pleaseSelectFuture);
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newDateOnly = new Date(newTime);
    newDateOnly.setHours(0, 0, 0, 0);
    if (newDateOnly.getTime() <= today.getTime()) {
      setCompleteError(t.pleaseSelectFuture);
      return;
    }
    setCompleting(true);
    setCompleteError("");
    try {
      await taskService.reschedule(completeTarget.id, newTime);
      await loadTasks();
      setSuccessMessage(t.taskRescheduledSuccess);
      setTimeout(() => setSuccessMessage(""), 3000);
      closeComplete();
    } catch (err) {
      setCompleteError(err instanceof Error ? err.message : t.failedSave);
    } finally {
      setCompleting(false);
    }
  }

  async function saveTask() {
    if (!form.name.trim() || !form.deadline) {
      setError(t.failedSave);
      return;
    }
    const deadline = new Date(`${form.deadline}T12:00:00`).getTime();
    if (!Number.isFinite(deadline)) {
      setError(t.failedSave);
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await taskService.update(editingId, { name: form.name.trim(), deadline });
      } else {
        await taskService.create({ name: form.name.trim(), deadline });
      }
      await loadTasks();
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedSave);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (deleting) return;
    if (deleteStartRef.current !== null) {
      const elapsed = Date.now() - deleteStartRef.current;
      if (elapsed < 3500) return;
    } else if (deleteCountdown > 0) return;
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await taskRepository.delete(deleteTarget.id);
      await loadTasks();
      setDeleteTarget(null);
      setDeleteCountdown(3.5);
      deleteStartRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedSave);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell activePage="tasks" showHeader={false}>
      <main className={styles.tasksPage}>
        <div className={styles.tasksShell}>
          {/* Unified Tasks header — brand / search / status filter / finished / add */}
          <div className={styles.headerContainer}>
          <section className={styles.tasksHeader}>
            <div className={styles.tasksHeaderBrand}>
              <div className={styles.tasksLogo}>
                <img src="/chicken.jpg" alt="" />
              </div>
              <div className={styles.tasksTitle}>
                <h1>{t.title}</h1>
                <p>{t.subtitle}</p>
              </div>
            </div>

            <div className={styles.searchBox}>
              <span aria-hidden="true">
                <Search size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.searchPlaceholder}
                aria-label={t.search}
              />
            </div>

            <div className={styles.filterWrapper}>
              <StatusFilter
                value={statusFilter}
                onChange={setStatusFilter}
                onFinishedTasks={() => router.push("/tasks/finished")}
                t={{ allStatuses: t.allStatuses, newToOld: t.newToOld, closestDeadline: t.closestDeadline, missed: t.missed, finishedTasks: t.finishedTasks }}
              />
            </div>

            <button type="button" className={styles.primaryButton} onClick={openCreate}>
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              {t.addTask}
            </button>
          </section>
          </div>

          {/* Summary Cards — 5 in one row */}
          <section className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconTotal}`}>
                <ClipboardList size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.total}</span>
                <strong className={styles.summaryValue}>{stats.total}</strong>
                <small className={styles.summarySub}>{t.totalSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconMonth}`}>
                <CalendarDays size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.month}</span>
                <strong className={styles.summaryValue}>{stats.month}</strong>
                <small className={styles.summarySub}>{t.monthSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconWeek}`}>
                <CalendarRange size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.week}</span>
                <strong className={styles.summaryValue}>{stats.week}</strong>
                <small className={styles.summarySub}>{t.weekSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconToday}`}>
                <CalendarCheck size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.today}</span>
                <strong className={styles.summaryValue}>{stats.today}</strong>
                <small className={styles.summarySub}>{t.todaySub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconMissed}`}>
                <CircleAlert size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.missedLabel}</span>
                <strong className={styles.summaryValue}>{stats.missed}</strong>
                <small className={styles.summarySub}>{t.missedSub}</small>
              </div>
            </div>
          </section>

          {error && !showForm && !deleteTarget && !completeTarget && <div className={styles.errorBanner}>{error}</div>}
          {successMessage && <div className={styles.successBanner}>{successMessage}</div>}

          <section className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <span>{t.taskName}</span>
              <span>{t.deadline}</span>
              <span>{t.status}</span>
              <span>{t.actions}</span>
            </div>

            {loading ? (
              <div className={styles.emptyState}>
                <div className={styles.loadingPulse} />
                <strong>{t.loading}</strong>
              </div>
            ) : filtered.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon} aria-hidden="true">
                  <ClipboardCheck size={32} strokeWidth={2} />
                </div>
                <strong>{tasks.length === 0 ? t.noTasks : t.noTasksFound}</strong>
                <p>{tasks.length === 0 ? t.addFirst : t.tryAnother}</p>
                {tasks.length === 0 && (
                  <button type="button" className={styles.primaryButton} onClick={openCreate}>
                    <Plus size={16} strokeWidth={2} aria-hidden="true" />
                    {t.addTask}
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.taskRows}>
                {filtered.map((task) => {
                  const statusLabel = getStatusLabel(task.deadline, t);
                  const urgency = getTaskUrgency(task.deadline);
                  const isCompleted = (task.status ?? "pending") === "completed";
                  const badgeClass = isCompleted
                    ? styles.statusCompleted
                    : urgency === "missed"
                      ? styles.statusMissed
                      : urgency === "urgent"
                        ? styles.statusUrgent
                        : urgency === "soon"
                          ? styles.statusSoon
                          : urgency === "upcoming"
                            ? styles.statusUpcoming
                            : styles.statusFar;
                  return (
                    <article key={task.id} className={styles.taskRow} onDoubleClick={() => openEdit(task)}>
                      <span className={styles.taskNameCell} title={task.name}>
                        <span className={styles.taskIcon} aria-hidden="true">
                          <ClipboardCheck size={16} strokeWidth={2} />
                        </span>
                        <strong>{task.name}</strong>
                      </span>
                      <span className={styles.deadlineText}>{new Date(task.deadline).toLocaleDateString(language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB", { numberingSystem: "latn" } as any)}</span>
                      <span className={`${styles.statusBadge} ${badgeClass}`}>{statusLabel}</span>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.rowCompleteButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            openComplete(task);
                          }}
                          title={t.completeTask}
                          aria-label={`${t.completeTask} ${task.name}`}
                        >
                          <CircleCheck size={16} strokeWidth={2} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={styles.rowEditButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(task);
                          }}
                          title={t.modify}
                          aria-label={`${t.modify} ${task.name}`}
                        >
                          <Pencil size={16} strokeWidth={2} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={styles.rowDeleteButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            setError("");
                            setDeleteTarget(task);
                          }}
                          title={t.delete}
                          aria-label={`${t.delete} ${task.name}`}
                        >
                          <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {showForm && (
            <div className={styles.modalBackdrop} onClick={closeForm}>
              <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                  <h2>{editingId ? t.editTask : t.newTask}</h2>
                  <button type="button" className={styles.closeButton} onClick={closeForm} disabled={saving} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
                <div className={styles.formGrid}>
                  <label>
                    <span>{t.name} *</span>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </label>
                  <label>
                    <span>{t.deadline} *</span>
                    <StyledDatePicker
                      value={form.deadline}
                      onChange={(value) => setForm({ ...form, deadline: value })}
                      language={language}
                      placeholder={t.deadline}
                      ariaLabel={t.deadline}
                    />
                  </label>
                </div>
                {error && <div className={styles.formError}>{error}</div>}
                <footer className={styles.modalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={closeForm} disabled={saving}>
                    {t.cancel}
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={saveTask} disabled={saving}>
                    {saving ? t.saving : editingId ? t.save : t.create}
                  </button>
                </footer>
              </section>
            </div>
          )}

          {deleteTarget && (
            <div className={styles.modalBackdrop}>
              <section className={styles.deleteModalCompact} role="dialog" aria-modal="true" aria-labelledby="delete-title">
                <div className={styles.warningIconSmall} aria-hidden="true">
                  <AlertTriangle size={20} strokeWidth={2} />
                </div>
                <h2 id="delete-title">{t.deleteTask}</h2>
                <p className={styles.deleteDescription}>{t.deleteWarning}</p>
                <p className={styles.deleteContext}>
                  {deleteTarget.name} · {new Date(deleteTarget.deadline).toLocaleDateString(language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB", { numberingSystem: "latn" } as any)}
                </p>
                <div className={styles.circularCountdown} aria-live="polite">
                  <div className={styles.circleWrapper} aria-hidden="true">
                    <svg width="64" height="64" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="28" className={styles.circleTrack} />
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        className={styles.circleProgress}
                        style={{
                          strokeDasharray: `${2 * Math.PI * 28}`,
                          strokeDashoffset: `${2 * Math.PI * 28 * (deleteCountdown / 3.5)}`,
                        }}
                      />
                    </svg>
                    <span className={styles.circleText}>{deleteCountdown > 0 ? deleteCountdown.toFixed(1) : "0.0"}</span>
                  </div>
                  <span className={styles.circleLabel}>{deleteCountdown > 0 ? "Confirm deletion" : t.confirmDelete}</span>
                </div>
                {error && <div className={styles.formError}>{error}</div>}
                <div className={styles.modalFooterCompact}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      if (!deleting) {
                        setDeleteTarget(null);
                        setDeleteCountdown(3.5);
                        deleteStartRef.current = null;
                      }
                    }}
                    disabled={deleting}
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => void confirmDelete()}
                    disabled={deleteCountdown > 0 || deleting}
                  >
                    <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                    {deleting ? t.deleting : t.confirmDelete}
                  </button>
                </div>
              </section>
            </div>
          )}

          {completeTarget && (
            <div className={styles.modalBackdrop} onClick={closeComplete}>
              <section className={styles.completeModal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className={styles.completeIcon} aria-hidden="true">
                  <CircleCheck size={28} strokeWidth={2} />
                </div>
                <h2>{t.taskCompleted}</h2>
                <p className={styles.completeMessage}>
                  &quot;{completeTarget.name}&quot; {t.taskCompletedMessage}
                </p>
                {completeMode === "choice" ? (
                  <>
                    <p className={styles.completeQuestion}>{t.whatNext}</p>
                    <div className={styles.completeActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => void handleFinish()}
                        disabled={completing}
                      >
                        {completing ? t.saving : t.finishTask}
                      </button>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => {
                          setCompleteMode("date");
                          setCompleteError("");
                        }}
                        disabled={completing}
                      >
                        {t.setNewDate}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className={styles.completeQuestion}>{t.setNextDeadline}</p>
                    <div className={styles.completeDateField}>
                      <label>
                        <span>{t.nextDate} *</span>
                        <StyledDatePicker
                          value={newDeadline}
                          onChange={(v) => setNewDeadline(v)}
                          language={language}
                          placeholder={t.nextDate}
                          ariaLabel={t.nextDate}
                        />
                      </label>
                    </div>
                    {completeError && <div className={styles.formError}>{completeError}</div>}
                    <div className={styles.completeActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => {
                          setCompleteMode("choice");
                          setCompleteError("");
                        }}
                        disabled={completing}
                      >
                        {t.back}
                      </button>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => void handleReschedule()}
                        disabled={completing}
                      >
                        {completing ? t.saving : t.confirmNewDate}
                      </button>
                    </div>
                  </>
                )}
                {completeMode === "choice" && completeError && <div className={styles.formError}>{completeError}</div>}
              </section>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}


