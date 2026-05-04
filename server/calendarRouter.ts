import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { calendarEvents } from "../drizzle/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import {
  createCalendarEventLocal,
  deleteCalendarEventLocal,
  listCalendarEventsLocal,
  listUpcomingCalendarEventsLocal,
  updateCalendarEventLocal,
} from "./localStore";

export const calendarRouter = router({
  /**
   * Criar um novo evento de calendário/vencimento
   */
  createEvent: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1, "Título é obrigatório"),
        description: z.string().optional(),
        dueDate: z.date(),
        eventType: z.enum(["vencimento", "fatura", "documento", "lembretes", "outro"]),
        priority: z.enum(["baixa", "media", "alta"]).default("media"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        return createCalendarEventLocal({
          userId: ctx.user.id,
          title: input.title,
          description: input.description,
          dueDate: input.dueDate,
          eventType: input.eventType,
          priority: input.priority,
        });
      }

      const [event] = await db
        .insert(calendarEvents)
        .values({
          userId: ctx.user.id,
          title: input.title,
          description: input.description,
          dueDate: input.dueDate,
          eventType: input.eventType,
          priority: input.priority,
        })
        .$returningId();

      return event;
    }),

  /**
   * Listar eventos do usuário para um período específico
   */
  listEvents: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return listCalendarEventsLocal(ctx.user.id, input.startDate, input.endDate);

      const events = await db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, ctx.user.id),
            gte(calendarEvents.dueDate, input.startDate),
            lte(calendarEvents.dueDate, input.endDate)
          )
        )
        .orderBy(calendarEvents.dueDate);

      return events;
    }),

  /**
   * Obter próximos vencimentos (próximos 30 dias)
   */
  upcomingEvents: protectedProcedure
    .input(
      z.object({
        days: z.number().default(30),
      })
    )
    .query(async ({ input, ctx }) => {
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + input.days);

      const db = await getDb();
      if (!db) return listUpcomingCalendarEventsLocal(ctx.user.id, input.days);

      const events = await db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, ctx.user.id),
            eq(calendarEvents.completed, false),
            gte(calendarEvents.dueDate, today),
            lte(calendarEvents.dueDate, endDate)
          )
        )
        .orderBy(calendarEvents.dueDate);

      return events;
    }),

  /**
   * Atualizar um evento
   */
  updateEvent: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        dueDate: z.date().optional(),
        eventType: z.enum(["vencimento", "fatura", "documento", "lembretes", "outro"]).optional(),
        priority: z.enum(["baixa", "media", "alta"]).optional(),
        completed: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...updates } = input;
      const cleanedUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, value]) => value !== undefined)
      );

      const db = await getDb();
      if (!db) {
        updateCalendarEventLocal(ctx.user.id, id, cleanedUpdates);
        return { success: true };
      }

      await db
        .update(calendarEvents)
        .set({
          ...cleanedUpdates,
          updatedAt: new Date(),
        })
        .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, ctx.user.id)));

      return { success: true };
    }),

  /**
   * Deletar um evento
   */
  deleteEvent: protectedProcedure
    .input(z.number())
    .mutation(async ({ input: eventId, ctx }) => {
      const db = await getDb();
      if (!db) {
        deleteCalendarEventLocal(ctx.user.id, eventId);
        return { success: true };
      }

      await db
        .delete(calendarEvents)
        .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, ctx.user.id)));

      return { success: true };
    }),

  /**
   * Marcar como completo
   */
  markAsComplete: protectedProcedure
    .input(z.number())
    .mutation(async ({ input: eventId, ctx }) => {
      const db = await getDb();
      if (!db) {
        updateCalendarEventLocal(ctx.user.id, eventId, { completed: true });
        return { success: true };
      }

      await db
        .update(calendarEvents)
        .set({ completed: true })
        .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, ctx.user.id)));

      return { success: true };
    }),
});
