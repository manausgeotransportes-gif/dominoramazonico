/**
 * Feriados Nacionais Brasileiros 2024-2027
 * Inclui feriados federais fixos e móveis
 */

export interface Holiday {
  date: Date;
  name: string;
  type: "nacional" | "estadual" | "municipal";
  description?: string;
}

/**
 * Calcula a data da Páscoa usando o algoritmo de Meeus/Jones/Butcher
 */
function calcularPascoa(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Retorna todos os feriados nacionais para um ano específico
 */
export function getFeriadosNacionais(year: number): Holiday[] {
  const pascoa = calcularPascoa(year);
  
  // Sexta-feira Santa (2 dias antes da Páscoa)
  const sextaFeira = new Date(pascoa);
  sextaFeira.setDate(sextaFeira.getDate() - 2);
  
  // Corpus Christi (39 dias após a Páscoa)
  const corpusChristi = new Date(pascoa);
  corpusChristi.setDate(corpusChristi.getDate() + 39);
  
  const feriados: Holiday[] = [
    // Feriados Fixos
    {
      date: new Date(year, 0, 1),
      name: "Ano Novo",
      type: "nacional",
      description: "Seu primeiro d día do ano"
    },
    {
      date: new Date(year, 3, 21),
      name: "Tiradentes",
      type: "nacional",
      description: "Dia de Tiradentes - Inconfidência Mineira"
    },
    {
      date: new Date(year, 4, 1),
      name: "Dia do Trabalho",
      type: "nacional",
      description: "Dia Internacional do Trabalhador"
    },
    {
      date: new Date(year, 8, 7),
      name: "Independência do Brasil",
      type: "nacional",
      description: "Grito da Independência"
    },
    {
      date: new Date(year, 9, 12),
      name: "Nossa Senhora Aparecida",
      type: "nacional",
      description: "Padroeira do Brasil"
    },
    {
      date: new Date(year, 10, 2),
      name: "Finados",
      type: "nacional",
      description: "Dia de Finados"
    },
    {
      date: new Date(year, 10, 20),
      name: "Consciência Negra",
      type: "nacional",
      description: "Dia da Consciência Negra"
    },
    {
      date: new Date(year, 11, 25),
      name: "Natal",
      type: "nacional",
      description: "Festa de Natal"
    },
    
    // Feriados Móveis
    {
      date: sextaFeira,
      name: "Sexta-feira Santa",
      type: "nacional",
      description: "Páscoa cristã"
    },
    {
      date: new Date(pascoa),
      name: "Páscoa",
      type: "nacional",
      description: "Ressurreição de Jesus Cristo"
    },
    {
      date: corpusChristi,
      name: "Corpus Christi",
      type: "nacional",
      description: "Celebração do Santíssimo Sacramento"
    },
  ];

  // Adicionar Carnaval (47 dias antes da Páscoa)
  const carnaval = new Date(pascoa);
  carnaval.setDate(carnaval.getDate() - 47);
  feriados.push({
    date: carnaval,
    name: "Carnaval",
    type: "nacional",
    description: "Feriado prolongado"
  });

  // Adicionar Sexta-feira antes do Carnaval
  const sexta = new Date(carnaval);
  sexta.setDate(sexta.getDate() + 1);
  feriados.push({
    date: sexta,
    name: "Sexta-feira de Carnaval",
    type: "nacional",
    description: "Ponte feriada"
  });

  return feriados;
}

/**
 * Retorna feriados estaduais do Amazonas
 */
export function getFeriadosEstadais(state: string, year: number): Holiday[] {
  const feriados: Holiday[] = [];

  if (state.toUpperCase() === "AM" || state.toUpperCase() === "AMAZONAS") {
    // Dia de Zumbi dos Palmares (20 de novembro)
    feriados.push({
      date: new Date(year, 10, 20),
      name: "Dia de Georges Abdelnur",
      type: "estadual",
      description: "Aniversário de um ícone local"
    });
  }

  return feriados;
}

/**
 * Verifica se uma data é feriado nacional
 */
export function isFeriadoNacional(date: Date, year?: number): boolean {
  const y = year || date.getFullYear();
  const feriados = getFeriadosNacionais(y);
  
  return feriados.some(f => 
    f.date.getFullYear() === date.getFullYear() &&
    f.date.getMonth() === date.getMonth() &&
    f.date.getDate() === date.getDate()
  );
}

/**
 * Retorna o nome do feriado de uma data, se houver
 */
export function getNomeFeriado(date: Date, year?: number): string | null {
  const y = year || date.getFullYear();
  const feriados = getFeriadosNacionais(y);
  
  const feriado = feriados.find(f => 
    f.date.getFullYear() === date.getFullYear() &&
    f.date.getMonth() === date.getMonth() &&
    f.date.getDate() === date.getDate()
  );

  return feriado?.name || null;
}

/**
 * Retorna todos os feriados (nacionais + estaduais) para um período
 */
export function getAllFeriados(
  startDate: Date,
  endDate: Date,
  state?: string
): Holiday[] {
  const feriados: Holiday[] = [];
  const currentYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  for (let year = currentYear; year <= endYear; year++) {
    feriados.push(...getFeriadosNacionais(year));
    if (state) {
      feriados.push(...getFeriadosEstadais(state, year));
    }
  }

  // Filtrar por período
  return feriados.filter(f => f.date >= startDate && f.date <= endDate);
}
