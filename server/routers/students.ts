import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import {
  createStudent,
  getAllStudents,
  getAllStudentsWithStatus,
  getStudentByStudentId,
  getStudentById,
  getAccessLogsByStudentId,
  updateStudentStatus,
  updateStudent,
  deleteStudent,
} from "../db";

const createStudentSchema = z.object({
  studentId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  year: z.enum(["1", "2", "3", "4"]),
  branch: z.string().min(1),
});

export const studentsRouter = router({
  /**
   * Get all active students
   */
  list: adminProcedure.query(async () => {
    return await getAllStudents();
  }),

  /**
   * Get student by ID
   */
  getById: publicProcedure
    .input(z.object({ studentId: z.string() }))
    .query(async ({ input }) => {
      return await getStudentByStudentId(input.studentId);
    }),

  /**
   * Create new student
   */
  create: adminProcedure
    .input(createStudentSchema)
    .mutation(async ({ input }) => {
      const existingStudent = await getStudentByStudentId(input.studentId);
      if (existingStudent) {
        throw new Error("Student ID already exists");
      }
      return await createStudent({
        studentId: input.studentId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        year: input.year,
        branch: input.branch,
        status: "active",
      });
    }),

  /**
   * Get access logs for a student
   */
  getAccessLogs: adminProcedure
    .input(z.object({ studentId: z.number(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      return await getAccessLogsByStudentId(input.studentId, input.limit);
    }),

  /**
   * List all students (all statuses) for admin panel
   */
  listAll: adminProcedure.query(async () => {
    return await getAllStudentsWithStatus();
  }),

  /**
   * Update student status (active/inactive/graduated)
   */
  updateStudentStatus: adminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["active", "inactive", "graduated"]),
    }))
    .mutation(async ({ input }) => {
      const student = await getStudentById(input.id);
      if (!student) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student not found" });
      }
      await updateStudentStatus(input.id, input.status);
      return { success: true };
    }),

  /**
   * Update student info
   */
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      studentId: z.string().min(1),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email().optional().or(z.literal("")).nullable(),
      phone: z.string().optional().nullable(),
      year: z.enum(["1", "2", "3", "4"]),
      branch: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const student = await getStudentById(id);
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Student not found" });

      if (data.studentId !== student.studentId) {
        const existing = await getStudentByStudentId(data.studentId);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "รหัสนักศึกษานี้มีอยู่แล้ว" });
      }

      await updateStudent(id, {
        studentId: data.studentId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || null,
        phone: data.phone || null,
        year: data.year,
        branch: data.branch,
      });
      return { success: true };
    }),

  /**
   * Delete student
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const student = await getStudentById(input.id);
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Student not found" });
      await deleteStudent(input.id);
      return { success: true };
    }),
});
