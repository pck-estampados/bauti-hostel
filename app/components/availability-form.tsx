type AvailabilityFormProps = {
  compact?: boolean;
  defaults?: {
    checkin?: string;
    checkout?: string;
    adults?: string;
    children?: string;
  };
};

export function AvailabilityForm({ compact = false, defaults }: AvailabilityFormProps) {
  return (
    <form
      className={`availability-form${compact ? " availability-form--compact" : ""}`}
      action="/disponibilidad"
      method="get"
    >
      <label>
        <span>Ingreso</span>
        <input type="date" name="checkin" defaultValue={defaults?.checkin} required />
      </label>
      <label>
        <span>Salida</span>
        <input type="date" name="checkout" defaultValue={defaults?.checkout} required />
      </label>
      <label>
        <span>Adultos</span>
        <select name="adults" defaultValue={defaults?.adults ?? "2"}>
          {[1, 2, 3, 4, 5, 6].map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Niños</span>
        <select name="children" defaultValue={defaults?.children ?? "0"}>
          {[0, 1, 2, 3, 4].map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </label>
      <button className="button button--primary availability-form__submit" type="submit">
        Consultar disponibilidad
      </button>
    </form>
  );
}
