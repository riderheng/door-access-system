import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle, Users, Settings, Bell, BarChart3, Loader2,
  Search, Plus, UserX, UserCheck, GraduationCap,
  Download, RefreshCw, Send, Eye, CheckCircle2,
  Pencil, Shield, ClipboardList, Trash2, Clock,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createStudentSchema = z.object({
  studentId: z.string().min(1, "กรุณากรอกรหัสนักศึกษา"),
  firstName: z.string().min(1, "กรุณากรอกชื่อ"),
  lastName: z.string().min(1, "กรุณากรอกนามสกุล"),
  email: z.string().email("อีเมลไม่ถูกต้อง").optional().or(z.literal("")),
  phone: z.string().optional(),
  year: z.enum(["1", "2", "3", "4"]),
  branch: z.string().min(1, "กรุณากรอกสาขา"),
});
type CreateStudentForm = z.infer<typeof createStudentSchema>;

const updateStudentSchema = z.object({
  studentId: z.string().min(1, "กรุณากรอกรหัสนักศึกษา"),
  firstName: z.string().min(1, "กรุณากรอกชื่อ"),
  lastName: z.string().min(1, "กรุณากรอกนามสกุล"),
  email: z.string().email("อีเมลไม่ถูกต้อง").optional().or(z.literal("")),
  phone: z.string().optional(),
  year: z.enum(["1", "2", "3", "4"]),
  branch: z.string().min(1, "กรุณากรอกสาขา"),
});
type UpdateStudentForm = z.infer<typeof updateStudentSchema>;

const addAdminSchema = z.object({
  userId: z.number().min(1, "กรุณาเลือกผู้ใช้"),
  role: z.enum(["super_admin", "admin", "moderator"]),
  reason: z.string().min(1, "กรุณากรอกเหตุผล"),
});
type AddAdminForm = z.infer<typeof addAdminSchema>;

// ─── Types ────────────────────────────────────────────────────────────────────

type NotifType = "line" | "telegram" | "slack" | "email";
type NotifForm = { webhookUrl: string; isEnabled: boolean; eventTypes: string[] };

const NOTIF_CHANNELS: { type: NotifType; label: string; placeholder: string }[] = [
  { type: "line", label: "LINE Notify", placeholder: "https://notify-api.line.me/api/notify" },
  { type: "telegram", label: "Telegram Bot", placeholder: "https://api.telegram.org/bot<TOKEN>/sendMessage" },
  { type: "slack", label: "Slack Webhook", placeholder: "https://hooks.slack.com/services/..." },
  { type: "email", label: "Email", placeholder: "admin@example.com" },
];

const EVENT_TYPES = [
  { value: "entry", label: "เข้าห้อง" },
  { value: "exit", label: "ออกห้อง" },
  { value: "door_alert", label: "ประตูไม่ปิดสนิท" },
  { value: "unauthorized", label: "การเข้าที่ไม่ได้รับอนุญาต" },
];

const ROOMS = ["room_101", "room_102", "room_103", "room_104"];

const DAYS_OF_WEEK = [
  { value: 0, label: "อาทิตย์" },
  { value: 1, label: "จันทร์" },
  { value: 2, label: "อังคาร" },
  { value: 3, label: "พุธ" },
  { value: 4, label: "พฤหัสบดี" },
  { value: 5, label: "ศุกร์" },
  { value: 6, label: "เสาร์" },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  moderator: "Moderator",
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-red-100 text-red-800 hover:bg-red-100",
  admin: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  moderator: "bg-purple-100 text-purple-800 hover:bg-purple-100",
};

const DEFAULT_NOTIF_FORM: NotifForm = {
  webhookUrl: "",
  isEnabled: false,
  eventTypes: ["entry", "exit"],
};

type ScheduleRow = { startTime: string; endTime: string; isEnabled: boolean; dirty: boolean };
type ScheduleMap = Record<number, ScheduleRow>;

function defaultScheduleMap(): ScheduleMap {
  const map: ScheduleMap = {};
  for (const d of DAYS_OF_WEEK) {
    map[d.value] = { startTime: "08:00", endTime: "17:00", isEnabled: false, dirty: false };
  }
  return map;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { user } = useAuth();

  // ── Settings state ──
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const { data: settings, isLoading: settingsFetching } = trpc.admin.getSettings.useQuery();
  const updateSettingsMutation = trpc.admin.updateSettings.useMutation();
  const [qrExpiration, setQrExpiration] = useState<number>(15);
  const [reentryWindow, setReentryWindow] = useState<number>(5);
  const [doorAlertEnabled, setDoorAlertEnabled] = useState<boolean>(true);

  // ── Schedule state ──
  const [scheduleRoom, setScheduleRoom] = useState<string>(ROOMS[0]);
  const [scheduleMap, setScheduleMap] = useState<ScheduleMap>(defaultScheduleMap());
  const [savingDay, setSavingDay] = useState<number | null>(null);
  const { data: scheduleData, refetch: refetchSchedule } = trpc.admin.getAccessSchedules.useQuery(
    { roomId: scheduleRoom },
    { enabled: !!scheduleRoom }
  );
  const setAccessScheduleMutation = trpc.admin.setAccessSchedule.useMutation();

  useEffect(() => {
    if (settings) {
      setQrExpiration(settings.qrExpirationMinutes);
      setReentryWindow(settings.reentryWindowMinutes);
      setDoorAlertEnabled(settings.doorAlertEnabled);
    }
  }, [settings]);

  useEffect(() => {
    const next = defaultScheduleMap();
    if (scheduleData) {
      for (const s of scheduleData) {
        next[s.dayOfWeek] = {
          startTime: s.startTime,
          endTime: s.endTime,
          isEnabled: s.isEnabled ?? false,
          dirty: false,
        };
      }
    }
    setScheduleMap(next);
  }, [scheduleData, scheduleRoom]);

  // ── Stats ──
  const { data: stats } = trpc.access.getStats.useQuery(undefined, { refetchInterval: 30000 });

  // ── Students state ──
  const [studentSearch, setStudentSearch] = useState("");
  const [studentStatusFilter, setStudentStatusFilter] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<{ id: number; firstName: string; lastName: string } | null>(null);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [editStudentData, setEditStudentData] = useState<{
    id: number; studentId: string; firstName: string; lastName: string;
    email: string; phone: string; year: "1"|"2"|"3"|"4"; branch: string;
  } | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [deleteStudentId, setDeleteStudentId] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: allStudents, isLoading: studentsLoading, refetch: refetchStudents } =
    trpc.students.listAll.useQuery();
  const createMutation = trpc.students.create.useMutation();
  const updateStudentMutation = trpc.students.update.useMutation();
  const updateStatusMutation = trpc.students.updateStudentStatus.useMutation();
  const deleteStudentMutation = trpc.students.delete.useMutation();

  const { data: studentLogs, isLoading: studentLogsLoading } = trpc.students.getAccessLogs.useQuery(
    { studentId: selectedStudent?.id ?? 0, limit: 20 },
    { enabled: !!selectedStudent && showLogsDialog }
  );

  const studentForm = useForm<CreateStudentForm>({ resolver: zodResolver(createStudentSchema) });
  const editStudentForm = useForm<UpdateStudentForm>({ resolver: zodResolver(updateStudentSchema) });

  const filteredStudents = (allStudents ?? []).filter(s => {
    const matchSearch = !studentSearch ||
      s.firstName.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.lastName.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.studentId.includes(studentSearch);
    const matchStatus = studentStatusFilter === "all" || s.status === studentStatusFilter;
    return matchSearch && matchStatus;
  });

  // ── Notifications state ──
  const { data: notifSettings, refetch: refetchNotif } = trpc.notifications.getSettings.useQuery();
  const upsertNotifMutation = trpc.notifications.upsertSetting.useMutation();
  const testNotifMutation = trpc.notifications.testNotification.useMutation();
  const [notifForms, setNotifForms] = useState<Record<NotifType, NotifForm>>({
    line: { ...DEFAULT_NOTIF_FORM },
    telegram: { ...DEFAULT_NOTIF_FORM },
    slack: { ...DEFAULT_NOTIF_FORM },
    email: { ...DEFAULT_NOTIF_FORM },
  });

  useEffect(() => {
    if (notifSettings && notifSettings.length > 0) {
      setNotifForms(prev => {
        const next = { ...prev };
        for (const s of notifSettings) {
          const t = s.notificationType as NotifType;
          next[t] = {
            webhookUrl: s.webhookUrl ?? "",
            isEnabled: s.isEnabled,
            eventTypes: (() => {
              try { return JSON.parse(s.eventTypes); } catch { return []; }
            })(),
          };
        }
        return next;
      });
    }
  }, [notifSettings]);

  // ── Reports state ──
  const [reportFilters, setReportFilters] = useState({ roomId: "", dateFrom: "", dateTo: "" });
  const [reportPage, setReportPage] = useState(0);
  const PAGE_SIZE = 20;

  const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } =
    trpc.access.getAccessLogs.useQuery({
      roomId: reportFilters.roomId || undefined,
      dateFrom: reportFilters.dateFrom ? new Date(reportFilters.dateFrom) : undefined,
      dateTo: reportFilters.dateTo ? new Date(reportFilters.dateTo) : undefined,
      limit: PAGE_SIZE,
      offset: reportPage * PAGE_SIZE,
    });

  // ── Admin Management state ──
  const [showAddAdminDialog, setShowAddAdminDialog] = useState(false);
  const [editAdminData, setEditAdminData] = useState<{ adminId: number; currentRole: string; name: string } | null>(null);
  const [showEditAdminDialog, setShowEditAdminDialog] = useState(false);
  const [deleteAdminId, setDeleteAdminId] = useState<number | null>(null);
  const [deleteAdminReason, setDeleteAdminReason] = useState("");
  const [showDeleteAdminConfirm, setShowDeleteAdminConfirm] = useState(false);

  const { data: adminList, isLoading: adminsLoading, refetch: refetchAdmins } =
    trpc.adminManagement.listAdmins.useQuery();
  const { data: userList } = trpc.adminManagement.listUsers.useQuery();
  const createAdminMutation = trpc.adminManagement.createAdmin.useMutation();
  const updateAdminRoleMutation = trpc.adminManagement.updateAdminRole.useMutation();
  const deleteAdminMutation = trpc.adminManagement.deleteAdmin.useMutation();

  const addAdminForm = useForm<AddAdminForm>({ resolver: zodResolver(addAdminSchema) });

  const nonAdminUsers = (userList ?? []).filter(u =>
    !(adminList ?? []).some(a => a.id === u.id)
  );

  // ── Audit Log state ──
  const [auditSubTab, setAuditSubTab] = useState<"audit" | "activity">("audit");
  const [auditPage, setAuditPage] = useState(0);
  const AUDIT_PAGE_SIZE = 25;

  const { data: auditSummary } = trpc.auditLogs.getSummary.useQuery();
  const { data: auditLogsData, isLoading: auditLogsLoading, refetch: refetchAuditLogs } =
    trpc.auditLogs.getAuditLogs.useQuery(
      { limit: AUDIT_PAGE_SIZE, offset: auditPage * AUDIT_PAGE_SIZE },
      { enabled: auditSubTab === "audit" }
    );
  const { data: activityLogsData, isLoading: activityLogsLoading, refetch: refetchActivityLogs } =
    trpc.auditLogs.getAdminActivityLogs.useQuery(
      { limit: AUDIT_PAGE_SIZE, offset: auditPage * AUDIT_PAGE_SIZE },
      { enabled: auditSubTab === "activity" }
    );

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleUpdateSettings = async () => {
    setSettingsLoading(true);
    setSettingsMessage(null);
    try {
      await updateSettingsMutation.mutateAsync({ qrExpirationMinutes: qrExpiration, reentryWindowMinutes: reentryWindow, doorAlertEnabled });
      setSettingsMessage({ type: "success", text: "อัพเดตตั้งค่าสำเร็จ" });
    } catch (error) {
      setSettingsMessage({ type: "error", text: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" });
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSaveScheduleDay = async (dayOfWeek: number) => {
    const row = scheduleMap[dayOfWeek];
    setSavingDay(dayOfWeek);
    try {
      await setAccessScheduleMutation.mutateAsync({
        roomId: scheduleRoom,
        dayOfWeek,
        startTime: row.startTime,
        endTime: row.endTime,
        isEnabled: row.isEnabled,
      });
      setScheduleMap(prev => ({
        ...prev,
        [dayOfWeek]: { ...prev[dayOfWeek], dirty: false },
      }));
      toast.success(`บันทึกตารางเวลา ${DAYS_OF_WEEK[dayOfWeek].label} สำเร็จ`);
      refetchSchedule();
    } catch {
      toast.error("บันทึกไม่สำเร็จ");
    } finally {
      setSavingDay(null);
    }
  };

  const handleSaveAllSchedules = async () => {
    setSavingDay(-1);
    try {
      for (const d of DAYS_OF_WEEK) {
        const row = scheduleMap[d.value];
        await setAccessScheduleMutation.mutateAsync({
          roomId: scheduleRoom,
          dayOfWeek: d.value,
          startTime: row.startTime,
          endTime: row.endTime,
          isEnabled: row.isEnabled,
        });
      }
      setScheduleMap(prev => {
        const next = { ...prev };
        for (const d of DAYS_OF_WEEK) next[d.value] = { ...next[d.value], dirty: false };
        return next;
      });
      toast.success("บันทึกตารางเวลาทั้งหมดสำเร็จ");
      refetchSchedule();
    } catch {
      toast.error("บันทึกไม่สำเร็จ");
    } finally {
      setSavingDay(null);
    }
  };

  const handleCreateStudent = async (data: CreateStudentForm) => {
    try {
      await createMutation.mutateAsync({
        ...data,
        email: data.email || undefined,
        phone: data.phone || undefined,
      });
      toast.success("เพิ่มนักศึกษาสำเร็จ");
      setShowAddDialog(false);
      studentForm.reset();
      refetchStudents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleEditStudent = (s: {
    id: number; studentId: string; firstName: string; lastName: string;
    email?: string | null; phone?: string | null; year: "1"|"2"|"3"|"4"; branch: string;
  }) => {
    setEditStudentData({
      id: s.id,
      studentId: s.studentId,
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email ?? "",
      phone: s.phone ?? "",
      year: s.year,
      branch: s.branch,
    });
    editStudentForm.reset({
      studentId: s.studentId,
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email ?? "",
      phone: s.phone ?? "",
      year: s.year,
      branch: s.branch,
    });
    setShowEditDialog(true);
  };

  const handleUpdateStudent = async (data: UpdateStudentForm) => {
    if (!editStudentData) return;
    try {
      await updateStudentMutation.mutateAsync({
        id: editStudentData.id,
        ...data,
        email: data.email || null,
        phone: data.phone || null,
      });
      toast.success("แก้ไขข้อมูลนักศึกษาสำเร็จ");
      setShowEditDialog(false);
      setEditStudentData(null);
      refetchStudents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleUpdateStatus = async (id: number, status: "active" | "inactive" | "graduated") => {
    try {
      await updateStatusMutation.mutateAsync({ id, status });
      toast.success("อัพเดตสถานะสำเร็จ");
      refetchStudents();
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    }
  };

  const handleDeleteStudent = async () => {
    if (!deleteStudentId) return;
    try {
      await deleteStudentMutation.mutateAsync({ id: deleteStudentId });
      toast.success("ลบนักศึกษาสำเร็จ");
      setShowDeleteConfirm(false);
      setDeleteStudentId(null);
      refetchStudents();
    } catch {
      toast.error("ลบไม่สำเร็จ");
    }
  };

  const handleSaveNotif = async (type: NotifType) => {
    const form = notifForms[type];
    try {
      await upsertNotifMutation.mutateAsync({
        notificationType: type,
        webhookUrl: form.webhookUrl || null,
        isEnabled: form.isEnabled,
        eventTypes: form.eventTypes,
      });
      toast.success(`บันทึก ${type} สำเร็จ`);
      refetchNotif();
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    }
  };

  const handleTestNotif = async (type: NotifType) => {
    const form = notifForms[type];
    if (!form.webhookUrl) { toast.error("กรุณากรอก URL/Email ก่อน"); return; }
    try {
      await testNotifMutation.mutateAsync({ notificationType: type, webhookUrl: form.webhookUrl });
      toast.success("ส่งการทดสอบสำเร็จ");
    } catch {
      toast.error("ส่งไม่สำเร็จ — ตรวจสอบ URL อีกครั้ง");
    }
  };

  const handleExportCSV = () => {
    const logs = logsData?.logs;
    if (!logs?.length) { toast.error("ไม่มีข้อมูลสำหรับ Export"); return; }
    const headers = ["วันที่เวลา", "รหัสนักศึกษา", "ชื่อ-นามสกุล", "ห้อง", "ประเภท", "สถานะ", "ออฟไลน์"];
    const rows = logs.map(log => [
      format(new Date(log.timestamp), "dd/MM/yyyy HH:mm:ss"),
      log.studentCode ?? "",
      `${log.firstName ?? ""} ${log.lastName ?? ""}`.trim(),
      log.roomId,
      log.accessType === "entry" ? "เข้าห้อง" : "ออกห้อง",
      log.status,
      log.isOfflineSync ? "ใช่" : "ไม่",
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `access-logs-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export สำเร็จ");
  };

  const handleAddAdmin = async (data: AddAdminForm) => {
    try {
      await createAdminMutation.mutateAsync(data);
      toast.success("เพิ่มแอดมินสำเร็จ");
      setShowAddAdminDialog(false);
      addAdminForm.reset();
      refetchAdmins();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleUpdateAdminRole = async (adminId: number, role: "super_admin" | "admin" | "moderator") => {
    try {
      await updateAdminRoleMutation.mutateAsync({ adminId, role, reason: "Updated via dashboard" });
      toast.success("อัพเดตสิทธิ์สำเร็จ");
      setShowEditAdminDialog(false);
      setEditAdminData(null);
      refetchAdmins();
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    }
  };

  const handleDeleteAdmin = async () => {
    if (!deleteAdminId) return;
    try {
      await deleteAdminMutation.mutateAsync({ adminId: deleteAdminId, reason: deleteAdminReason || "Removed via dashboard" });
      toast.success("ลบแอดมินสำเร็จ");
      setShowDeleteAdminConfirm(false);
      setDeleteAdminId(null);
      setDeleteAdminReason("");
      refetchAdmins();
    } catch {
      toast.error("ลบไม่สำเร็จ");
    }
  };

  // ─── Guard ────────────────────────────────────────────────────────────────────

  if (!user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center py-20">
        <Alert className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>คุณไม่มีสิทธิ์เข้าถึงหน้านี้</AlertDescription>
        </Alert>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">ระบบจัดการควบคุมการเข้าออก — มหาวิทยาลัยราชมงคลพระนคร</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">นักศึกษาทั้งหมด</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {stats ? stats.totalStudents : <Skeleton className="h-8 w-12" />}
              </div>
              <p className="text-xs text-gray-500 mt-1">นักศึกษาที่ Active</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">การเข้าออกวันนี้</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {stats ? stats.todayAccess : <Skeleton className="h-8 w-12" />}
              </div>
              <p className="text-xs text-gray-500 mt-1">ครั้งในวันนี้</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">ประตูที่เปิด</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(stats?.openDoors ?? 0) > 0 ? "text-red-600" : "text-gray-900"}`}>
                {stats ? stats.openDoors : <Skeleton className="h-8 w-12" />}
              </div>
              <p className="text-xs text-gray-500 mt-1">ห้องที่ต้องตรวจสอบ</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">ห้องทั้งหมด</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {stats ? stats.totalDoors : <Skeleton className="h-8 w-12" />}
              </div>
              <p className="text-xs text-gray-500 mt-1">ห้องที่ติดตั้งระบบ</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="settings" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6">
            <TabsTrigger value="settings" className="flex items-center gap-1.5">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">ตั้งค่า</span>
            </TabsTrigger>
            <TabsTrigger value="students" className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">นักศึกษา</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-1.5">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">แจ้งเตือน</span>
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">รายงาน</span>
            </TabsTrigger>
            <TabsTrigger value="admins" className="flex items-center gap-1.5">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">แอดมิน</span>
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-1.5">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Audit Log</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Settings Tab ───────────────────────────────────────────────── */}
          <TabsContent value="settings" className="space-y-4">
            {/* System settings */}
            <Card>
              <CardHeader>
                <CardTitle>ตั้งค่าระบบ</CardTitle>
                <CardDescription>จัดการการตั้งค่าทั่วไปของระบบ</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {settingsMessage && (
                  <Alert className={settingsMessage.type === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
                    {settingsMessage.type === "success"
                      ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                      : <AlertCircle className="h-4 w-4 text-red-600" />}
                    <AlertDescription className={settingsMessage.type === "success" ? "text-green-800" : "text-red-800"}>
                      {settingsMessage.text}
                    </AlertDescription>
                  </Alert>
                )}
                {settingsFetching ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <>
                    <div>
                      <Label className="mb-2 block">เวลาหมดอายุ QR Code (นาที)</Label>
                      <Input
                        type="number"
                        value={qrExpiration}
                        onChange={e => setQrExpiration(parseInt(e.target.value))}
                        className="max-w-xs"
                      />
                      <p className="text-xs text-gray-500 mt-1">ค่าเริ่มต้น: 15 นาที</p>
                    </div>
                    <div>
                      <Label className="mb-2 block">ช่วงเวลาการเข้าใหม่ (นาที)</Label>
                      <Input
                        type="number"
                        value={reentryWindow}
                        onChange={e => setReentryWindow(parseInt(e.target.value))}
                        className="max-w-xs"
                      />
                      <p className="text-xs text-gray-500 mt-1">สามารถเข้าห้องใหม่ได้ภายใน N นาทีหลังออก</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        id="doorAlert"
                        checked={doorAlertEnabled}
                        onCheckedChange={setDoorAlertEnabled}
                      />
                      <Label htmlFor="doorAlert">เปิดใช้งานเตือนประตูไม่ปิดสนิท</Label>
                    </div>
                    <Button onClick={handleUpdateSettings} disabled={settingsLoading} className="bg-blue-600 hover:bg-blue-700">
                      {settingsLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังบันทึก...</> : "บันทึกการเปลี่ยนแปลง"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Room Schedule */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      ตารางเวลาเปิด-ปิดห้อง
                    </CardTitle>
                    <CardDescription>กำหนดเวลาที่ระบบอนุญาตให้นักศึกษาเข้าห้องได้</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">ห้อง:</Label>
                    <Select value={scheduleRoom} onValueChange={v => setScheduleRoom(v)}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROOMS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-28">วัน</TableHead>
                        <TableHead>เวลาเปิด</TableHead>
                        <TableHead>เวลาปิด</TableHead>
                        <TableHead className="w-24 text-center">เปิดใช้งาน</TableHead>
                        <TableHead className="w-20 text-right">บันทึก</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {DAYS_OF_WEEK.map(d => {
                        const row = scheduleMap[d.value];
                        const isSaving = savingDay === d.value || savingDay === -1;
                        return (
                          <TableRow key={d.value} className={row.dirty ? "bg-yellow-50" : ""}>
                            <TableCell className="font-medium">{d.label}</TableCell>
                            <TableCell>
                              <Input
                                type="time"
                                value={row.startTime}
                                className="w-32"
                                disabled={!row.isEnabled}
                                onChange={e => setScheduleMap(prev => ({
                                  ...prev,
                                  [d.value]: { ...prev[d.value], startTime: e.target.value, dirty: true },
                                }))}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="time"
                                value={row.endTime}
                                className="w-32"
                                disabled={!row.isEnabled}
                                onChange={e => setScheduleMap(prev => ({
                                  ...prev,
                                  [d.value]: { ...prev[d.value], endTime: e.target.value, dirty: true },
                                }))}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={row.isEnabled}
                                onCheckedChange={v => setScheduleMap(prev => ({
                                  ...prev,
                                  [d.value]: { ...prev[d.value], isEnabled: v, dirty: true },
                                }))}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isSaving}
                                onClick={() => handleSaveScheduleDay(d.value)}
                              >
                                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "บันทึก"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    onClick={handleSaveAllSchedules}
                    disabled={savingDay !== null}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {savingDay === -1 ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังบันทึก...</> : "บันทึกทั้งหมด"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Students Tab ───────────────────────────────────────────────── */}
          <TabsContent value="students" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>จัดการนักศึกษา</CardTitle>
                    <CardDescription>ดูและจัดการข้อมูลนักศึกษาทั้งหมด</CardDescription>
                  </div>
                  <Button onClick={() => setShowAddDialog(true)} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="h-4 w-4 mr-2" />เพิ่มนักศึกษา
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="ค้นหาชื่อหรือรหัสนักศึกษา..."
                      className="pl-9"
                      value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)}
                    />
                  </div>
                  <Select value={studentStatusFilter} onValueChange={setStudentStatusFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ทุกสถานะ</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="graduated">สำเร็จการศึกษา</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {studentsLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                ) : filteredStudents.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">ไม่พบนักศึกษา</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>รหัสนักศึกษา</TableHead>
                        <TableHead>ชื่อ-นามสกุล</TableHead>
                        <TableHead>ชั้นปี</TableHead>
                        <TableHead>สาขา</TableHead>
                        <TableHead>สถานะ</TableHead>
                        <TableHead className="text-right">จัดการ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-sm">{s.studentId}</TableCell>
                          <TableCell>{s.firstName} {s.lastName}</TableCell>
                          <TableCell>ปี {s.year}</TableCell>
                          <TableCell className="max-w-[150px] truncate">{s.branch}</TableCell>
                          <TableCell>
                            <Badge
                              className={
                                s.status === "active" ? "bg-green-100 text-green-800 hover:bg-green-100" :
                                s.status === "graduated" ? "bg-blue-100 text-blue-800 hover:bg-blue-100" :
                                "bg-gray-100 text-gray-600 hover:bg-gray-100"
                              }
                            >
                              {s.status === "active" ? "Active" : s.status === "graduated" ? "สำเร็จการศึกษา" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => { setSelectedStudent({ id: s.id, firstName: s.firstName, lastName: s.lastName }); setShowLogsDialog(true); }}
                                title="ดูประวัติ"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => handleEditStudent(s)}
                                title="แก้ไข"
                              >
                                <Pencil className="h-4 w-4 text-blue-500" />
                              </Button>
                              {s.status !== "graduated" && (
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => handleUpdateStatus(s.id, s.status === "active" ? "inactive" : "active")}
                                  title={s.status === "active" ? "ระงับ" : "เปิดใช้งาน"}
                                >
                                  {s.status === "active"
                                    ? <UserX className="h-4 w-4 text-red-500" />
                                    : <UserCheck className="h-4 w-4 text-green-600" />}
                                </Button>
                              )}
                              {s.status === "active" && (
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => handleUpdateStatus(s.id, "graduated")}
                                  title="สำเร็จการศึกษา"
                                >
                                  <GraduationCap className="h-4 w-4 text-blue-500" />
                                </Button>
                              )}
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => { setDeleteStudentId(s.id); setShowDeleteConfirm(true); }}
                                title="ลบ"
                              >
                                <Trash2 className="h-4 w-4 text-red-400" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Notifications Tab ──────────────────────────────────────────── */}
          <TabsContent value="notifications" className="space-y-4">
            {NOTIF_CHANNELS.map(channel => {
              const form = notifForms[channel.type];
              return (
                <Card key={channel.type}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">{channel.label}</CardTitle>
                        <CardDescription>ตั้งค่าการแจ้งเตือนผ่าน {channel.label}</CardDescription>
                      </div>
                      <Switch
                        checked={form.isEnabled}
                        onCheckedChange={v => setNotifForms(p => ({ ...p, [channel.type]: { ...p[channel.type], isEnabled: v } }))}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="mb-2 block">
                        {channel.type === "email" ? "Email Address" : "Webhook URL"}
                      </Label>
                      <Input
                        placeholder={channel.placeholder}
                        value={form.webhookUrl}
                        onChange={e => setNotifForms(p => ({ ...p, [channel.type]: { ...p[channel.type], webhookUrl: e.target.value } }))}
                        disabled={!form.isEnabled}
                      />
                    </div>
                    <div>
                      <Label className="mb-2 block">เหตุการณ์ที่ต้องการแจ้งเตือน</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {EVENT_TYPES.map(evt => (
                          <div key={evt.value} className="flex items-center gap-2">
                            <Switch
                              id={`${channel.type}-${evt.value}`}
                              checked={form.eventTypes.includes(evt.value)}
                              disabled={!form.isEnabled}
                              onCheckedChange={checked => {
                                setNotifForms(p => ({
                                  ...p,
                                  [channel.type]: {
                                    ...p[channel.type],
                                    eventTypes: checked
                                      ? [...p[channel.type].eventTypes, evt.value]
                                      : p[channel.type].eventTypes.filter(e => e !== evt.value),
                                  },
                                }));
                              }}
                            />
                            <Label htmlFor={`${channel.type}-${evt.value}`} className="text-sm font-normal">
                              {evt.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSaveNotif(channel.type)}
                        disabled={upsertNotifMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700"
                        size="sm"
                      >
                        {upsertNotifMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                        บันทึก
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        onClick={() => handleTestNotif(channel.type)}
                        disabled={!form.webhookUrl || testNotifMutation.isPending}
                      >
                        <Send className="h-4 w-4 mr-1" />ทดสอบ
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* ── Reports Tab ────────────────────────────────────────────────── */}
          <TabsContent value="reports" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>รายงานการเข้าออก</CardTitle>
                    <CardDescription>ดูและ Export ข้อมูลการเข้าออกห้องเรียน</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
                      <RefreshCw className="h-4 w-4 mr-1" />รีเฟรช
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportCSV}>
                      <Download className="h-4 w-4 mr-1" />Export CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3 mb-4">
                  <div>
                    <Label className="text-xs mb-1 block">วันที่เริ่ม</Label>
                    <Input
                      type="date"
                      value={reportFilters.dateFrom}
                      onChange={e => { setReportFilters(p => ({ ...p, dateFrom: e.target.value })); setReportPage(0); }}
                      className="w-40"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">วันที่สิ้นสุด</Label>
                    <Input
                      type="date"
                      value={reportFilters.dateTo}
                      onChange={e => { setReportFilters(p => ({ ...p, dateTo: e.target.value })); setReportPage(0); }}
                      className="w-40"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">ห้อง</Label>
                    <Select value={reportFilters.roomId || "all"} onValueChange={v => { setReportFilters(p => ({ ...p, roomId: v === "all" ? "" : v })); setReportPage(0); }}>
                      <SelectTrigger className="w-36">
                        <SelectValue placeholder="ทุกห้อง" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">ทุกห้อง</SelectItem>
                        {ROOMS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => { setReportFilters({ roomId: "", dateFrom: "", dateTo: "" }); setReportPage(0); }}
                    >
                      ล้างตัวกรอง
                    </Button>
                  </div>
                </div>

                {logsLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                ) : !logsData?.logs?.length ? (
                  <p className="text-center text-gray-500 py-8">ไม่พบข้อมูล</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>วันที่เวลา</TableHead>
                          <TableHead>รหัสนักศึกษา</TableHead>
                          <TableHead>ชื่อ-นามสกุล</TableHead>
                          <TableHead>ห้อง</TableHead>
                          <TableHead>ประเภท</TableHead>
                          <TableHead>สถานะ</TableHead>
                          <TableHead>ออฟไลน์</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logsData.logs.map(log => (
                          <TableRow key={log.id}>
                            <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                              {format(new Date(log.timestamp), "dd/MM/yy HH:mm")}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{log.studentCode ?? "—"}</TableCell>
                            <TableCell>{log.firstName ? `${log.firstName} ${log.lastName}` : "—"}</TableCell>
                            <TableCell>{log.roomId}</TableCell>
                            <TableCell>
                              <Badge className={log.accessType === "entry" ? "bg-blue-100 text-blue-800 hover:bg-blue-100" : "bg-orange-100 text-orange-800 hover:bg-orange-100"}>
                                {log.accessType === "entry" ? "เข้าห้อง" : "ออกห้อง"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={
                                log.status === "success" ? "bg-green-100 text-green-800 hover:bg-green-100" :
                                log.status === "failed" ? "bg-red-100 text-red-800 hover:bg-red-100" :
                                "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
                              }>
                                {log.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{log.isOfflineSync ? "✓" : ""}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-gray-500">หน้า {reportPage + 1}</p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={reportPage === 0} onClick={() => setReportPage(p => p - 1)}>
                          ก่อนหน้า
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          disabled={(logsData?.logs?.length ?? 0) < PAGE_SIZE}
                          onClick={() => setReportPage(p => p + 1)}
                        >
                          ถัดไป
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Admin Management Tab ───────────────────────────────────────── */}
          <TabsContent value="admins" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>จัดการแอดมิน</CardTitle>
                    <CardDescription>กำหนดสิทธิ์และบทบาทของแอดมินในระบบ</CardDescription>
                  </div>
                  <Button onClick={() => setShowAddAdminDialog(true)} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="h-4 w-4 mr-2" />เพิ่มแอดมิน
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {adminsLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                ) : !adminList?.length ? (
                  <p className="text-center text-gray-500 py-8">ไม่พบแอดมิน</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ชื่อ</TableHead>
                        <TableHead>อีเมล</TableHead>
                        <TableHead>สิทธิ์</TableHead>
                        <TableHead>เหตุผล</TableHead>
                        <TableHead>วันที่เพิ่ม</TableHead>
                        <TableHead className="text-right">จัดการ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adminList.map(a => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.name ?? "—"}</TableCell>
                          <TableCell className="text-sm text-gray-600">{a.email ?? "—"}</TableCell>
                          <TableCell>
                            <Badge className={ROLE_COLORS[a.role] ?? "bg-gray-100 text-gray-600"}>
                              {ROLE_LABELS[a.role] ?? a.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate text-sm text-gray-500">
                            {a.reason ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                            {a.createdAt ? format(new Date(a.createdAt), "dd/MM/yy") : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => {
                                  setEditAdminData({ adminId: a.id, currentRole: a.role, name: a.name ?? "" });
                                  setShowEditAdminDialog(true);
                                }}
                                title="เปลี่ยนสิทธิ์"
                              >
                                <Pencil className="h-4 w-4 text-blue-500" />
                              </Button>
                              {a.id !== user.id && (
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => { setDeleteAdminId(a.id); setShowDeleteAdminConfirm(true); }}
                                  title="ลบแอดมิน"
                                >
                                  <Trash2 className="h-4 w-4 text-red-400" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Audit Log Tab ──────────────────────────────────────────────── */}
          <TabsContent value="audit" className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Audit Logs", value: auditSummary?.auditLogsTotal },
                { label: "Admin Activity", value: auditSummary?.adminActivityTotal },
                { label: "System Actions", value: auditSummary?.systemActionTotal },
                { label: "Access Approvals", value: auditSummary?.accessApprovalsTotal },
              ].map(item => (
                <Card key={item.label}>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-gray-500">{item.label}</p>
                    <p className="text-2xl font-bold mt-1">
                      {item.value ?? <Skeleton className="h-7 w-10" />}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle>บันทึกกิจกรรม</CardTitle>
                    <CardDescription>ประวัติการกระทำทั้งหมดในระบบ</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex rounded-lg border overflow-hidden">
                      <button
                        className={`px-3 py-1.5 text-sm transition-colors ${auditSubTab === "audit" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                        onClick={() => { setAuditSubTab("audit"); setAuditPage(0); }}
                      >
                        Audit Log
                      </button>
                      <button
                        className={`px-3 py-1.5 text-sm border-l transition-colors ${auditSubTab === "activity" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                        onClick={() => { setAuditSubTab("activity"); setAuditPage(0); }}
                      >
                        Admin Activity
                      </button>
                    </div>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => auditSubTab === "audit" ? refetchAuditLogs() : refetchActivityLogs()}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {auditSubTab === "audit" && (
                  <>
                    {auditLogsLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                    ) : !auditLogsData?.length ? (
                      <p className="text-center text-gray-500 py-8">ไม่พบข้อมูล</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>วันที่เวลา</TableHead>
                            <TableHead>ผู้ดำเนินการ</TableHead>
                            <TableHead>การกระทำ</TableHead>
                            <TableHead>ประเภทข้อมูล</TableHead>
                            <TableHead>เหตุผล</TableHead>
                            <TableHead>สถานะ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {auditLogsData.map(log => (
                            <TableRow key={log.id}>
                              <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                                {format(new Date(log.timestamp), "dd/MM/yy HH:mm")}
                              </TableCell>
                              <TableCell className="text-sm">{log.adminName ?? `ID:${log.userId}`}</TableCell>
                              <TableCell>
                                <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100 text-xs font-mono">
                                  {log.actionType}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-gray-600">{log.entityType}</TableCell>
                              <TableCell className="max-w-[200px] truncate text-sm text-gray-500">
                                {log.reason ?? "—"}
                              </TableCell>
                              <TableCell>
                                <Badge className={log.status === "success" ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-red-100 text-red-800 hover:bg-red-100"}>
                                  {log.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </>
                )}

                {auditSubTab === "activity" && (
                  <>
                    {activityLogsLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                    ) : !activityLogsData?.length ? (
                      <p className="text-center text-gray-500 py-8">ไม่พบข้อมูล</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>วันที่เวลา</TableHead>
                            <TableHead>แอดมิน</TableHead>
                            <TableHead>กิจกรรม</TableHead>
                            <TableHead>เป้าหมาย</TableHead>
                            <TableHead>รายละเอียด</TableHead>
                            <TableHead>สถานะ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activityLogsData.map(log => (
                            <TableRow key={log.id}>
                              <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                                {format(new Date(log.timestamp), "dd/MM/yy HH:mm")}
                              </TableCell>
                              <TableCell className="text-sm">{log.adminName ?? `ID:${log.adminId}`}</TableCell>
                              <TableCell>
                                <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100 text-xs font-mono">
                                  {log.activityType}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-gray-600">
                                {log.targetName ? `${log.targetName} (${log.targetType})` : log.targetType}
                              </TableCell>
                              <TableCell className="max-w-[200px] truncate text-sm text-gray-500">
                                {log.description ?? "—"}
                              </TableCell>
                              <TableCell>
                                <Badge className={log.status === "success" ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-red-100 text-red-800 hover:bg-red-100"}>
                                  {log.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </>
                )}

                {/* Audit pagination */}
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-gray-500">หน้า {auditPage + 1}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={auditPage === 0} onClick={() => setAuditPage(p => p - 1)}>
                      ก่อนหน้า
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      disabled={((auditSubTab === "audit" ? auditLogsData?.length : activityLogsData?.length) ?? 0) < AUDIT_PAGE_SIZE}
                      onClick={() => setAuditPage(p => p + 1)}
                    >
                      ถัดไป
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Add Student Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>เพิ่มนักศึกษาใหม่</DialogTitle>
          </DialogHeader>
          <form onSubmit={studentForm.handleSubmit(handleCreateStudent)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block">รหัสนักศึกษา *</Label>
                <Input {...studentForm.register("studentId")} placeholder="เช่น 6412345678" />
                {studentForm.formState.errors.studentId && (
                  <p className="text-xs text-red-500 mt-1">{studentForm.formState.errors.studentId.message}</p>
                )}
              </div>
              <div>
                <Label className="mb-1 block">ชั้นปี *</Label>
                <Select onValueChange={v => studentForm.setValue("year", v as "1"|"2"|"3"|"4")} defaultValue="">
                  <SelectTrigger>
                    <SelectValue placeholder="เลือกชั้นปี" />
                  </SelectTrigger>
                  <SelectContent>
                    {["1","2","3","4"].map(y => <SelectItem key={y} value={y}>ปี {y}</SelectItem>)}
                  </SelectContent>
                </Select>
                {studentForm.formState.errors.year && (
                  <p className="text-xs text-red-500 mt-1">{studentForm.formState.errors.year.message}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block">ชื่อ *</Label>
                <Input {...studentForm.register("firstName")} placeholder="ชื่อ" />
                {studentForm.formState.errors.firstName && (
                  <p className="text-xs text-red-500 mt-1">{studentForm.formState.errors.firstName.message}</p>
                )}
              </div>
              <div>
                <Label className="mb-1 block">นามสกุล *</Label>
                <Input {...studentForm.register("lastName")} placeholder="นามสกุล" />
                {studentForm.formState.errors.lastName && (
                  <p className="text-xs text-red-500 mt-1">{studentForm.formState.errors.lastName.message}</p>
                )}
              </div>
            </div>
            <div>
              <Label className="mb-1 block">สาขา *</Label>
              <Input {...studentForm.register("branch")} placeholder="เช่น วิทยาการคอมพิวเตอร์" />
              {studentForm.formState.errors.branch && (
                <p className="text-xs text-red-500 mt-1">{studentForm.formState.errors.branch.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block">อีเมล</Label>
                <Input {...studentForm.register("email")} placeholder="student@email.com" type="email" />
              </div>
              <div>
                <Label className="mb-1 block">เบอร์โทร</Label>
                <Input {...studentForm.register("phone")} placeholder="08x-xxx-xxxx" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowAddDialog(false); studentForm.reset(); }}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                {createMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />กำลังเพิ่ม...</> : "เพิ่มนักศึกษา"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Student Dialog ────────────────────────────────────────────── */}
      <Dialog open={showEditDialog} onOpenChange={v => { setShowEditDialog(v); if (!v) setEditStudentData(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>แก้ไขข้อมูลนักศึกษา</DialogTitle>
          </DialogHeader>
          <form onSubmit={editStudentForm.handleSubmit(handleUpdateStudent)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block">รหัสนักศึกษา *</Label>
                <Input {...editStudentForm.register("studentId")} />
                {editStudentForm.formState.errors.studentId && (
                  <p className="text-xs text-red-500 mt-1">{editStudentForm.formState.errors.studentId.message}</p>
                )}
              </div>
              <div>
                <Label className="mb-1 block">ชั้นปี *</Label>
                <Select
                  value={editStudentForm.watch("year")}
                  onValueChange={v => editStudentForm.setValue("year", v as "1"|"2"|"3"|"4")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["1","2","3","4"].map(y => <SelectItem key={y} value={y}>ปี {y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block">ชื่อ *</Label>
                <Input {...editStudentForm.register("firstName")} />
                {editStudentForm.formState.errors.firstName && (
                  <p className="text-xs text-red-500 mt-1">{editStudentForm.formState.errors.firstName.message}</p>
                )}
              </div>
              <div>
                <Label className="mb-1 block">นามสกุล *</Label>
                <Input {...editStudentForm.register("lastName")} />
                {editStudentForm.formState.errors.lastName && (
                  <p className="text-xs text-red-500 mt-1">{editStudentForm.formState.errors.lastName.message}</p>
                )}
              </div>
            </div>
            <div>
              <Label className="mb-1 block">สาขา *</Label>
              <Input {...editStudentForm.register("branch")} />
              {editStudentForm.formState.errors.branch && (
                <p className="text-xs text-red-500 mt-1">{editStudentForm.formState.errors.branch.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block">อีเมล</Label>
                <Input {...editStudentForm.register("email")} type="email" />
              </div>
              <div>
                <Label className="mb-1 block">เบอร์โทร</Label>
                <Input {...editStudentForm.register("phone")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowEditDialog(false); setEditStudentData(null); }}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={updateStudentMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                {updateStudentMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />กำลังบันทึก...</> : "บันทึก"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Student Confirm ─────────────────────────────────────────── */}
      <Dialog open={showDeleteConfirm} onOpenChange={v => { setShowDeleteConfirm(v); if (!v) setDeleteStudentId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>ยืนยันการลบนักศึกษา</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">การลบนักศึกษาจะลบข้อมูลออกจากระบบถาวร และจะไม่สามารถกู้คืนได้</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setDeleteStudentId(null); }}>ยกเลิก</Button>
            <Button
              variant="destructive"
              disabled={deleteStudentMutation.isPending}
              onClick={handleDeleteStudent}
            >
              {deleteStudentMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              ลบนักศึกษา
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Student Logs Dialog ────────────────────────────────────────────── */}
      <Dialog open={showLogsDialog} onOpenChange={v => { setShowLogsDialog(v); if (!v) setSelectedStudent(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              ประวัติการเข้าออก — {selectedStudent?.firstName} {selectedStudent?.lastName}
            </DialogTitle>
          </DialogHeader>
          {studentLogsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : !studentLogs?.length ? (
            <p className="text-center text-gray-500 py-8">ไม่พบประวัติการเข้าออก</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>วันที่เวลา</TableHead>
                  <TableHead>ห้อง</TableHead>
                  <TableHead>ประเภท</TableHead>
                  <TableHead>สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentLogs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(log.timestamp), "dd/MM/yy HH:mm")}
                    </TableCell>
                    <TableCell>{log.roomId}</TableCell>
                    <TableCell>
                      <Badge className={log.accessType === "entry" ? "bg-blue-100 text-blue-800 hover:bg-blue-100" : "bg-orange-100 text-orange-800 hover:bg-orange-100"}>
                        {log.accessType === "entry" ? "เข้าห้อง" : "ออกห้อง"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={log.status === "success" ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-red-100 text-red-800 hover:bg-red-100"}>
                        {log.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Add Admin Dialog ───────────────────────────────────────────────── */}
      <Dialog open={showAddAdminDialog} onOpenChange={v => { setShowAddAdminDialog(v); if (!v) addAdminForm.reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>เพิ่มแอดมินใหม่</DialogTitle>
          </DialogHeader>
          <form onSubmit={addAdminForm.handleSubmit(handleAddAdmin)} className="space-y-4">
            <div>
              <Label className="mb-1 block">เลือกผู้ใช้ *</Label>
              <Select onValueChange={v => addAdminForm.setValue("userId", parseInt(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="เลือกผู้ใช้" />
                </SelectTrigger>
                <SelectContent>
                  {nonAdminUsers.length === 0 ? (
                    <SelectItem value="0" disabled>ไม่มีผู้ใช้ที่สามารถเพิ่มได้</SelectItem>
                  ) : (
                    nonAdminUsers.map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name ?? u.email ?? `ID: ${u.id}`}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {addAdminForm.formState.errors.userId && (
                <p className="text-xs text-red-500 mt-1">{addAdminForm.formState.errors.userId.message}</p>
              )}
            </div>
            <div>
              <Label className="mb-1 block">สิทธิ์ *</Label>
              <Select onValueChange={v => addAdminForm.setValue("role", v as "super_admin" | "admin" | "moderator")} defaultValue="admin">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="moderator">Moderator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block">เหตุผล *</Label>
              <Input {...addAdminForm.register("reason")} placeholder="เช่น แต่งตั้งเป็นผู้ดูแลระบบ" />
              {addAdminForm.formState.errors.reason && (
                <p className="text-xs text-red-500 mt-1">{addAdminForm.formState.errors.reason.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowAddAdminDialog(false); addAdminForm.reset(); }}>ยกเลิก</Button>
              <Button type="submit" disabled={createAdminMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                {createAdminMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />กำลังเพิ่ม...</> : "เพิ่มแอดมิน"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Admin Role Dialog ─────────────────────────────────────────── */}
      <Dialog open={showEditAdminDialog} onOpenChange={v => { setShowEditAdminDialog(v); if (!v) setEditAdminData(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>เปลี่ยนสิทธิ์ — {editAdminData?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>สิทธิ์ใหม่</Label>
            <div className="flex flex-col gap-2">
              {(["super_admin", "admin", "moderator"] as const).map(role => (
                <button
                  key={role}
                  type="button"
                  className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                    editAdminData?.currentRole === role
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                  onClick={() => editAdminData && handleUpdateAdminRole(editAdminData.adminId, role)}
                  disabled={updateAdminRoleMutation.isPending}
                >
                  <span>{ROLE_LABELS[role]}</span>
                  {editAdminData?.currentRole === role && <CheckCircle2 className="h-4 w-4 text-blue-500" />}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditAdminDialog(false); setEditAdminData(null); }}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Admin Confirm ───────────────────────────────────────────── */}
      <Dialog open={showDeleteAdminConfirm} onOpenChange={v => { setShowDeleteAdminConfirm(v); if (!v) { setDeleteAdminId(null); setDeleteAdminReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>ยืนยันการลบแอดมิน</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">กรุณาระบุเหตุผลในการลบสิทธิ์แอดมิน</p>
            <Input
              placeholder="เหตุผล (ไม่บังคับ)"
              value={deleteAdminReason}
              onChange={e => setDeleteAdminReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDeleteAdminConfirm(false); setDeleteAdminId(null); setDeleteAdminReason(""); }}>ยกเลิก</Button>
            <Button
              variant="destructive"
              disabled={deleteAdminMutation.isPending}
              onClick={handleDeleteAdmin}
            >
              {deleteAdminMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              ลบแอดมิน
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
