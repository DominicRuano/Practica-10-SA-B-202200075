from dataclasses import replace

from fastapi.testclient import TestClient

from app.main import crear_aplicacion
from app.repositorio import CategoriaRegistro, NombreCategoriaDuplicado


CABECERAS = {"X-User-Id": "usuario-1"}
SEMILLAS = [
    CategoriaRegistro(
        1,
        "Infraestructura",
        "Aulas, mobiliario y espacios físicos.",
    ),
    CategoriaRegistro(
        2,
        "Soporte técnico",
        "Equipo, plataformas y servicios tecnológicos.",
    ),
    CategoriaRegistro(
        3,
        "Servicios estudiantiles",
        "Trámites y atención para estudiantes.",
    ),
]


class RepositorioEnMemoria:
    def __init__(self, disponible: bool = True) -> None:
        self.registros: dict[int, CategoriaRegistro] = {}
        self.siguiente_id = 1
        self.esta_disponible = disponible
        self.inicializaciones = 0

    def inicializar(self) -> None:
        self.inicializaciones += 1
        if not self.registros:
            for semilla in SEMILLAS:
                self.registros[semilla.id] = semilla
            self.siguiente_id = 4

    def disponible(self) -> bool:
        return self.esta_disponible

    def listar(self) -> list[CategoriaRegistro]:
        return list(self.registros.values())

    def obtener(self, categoria_id: int) -> CategoriaRegistro | None:
        return self.registros.get(categoria_id)

    def crear(self, nombre: str, descripcion: str) -> CategoriaRegistro:
        self._validar_unico(nombre)
        registro = CategoriaRegistro(self.siguiente_id, nombre, descripcion)
        self.registros[registro.id] = registro
        self.siguiente_id += 1
        return registro

    def actualizar(
        self, categoria_id: int, nombre: str, descripcion: str
    ) -> CategoriaRegistro | None:
        actual = self.registros.get(categoria_id)
        if actual is None:
            return None
        self._validar_unico(nombre, categoria_id)
        actualizado = replace(actual, nombre=nombre, descripcion=descripcion)
        self.registros[categoria_id] = actualizado
        return actualizado

    def eliminar(self, categoria_id: int) -> bool:
        return self.registros.pop(categoria_id, None) is not None

    def _validar_unico(
        self, nombre: str, id_ignorado: int | None = None
    ) -> None:
        if any(
            item.id != id_ignorado
            and item.nombre.strip().casefold() == nombre.strip().casefold()
            for item in self.registros.values()
        ):
            raise NombreCategoriaDuplicado


def ejecutar_graphql(
    cliente: TestClient, consulta: str, variables: dict | None = None
) -> dict:
    respuesta = cliente.post(
        "/api/v1/catalogo/graphql",
        headers=CABECERAS,
        json={"query": consulta, "variables": variables or {}},
    )
    assert respuesta.status_code == 200
    return respuesta.json()


def test_health_y_probes_son_publicos() -> None:
    repositorio = RepositorioEnMemoria()
    app = crear_aplicacion(repositorio)

    with TestClient(app) as cliente:
        assert cliente.get("/live").json() == {
            "status": "ok",
            "servicio": "catalogo",
        }
        assert cliente.get("/api/v1/catalogo/health").status_code == 200
        assert cliente.get("/ready").json()["status"] == "ready"
        assert cliente.get("/startup").json()["status"] == "started"

    assert repositorio.inicializaciones == 1


def test_readiness_falla_si_postgresql_no_responde() -> None:
    app = crear_aplicacion(RepositorioEnMemoria(disponible=False))

    with TestClient(app) as cliente:
        assert cliente.get("/live").status_code == 200
        respuesta = cliente.get("/ready")

    assert respuesta.status_code == 503


def test_graphql_exige_usuario() -> None:
    app = crear_aplicacion(RepositorioEnMemoria())

    with TestClient(app) as cliente:
        respuesta = cliente.post(
            "/api/v1/catalogo/graphql",
            json={"query": "query { categorias { id } }"},
        )

    assert respuesta.status_code == 401
    assert respuesta.json()["detail"] == "Se requiere una identidad autenticada."


def test_semillas_y_crud_graphql() -> None:
    repositorio = RepositorioEnMemoria()
    app = crear_aplicacion(repositorio)

    with TestClient(app) as cliente:
        listado = ejecutar_graphql(
            cliente,
            "query { categorias { id nombre descripcion } }",
        )
        assert [item["nombre"] for item in listado["data"]["categorias"]] == [
            "Infraestructura",
            "Soporte técnico",
            "Servicios estudiantiles",
        ]

        creacion = ejecutar_graphql(
            cliente,
            """
            mutation Crear($datos: CategoriaInput!) {
              crearCategoria(datos: $datos) { id nombre descripcion }
            }
            """,
            {
                "datos": {
                    "nombre": "Biblioteca",
                    "descripcion": "Préstamos y recursos bibliográficos",
                }
            },
        )
        creada = creacion["data"]["crearCategoria"]
        assert creada["nombre"] == "Biblioteca"

        actualizacion = ejecutar_graphql(
            cliente,
            """
            mutation Actualizar($id: Int!, $datos: CategoriaInput!) {
              actualizarCategoria(id: $id, datos: $datos) { nombre descripcion }
            }
            """,
            {
                "id": creada["id"],
                "datos": {
                    "nombre": "Biblioteca central",
                    "descripcion": "Atención y préstamos",
                },
            },
        )
        assert actualizacion["data"]["actualizarCategoria"]["nombre"] == (
            "Biblioteca central"
        )

        eliminacion = ejecutar_graphql(
            cliente,
            "mutation Eliminar($id: Int!) { eliminarCategoria(id: $id) }",
            {"id": creada["id"]},
        )
        assert eliminacion["data"]["eliminarCategoria"] is True

    # Volver a inicializar es idempotente y no repone datos borrados.
    segunda_app = crear_aplicacion(repositorio)
    with TestClient(segunda_app) as cliente:
        listado = ejecutar_graphql(cliente, "query { categorias { nombre } }")
    assert len(listado["data"]["categorias"]) == 3


def test_conflicto_validacion_y_categoria_inexistente() -> None:
    app = crear_aplicacion(RepositorioEnMemoria())

    with TestClient(app) as cliente:
        duplicada = ejecutar_graphql(
            cliente,
            """
            mutation Crear($datos: CategoriaInput!) {
              crearCategoria(datos: $datos) { id }
            }
            """,
            {"datos": {"nombre": "infraestructura", "descripcion": "Otra"}},
        )
        assert duplicada["errors"][0]["message"] == (
            "Ya existe una categoría con ese nombre."
        )

        invalida = ejecutar_graphql(
            cliente,
            """
            mutation Crear($datos: CategoriaInput!) {
              crearCategoria(datos: $datos) { id }
            }
            """,
            {"datos": {"nombre": "x", "descripcion": ""}},
        )
        assert invalida["errors"][0]["message"] == (
            "El nombre debe tener entre 3 y 80 caracteres."
        )

        inexistente = ejecutar_graphql(
            cliente,
            """
            mutation Actualizar($id: Int!, $datos: CategoriaInput!) {
              actualizarCategoria(id: $id, datos: $datos) { id }
            }
            """,
            {
                "id": 9999,
                "datos": {"nombre": "Nueva categoría", "descripcion": ""},
            },
        )
        assert inexistente["errors"][0]["message"] == (
            "La categoría no existe."
        )
