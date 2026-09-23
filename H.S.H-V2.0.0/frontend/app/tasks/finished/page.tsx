"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCheck, ClipboardCheck, Search } from "lucide-react";

import AppShell from "../../../src/components/layout/AppShell";
import { taskService } from "../../../src/services/task.service";
import { settingsService } from "../../../src/services/settings.service";
import { DEFAULT_SETTINGS, SETTINGS_EVENT } from "../../../src/lib/settings";
import { useDbSync } from "../../../src/hooks/useDbSync";
import type { Task } from "../../../src/types/entities/task";
import type { Language } from "../../../src/types/settings/settings";
import styles from "../page.module.css";

const TRANSLATIONS = {
  en: {
    finishedTasks: "Finished Tasks",
    finishedSubtitle: "View completed task history.",
    backToTasks: "Back to Tasks",
    search: "Search finished tasks...",
    searchPlaceholder: "Search finished tasks by name...",
    taskName: "Task Name",
    deadline: "Deadline",
    completed: "Completed",
    status: "Status",
    loading: "Loading finished tasks...",
    noFinished: "No finished tasks yet",
    noFinishedFound: "No finished tasks found",
    noFinishedHint: "Completed tasks will appear here.",
    tryAnother: "Try another search term.",
    completedStatus: "Completed",
  },
  fr: {
    finishedTasks: "Tâches Terminées",
    finishedSubtitle: "Voir l'historique des tâches terminées.",
    backToTasks: "Retour aux Tâches",
    search: "Rechercher des tâches terminées...",
    searchPlaceholder: "Rechercher par nom...",
    taskName: "Nom de la tâche",
    deadline: "Échéance",
    completed: "Terminé le",
    status: "Statut",
    loading: "Chargement des tâches terminées...",
    noFinished: "Aucune tâche terminée pour le moment",
    noFinishedFound: "Aucune tâche terminée trouvée",
    noFinishedHint: "Les tâches terminées apparaîtront ici.",
    tryAnother: "Essayez un autre terme de recherche.",
    completedStatus: "Terminée",
  },
  ar: {
    finishedTasks: "المهام المكتملة",
    finishedSubtitle: "عرض سجل المهام المكتملة.",
    backToTasks: "العودة إلى المهام",
    search: "البحث عن المهام المكتملة...",
    searchPlaceholder: "البحث بالاسم...",
    taskName: "اسم المهمة",
    deadline: "الموعد النهائي",
    completed: "مكتمل",
    status: "الحالة",
    loading: "جارٍ تحميل المهام المكتملة...",
    noFinished: "لا توجد مهام مكتملة بعد",
    noFinishedFound: "لم يتم العثور على مهام مكتملة",
    noFinishedHint: "ستظهر المهام المكتملة هنا.",
    tryAnother: "جرّب مصطلح بحث آخر.",
    completedStatus: "مكتملة",
  },
} as const;

export default function FinishedTasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const t = TRANSLATIONS[language];

  async function loadSettings() {
    const s = await settingsService.get();
    setLanguage(s?.language ?? DEFAULT_SETTINGS.language);
  }

  async function loadTasks() {
    setLoading(true);
    try {
      const all = await taskService.getAll();
      setTasks(all);
    } catch {
      setError("Failed to load tasks.");
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

  useDbSync(() => { void loadTasks(); }, []);

  const finishedTasks = useMemo(() => {
    return [...tasks].filter((task) => task.status === "completed").sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return finishedTasks;
    return finishedTasks.filter((task) => [task.name].some((val) => String(val ?? "").toLowerCase().includes(q)));
  }, [finishedTasks, search]);

  return (
    <AppShell activePage="tasks">
      <main className={styles.tasksPage}>
        <div className={styles.tasksShell}>
          <div style={{ marginBottom: 16 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{t.finishedTasks}</h1>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>{t.finishedSubtitle}</p>
          </div>

          <section className={styles.toolbar}>
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

            <button type="button" className={styles.secondaryButton} onClick={() => router.push("/tasks")}>
              <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
              {t.backToTasks}
            </button>
          </section>

          {error && <div className={styles.errorBanner}>{error}</div>}

          <section className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <span>{t.taskName}</span>
              <span>{t.deadline}</span>
              <span>{t.completed}</span>
              <span>{t.status}</span>
            </div>

            {loading ? (
              <div className={styles.emptyState}>
                <div className={styles.loadingPulse} />
                <strong>{t.loading}</strong>
              </div>
            ) : filtered.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon} aria-hidden="true">
                  <CheckCheck size={32} strokeWidth={2} />
                </div>
                <strong>{finishedTasks.length === 0 ? t.noFinished : t.noFinishedFound}</strong>
                <p>{finishedTasks.length === 0 ? t.noFinishedHint : t.tryAnother}</p>
              </div>
            ) : (
              <div className={styles.taskRows}>
                {filtered.map((task) => (
                  <article key={task.id} className={styles.taskRow}>
                    <span className={styles.taskNameCell} title={task.name}>
                      <span className={styles.taskIcon} aria-hidden="true">
                        <ClipboardCheck size={16} strokeWidth={2} />
                      </span>
                      <strong>{task.name}</strong>
                    </span>
                    <span className={styles.deadlineText}>{new Date(task.deadline).toLocaleDateString(language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB", { numberingSystem: "latn" } as any)}</span>
                    <span className={styles.deadlineText}>
                      {task.completedAt ? new Date(task.completedAt).toLocaleDateString(language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB", { numberingSystem: "latn" } as any) : new Date(task.updatedAt).toLocaleDateString(language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB", { numberingSystem: "latn" } as any)}
                    </span>
                    <span className={`${styles.statusBadge} ${styles.statusCompleted}`}>{t.completedStatus}</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
