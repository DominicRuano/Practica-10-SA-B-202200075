DROP INDEX IF EXISTS uq_solicitudes_usuario_titulo;

CREATE UNIQUE INDEX uq_solicitudes_usuario_titulo_activo
    ON solicitudes (usuario_id, lower(trim(titulo)))
    WHERE estado <> 'finalizada';
