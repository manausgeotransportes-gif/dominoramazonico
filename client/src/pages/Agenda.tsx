import { useState, useMemo } from "react";
import { ArrowLeft, Plus, Trash2, CheckCircle2, Clock, AlertCircle, Calendar as CalendarIcon, Edit3 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { getNomeFeriado, getAllFeriados } from "@shared/holidays";

export default function AgendaPage() {
  const { user } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/" });
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDueDate, setFormDueDate] = useState<Date | null>(null);
  const [formType, setFormType] = useState("vencimento");
  const [formPriority, setFormPriority] = useState("media");
  const [selectedState, setSelectedState] = useState("AM");

  const today = new Date();
  const nextMonth = new Date(today);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  // Queries
  const eventsQuery = trpc.calendar.listEvents.useQuery(
    { startDate: today, endDate: nextMonth },
    { refetchInterval: 5000 }
  );

  const upcomingQuery = trpc.calendar.upcomingEvents.useQuery(
    { days: 30 },
    { refetchInterval: 5000 }
  );

  // Mutations
  const createEvent = trpc.calendar.createEvent.useMutation({
    onSuccess: () => {
      toast.success("Evento criado com sucesso!");
      eventsQuery.refetch();
      upcomingQuery.refetch();
      resetForm();
      setDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const updateEvent = trpc.calendar.updateEvent.useMutation({
    onSuccess: () => {
      toast.success("Evento atualizado com sucesso!");
      eventsQuery.refetch();
      upcomingQuery.refetch();
      resetForm();
      setDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteEvent = trpc.calendar.deleteEvent.useMutation({
    onSuccess: () => {
      toast.success("Evento deletado com sucesso!");
      eventsQuery.refetch();
      upcomingQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const markAsComplete = trpc.calendar.markAsComplete.useMutation({
    onSuccess: () => {
      eventsQuery.refetch();
      upcomingQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormDueDate(null);
    setFormType("vencimento");
    setFormPriority("media");
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!formTitle || !formDueDate) {
      toast.error("Preencha título e data!");
      return;
    }

    if (editingId) {
      await updateEvent.mutateAsync({
        id: editingId,
        title: formTitle,
        description: formDescription,
        dueDate: formDueDate,
        eventType: formType as "vencimento" | "fatura" | "documento" | "lembretes" | "outro",
        priority: formPriority as "baixa" | "media" | "alta",
      });
    } else {
      await createEvent.mutateAsync({
        title: formTitle,
        description: formDescription,
        dueDate: formDueDate,
        eventType: formType as "vencimento" | "fatura" | "documento" | "lembretes" | "outro",
        priority: formPriority as "baixa" | "media" | "alta",
      });
    }
  };

  // Get holidays for calendar display
  const feriados = useMemo(() => {
    const current = new Date();
    const nextYear = new Date(current.getFullYear() + 1, 0, 1);
    return getAllFeriados(current, nextYear, selectedState);
  }, [selectedState]);

  // Check if date is holiday
  const isHoliday = (date: Date) => {
    return feriados.some(
      (feriado) =>
        feriado.date.getFullYear() === date.getFullYear() &&
        feriado.date.getMonth() === date.getMonth() &&
        feriado.date.getDate() === date.getDate()
    );
  };

  const getHolidayName = (date: Date) => {
    const feriado = feriados.find(
      (feriado) =>
        feriado.date.getFullYear() === date.getFullYear() &&
        feriado.date.getMonth() === date.getMonth() &&
        feriado.date.getDate() === date.getDate()
    );
    return feriado?.name ?? null;
  };

  // Get events for selected date
  type CalendarEventType = NonNullable<typeof eventsQuery.data>[number];

  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [] as CalendarEventType[];
    return (eventsQuery.data ?? []).filter(
      (event) =>
        new Date(event.dueDate).getFullYear() === selectedDate.getFullYear() &&
        new Date(event.dueDate).getMonth() === selectedDate.getMonth() &&
        new Date(event.dueDate).getDate() === selectedDate.getDate()
    );
  }, [selectedDate, eventsQuery.data]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "alta":
        return "bg-red-500/20 text-red-300 border-red-500/30";
      case "media":
        return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
      case "baixa":
        return "bg-green-500/20 text-green-300 border-green-500/30";
      default:
        return "bg-gray-500/20 text-gray-300 border-gray-500/30";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "fatura":
        return "💰";
      case "documento":
        return "📄";
      case "vencimento":
        return "⏰";
      case "lembretes":
        return "🔔";
      default:
        return "📌";
    }
  };

  const handleEditEvent = (event: CalendarEventType) => {
    setEditingId(event.id);
    setFormTitle(event.title);
    setFormDescription(event.description ?? "");
    setFormDueDate(new Date(event.dueDate));
    setFormType(event.eventType);
    setFormPriority(event.priority);
    setDialogOpen(true);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const daysUntil = (date: Date | string) => {
    const eventDate = new Date(date);
    const today = new Date();
    const diff = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#14532d,#020617_65%)] text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/lobby">
              <Button variant="outline" className="border-white/20">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar ao lobby
              </Button>
            </Link>
            <div>
              <h1 className="text-4xl font-black">Agenda</h1>
              <p className="text-slate-300">Controle seus vencimentos e feriados em um único lugar</p>
            </div>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 h-11">
                <Plus className="w-4 h-4 mr-2" />
                Novo Evento
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar Evento" : "Novo Evento"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Título *</label>
                  <Input
                    placeholder="Ex: Fatura do Cartão"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="border-white/10 bg-white/5 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Descrição</label>
                  <Textarea
                    placeholder="Detalhes sobre o evento..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="border-white/10 bg-white/5 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Data de Vencimento *</label>
                  <Input
                    type="date"
                    value={formDueDate ? formDueDate.toISOString().split("T")[0] : ""}
                    onChange={(e) => {
                      if (e.target.value) {
                        const date = new Date(e.target.value + "T00:00:00");
                        setFormDueDate(date);
                      }
                    }}
                    className="border-white/10 bg-white/5 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Tipo</label>
                  <Select value={formType} onValueChange={setFormType}>
                    <SelectTrigger className="border-white/10 bg-white/5 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      <SelectItem value="vencimento">Vencimento</SelectItem>
                      <SelectItem value="fatura">Fatura</SelectItem>
                      <SelectItem value="documento">Documento</SelectItem>
                      <SelectItem value="lembretes">Lembretes</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Prioridade</label>
                  <Select value={formPriority} onValueChange={setFormPriority}>
                    <SelectTrigger className="border-white/10 bg-white/5 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={!formTitle || !formDueDate || createEvent.isPending || updateEvent.isPending}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {editingId ? "Atualizar" : "Criar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Calendar e Próximos Eventos */}
          <div className="lg:col-span-2 space-y-6">
            {/* Calendar */}
            <Card className="border-white/10 bg-slate-950/85">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-emerald-400" />
                  Calendário
                </CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  className="rounded-md border border-white/10"
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  modifiers={{
                    holiday: (date) => isHoliday(date),
                    event: (date) =>
                      (eventsQuery.data ?? []).some(
                        (event) =>
                          new Date(event.dueDate).getFullYear() === date.getFullYear() &&
                          new Date(event.dueDate).getMonth() === date.getMonth() &&
                          new Date(event.dueDate).getDate() === date.getDate()
                      ),
                  }}
                  modifiersClassNames={{
                    holiday: "bg-red-500/20 text-red-200 font-bold",
                    event: "bg-blue-500/20 text-blue-200",
                  }}
                />
              </CardContent>
            </Card>

            {/* Selected Date Info */}
            {selectedDate && (
              <Card className="border-white/10 bg-slate-950/85">
                <CardHeader>
                  <CardTitle>{formatDate(selectedDate)}</CardTitle>
                  {isHoliday(selectedDate) && (
                    <CardDescription className="text-yellow-300">
                      🎉 {getHolidayName(selectedDate)}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedDateEvents.length === 0 ? (
                    <p className="text-slate-400">Nenhum evento neste dia</p>
                  ) : (
                    selectedDateEvents.map((event) => (
                      <div
                        key={event.id}
                        className={`rounded-lg border p-3 space-y-2 ${getPriorityColor(event.priority)}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-semibold">{getTypeIcon(event.eventType)} {event.title}</p>
                            <p className="text-sm opacity-75">{event.description}</p>
                          </div>
                          <div className="flex gap-2">
                            {!event.completed && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => markAsComplete.mutate(event.id)}
                                className="h-8 w-8"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditEvent(event)}
                              className="h-8 w-8"
                            >
                              <Edit3 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteEvent.mutate(event.id)}
                              className="h-8 w-8 text-red-400 hover:text-red-300"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Próximos Vencimentos */}
          <div className="space-y-6">
            <Card className="border-white/10 bg-slate-950/85">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-400" />
                  Próximos 30 Dias
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(upcomingQuery.data ?? []).length === 0 ? (
                  <p className="text-slate-400 text-sm">Nenhum vencimento próximo</p>
                ) : (
                  upcomingQuery.data?.map((event: CalendarEventType) => {
                    const days = daysUntil(event.dueDate);
                    const isUrgent = days <= 7;
                    return (
                      <div
                        key={event.id}
                        className={`rounded-lg border p-3 space-y-1 cursor-pointer hover:bg-white/[0.05] transition ${
                          isUrgent ? "border-red-500/30 bg-red-500/10" : "border-white/10"
                        }`}
                        onClick={() => {
                          setSelectedDate(new Date(event.dueDate));
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm">{getTypeIcon(event.eventType)} {event.title}</p>
                          {isUrgent && <AlertCircle className="w-4 h-4 text-red-400" />}
                        </div>
                        <p className="text-xs text-slate-400">{formatDate(event.dueDate)}</p>
                        {days < 0 ? (
                          <p className="text-xs text-red-400">Vencido há {Math.abs(days)} dias</p>
                        ) : days === 0 ? (
                          <p className="text-xs text-yellow-400">Vence hoje!</p>
                        ) : days === 1 ? (
                          <p className="text-xs text-yellow-400">Vence amanhã</p>
                        ) : (
                          <p className="text-xs text-slate-400">Faltam {days} dias</p>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Feriados */}
            <Card className="border-white/10 bg-slate-950/85">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-red-400" />
                  Feriados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-2">Estado</label>
                    <Select value={selectedState} onValueChange={setSelectedState}>
                      <SelectTrigger className="border-white/10 bg-white/5 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="AM">Amazonas</SelectItem>
                        <SelectItem value="SP">São Paulo</SelectItem>
                        <SelectItem value="RJ">Rio de Janeiro</SelectItem>
                        <SelectItem value="MG">Minas Gerais</SelectItem>
                        <SelectItem value="RS">Rio Grande do Sul</SelectItem>
                        <SelectItem value="PE">Pernambuco</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {feriados.slice(0, 10).map((feriado, idx) => (
                    <div key={idx} className="border-b border-white/10 pb-2 last:border-0">
                      <p className="font-semibold text-sm">{feriado.name}</p>
                      <p className="text-xs text-slate-400">{feriado.date.toLocaleDateString("pt-BR")}</p>
                      {feriado.description && (
                        <p className="text-xs text-slate-500">{feriado.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
