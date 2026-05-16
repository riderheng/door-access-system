import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Wifi, WifiOff, Lock, LockOpen, Activity, Cpu } from "lucide-react";

const ROOMS = [
  { value: "room_101", label: "ห้อง 101" },
  { value: "room_102", label: "ห้อง 102" },
  { value: "room_103", label: "ห้อง 103" },
  { value: "room_104", label: "ห้อง 104" },
];

type DoorState = "locked" | "unlocking" | "unlocked" | "locking";

interface DoorStatus {
  roomId: string;
  state: DoorState;
  lastEvent: string;
  unlockTimer: number;
}

const UNLOCK_DURATION = 5000;

function DoorCard({ door, onUnlock, onLock }: {
  door: DoorStatus;
  onUnlock: () => void;
  onLock: () => void;
}) {
  const isOpen = door.state === "unlocked" || door.state === "unlocking";
  const isTransitioning = door.state === "unlocking" || door.state === "locking";
  const progress = door.state === "unlocked"
    ? 100 - Math.round((door.unlockTimer / UNLOCK_DURATION) * 100)
    : 0;

  return (
    <Card className={`transition-all duration-500 ${isOpen ? "border-green-400 shadow-green-100 shadow-lg" : "border-gray-200"}`}>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between mb-4">
          <span className="font-semibold text-sm">{door.roomId.replace("_", " ").toUpperCase()}</span>
          <Badge className={
            door.state === "unlocked" ? "bg-green-100 text-green-800" :
            door.state === "unlocking" ? "bg-yellow-100 text-yellow-800" :
            door.state === "locking" ? "bg-orange-100 text-orange-800" :
            "bg-gray-100 text-gray-700"
          }>
            {door.state === "locked" ? "ล็อค" :
             door.state === "unlocking" ? "กำลังปลดล็อค..." :
             door.state === "unlocked" ? "ปลดล็อคแล้ว" :
             "กำลังล็อค..."}
          </Badge>
        </div>

        {/* Door visual */}
        <div className="flex justify-center mb-4">
          <div className={`relative w-20 h-28 border-4 rounded-sm transition-all duration-700 ${
            isOpen ? "border-green-400 bg-green-50" : "border-gray-400 bg-gray-100"
          }`}>
            {/* Door knob */}
            <div className={`absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-colors duration-500 ${
              isOpen ? "bg-green-500" : "bg-gray-500"
            }`} />
            {/* Lock icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              {isTransitioning ? (
                <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
              ) : isOpen ? (
                <LockOpen className="h-6 w-6 text-green-600" />
              ) : (
                <Lock className="h-6 w-6 text-gray-500" />
              )}
            </div>
            {/* Open gap effect */}
            {isOpen && (
              <div className="absolute -right-3 top-0 bottom-0 w-2 bg-green-200 rounded-r-sm opacity-60" />
            )}
          </div>
        </div>

        {/* Timer bar */}
        {door.state === "unlocked" && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>ล็อคกลับใน</span>
              <span>{Math.ceil(door.unlockTimer / 1000)} วิ</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-1000"
                style={{ width: `${(door.unlockTimer / UNLOCK_DURATION) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Last event */}
        <p className="text-xs text-gray-400 mb-3 truncate">{door.lastEvent || "—"}</p>

        {/* Manual buttons */}
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs"
            onClick={onUnlock} disabled={isTransitioning || door.state === "unlocked"}>
            <LockOpen className="h-3 w-3 mr-1" /> จำลองปลดล็อค
          </Button>
          <Button size="sm" variant="outline" className="flex-1 border-red-300 text-red-700 text-xs"
            onClick={onLock} disabled={isTransitioning || door.state === "locked"}>
            <Lock className="h-3 w-3 mr-1" /> จำลองล็อค
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ESP32Simulator() {
  const [selectedRoom, setSelectedRoom] = useState<string>("all");
  const [pollLog, setPollLog] = useState<string[]>([]);
  const [pollCount, setPollCount] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  const [doors, setDoors] = useState<Record<string, DoorStatus>>(() => {
    const init: Record<string, DoorStatus> = {};
    for (const r of ROOMS) {
      init[r.value] = { roomId: r.value, state: "locked", lastEvent: "รอคำสั่ง...", unlockTimer: 0 };
    }
    return init;
  });

  const updateDoorStatusMutation = trpc.mockESP32.updateDoorStatus.useMutation();

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString("th-TH");
    setPollLog(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50));
  };

  const doUnlock = (roomId: string, source: string) => {
    setDoors(prev => ({
      ...prev,
      [roomId]: { ...prev[roomId], state: "unlocking", lastEvent: `${source} — กำลังปลดล็อค` },
    }));
    setTimeout(() => {
      setDoors(prev => ({
        ...prev,
        [roomId]: { ...prev[roomId], state: "unlocked", lastEvent: `${source} — ปลดล็อคแล้ว`, unlockTimer: UNLOCK_DURATION },
      }));
      updateDoorStatusMutation.mutate({ roomId, sensorStatus: "open", reason: "Simulator unlock" });
      addLog(`${roomId} — UNLOCKED (${source})`);
    }, 600);
  };

  const doLock = (roomId: string, source: string) => {
    setDoors(prev => ({
      ...prev,
      [roomId]: { ...prev[roomId], state: "locking", lastEvent: `${source} — กำลังล็อค` },
    }));
    setTimeout(() => {
      setDoors(prev => ({
        ...prev,
        [roomId]: { ...prev[roomId], state: "locked", lastEvent: `${source} — ล็อคแล้ว`, unlockTimer: 0 },
      }));
      updateDoorStatusMutation.mutate({ roomId, sensorStatus: "closed", reason: "Simulator lock" });
      addLog(`${roomId} — LOCKED (${source})`);
    }, 400);
  };

  // Countdown timer for unlocked doors
  useEffect(() => {
    const interval = setInterval(() => {
      setDoors(prev => {
        const next = { ...prev };
        for (const roomId of Object.keys(next)) {
          const d = next[roomId];
          if (d.state === "unlocked") {
            const remaining = d.unlockTimer - 100;
            if (remaining <= 0) {
              doLock(roomId, "auto");
            } else {
              next[roomId] = { ...d, unlockTimer: remaining };
            }
          }
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Poll server every 2 seconds
  useEffect(() => {
    const poll = async () => {
      const roomsToPoll = selectedRoom === "all" ? ROOMS.map(r => r.value) : [selectedRoom];
      for (const roomId of roomsToPoll) {
        try {
          const res = await fetch(`/api/esp32/command/${roomId}`);
          const data = await res.json();
          setPollCount(c => c + 1);
          if (data.command === "unlock") {
            addLog(`${roomId} ← คำสั่ง UNLOCK จาก Server`);
            doUnlock(roomId, "Server command");
          } else if (data.command === "lock") {
            addLog(`${roomId} ← คำสั่ง LOCK จาก Server`);
            doLock(roomId, "Server command");
          }
        } catch {
          // server ไม่ตอบ — ไม่ต้อง log ทุกครั้ง
        }
      }
    };

    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [selectedRoom]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, [pollLog]);

  const displayRooms = selectedRoom === "all" ? ROOMS.map(r => r.value) : [selectedRoom];

  return (
    <div className="max-w-4xl mx-auto py-4 space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="h-5 w-5 text-blue-600" />
          <h1 className="text-2xl font-bold">ESP32 Simulator</h1>
          <Badge className="bg-blue-100 text-blue-800">จำลองฮาร์ดแวร์</Badge>
        </div>
        <p className="text-gray-500 text-sm">จำลองการทำงานของ ESP32 — poll server ทุก 2 วินาที แสดง animation ประตูเปิด/ปิด</p>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg text-sm">
        <div className="flex items-center gap-2 text-green-700">
          <Wifi className="h-4 w-4" />
          <span>เชื่อมต่อ Server</span>
        </div>
        <div className="flex items-center gap-2 text-gray-500">
          <Activity className="h-4 w-4" />
          <span>Poll แล้ว {pollCount} ครั้ง</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-gray-500">แสดงห้อง:</span>
          <Select value={selectedRoom} onValueChange={setSelectedRoom}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกห้อง</SelectItem>
              {ROOMS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Door cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {displayRooms.map(roomId => (
          <DoorCard
            key={roomId}
            door={doors[roomId]}
            onUnlock={() => doUnlock(roomId, "Manual")}
            onLock={() => doLock(roomId, "Manual")}
          />
        ))}
      </div>

      {/* Poll log */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Event Log
          </CardTitle>
          <CardDescription className="text-xs">คำสั่งที่รับจาก Server และ events ทั้งหมด</CardDescription>
        </CardHeader>
        <CardContent>
          <div ref={logRef} className="h-40 overflow-y-auto bg-gray-900 rounded-md p-3 font-mono text-xs text-green-400 space-y-0.5">
            {pollLog.length === 0 ? (
              <p className="text-gray-500">รอ event...</p>
            ) : (
              pollLog.map((line, i) => <p key={i}>{line}</p>)
            )}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-gray-400 text-center">
        ทดสอบ: ไปที่ <strong>Admin → Settings → ควบคุมประตูแบบ Manual</strong> แล้วกดปลดล็อค — ดูผลที่นี่ภายใน 2 วินาที
      </p>
    </div>
  );
}
