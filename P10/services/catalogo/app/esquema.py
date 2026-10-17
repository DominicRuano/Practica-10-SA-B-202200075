import strawberry
from graphql import GraphQLError
from strawberry.types import Info

from .repositorio import CategoriaRegistro
from .servicio import (
    CategoriaNoEncontrada,
    DatosCategoriaInvalidos,
    ServicioCatalogo,
)


@strawberry.type
class Categoria:
    id: int
    nombre: str
    descripcion: str

    @classmethod
    def desde_registro(cls, registro: CategoriaRegistro) -> "Categoria":
        return cls(
            id=registro.id,
            nombre=registro.nombre,
            descripcion=registro.descripcion,
        )


@strawberry.input
class CategoriaInput:
    nombre: str
    descripcion: str = ""


def _servicio(info: Info) -> ServicioCatalogo:
    return info.context["servicio"]


def _error_graphql(error: Exception) -> GraphQLError:
    return GraphQLError(str(error))


@strawberry.type
class Query:
    @strawberry.field
    def categorias(self, info: Info) -> list[Categoria]:
        return [
            Categoria.desde_registro(registro)
            for registro in _servicio(info).listar()
        ]

    @strawberry.field
    def categoria(self, info: Info, id: int) -> Categoria | None:
        try:
            registro = _servicio(info).obtener(id)
        except DatosCategoriaInvalidos as error:
            raise _error_graphql(error) from error
        return Categoria.desde_registro(registro) if registro else None


@strawberry.type
class Mutation:
    @strawberry.mutation
    def crear_categoria(self, info: Info, datos: CategoriaInput) -> Categoria:
        try:
            registro = _servicio(info).crear(datos.nombre, datos.descripcion)
        except DatosCategoriaInvalidos as error:
            raise _error_graphql(error) from error
        return Categoria.desde_registro(registro)

    @strawberry.mutation
    def actualizar_categoria(
        self, info: Info, id: int, datos: CategoriaInput
    ) -> Categoria:
        try:
            registro = _servicio(info).actualizar(
                id, datos.nombre, datos.descripcion
            )
        except (DatosCategoriaInvalidos, CategoriaNoEncontrada) as error:
            raise _error_graphql(error) from error
        return Categoria.desde_registro(registro)

    @strawberry.mutation
    def eliminar_categoria(self, info: Info, id: int) -> bool:
        try:
            return _servicio(info).eliminar(id)
        except (DatosCategoriaInvalidos, CategoriaNoEncontrada) as error:
            raise _error_graphql(error) from error


esquema = strawberry.Schema(query=Query, mutation=Mutation)
