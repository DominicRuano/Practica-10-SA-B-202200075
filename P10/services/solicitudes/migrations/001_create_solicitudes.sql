CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS solicitudes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL,
    categoria_id INTEGER NOT NULL CHECK (categoria_id > 0),
    titulo VARCHAR(200) NOT NULL CHECK (char_length(trim(titulo)) BETWEEN 3 AND 200),
    descripcion VARCHAR(1000) NOT NULL CHECK (char_length(trim(descripcion)) BETWEEN 3 AND 1000),
    prioridad SMALLINT NOT NULL CHECK (prioridad BETWEEN 1 AND 5),
    estado VARCHAR(20) NOT NULL DEFAULT 'registrada'
        CHECK (estado IN ('registrada', 'en_proceso', 'finalizada')),
    creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitudes_usuario_titulo
    ON solicitudes (usuario_id, lower(trim(titulo)));

CREATE INDEX IF NOT EXISTS idx_solicitudes_usuario
    ON solicitudes (usuario_id);

CREATE INDEX IF NOT EXISTS idx_solicitudes_estado
    ON solicitudes (estado);
