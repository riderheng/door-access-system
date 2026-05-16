import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, QrCode, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import OfflineModeExitButton from "@/components/OfflineModeExitButton";

const ROOMS = [
  { value: "room_101", label: "ห้อง 101" },
  { value: "room_102", label: "ห้อง 102" },
  { value: "room_103", label: "ห้อง 103" },
  { value: "room_104", label: "ห้อง 104" },
];

export default function StudentAccess() {
  const { user } = useAuth();
  const [selectedRoom, setSelectedRoom] = useState<string>("room_101");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const generateQRMutation = trpc.access.generateQRCode.useMutation();
  const verifyAccessMutation = trpc.access.verifyAndRecordAccess.useMutation();

  const handleGenerateQR = async () => {
    if (!user) return;
    setLoading(true);
    setMessage(null);
    setQrToken(null);
    setQrImage(null);
    try {
      const result = await generateQRMutation.mutateAsync({ studentId: user.id });
      setQrImage(result.qrImage);
      setQrToken(result.token);
      setMessage({ type: "success", text: "QR Code สร้างสำเร็จ (หมดอายุใน 15 นาที)" });

      // ล้าง QR อัตโนมัติเมื่อหมดอายุ
      setTimeout(() => {
        setQrImage(null);
        setQrToken(null);
      }, 15 * 60 * 1000);
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการสร้าง QR Code",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRecordAccess = async (accessType: "entry" | "exit") => {
    if (!user || !qrToken) return;
    setLoading(true);
    setMessage(null);
    try {
      await verifyAccessMutation.mutateAsync({
        qrCode: qrToken,
        roomId: selectedRoom,
        accessType,
        deviceInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
        },
      });

      setMessage({
        type: "success",
        text: accessType === "entry" ? "บันทึกการเข้าห้องสำเร็จ" : "บันทึกการออกห้องสำเร็จ",
      });
      setQrImage(null);
      setQrToken(null);
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-4">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">ระบบควบคุมการเข้าออก</h1>
          <p className="text-gray-600">{user?.name || "นักศึกษา"} — มหาวิทยาลัยราชมงคลพระนคร</p>
        </div>

        {/* Alert Messages */}
        {message && (
          <Alert className={`mb-6 ${message.type === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
            {message.type === "success"
              ? <CheckCircle2 className="h-4 w-4 text-green-600" />
              : <AlertCircle className="h-4 w-4 text-red-600" />}
            <AlertDescription className={message.type === "success" ? "text-green-800" : "text-red-800"}>
              {message.text}
            </AlertDescription>
          </Alert>
        )}

        {/* QR Code Card */}
        <Card className="mb-6 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              QR Code สำหรับเข้าห้อง
            </CardTitle>
            <CardDescription className="text-blue-100">
              สร้าง QR Code ใหม่แล้วสแกนหรือกดปุ่มเข้า-ออก
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {/* Room Selection */}
            <div className="mb-4">
              <Label className="mb-2 block">เลือกห้อง</Label>
              <Select value={selectedRoom} onValueChange={setSelectedRoom}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROOMS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {qrImage ? (
              <div className="flex flex-col items-center gap-4">
                <img
                  src={qrImage}
                  alt="QR Code"
                  className="w-64 h-64 border-4 border-blue-200 rounded-lg"
                />
                <p className="text-sm text-gray-500 text-center">
                  สแกน QR Code นี้ที่อุปกรณ์ที่ประตู หรือกดปุ่มด้านล่าง
                </p>

                {/* Entry / Exit Buttons */}
                <div className="flex gap-3 w-full">
                  <Button
                    onClick={() => handleRecordAccess("entry")}
                    disabled={loading}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    เข้าห้อง
                  </Button>
                  <Button
                    onClick={() => handleRecordAccess("exit")}
                    disabled={loading}
                    className="flex-1 bg-orange-600 hover:bg-orange-700"
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    ออกห้อง
                  </Button>
                </div>

                <Button
                  onClick={handleGenerateQR}
                  disabled={loading}
                  variant="outline"
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  สร้าง QR Code ใหม่
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="w-64 h-64 bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                  <div className="text-center">
                    <QrCode className="h-16 w-16 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">กด "สร้าง QR Code" เพื่อเริ่ม</p>
                  </div>
                </div>
                <Button
                  onClick={handleGenerateQR}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  size="lg"
                >
                  {loading
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังสร้าง...</>
                    : <><QrCode className="mr-2 h-5 w-5" />สร้าง QR Code</>}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Offline Exit Button */}
        {user && (
          <Card className="mb-6 shadow-lg">
            <CardHeader>
              <CardTitle className="text-base">ออกห้องแบบออฟไลน์</CardTitle>
              <CardDescription>ใช้เมื่อไม่มีสัญญาณอินเทอร์เน็ต</CardDescription>
            </CardHeader>
            <CardContent>
              <OfflineModeExitButton
                studentId={user.id}
                roomId={selectedRoom}
                studentName={user.name ?? "นักศึกษา"}
                onSuccess={() => setMessage({ type: "success", text: "บันทึกการออกห้องในโหมดออฟไลน์แล้ว" })}
              />
            </CardContent>
          </Card>
        )}

        {/* Student Info Card */}
        <Card className="shadow-lg">
          <CardHeader className="bg-gray-50">
            <CardTitle className="text-lg">ข้อมูลประจำตัว</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">ชื่อ-นามสกุล</p>
                <p className="font-semibold text-gray-900">{user?.name || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">อีเมล</p>
                <p className="font-semibold text-gray-900">{user?.email || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ห้องที่เลือก</p>
                <p className="font-semibold text-gray-900">
                  {ROOMS.find(r => r.value === selectedRoom)?.label ?? selectedRoom}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">สถานะ QR</p>
                <p className={`font-semibold ${qrToken ? "text-green-600" : "text-gray-400"}`}>
                  {qrToken ? "พร้อมใช้งาน" : "ยังไม่ได้สร้าง"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
    </div>
  );
}
