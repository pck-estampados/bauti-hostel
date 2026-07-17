# Galería administrable

La galería utiliza el bucket público `hostel-media` y conserva los archivos bajo
el prefijo `gallery/` con nombres UUID v4 no predecibles. La base de datos sólo
publica filas activas que tengan texto alternativo.

## Decisión técnica de carga

El límite operativo es exactamente **6 MiB (6.291.456 bytes) por archivo**. Se
eligió este tamaño para usar la carga estándar de Supabase y validar el archivo
completo en el servidor antes de activarlo. El mismo límite se aplica en cuatro
capas:

- el bucket de Supabase Storage;
- la restricción de `media_assets.size_bytes`;
- la validación server-side usada por la API;
- la validación anticipada del panel administrativo.

Las pruebas automatizadas fijan el mismo valor para evitar divergencias. Los
formatos admitidos son JPEG, PNG y WebP, con un máximo adicional de 50
megapíxeles.

## Categorías

El catálogo cerrado contiene únicamente: `exterior`, `recepcion`, `habitacion`,
`pileta`, `patio`, `espacios_comunes`, `desayuno` y `otros`. Las etiquetas
visibles se presentan en español con la acentuación correspondiente.
