import { z } from "zod";
import { ESTADOS_SOLICITUD } from "../domain/solicitud.js";

const texto = (campo: string, minimo: number, maximo: number) =>
  z
    .string({ error: `${campo} debe ser texto.` })
    .trim()
    .min(minimo, `${campo} debe tener al menos ${minimo} caracteres.`)
    .max(maximo, `${campo} no puede superar ${maximo} caracteres.`);

const camposSolicitud = {
  categoria_id: z
    .number({ error: "categoria_id debe ser un número." })
    .int("categoria_id debe ser un entero.")
    .positive("categoria_id debe ser mayor que cero."),
  titulo: texto("titulo", 3, 200),
  descripcion: texto("descripcion", 3, 1000),
  prioridad: z
    .number({ error: "prioridad debe ser un número." })
    .int("prioridad debe ser un entero.")
    .min(1, "prioridad debe estar entre 1 y 5.")
    .max(5, "prioridad debe estar entre 1 y 5."),
};

export const creacionSolicitudSchema = z.strictObject(camposSolicitud);

export const reemplazoSolicitudSchema = z.strictObject({
  ...camposSolicitud,
  estado: z.enum(ESTADOS_SOLICITUD),
});

export const estadoSolicitudSchema = z.strictObject({
  estado: z.enum(ESTADOS_SOLICITUD),
});

export const idSolicitudSchema = z.uuid({
  error: "El id debe ser un UUID válido.",
});

export const identidadSchema = z.object({
  usuarioId: z.uuid(),
  rol: z.enum(["cliente", "admin"]),
});
