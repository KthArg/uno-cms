Un componente por tipo de campo, para la autogeneración de formularios (SPEC §5.1).

Quien los reparte es el `switch` de `../EntryForm.tsx`, y es **exhaustivo** por tipo: si se añade
un campo a `cms.config.ts` y falta su componente aquí, no compila. Lo comprobé por mutación antes
de afirmarlo — sin el caso `never`, ese `switch` compilaba igual, porque un componente de React
puede devolver `undefined`.

Tiptap se carga con `dynamic` y solo en los campos `richtext`, con la etiqueta **fuera** de esa
frontera perezosa: si no, el campo se queda sin nombre accesible mientras carga.
