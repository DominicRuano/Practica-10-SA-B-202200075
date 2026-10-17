from typing import Protocol

from .repositorio import CategoriaRegistro, NombreCategoriaDuplicado


class RepositorioCategorias(Protocol):
    def listar(self) -> list[CategoriaRegistro]: ...

    def obtener(self, categoria_id: int) -> CategoriaRegistro | None: ...

    def crear(self, nombre: str, descripcion: str) -> CategoriaRegistro: ...

    def actualizar(
        self, categoria_id: int, nombre: str, descripcion: str
    ) -> CategoriaRegistro | None: ...

    def eliminar(self, categoria_id: int) -> bool: ...


class CategoriaNoEncontrada(Exception):
    pass


class DatosCategoriaInvalidos(Exception):
    pass


class ServicioCatalogo:
    def __init__(self, repositorio: RepositorioCategorias) -> None:
        self.repositorio = repositorio

    def listar(self) -> list[CategoriaRegistro]:
        return self.repositorio.listar()

    def obtener(self, categoria_id: int) -> CategoriaRegistro | None:
        self._validar_id(categoria_id)
        return self.repositorio.obtener(categoria_id)

    def crear(self, nombre: str, descripcion: str) -> CategoriaRegistro:
        nombre_limpio, descripcion_limpia = self._validar_textos(
            nombre, descripcion
        )
        try:
            return self.repositorio.crear(nombre_limpio, descripcion_limpia)
        except NombreCategoriaDuplicado as error:
            raise DatosCategoriaInvalidos(
                "Ya existe una categoría con ese nombre."
            ) from error

    def actualizar(
        self, categoria_id: int, nombre: str, descripcion: str
    ) -> CategoriaRegistro:
        self._validar_id(categoria_id)
        nombre_limpio, descripcion_limpia = self._validar_textos(
            nombre, descripcion
        )
        try:
            categoria = self.repositorio.actualizar(
                categoria_id, nombre_limpio, descripcion_limpia
            )
        except NombreCategoriaDuplicado as error:
            raise DatosCategoriaInvalidos(
                "Ya existe una categoría con ese nombre."
            ) from error

        if categoria is None:
            raise CategoriaNoEncontrada("La categoría no existe.")
        return categoria

    def eliminar(self, categoria_id: int) -> bool:
        self._validar_id(categoria_id)
        if not self.repositorio.eliminar(categoria_id):
            raise CategoriaNoEncontrada("La categoría no existe.")
        return True

    @staticmethod
    def _validar_id(categoria_id: int) -> None:
        if categoria_id <= 0:
            raise DatosCategoriaInvalidos(
                "El identificador de la categoría debe ser mayor que cero."
            )

    @staticmethod
    def _validar_textos(nombre: str, descripcion: str) -> tuple[str, str]:
        nombre_limpio = nombre.strip()
        descripcion_limpia = descripcion.strip()

        if len(nombre_limpio) < 3 or len(nombre_limpio) > 80:
            raise DatosCategoriaInvalidos(
                "El nombre debe tener entre 3 y 80 caracteres."
            )
        if len(descripcion_limpia) > 250:
            raise DatosCategoriaInvalidos(
                "La descripción no puede superar 250 caracteres."
            )
        return nombre_limpio, descripcion_limpia
