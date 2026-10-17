import logging
import os
from contextlib import asynccontextmanager
from typing import Annotated, AsyncIterator, Protocol

from fastapi import FastAPI, Header, HTTPException, Request, status
from strawberry.fastapi import GraphQLRouter

from .esquema import esquema
from .repositorio import RepositorioCategoriasPostgres
from .servicio import RepositorioCategorias, ServicioCatalogo


class RepositorioAplicacion(RepositorioCategorias, Protocol):
    def inicializar(self) -> None: ...

    def disponible(self) -> bool: ...


def _configurar_logging() -> None:
    nivel = os.getenv("LOG_LEVEL", "INFO").upper()
    if nivel not in logging.getLevelNamesMapping():
        nivel = "INFO"
    logging.basicConfig(
        level=nivel,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def crear_aplicacion(
    repositorio: RepositorioAplicacion | None = None,
) -> FastAPI:
    _configurar_logging()
    repositorio_real = repositorio or RepositorioCategoriasPostgres(
        os.getenv(
            "DATABASE_URL",
            "postgresql://catalogo:catalogo@postgresql:5432/catalogo",
        )
    )
    servicio = ServicioCatalogo(repositorio_real)

    @asynccontextmanager
    async def ciclo_vida(aplicacion: FastAPI) -> AsyncIterator[None]:
        aplicacion.state.inicio_completado = False
        repositorio_real.inicializar()
        aplicacion.state.inicio_completado = True
        try:
            yield
        finally:
            aplicacion.state.inicio_completado = False

    aplicacion = FastAPI(
        title="Servicio de catálogo",
        version="2.0.0",
        lifespan=ciclo_vida,
    )
    aplicacion.state.servicio_catalogo = servicio
    aplicacion.state.repositorio_catalogo = repositorio_real
    aplicacion.state.inicio_completado = False

    @aplicacion.get("/live")
    @aplicacion.get("/api/v1/catalogo/live", include_in_schema=False)
    def live() -> dict[str, str]:
        return {"status": "ok", "servicio": "catalogo"}

    @aplicacion.get("/api/v1/catalogo/health")
    def health() -> dict[str, str]:
        return live()

    @aplicacion.get("/ready")
    @aplicacion.get("/api/v1/catalogo/ready", include_in_schema=False)
    def ready(request: Request) -> dict[str, str]:
        if not request.app.state.repositorio_catalogo.disponible():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="PostgreSQL no está disponible.",
            )
        return {"status": "ready", "servicio": "catalogo"}

    @aplicacion.get("/startup")
    @aplicacion.get("/api/v1/catalogo/startup", include_in_schema=False)
    def startup(request: Request) -> dict[str, str]:
        if not request.app.state.inicio_completado:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="La inicialización no ha terminado.",
            )
        return {"status": "started", "servicio": "catalogo"}

    async def obtener_contexto(
        request: Request,
        x_user_id: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        if x_user_id is None or not x_user_id.strip():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Se requiere una identidad autenticada.",
            )
        return {
            "request": request,
            "usuario_id": x_user_id.strip(),
            "servicio": request.app.state.servicio_catalogo,
        }

    graphql = GraphQLRouter(esquema, context_getter=obtener_contexto)
    aplicacion.include_router(
        graphql,
        prefix="/api/v1/catalogo/graphql",
    )
    return aplicacion


from .telemetria import instrumentar

app = crear_aplicacion()
instrumentar(app)
