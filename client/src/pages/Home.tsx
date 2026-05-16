import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  QrCode,
  ShieldCheck,
  DoorOpen,
  Users,
  Activity,
  Loader2,
} from "lucide-react";

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  const { data: stats } = trpc.access.getStats.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary">RMUTP</Badge>
            {user.role === "admin" && <Badge className="bg-blue-600">Admin</Badge>}
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            ระบบควบคุมการเข้าออกห้องเรียน
          </h1>
          <p className="text-gray-500 mt-1">
            สวัสดี, {user.name || "ผู้ใช้งาน"} — เลือกฟีเจอร์ที่ต้องการ
          </p>
        </div>

        {/* Stats row (admin only) */}
        {user.role === "admin" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">นักศึกษา</p>
                    <p className="text-xl font-bold">{stats?.totalStudents ?? "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <Activity className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">เข้าออกวันนี้</p>
                    <p className="text-xl font-bold">{stats?.todayAccess ?? "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${(stats?.openDoors ?? 0) > 0 ? "bg-red-100" : "bg-gray-100"}`}>
                    <DoorOpen className={`h-5 w-5 ${(stats?.openDoors ?? 0) > 0 ? "text-red-600" : "text-gray-500"}`} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">ประตูที่เปิด</p>
                    <p className={`text-xl font-bold ${(stats?.openDoors ?? 0) > 0 ? "text-red-600" : ""}`}>
                      {stats?.openDoors ?? "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <ShieldCheck className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">ห้องทั้งหมด</p>
                    <p className="text-xl font-bold">{stats?.totalDoors ?? "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Action cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-blue-300"
            onClick={() => setLocation("/access")}
          >
            <CardHeader>
              <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center mb-2">
                <QrCode className="h-6 w-6 text-blue-600" />
              </div>
              <CardTitle>ระบบเข้า-ออกห้อง</CardTitle>
              <CardDescription>
                สแกน QR Code เพื่อบันทึกการเข้าออกห้องเรียน
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full bg-blue-600 hover:bg-blue-700">
                เข้าสู่ระบบเข้า-ออก
              </Button>
            </CardContent>
          </Card>

          {user.role === "admin" && (
            <Card
              className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-green-300"
              onClick={() => setLocation("/admin")}
            >
              <CardHeader>
                <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center mb-2">
                  <ShieldCheck className="h-6 w-6 text-green-600" />
                </div>
                <CardTitle>แผงควบคุมแอดมิน</CardTitle>
                <CardDescription>
                  จัดการนักศึกษา ตั้งค่าระบบ ดูรายงาน และตั้งค่าการแจ้งเตือน
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full bg-green-600 hover:bg-green-700">
                  เข้าสู่แผงควบคุม
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
  );
}
