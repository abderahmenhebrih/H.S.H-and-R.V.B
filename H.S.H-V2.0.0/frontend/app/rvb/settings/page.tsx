"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import RvbShell from "../../../src/components/rvb/RvbShell";
import RvbAuthGuard from "../../../src/components/rvb/RvbAuthGuard";
import { useRvbAuth } from "../../../src/contexts/RvbAuthContext";
import { rvbUiPreferencesService, RVB_UI_PREFERENCES_EVENT } from "@/src/services/rvb-ui-preferences.service";
import { DEFAULT_SETTINGS, getDirection } from "../../../src/lib/settings";
import type { Settings, Language, Currency } from "../../../src/types/settings/settings";
import { getSavedTheme, applyTheme } from "../../../src/lib/theme";
import { rvbAuthService } from "../../../src/services/rvb-auth.service";
import StyledSelect from "../../../src/components/common/StyledSelect";
import ThemeAppearanceSelector from "../../../src/components/settings/ThemeAppearanceSelector";
import { Settings as SettingsIcon, Globe, Palette, Bell, Shield, Info, Sun, Moon, LogOut, KeyRound, Image as ImageIcon, Check, X, Eye, EyeOff, Monitor } from "lucide-react";
import styles from "./page.module.css";

const TR: Record<Language, any> = {
  en: {
    title: "Settings",
    subtitle: "Manage currency configuration and personal preferences.",
    nav: { general: "General", appearance: "Appearance", notifications: "Notifications", account: "Account & Security", about: "About" },
    general: {
      title: "General",
      language: "Language",
      languageDesc: "Personal R.V.B preference — only affects your account.",
      currency: "Currency",
      currencyDesc: "Company business setting — managed by Manager/Admin.",
      shared: "Personal",
      currencyShared: "Company setting",
      confirmLangTitle: "Change language?",
      confirmLangDesc: "This will update your personal R.V.B language preference.",
      confirmCurrTitle: "Change currency?",
      confirmCurrDesc: "This will update company currency for all R.V.B users.",
      cancel: "Cancel", apply: "Apply",
    },
    appearance: { title: "Appearance", desc: "Choose how R.V.B looks.", light: "Light", dark: "Dark", lightDesc: "Bright cream interface", darkDesc: "Dark comfort mode", preview: "Preview" },
    notifications: {
      title: "Notification preferences",
      desc: "Control which notifications you receive. Preferences only affect optional notifications you are eligible for.",
      chats: "Chat messages", chatsDesc: "Direct and group messages",
      mentions: "Mentions & replies", mentionsDesc: "When you are mentioned or replied to",
      requests: "Requests", requestsDesc: "Worker/Supplier/Customer request updates you can act on or submitted",
      orders: "Orders", ordersDesc: "Customer order status you are eligible to see",
      statusUpdates: "Status updates", statusDesc: "General system status updates",
      reminders: "Reminder notifications", remindersDesc: "Scheduled mention reminders (30/60/120 min)",
      saved: "Preferences saved",
    },
    account: {
      title: "Account & Security",
      profile: "Profile",
      displayName: "Display name",
      tag: "Tag",
      role: "Role",
      status: "Status",
      linked: "Linked entity",
      notLinked: "Not linked",
      changePhoto: "Change Photo",
      removePhoto: "Remove",
      editName: "Save name",
      nameSaved: "Display name updated",
      password: "Change password",
      current: "Current password",
      newPass: "New password",
      confirm: "Confirm password",
      change: "Change password",
      changed: "Password changed successfully",
      sessions: "Sessions",
      currentSession: "Current Session",
      otherSessions: "Other Sessions",
      revokeOthers: "Sign out other sessions",
      revoked: "Other sessions revoked",
      logout: "Log Out",
      show: "Show", hide: "Hide",
    },
    about: {
      title: "About",
      rvb: "R.V.B — The Kingdom of White Meat",
      desc: "R.V.B is the management portal for white meat operations.",
      version: "Version",
      env: "Environment",
      sharedNote: "Language and theme are personal R.V.B preferences. Currency is a company setting managed by Manager/Admin. R.V.B does not use H.S.H offline storage.",
      openHsh: "Open H.S.H workspace",
    },
    common: { sharedBadge: "Personal", save: "Save", saving: "Saving...", error: "Failed to save", retry: "Retry" },
  },
  fr: {
    title: "Paramètres",
    subtitle: "Gérez la devise d'entreprise et vos préférences personnelles.",
    nav: { general: "Général", appearance: "Apparence", notifications: "Notifications", account: "Compte et sécurité", about: "À propos" },
    general: {
      title: "Général",
      language: "Langue",
      languageDesc: "Préférence personnelle R.V.B — n'affecte que votre compte.",
      currency: "Devise",
      currencyDesc: "Paramètre d'entreprise — géré par Manager/Admin.",
      shared: "Personnel",
      currencyShared: "Paramètre d'entreprise",
      confirmLangTitle: "Changer la langue ?",
      confirmLangDesc: "Cela mettra à jour votre préférence linguistique personnelle.",
      confirmCurrTitle: "Changer la devise ?",
      confirmCurrDesc: "Cela mettra à jour la devise de l'entreprise pour tous les utilisateurs R.V.B.",
      cancel: "Annuler", apply: "Appliquer",
    },
    appearance: { title: "Apparence", desc: "Choisissez l'apparence de R.V.B.", light: "Clair", dark: "Sombre", lightDesc: "Interface claire crème", darkDesc: "Mode sombre", preview: "Aperçu" },
    notifications: {
      title: "Préférences de notification",
      desc: "Contrôlez les notifications que vous recevez. Ces préférences n'affectent que les notifications optionnelles auxquelles vous êtes éligible.",
      chats: "Messages chat", chatsDesc: "Messages directs et de groupe",
      mentions: "Mentions et réponses", mentionsDesc: "Quand vous êtes mentionné",
      requests: "Demandes", requestsDesc: "Mises à jour des demandes",
      orders: "Commandes", ordersDesc: "Statuts des commandes",
      statusUpdates: "Mises à jour statut", statusDesc: "Mises à jour système",
      reminders: "Rappels", remindersDesc: "Rappels planifiés",
      saved: "Préférences enregistrées",
    },
    account: {
      title: "Compte et sécurité",
      profile: "Profil",
      displayName: "Nom d'affichage",
      tag: "Tag",
      role: "Rôle",
      status: "Statut",
      linked: "Entité liée",
      notLinked: "Non lié",
      changePhoto: "Changer photo",
      removePhoto: "Retirer",
      editName: "Enregistrer",
      nameSaved: "Nom mis à jour",
      password: "Changer le mot de passe",
      current: "Mot de passe actuel",
      newPass: "Nouveau mot de passe",
      confirm: "Confirmer",
      change: "Changer",
      changed: "Mot de passe changé",
      sessions: "Sessions",
      currentSession: "Session actuelle",
      otherSessions: "Autres sessions",
      revokeOthers: "Déconnecter autres sessions",
      revoked: "Autres sessions révoquées",
      logout: "Se déconnecter",
      show: "Afficher", hide: "Masquer",
    },
    about: {
      title: "À propos",
      rvb: "R.V.B — Le Royaume des Viandes Blanches",
      desc: "Portail de gestion des opérations viandes blanches.",
      version: "Version",
      env: "Environnement",
      sharedNote: "La langue et le thème sont des préférences personnelles R.V.B. La devise est un paramètre d'entreprise géré par le Manager/Admin. R.V.B n'utilise pas le stockage hors ligne H.S.H.",
      openHsh: "Ouvrir H.S.H",
    },
    common: { sharedBadge: "Personnel", save: "Enregistrer", saving: "Enregistrement...", error: "Échec", retry: "Réessayer" },
  },
  ar: {
    title: "الإعدادات",
    subtitle: "إدارة إعدادات العملة وتفضيلاتك الشخصية.",
    nav: { general: "عام", appearance: "المظهر", notifications: "الإشعارات", account: "الحساب والأمان", about: "حول" },
    general: {
      title: "عام",
      language: "اللغة",
      languageDesc: "تفضيل شخصي لـ R.V.B — يؤثر على حسابك فقط.",
      currency: "العملة",
      currencyDesc: "إعداد شركة — يُدار بواسطة المدير/المسؤول.",
      shared: "شخصي",
      currencyShared: "إعداد الشركة",
      confirmLangTitle: "تغيير اللغة؟",
      confirmLangDesc: "سيؤدي هذا إلى تحديث تفضيل اللغة الشخصي الخاص بك.",
      confirmCurrTitle: "تغيير العملة؟",
      confirmCurrDesc: "سيؤدي هذا إلى تحديث عملة الشركة لجميع مستخدمي R.V.B.",
      cancel: "إلغاء", apply: "تطبيق",
    },
    appearance: { title: "المظهر", desc: "اختر مظهر R.V.B.", light: "فاتح", dark: "داكن", lightDesc: "واجهة فاتحة", darkDesc: "وضع داكن", preview: "معاينة" },
    notifications: {
      title: "تفضيلات الإشعارات",
      desc: "تحكم في الإشعارات التي تتلقاها. تؤثر فقط على الإشعارات الاختيارية التي تستحقها.",
      chats: "رسائل الدردشة", chatsDesc: "الرسائل المباشرة والجماعية",
      mentions: "الإشارات والردود", mentionsDesc: "عند ذكرك",
      requests: "الطلبات", requestsDesc: "تحديثات الطلبات",
      orders: "الطلبيات", ordersDesc: "حالات الطلبيات",
      statusUpdates: "تحديثات الحالة", statusDesc: "تحديثات النظام",
      reminders: "التذكيرات", remindersDesc: "تذكيرات مجدولة",
      saved: "تم حفظ التفضيلات",
    },
    account: {
      title: "الحساب والأمان",
      profile: "الملف الشخصي",
      displayName: "الاسم المعروض",
      tag: "الوسم",
      role: "الدور",
      status: "الحالة",
      linked: "الكيان المرتبط",
      notLinked: "غير مرتبط",
      changePhoto: "تغيير الصورة",
      removePhoto: "إزالة",
      editName: "حفظ",
      nameSaved: "تم تحديث الاسم",
      password: "تغيير كلمة المرور",
      current: "كلمة المرور الحالية",
      newPass: "كلمة المرور الجديدة",
      confirm: "تأكيد",
      change: "تغيير",
      changed: "تم تغيير كلمة المرور",
      sessions: "الجلسات",
      currentSession: "الجلسة الحالية",
      otherSessions: "جلسات أخرى",
      revokeOthers: "تسجيل خروج الجلسات الأخرى",
      revoked: "تم إنهاء الجلسات الأخرى",
      logout: "تسجيل الخروج",
      show: "إظهار", hide: "إخفاء",
    },
    about: {
      title: "حول",
      rvb: "R.V.B — مملكة اللحوم البيضاء",
      desc: "بوابة إدارة عمليات اللحوم البيضاء.",
      version: "الإصدار",
      env: "البيئة",
      sharedNote: "اللغة والمظهر تفضيلات شخصية لـ R.V.B. العملة إعداد شركة يُدار بواسطة المدير/المسؤول. لا يستخدم R.V.B تخزين H.S.H غير المتصل.",
      openHsh: "فتح H.S.H",
    },
    common: { sharedBadge: "شخصي", save: "حفظ", saving: "جارٍ الحفظ...", error: "فشل", retry: "إعادة" },
  },
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={checked ? "toggleOn" : "toggleOff"}
      style={{
        width: 44, height: 26, borderRadius: 999, border: "1px solid var(--border)", background: checked ? "var(--accent)" : "var(--panel-hover)", position: "relative", cursor: "pointer", transition: "all 0.2s", flex: "0 0 44px",
      }}
    >
      <span style={{ position: "absolute", top: 2, insetInlineStart: checked ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "inset-inline-start 0.2s" }} />
    </button>
  );
}

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function SettingsInner() {
  const router = useRouter();
  const { user, logout, changePassword, setUser } = useRvbAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [dark, setDark] = useState(() => {
    try { return getSavedTheme() === "dark"; } catch { return false; }
  });
  const lang = (settings.language as Language) || "en";
  const t = (TR as any)[lang] ?? TR.en;
  const isRtl = lang === "ar";
  const [active, setActive] = useState<"general" | "appearance" | "notifications" | "account" | "about">("general");
  const [pending, setPending] = useState<null | { type: "language"; oldValue: Language; newValue: Language } | { type: "currency"; oldValue: Currency; newValue: Currency }>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({ chats: true, mentions: true, requests: true, orders: true, statusUpdates: true, reminders: true });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifMsg, setNotifMsg] = useState("");
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSid, setCurrentSid] = useState<string | null>(null);
  const [pfpUploading, setPfpUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load RVB presentation settings: language from account preferences, currency from company config
  useEffect(() => {
    rvbUiPreferencesService.get().then((s) => { if (s) setSettings(s); }).catch(()=>{});
    // Also sync currency explicitly from config for freshness
    import("@/src/services/rvb-config.service").then(({ rvbConfigService }) => {
      rvbConfigService.get().then((cfg) => {
        if (cfg?.currency) setSettings((prev) => ({ ...prev, currency: cfg.currency as any }));
      }).catch(()=>{});
    }).catch(()=>{});
    const h = (e: Event) => {
      const ce = e as CustomEvent<Settings>;
      if (ce?.detail) setSettings(ce.detail);
    };
    window.addEventListener(RVB_UI_PREFERENCES_EVENT, h as any);
    const themeH = () => setDark(getSavedTheme() === "dark");
    window.addEventListener("hebrih-theme-change", themeH);
    window.addEventListener("storage", themeH);
    return () => { window.removeEventListener(RVB_UI_PREFERENCES_EVENT, h as any); window.removeEventListener("hebrih-theme-change", themeH); window.removeEventListener("storage", themeH); };
  }, []);

  // Load personal prefs
  useEffect(() => {
    rvbAuthService.getPreferences().then((p) => {
      const n = (p as any)?.notifications;
      if (n) setNotifPrefs((prev) => ({ ...prev, ...n }));
    }).catch(() => {});
    rvbAuthService.getSessions().then((r) => { setSessions(r.sessions); setCurrentSid(r.currentSessionId); }).catch(() => {});
  }, []);

  useEffect(() => { setDisplayName(user?.displayName || ""); }, [user?.displayName]);

  const handleLangSelect = (v: Language) => {
    if (v === settings.language) return;
    setPending({ type: "language", oldValue: settings.language, newValue: v });
  };
  const handleCurrSelect = (v: Currency) => {
    if (v === settings.currency) return;
    // Only manager/admin may change currency; guard UI will disable for others
    setPending({ type: "currency", oldValue: settings.currency, newValue: v });
  };
  const confirmPending = async () => {
    if (!pending || confirmLoading) return;
    setConfirmLoading(true);
    try {
      if (pending.type === "currency") {
        const { rvbConfigService } = await import("@/src/services/rvb-config.service");
        await rvbConfigService.update({ currency: pending.newValue });
        const next: Settings = { ...settings, currency: pending.newValue };
        setSettings(next);
        window.dispatchEvent(new CustomEvent(RVB_UI_PREFERENCES_EVENT, { detail: next }));
        setPending(null);
      } else {
        // Language: personal RVB preference via account ui preferences
        await rvbUiPreferencesService.setLanguage(pending.newValue);
        const next: Settings = { ...settings, language: pending.newValue };
        setSettings(next);
        document.documentElement.lang = next.language;
        document.documentElement.dir = getDirection(next.language);
        // rvbUiPreferencesService already dispatched event, but ensure
        window.dispatchEvent(new CustomEvent(RVB_UI_PREFERENCES_EVENT, { detail: next }));
        setPending(null);
      }
    } catch (e: any) {
      alert(e?.code || e?.message || "Failed to save");
    } finally { setConfirmLoading(false); if (pending && !confirmLoading) setPending(null); }
  };

  const toggleTheme = async (val: "light" | "dark") => {
    applyTheme(val);
    setDark(val === "dark");
    try { await rvbUiPreferencesService.setTheme(val); } catch {}
  };

  const handleNotifToggle = async (key: string, val: boolean) => {
    const next = { ...notifPrefs, [key]: val };
    setNotifPrefs(next);
    setNotifSaving(true);
    setNotifMsg("");
    try {
      await rvbAuthService.updatePreferences(next);
      setNotifMsg(t.notifications.saved);
      setTimeout(() => setNotifMsg(""), 2000);
    } catch (e: any) {
      setNotifPrefs((prev) => ({ ...prev, [key]: !val }));
    } finally { setNotifSaving(false); }
  };

  const handleSaveName = async () => {
    if (!displayName.trim() || displayName.trim() === user?.displayName) return;
    setSavingName(true);
    setNameMsg("");
    try {
      const acc = await rvbAuthService.updateProfile({ displayName: displayName.trim() });
      setUser(acc as any);
      setNameMsg(t.account.nameSaved);
      setTimeout(() => setNameMsg(""), 2000);
    } catch (e: any) {
      setNameMsg(e?.code || "Failed");
    } finally { setSavingName(false); }
  };

  const handlePfpChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("Image too large (2MB max)"); return; }
    setPfpUploading(true);
    try {
      // Canvas compress to 512 max similar to onboarding for consistency and <200k guidance
      const compressed: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("read failed"));
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const img = new window.Image();
          img.onerror = () => resolve(dataUrl); // fallback to original if cant process
          img.onload = () => {
            try {
              const w = img.width, h = img.height;
              const size = Math.min(w, h) || 512;
              const sx = (w - size) / 2;
              const sy = (h - size) / 2;
              const canvasSize = 512;
              const canvas = document.createElement("canvas");
              canvas.width = canvasSize;
              canvas.height = canvasSize;
              const ctx = canvas.getContext("2d");
              if (!ctx) { resolve(dataUrl); return; }
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, canvasSize, canvasSize);
              ctx.drawImage(img, sx, sy, size, size, 0, 0, canvasSize, canvasSize);
              // try jpeg qualities to keep <200k
              const qualities = [0.85, 0.7, 0.55];
              for (const q of qualities) {
                const out = canvas.toDataURL("image/jpeg", q);
                if (out.length < 200000) { resolve(out); return; }
              }
              const out = canvas.toDataURL("image/jpeg", 0.5);
              resolve(out);
            } catch { resolve(dataUrl); }
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      });
      const acc = await rvbAuthService.updateProfile({ profilePicture: compressed });
      setUser(acc as any);
    } catch (e: any) {
      const msg = e?.code === "RVB_PROFILE_PICTURE_REQUIRED" ? "Photo is required — cannot remove. Please choose a replacement." : (e?.message || "Upload failed");
      alert(msg);
    } finally { setPfpUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const handleRemovePfp = async () => {
    // After onboarding, replace photo allowed but not leave without photo - require replacement
    if ((user as any)?.onboardingStatus === "complete") {
      alert("Cannot remove profile picture after onboarding — please replace it with a new photo.");
      return;
    }
    setPfpUploading(true);
    try {
      const acc = await rvbAuthService.updateProfile({ profilePicture: null as any });
      setUser(acc as any);
    } catch (e: any) {
      alert(e?.code || e?.message || "Remove failed");
    } finally { setPfpUploading(false); }
  };

  const handleChangePw = async () => {
    setPwError(""); setPwMsg("");
    if (!currentPw || !newPw || !confirmPw) { setPwError("All fields required"); return; }
    if (newPw.length < 8 || newPw.length > 128) { setPwError("8–128 characters"); return; }
    setPwLoading(true);
    try {
      await changePassword({ currentPassword: currentPw, newPassword: newPw, confirmPassword: confirmPw });
      setPwMsg(t.account.changed);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setTimeout(() => setPwMsg(""), 2500);
    } catch (e: any) {
      setPwError(e?.code || e?.message || "Failed");
    } finally { setPwLoading(false); }
  };

  const handleRevokeOthers = async () => {
    await rvbAuthService.revokeOtherSessions();
    const r = await rvbAuthService.getSessions();
    setSessions(r.sessions);
    setCurrentSid(r.currentSessionId);
  };

  const roleLabel = (role?: string) => {
    const map: any = t.account && (TR as any).en.account ? null : null;
    // Use TR role labels via appearance? simple capitalize
    if (!role) return "—";
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const navItems: Array<{ id: typeof active; label: string; icon: any }> = [
    { id: "general", label: t.nav.general, icon: SettingsIcon },
    { id: "appearance", label: t.nav.appearance, icon: Palette },
    { id: "notifications", label: t.nav.notifications, icon: Bell },
    { id: "account", label: t.nav.account, icon: Shield },
    { id: "about", label: t.nav.about, icon: Info },
  ];

  return (
    <RvbShell activePage="settings">
      <div className={styles.settingsRoot} dir={isRtl ? "rtl" : "ltr"}>
        <div className={styles.layout}>
          <nav className={styles.sidebar} aria-label="Settings navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button key={item.id} type="button" className={`${styles.navItem} ${isActive ? styles.navActive : ""}`} onClick={() => setActive(item.id)} aria-current={isActive ? "page" : undefined}>
                  <Icon size={18} strokeWidth={2} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className={styles.content}>
            {/* Mobile top segmented */}
            <div className={styles.mobileNav} role="tablist">
              {navItems.map((item) => (
                <button key={item.id} role="tab" aria-selected={active === item.id} className={`${styles.mobileTab} ${active === item.id ? styles.mobileTabActive : ""}`} onClick={() => setActive(item.id)}>{item.label}</button>
              ))}
            </div>

            {active === "general" && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>{t.general.title}</h2>
                <div className={styles.card}>
                  <div className={styles.row}>
                    <div className={styles.rowText}>
                      <strong><Globe size={16} /> {t.general.language}</strong>
                      <span>{t.general.languageDesc}</span>
                      <small className={styles.sharedBadge}>{t.general.shared}</small>
                    </div>
                    <div style={{ minWidth: 180 }}>
                      <StyledSelect value={settings.language} onChange={(v) => handleLangSelect(v as Language)} ariaLabel={t.general.language} options={[{ value: "en", label: "English" }, { value: "fr", label: "Français" }, { value: "ar", label: "العربية" }]} />
                    </div>
                  </div>
                  <div className={styles.divider} />
                  <div className={styles.row}>
                    <div className={styles.rowText}>
                      <strong>¤ {t.general.currency}</strong>
                      <span>{t.general.currencyDesc}</span>
                      <small className={styles.sharedBadge}>{(t.general as any).currencyShared || t.general.shared}</small>
                    </div>
                    <div style={{ minWidth: 180 }}>
                      {user && (user.role === "manager" || user.role === "admin") ? (
                        <StyledSelect value={settings.currency} onChange={(v) => handleCurrSelect(v as Currency)} ariaLabel={t.general.currency} options={[{ value: "DA", label: "DA — Algerian Dinar" }, { value: "€", label: "€ — Euro" }, { value: "$", label: "$ — US Dollar" }]} />
                      ) : (
                        <div style={{ minHeight: 38, display: "grid", placeItems: "center", padding: "0 12px", border: "1px solid var(--border)", borderRadius: 9, background: "var(--panel-hover)", color: "var(--muted)", fontSize: 13, fontWeight: 700 }}>{settings.currency} — read-only</div>
                      )}
                    </div>
                  </div>
                  {user && !(user.role === "manager" || user.role === "admin") && (
                    <small style={{ color: "var(--muted)", fontSize: 11, marginTop: 6, display: "block" }}>Currency is a company setting — only Manager/Admin can change it.</small>
                  )}
                </div>
              </div>
            )}

            {active === "appearance" && (
              <ThemeAppearanceSelector language={lang} dark={dark} onThemeChange={(v) => setDark(v === "dark")} />
            )}

            {active === "notifications" && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>{t.notifications.title}</h2>
                <p className={styles.sectionDesc}>{t.notifications.desc}</p>
                <div className={styles.card}>
                  {[
                    { key: "chats", label: t.notifications.chats, desc: t.notifications.chatsDesc },
                    { key: "mentions", label: t.notifications.mentions, desc: t.notifications.mentionsDesc },
                    { key: "requests", label: t.notifications.requests, desc: t.notifications.requestsDesc },
                    { key: "orders", label: t.notifications.orders, desc: t.notifications.ordersDesc },
                    { key: "statusUpdates", label: t.notifications.statusUpdates, desc: t.notifications.statusDesc },
                    { key: "reminders", label: t.notifications.reminders, desc: t.notifications.remindersDesc },
                  ].map((item) => (
                    <div key={item.key} className={styles.notifRow}>
                      <div className={styles.rowText}>
                        <strong>{item.label}</strong>
                        <span>{item.desc}</span>
                      </div>
                      <Toggle checked={!!notifPrefs[item.key]} onChange={(v) => void handleNotifToggle(item.key, v)} label={item.label} />
                    </div>
                  ))}
                  {notifMsg && <small style={{ color: "var(--success)" }}>{notifMsg}</small>}
                  {notifSaving && <small style={{ color: "var(--muted)" }}>Saving...</small>}
                </div>
              </div>
            )}

            {active === "account" && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>{t.account.title}</h2>
                <div className={styles.card}>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={styles.avatarLarge} aria-hidden="true">
                      {user?.profilePicture ? <img src={user.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(user?.displayName || "?")}
                    </span>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <strong style={{ display: "block", fontSize: 16 }}>{user?.displayName}</strong>
                      <span dir="ltr" style={{ color: "var(--muted)", fontSize: 13 }}>@{user?.tag}</span>
                      <span style={{ display: "inline-block", marginInlineStart: 8, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--panel-hover)", fontSize: 11, fontWeight: 700 }}>{roleLabel(user?.role)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePfpChange} />
                      <button type="button" className={styles.secondaryButton} onClick={() => fileRef.current?.click()} disabled={pfpUploading}><ImageIcon size={14} /> {t.account.changePhoto}</button>
                      {user?.profilePicture && (user as any).onboardingStatus !== "complete" && <button type="button" className={styles.secondaryButton} onClick={handleRemovePfp} disabled={pfpUploading}><X size={14} /> {t.account.removePhoto}</button>}
                    </div>
                  </div>
                  <div className={styles.divider} />
                  <div className={styles.fieldRow}>
                    <label>{t.account.displayName}</label>
                    <div style={{ display: "flex", gap: 8, flex: 1 }}>
                      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t.account.displayName} style={{ flex: 1, height: 38, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 9, background: "var(--panel)" }} />
                      <button type="button" className={styles.primaryButton} onClick={handleSaveName} disabled={savingName || !displayName.trim() || displayName.trim() === user?.displayName}>{savingName ? t.common.saving : t.account.editName}</button>
                    </div>
                  </div>
                  {nameMsg && <small style={{ color: "var(--success)" }}>{nameMsg}</small>}
                  <div className={styles.infoGrid}>
                    <div><small>{t.account.tag}</small><strong dir="ltr">@{user?.tag}</strong><small style={{ color: "var(--subtle)" }}>Permanent</small></div>
                    <div><small>{t.account.role}</small><strong>{roleLabel(user?.role)}</strong></div>
                    <div><small>{t.account.status}</small><strong>{user?.status}</strong></div>
                    <div><small>{t.account.linked}</small><strong>{user?.linkedEntityType ? `${user.linkedEntityType} ${String(user.linkedEntityId).slice(0, 8)}` : t.account.notLinked}</strong></div>
                  </div>
                </div>

                <div className={styles.card}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}><KeyRound size={16} style={{ verticalAlign: "middle", marginInlineEnd: 6 }} /> {t.account.password}</h3>
                  <div className={styles.fieldRow}><label>{t.account.current}</label><div style={{ position: "relative", flex: 1, display: "flex" }}><input type={showPw ? "text" : "password"} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder={t.account.current} style={{ flex: 1, height: 38, padding: "0 36px 0 12px", border: "1px solid var(--border)", borderRadius: 9 }} /><button type="button" onClick={() => setShowPw((v) => !v)} style={{ position: "absolute", insetInlineEnd: 6, top: 6, width: 26, height: 26, display: "grid", placeItems: "center", border: 0, background: "transparent", cursor: "pointer" }}>{showPw ? <EyeOff size={14} /> : <Eye size={14} />}</button></div></div>
                  <div className={styles.fieldRow}><label>{t.account.newPass}</label><input type={showPw ? "text" : "password"} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder={t.account.newPass} style={{ flex: 1, height: 38, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 9 }} /></div>
                  <div className={styles.fieldRow}><label>{t.account.confirm}</label><input type={showPw ? "text" : "password"} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder={t.account.confirm} style={{ flex: 1, height: 38, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 9 }} /></div>
                  {pwError && <small style={{ color: "var(--danger)" }}>{pwError}</small>}
                  {pwMsg && <small style={{ color: "var(--success)" }}>{pwMsg}</small>}
                  <button type="button" className={styles.primaryButton} onClick={handleChangePw} disabled={pwLoading}>{pwLoading ? t.common.saving : t.account.change}</button>
                </div>

                <div className={styles.card}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}><Monitor size={16} style={{ verticalAlign: "middle", marginInlineEnd: 6 }} /> {t.account.sessions}</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {sessions.length === 0 ? <small style={{ color: "var(--muted)" }}>No active sessions</small> : sessions.map((s) => (
                      <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 9, background: s.isCurrent ? "var(--accent-soft)" : "var(--panel)" }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ display: "block", fontSize: 12 }}>{s.isCurrent ? t.account.currentSession : t.account.otherSessions} {s.isCurrent ? "· " + s.id.slice(0, 8) : ""}</strong>
                          <small style={{ color: "var(--muted)" }}>{s.userAgent ? s.userAgent.slice(0, 60) : "Unknown device"} · {new Date(s.lastUsedAt).toLocaleString()}</small>
                        </span>
                        {s.isCurrent && <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 999, background: "var(--accent)", color: "#fff" }}>Current</span>}
                      </div>
                    ))}
                  </div>
                  {sessions.filter((s) => !s.isCurrent).length > 0 && <button type="button" className={styles.secondaryButton} onClick={handleRevokeOthers} style={{ alignSelf: "flex-start" }}><LogOut size={14} /> {t.account.revokeOthers}</button>}
                </div>

                <div className={styles.card} style={{ borderColor: "var(--border)" }}>
                  <button type="button" className={styles.dangerButton} onClick={async () => { await logout(); }}><LogOut size={16} /> {t.account.logout}</button>
                </div>
              </div>
            )}

            {active === "about" && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>{t.about.title}</h2>
                <div className={styles.card} style={{ textAlign: "center", gap: 12 }}>
                  <div style={{ width: 64, height: 64, margin: "0 auto", borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)" }}><img src="/chicken.jpg" alt="RVB logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></div>
                  <h3 style={{ margin: 0 }}>{t.about.rvb}</h3>
                  <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>{t.about.desc}</p>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", fontSize: 12, color: "var(--muted)" }}>
                    <span>{t.about.version}: 1.1.0</span>
                    <span>{t.about.env}: {process.env.NODE_ENV || "development"}</span>
                  </div>
                  <small style={{ color: "var(--muted)", lineHeight: 1.5 }}>{t.about.sharedNote}</small>
                  <button type="button" className={styles.secondaryButton} onClick={() => router.push("/")} style={{ alignSelf: "center" }}>{t.about.openHsh}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {pending && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.42)", display: "grid", placeItems: "center", zIndex: 1000 }} onClick={() => !confirmLoading && setPending(null)}>
          <div style={{ width: "min(420px, 92vw)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: 18 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{pending.type === "language" ? t.general.confirmLangTitle : t.general.confirmCurrTitle}</h3>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>{pending.type === "language" ? t.general.confirmLangDesc : t.general.confirmCurrDesc}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className={styles.secondaryButton} onClick={() => setPending(null)} disabled={confirmLoading} style={{ flex: 1 }}>{t.general.cancel}</button>
              <button className={styles.primaryButton} onClick={confirmPending} disabled={confirmLoading} style={{ flex: 1 }}>{confirmLoading ? t.common.saving : t.general.apply}</button>
            </div>
          </div>
        </div>
      )}
    </RvbShell>
  );
}

export default function RvbSettingsPageWrapper() {
  return (
    <RvbAuthGuard>
      <SettingsInner />
    </RvbAuthGuard>
  );
}

