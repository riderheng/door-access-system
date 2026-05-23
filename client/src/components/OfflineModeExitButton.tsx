import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertCircle, Wifi, WifiOff, LogOut } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface OfflineModeExitButtonProps {
  studentId: number;
  roomId: string;
  studentName?: string;
  onSuccess?: () => void;
}

/**
 * Offline Mode Exit Button Component
 * 
 * ปุ่มออฟไลน์โหมดสำหรับออกห้องเมื่อไม่มีอินเทอร์เน็ต
 * - บันทึกข้อมูลลงใน IndexedDB
 * - ส่ง Webhook แจ้งเตือน Admin
 * - ซิงค์ข้อมูลเมื่อกลับมาออนไลน์
 */
export default function OfflineModeExitButton({
  studentId,
  roomId,
  studentName = "Student",
  onSuccess,
}: OfflineModeExitButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isLoading, setIsLoading] = useState(false);
  const [offlineReason, setOfflineReason] = useState("");
  const [syncQueue, setSyncQueue] = useState<any[]>([]);

  // ตรวจสอบสถานะการเชื่อมต่ออินเทอร์เน็ต
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Back online - syncing data...");
      syncOfflineData();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("No internet connection - using offline mode");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // โหลด Sync Queue จาก IndexedDB เมื่อ component mount
  useEffect(() => {
    loadSyncQueue();
  }, []);

  /**
   * โหลด Sync Queue จาก IndexedDB
   */
  const loadSyncQueue = async () => {
    try {
      const db = await openIndexedDB();
      const queue = await getAllFromIndexedDB(db, "syncQueue");
      setSyncQueue(queue);
    } catch (error) {
      console.error("Failed to load sync queue:", error);
    }
  };

  /**
   * เปิด IndexedDB
   */
  const openIndexedDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("DoorAccessSystem", 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("syncQueue")) {
          db.createObjectStore("syncQueue", { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("offlineExits")) {
          db.createObjectStore("offlineExits", { keyPath: "id", autoIncrement: true });
        }
      };
    });
  };

  /**
   * บันทึกข้อมูลลงใน IndexedDB
   */
  const saveToIndexedDB = async (storeName: string, data: any): Promise<void> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("DoorAccessSystem", 1);

      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const addRequest = store.add(data);

        addRequest.onerror = () => reject(addRequest.error);
        addRequest.onsuccess = () => resolve();
      };

      request.onerror = () => reject(request.error);
    });
  };

  /**
   * ดึงข้อมูลทั้งหมดจาก IndexedDB
   */
  const getAllFromIndexedDB = async (db: IDBDatabase, storeName: string): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  };

  /**
   * บันทึกการออกห้องแบบออฟไลน์
   */
  const handleOfflineExit = async () => {
    setIsLoading(true);

    try {
      const exitData = {
        studentId,
        roomId,
        studentName,
        reason: offlineReason || "Offline Mode Exit",
        timestamp: new Date().toISOString(),
        status: "pending", // รอการซิงค์
      };

      // บันทึกลงใน IndexedDB
      await saveToIndexedDB("offlineExits", exitData);

      // เพิ่มเข้า Sync Queue
      await saveToIndexedDB("syncQueue", {
        type: "offline_exit",
        data: exitData,
        createdAt: new Date().toISOString(),
        synced: false,
      });

      // อัพเดต Sync Queue state
      loadSyncQueue();

      toast.success("Exit recorded in offline mode", {
        description: `Data will be synced when online`,
      });

      setOfflineReason("");
      setIsOpen(false);

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Failed to record offline exit:", error);
      toast.error("Failed to record exit", {
        description: "Please try again",
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * ซิงค์ข้อมูลออฟไลน์เมื่อกลับมาออนไลน์
   */
  const syncOfflineData = async () => {
    try {
      const db = await openIndexedDB();
      const queue = await getAllFromIndexedDB(db, "syncQueue");

      if (queue.length === 0) {
        toast.info("No offline data to sync");
        return;
      }

      let syncedCount = 0;
      let failedCount = 0;

      for (const item of queue) {
        try {
          if (item.type === "offline_exit") {
            const response = await fetch("/api/trpc/access.recordOfflineExit", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                studentId: item.data.studentId,
                roomId: item.data.roomId,
                reason: item.data.reason,
                timestamp: item.data.timestamp,
              }),
            });

            if (!response.ok) {
              throw new Error(`Sync failed: HTTP ${response.status}`);
            }

            syncedCount++;
          }
        } catch (error) {
          console.error("Failed to sync item:", error);
          failedCount++;
        }
      }

      toast.success(`Synced ${syncedCount} offline records`, {
        description: failedCount > 0 ? `${failedCount} records failed` : undefined,
      });

      // ล้าง Sync Queue หลังจากซิงค์สำเร็จ
      if (syncedCount > 0) {
        loadSyncQueue();
      }
    } catch (error) {
      console.error("Failed to sync offline data:", error);
      toast.error("Failed to sync offline data");
    }
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant={isOnline ? "outline" : "destructive"}
        className="w-full gap-2"
        disabled={isLoading}
      >
        {isOnline ? (
          <>
            <Wifi className="w-4 h-4" />
            Exit Room (Online)
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4" />
            Exit Room (Offline Mode)
          </>
        )}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="w-5 h-5" />
              Exit Room
            </DialogTitle>
            <DialogDescription>
              {isOnline ? (
                "Record your exit from the room"
              ) : (
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="w-4 h-4" />
                  Offline Mode - Data will be synced when online
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Student Info */}
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-sm text-slate-600">Student</p>
              <p className="font-semibold">{studentName}</p>
            </div>

            {/* Room Info */}
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-sm text-slate-600">Room</p>
              <p className="font-semibold">{roomId}</p>
            </div>

            {/* Offline Reason */}
            <div>
              <label className="text-sm font-medium">Reason (Optional)</label>
              <textarea
                value={offlineReason}
                onChange={(e) => setOfflineReason(e.target.value)}
                placeholder="e.g., Normal exit, Emergency exit, etc."
                className="w-full mt-1 p-2 border rounded-lg text-sm"
                rows={3}
              />
            </div>

            {/* Sync Queue Status */}
            {syncQueue.length > 0 && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-sm text-blue-600">
                  📊 {syncQueue.length} record(s) waiting to sync
                </p>
              </div>
            )}

            {/* Connection Status */}
            <div className={`p-3 rounded-lg ${isOnline ? "bg-green-50" : "bg-amber-50"}`}>
              <p className={`text-sm font-medium ${isOnline ? "text-green-600" : "text-amber-600"}`}>
                {isOnline ? "✓ Online" : "⚠ Offline Mode"}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={isLoading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleOfflineExit}
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? "Recording..." : "Confirm Exit"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
