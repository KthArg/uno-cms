/**
 * Lo que se enseña cuando una llamada al servidor **lanza** en vez de responder.
 *
 * ## Por qué hace falta esto
 *
 * Las pantallas del panel manejan bien el "no se pudo": una action devuelve `{ ok: false }` con
 * su motivo y la pantalla lo cuenta. Lo que no manejaban es que la llamada **ni siquiera
 * llegue**: una Server Action rechaza si la red se cae, si el servidor devuelve un 500 o si el
 * despliegue cambia a mitad de la petición.
 *
 * Sin capturarlo, el `await` propaga, el manejador muere ahí y la bandera de "ocupado" **nunca
 * vuelve a bajar**: el botón se queda deshabilitado diciendo "Guardando…" para siempre, sin un
 * solo mensaje, y la única salida es recargar. Es el peor de los dos fallos posibles — el de
 * "no se pudo" al menos se explica.
 *
 * ## Por qué el mensaje es genérico
 *
 * Porque desde el cliente no se puede distinguir una red caída de un servidor caído de un
 * despliegue en curso, y adivinar sería inventarle una causa a quien lo lee. Lo que sí se puede
 * decir es lo único accionable: que lo intente otra vez.
 */
export const FALLO_DE_RED = 'No hemos podido conectar con el servidor. Vuelve a intentarlo.';
