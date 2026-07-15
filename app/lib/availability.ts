export type AvailabilitySearchParams = Record<
  string,
  string | string[] | undefined
>;

export type AvailabilityRequest = {
  checkin: string;
  checkout: string;
  adults: number;
  children: number;
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? "";
}

function safeCount(value: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

export function parseAvailabilityRequest(
  params: AvailabilitySearchParams,
): AvailabilityRequest {
  return {
    checkin: single(params.checkin),
    checkout: single(params.checkout),
    adults: safeCount(single(params.adults), 2, 1, 20),
    children: safeCount(single(params.children), 0, 0, 10),
  };
}

export function isValidAvailabilityRequest(request: AvailabilityRequest) {
  return (
    isValidDate(request.checkin) &&
    isValidDate(request.checkout) &&
    request.checkout > request.checkin
  );
}

function isValidDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T12:00:00`).getTime())
  );
}

export function displayDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function shortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function buildAvailabilityWhatsappMessage(request: AvailabilityRequest) {
  const totalGuests = request.adults + request.children;

  return [
    "Hola, quiero consultar disponibilidad en Hostel Bauti.",
    "",
    `Fecha de ingreso: ${shortDate(request.checkin)}`,
    `Fecha de salida: ${shortDate(request.checkout)}`,
    `Cantidad de huéspedes: ${totalGuests}`,
    `Adultos: ${request.adults}`,
    `Niños: ${request.children}`,
    "",
    "Quisiera conocer las habitaciones disponibles y el precio total. Gracias.",
  ].join("\n");
}
